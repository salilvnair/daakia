/**
 * The annotation graph, including the ones you wrote.
 *
 * The case this exists for is a real one and it defeats every scanner that
 * matches annotation names as text: a house annotation, meta-annotated with
 * `@RestController`, carrying its own prefix, with `@AliasFor` renaming the
 * attribute that supplies the rest of it.
 */
import { describe, it, expect } from 'vitest';
import { readController, resolveAnnotation, attribute, annotationArgs, stripNoise } from './annotations';
import type { RepoRoot } from '../api-detector';

/** A repository that is just a map of path → text. */
function repo(files: Record<string, string>): RepoRoot {
  return {
    dir: '/repo',
    files: Object.keys(files),
    read: (rel) => files[rel],
  };
}

const CUSTOM = `
package com.acme.web;

import org.springframework.web.bind.annotation.RestController;

/** Everything in here is a test client. */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/test-client")
public @interface TestClientApiController {

    @AliasFor(annotation = RequestMapping.class, attribute = "value")
    String[] path() default {};
}
`;

describe('a controller annotated the ordinary way', () => {
  it('is found, with its prefix', () => {
    const src = `
@RestController
@RequestMapping("/api/checkout")
public class CheckoutController { }
`;
    const r = readController(repo({}), 'CheckoutController.java', src);
    expect(r.isController).toBe(true);
    expect(r.prefix).toBe('/api/checkout');
  });

  it('takes @Controller too', () => {
    const r = readController(repo({}), 'X.java', '@Controller\npublic class X { }');
    expect(r.isController).toBe(true);
  });

  it('is not fooled by a comment', () => {
    /* A javadoc example that mentions the annotation is not an annotation. */
    const src = `
/**
 * Used to be @RestController — see ADR-14.
 */
public class NotAController { }
`;
    expect(readController(repo({}), 'X.java', src).isController).toBe(false);
  });
});

describe('a controller annotated with one of yours', () => {
  const files = {
    'src/main/java/com/acme/web/TestClientApiController.java': CUSTOM,
  };

  it('is recognised through the meta-annotation', () => {
    const src = `
@TestClientApiController(path = "/orders")
public class OrderTestClient { }
`;
    const r = readController(repo(files), 'OrderTestClient.java', src);
    expect(r.isController).toBe(true);
  });

  it('joins the annotation prefix and the aliased attribute, in that order', () => {
    // The whole point: neither "/test-client" nor "/orders" appears in the
    // class, and Spring serves /test-client/orders.
    const src = `@TestClientApiController(path = "/orders")\npublic class OrderTestClient { }`;
    expect(readController(repo(files), 'OrderTestClient.java', src).prefix)
      .toBe('/test-client//orders'.replace('//', '/'));
  });

  it('says which annotation made it a controller', () => {
    const src = `@TestClientApiController(path = "/orders")\npublic class OrderTestClient { }`;
    const r = readController(repo(files), 'OrderTestClient.java', src);
    expect(r.via).toContain('TestClientApiController');
    expect(r.via).toContain('RestController');
  });

  it('works with no attribute at all', () => {
    const src = `@TestClientApiController\npublic class Bare { }`;
    const r = readController(repo(files), 'Bare.java', src);
    expect(r.isController).toBe(true);
    expect(r.prefix).toBe('/test-client');
  });
});

describe('an annotation it cannot read', () => {
  it('does not claim the class is a controller', () => {
    /* Ships in a jar; there is no source to follow. Settings takes a mapping
       instead — guessing here would invent endpoints. */
    const src = `@InternalApi\npublic class Mystery { }`;
    expect(readController(repo({}), 'Mystery.java', src).isController).toBe(false);
  });

  it('does not follow a class of the same name', () => {
    const files = { 'a/Thing.java': 'public class Thing { }' };
    expect(resolveAnnotation(repo(files), 'Thing').controller).toBe(false);
  });
});

describe('reading an annotation’s arguments', () => {
  it('takes a lone value', () => {
    expect(attribute(annotationArgs('@GetMapping("/x")', 11), 'value')).toBe('/x');
  });

  it('takes a named one', () => {
    const src = '@RequestMapping(value = "/a", produces = "application/json")';
    expect(attribute(annotationArgs(src, 15), 'value')).toBe('/a');
    expect(attribute(annotationArgs(src, 15), 'produces')).toBe('application/json');
  });

  it('takes the first of several paths', () => {
    // Spring serves both; a request has one URL, and the second is an alias.
    const src = '@RequestMapping(value = {"/a", "/b"})';
    expect(attribute(annotationArgs(src, 15), 'value')).toBe('/a');
  });

  it('reports no arguments as none, not as empty', () => {
    expect(annotationArgs('@RestController\npublic class X', 15)).toBeUndefined();
  });
});

describe('stripping what is not code', () => {
  it('removes block and line comments', () => {
    expect(stripNoise('/* @RestController */ x')).not.toContain('@RestController');
    expect(stripNoise('// @RestController\nx')).not.toContain('@RestController');
  });

  it('leaves a URL in a string alone structurally', () => {
    // Strings are blanked, not deleted — offsets have to survive, because every
    // line number this module reports is computed from them.
    const src = 'a = "http://x"; b';
    expect(stripNoise(src).length).toBe(src.length);
  });
});
