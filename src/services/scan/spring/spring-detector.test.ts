/**
 * The Spring detector, end to end on a small repository.
 *
 * The cases worth having are the ones that defeat a regex over `@GetMapping`:
 * a house annotation, a context path, two handlers on one path, a body whose
 * type is another file, and a path the scan honestly cannot read.
 */
import { describe, it, expect } from 'vitest';
import { springDetector, readHandlerParams, splitParams, nameFromMethod } from './spring-detector';
import type { RepoRoot, SourceFile } from '../api-detector';

const repo = (files: Record<string, string>): RepoRoot => ({
  dir: '/repo', files: Object.keys(files), read: (r) => files[r],
});

/** Run the detector over every candidate, the way the scanner does. */
function scan(files: Record<string, string>) {
  const root = repo(files);
  const index = springDetector.index!(root);
  const findings = [];
  const unresolved = [];
  for (const path of springDetector.candidates(root)) {
    const file: SourceFile = { path, text: root.read(path)! };
    const r = springDetector.detect(file, index, root);
    findings.push(...r.findings);
    unresolved.push(...r.unresolved);
  }
  return { findings, unresolved };
}

const CONFIG = 'server:\n  port: 8443\n  servlet:\n    context-path: /checkout-api/v2\n';

describe('an ordinary controller', () => {
  const files = {
    'src/main/resources/application.yml': CONFIG,
    'src/main/java/CheckoutController.java': `
@RestController
@RequestMapping("/api/checkout")
public class CheckoutController {

    @GetMapping("/{id}")
    public ResponseEntity<Checkout> getCheckout(@PathVariable String id) { return null; }

    @GetMapping
    public List<Checkout> listCheckouts(@RequestParam(defaultValue = "0") int page,
                                        @RequestParam(required = false) String status) { return null; }

    @DeleteMapping("/{id}")
    public void cancelCheckout(@PathVariable String id) { }
}
`,
  };

  it('finds every handler', () => {
    expect(scan(files).findings.map(f => `${f.method} ${f.path}`)).toEqual([
      'GET /api/checkout/{id}',
      'GET /api/checkout',
      'DELETE /api/checkout/{id}',
    ]);
  });

  it('keeps the context path in the base URL and out of the path', () => {
    /*
      It belongs in exactly one of them. The first version put it in both, and
      every request in the collection would have asked for
      /checkout-api/v2/checkout-api/v2/api/checkout — a whole collection of
      404s that look like the application is broken, which is the failure this
      feature exists to prevent.
    */
    const root = repo(files);
    expect(springDetector.baseUrl!(root)?.url).toBe('http://localhost:8443/checkout-api/v2');
    for (const f of scan(files).findings) expect(f.path.startsWith('/api/')).toBe(true);
  });

  it('names a request after the handler, not the path', () => {
    expect(scan(files).findings[0].name).toBe('Get checkout');
  });

  it('reads query parameters, with their defaults and whether they are required', () => {
    const list = scan(files).findings[1];
    expect(list.queryParams).toEqual([
      { name: 'page', value: '0', required: true, type: 'int' },
      { name: 'status', value: '', required: false, type: 'String' },
    ]);
  });

  it('assumes 200 when no status is declared, and marks it an assumption', () => {
    /* Spring returns 200 for a DELETE unless told otherwise. Guessing 204
       because that is what a tidy API would do is the kind of plausible
       invention this design is built to avoid. */
    const f = scan(files).findings;
    expect(f[2].response?.status).toBe(200);
    expect(f[2].provenance.status.kind).toBe('generated');
  });
});

describe('a controller behind one of your annotations', () => {
  const files = {
    'src/main/resources/application.yml': CONFIG,
    'src/main/java/TestClientApiController.java': `
@RestController
@RequestMapping("/test-client")
public @interface TestClientApiController {
    @AliasFor(annotation = RequestMapping.class, attribute = "value")
    String[] path() default {};
}
`,
    'src/main/java/OrderTestClient.java': `
@TestClientApiController(path = "/orders")
public class OrderTestClient {
    @PostMapping("/{id}/replay")
    public ResponseEntity<ReplayResult> replayOrder(@PathVariable String id) { return null; }
}
`,
  };

  it('finds it, with every prefix in the right order', () => {
    const f = scan(files).findings;
    expect(f).toHaveLength(1);
    expect(f[0].path).toBe('/test-client/orders/{id}/replay');
  });

  it('marks the path as resolved, not read, and says through what', () => {
    const [f] = scan(files).findings;
    expect(f.provenance.path.kind).toBe('resolved');
    expect((f.provenance.path as { from: string }).from).toContain('TestClientApiController');
  });
});

describe('a body whose type is another file', () => {
  const files = {
    'src/main/java/CheckoutController.java': `
@RestController
public class CheckoutController {
    @PostMapping("/api/checkout")
    @ResponseStatus(HttpStatus.CREATED)
    public Checkout create(@RequestBody CheckoutRequest body) { return null; }
}
`,
    'src/main/java/CheckoutRequest.java': `
public class CheckoutRequest {
    @NotBlank private String cartId;
    @Email private String email;
    @Min(1) private int quantity;
    private List<Item> items;
    private String couponCode;
}
`,
    'src/main/java/Item.java': 'public class Item { private String sku; private int quantity; }',
  };

  it('reads the shape, one level into nested types', () => {
    const [f] = scan(files).findings;
    const body = JSON.parse(f.body!.raw!);
    expect(body).toEqual({
      cartId: 'x',
      email: 'user@example.com',
      quantity: 1,
      items: [{ sku: '', quantity: 0 }],
      couponCode: '',
    });
  });

  it('marks the body generated, and names the rules that generated it', () => {
    // Three fields came from constraints; the rest are zero values. Anything
    // invented has to be legible as invented.
    const [f] = scan(files).findings;
    expect(f.provenance.body.kind).toBe('generated');
    expect((f.provenance.body as { rule: string }).rule).toContain('@Email');
  });

  it('takes the declared status', () => {
    expect(scan(files).findings[0].response?.status).toBe(201);
  });
});

describe('two handlers on one path', () => {
  const files = {
    'src/main/java/UploadController.java': `
@RestController
public class UploadController {
    @PostMapping(value = "/api/import", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Job importJson(@RequestBody ImportRequest body) { return null; }

    @PostMapping(value = "/api/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Job importFile() { return null; }
}
`,
  };

  it('produces both, told apart by what tells them apart', () => {
    const f = scan(files).findings;
    expect(f).toHaveLength(2);
    expect(f.map(x => x.discriminator)).toEqual(['json', 'form-data']);
  });

  it('sets the header that actually selects each one', () => {
    const f = scan(files).findings;
    expect(f[0].headers).toContainEqual({ name: 'Content-Type', value: 'application/json', required: true });
    expect(f[1].headers).toContainEqual({ name: 'Content-Type', value: 'multipart/form-data', required: true });
  });
});

describe('what it cannot read', () => {
  it('reports a constant path rather than dropping the endpoint', () => {
    const { findings, unresolved } = scan({
      'src/main/java/AdminController.java': `
@RestController
public class AdminController {
    @GetMapping(ADMIN_ROOT)
    public String admin() { return ""; }
}
`,
    });
    expect(findings).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].expression).toContain('ADMIN_ROOT');
    expect(unresolved[0].source.file).toContain('AdminController');
  });

  it('will not pick a verb for a mapping that has none', () => {
    const { unresolved } = scan({
      'src/main/java/X.java': `
@RestController
public class X {
    @RequestMapping("/any")
    public String any() { return ""; }
}
`,
    });
    expect(unresolved[0].why).toContain('every verb');
  });
});

describe('detecting the framework at all', () => {
  it('is present when the build file says so', () => {
    expect(springDetector.present(repo({ 'pom.xml': '<artifactId>spring-boot-starter-web</artifactId>' }))).toBe(true);
    expect(springDetector.present(repo({ 'build.gradle': 'implementation "org.springframework.boot:spring-boot-starter-webflux"' }))).toBe(true);
  });

  it('is absent otherwise, without opening a single source file', () => {
    expect(springDetector.present(repo({ 'package.json': '{"dependencies":{"express":"^4"}}' }))).toBe(false);
  });

  it('does not offer test sources as candidates', () => {
    const r = repo({ 'src/main/java/A.java': '', 'src/test/java/ATest.java': '' });
    expect(springDetector.candidates(r)).toEqual(['src/main/java/A.java']);
  });
});

describe('the small parts', () => {
  it('splits a parameter list without breaking generics', () => {
    expect(splitParams('@RequestParam Map<String, String> q, @PathVariable String id'))
      .toEqual(['@RequestParam Map<String, String> q', '@PathVariable String id']);
  });

  it('takes the wire name from the annotation when it differs', () => {
    const p = readHandlerParams('@RequestParam("page_no") int pageNo');
    expect(p.queryParams[0].name).toBe('page_no');
  });

  it('falls back to the parameter name when it does not', () => {
    expect(readHandlerParams('@RequestParam int page').queryParams[0].name).toBe('page');
  });

  it('turns a handler name into something readable', () => {
    expect(nameFromMethod('getCheckoutById')).toBe('Get checkout by id');
  });
});
