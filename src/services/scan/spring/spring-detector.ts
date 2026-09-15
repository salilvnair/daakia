/**
 * The Spring detector.
 *
 * Reads controllers into findings: the verb and path off the mapping
 * annotation, the parameters off the handler's signature, and the request body
 * from whatever type `@RequestBody` names.
 *
 * The two things that make this more than a regex over `@GetMapping` live
 * elsewhere and are used here: `annotations.ts` resolves the annotation graph
 * so a house annotation is recognised, and `base-url.ts` composes the port with
 * the context path.
 *
 * ── On being wrong quietly ──
 *
 * Every value carries how it was known. A path read off an annotation is
 * `read`; a path assembled through a custom annotation is `resolved`; a body
 * field invented to satisfy `@Size(min=3)` is `generated`. A finding that is
 * half read and half guessed is the normal case, which is why provenance is
 * keyed by field rather than attached to the finding.
 */

import type {
  ApiDetector, DetectorIndex, DetectResult, Finding, HttpMethod, Param,
  Provenance, RepoRoot, SourceFile, SourceRef, Unresolved,
} from '../api-detector';
import { DETECTOR_LABELS, joinPath, normalisePathParams, pathParamNames } from '../api-detector';
import {
  VERB_ANNOTATIONS, annotationArgs, annotationsAbove, attribute, readController,
  stripNoise, type AnnotationMeaning,
} from './annotations';
import { springBaseUrl } from './base-url';
import { bodyFromType } from './types';

interface SpringIndex extends DetectorIndex {
  annotations: Map<string, AnnotationMeaning>;
}

const lineOf = (src: string, i: number) => src.slice(0, i).split('\n').length;

/** `getCheckout` → `Get checkout`. The handler names itself better than a path does. */
export function nameFromMethod(method: string): string {
  const words = method
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The parameter list of a handler, as text.
 *
 * Generics contain commas — `Map<String, String>` — so splitting on commas
 * needs to count angle brackets or it produces two broken halves.
 */
export function splitParams(sig: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < sig.length; i++) {
    const c = sig[i];
    if (c === '<' || c === '(') depth++;
    else if (c === '>' || c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(sig.slice(start, i)); start = i + 1; }
  }
  const last = sig.slice(start).trim();
  if (last) out.push(last);
  return out.map(s => s.trim()).filter(Boolean);
}

interface HandlerParams {
  pathParams: Param[];
  queryParams: Param[];
  headers: Param[];
  bodyType?: string;
}

/** Read `@PathVariable`, `@RequestParam`, `@RequestHeader`, `@RequestBody`. */
export function readHandlerParams(sig: string): HandlerParams {
  const out: HandlerParams = { pathParams: [], queryParams: [], headers: [] };

  for (const raw of splitParams(sig)) {
    /* The declared name is the last identifier; the type is what precedes it. */
    const decl = /(?:^|\s)([\w.<>\[\],\s]+?)\s+(\w+)\s*$/.exec(raw.replace(/@\w+(\([^)]*\))?/g, ' ').trim());
    const declaredName = decl?.[2];
    const declaredType = decl?.[1]?.trim();
    if (!declaredName) continue;

    const ann = /@(\w+)(?:\(([^)]*)\))?/.exec(raw);
    if (!ann) continue;
    const [, kind, args] = ann;

    /* `@RequestParam("page")`, `@RequestParam(name = "page")`, or neither —
       in which case the parameter's own name is the wire name. */
    const named = attribute(args, 'value') ?? attribute(args, 'name') ?? declaredName;
    const required = !/required\s*=\s*false/.test(args ?? '')
      && !/^Optional</.test(declaredType ?? '');
    const value = attribute(args, 'defaultValue') ?? '';

    if (kind === 'PathVariable') out.pathParams.push({ name: named, value, required: true, type: declaredType });
    else if (kind === 'RequestParam') out.queryParams.push({ name: named, value, required, type: declaredType });
    else if (kind === 'RequestHeader') out.headers.push({ name: named, value, required, type: declaredType });
    else if (kind === 'RequestBody') out.bodyType = declaredType;
  }
  return out;
}

/**
 * What distinguishes two handlers on the same path.
 *
 * Spring picks between them at runtime by content type or by a condition, and
 * both are declared. Producing all of them with the discriminator in the name —
 * and in the header that selects it — beats producing one and hoping.
 */
function discriminatorOf(args: string | undefined): { label: string; header?: Param } | undefined {
  const consumes = attribute(args, 'consumes');
  if (consumes) return { label: shortType(consumes), header: { name: 'Content-Type', value: mediaType(consumes), required: true } };
  const produces = attribute(args, 'produces');
  if (produces) return { label: shortType(produces), header: { name: 'Accept', value: mediaType(produces), required: true } };
  const params = attribute(args, 'params');
  if (params) return { label: params };
  return undefined;
}

/** `APPLICATION_JSON_VALUE` and `"application/json"` both mean the same thing. */
function mediaType(v: string): string {
  const known: Record<string, string> = {
    APPLICATION_JSON_VALUE: 'application/json',
    MULTIPART_FORM_DATA_VALUE: 'multipart/form-data',
    APPLICATION_XML_VALUE: 'application/xml',
    APPLICATION_PDF_VALUE: 'application/pdf',
    TEXT_PLAIN_VALUE: 'text/plain',
    TEXT_CSV_VALUE: 'text/csv',
    APPLICATION_FORM_URLENCODED_VALUE: 'application/x-www-form-urlencoded',
    APPLICATION_OCTET_STREAM_VALUE: 'application/octet-stream',
  };
  const bare = v.replace(/^MediaType\./, '').trim();
  return known[bare] ?? v.replace(/^MediaType\./, '');
}

function shortType(v: string): string {
  const t = mediaType(v);
  return t.split('/').pop()?.replace(/^x-www-form-urlencoded$/, 'form') ?? t;
}

/** `@ResponseStatus(HttpStatus.CREATED)` → 201. */
const STATUS_NAMES: Record<string, number> = {
  OK: 200, CREATED: 201, ACCEPTED: 202, NO_CONTENT: 204,
  BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
};

/**
 * The status, and whether it was declared or assumed.
 *
 * The first version guessed 201 for POST and 204 for DELETE, because that is
 * what a well-behaved API does. Spring returns **200** for all of them unless
 * `@ResponseStatus` says otherwise — so those were exactly the
 * plausible-looking inventions this whole design is built to avoid. 200 is now
 * the assumption, and it is marked as one.
 */
function statusFrom(args: string | undefined): { status: number; declared: boolean } {
  const raw = attribute(args, 'value') ?? attribute(args, 'code');
  if (raw) {
    const name = raw.replace(/^HttpStatus\./, '').trim();
    if (STATUS_NAMES[name]) return { status: STATUS_NAMES[name], declared: true };
    if (/^\d+$/.test(name)) return { status: Number(name), declared: true };
  }
  return { status: 200, declared: false };
}

export const springDetector: ApiDetector = {
  id: 'spring',
  label: DETECTOR_LABELS.spring,

  present(root) {
    for (const f of root.files) {
      if (!/(^|\/)(pom\.xml|build\.gradle(\.kts)?)$/.test(f)) continue;
      const text = root.read(f) ?? '';
      if (/spring-boot-starter-web(flux)?|spring-web\b/.test(text)) return true;
    }
    return false;
  },

  candidates(root) {
    return root.files.filter(f =>
      /\.(java|kt)$/.test(f)
      /* Tests are read for example values, not for endpoints — a test's own
         `@RestController` fixture is not an endpoint anybody wants to call. */
      && !/src\/test\//.test(f));
  },

  index() {
    /* One cache of resolved annotations for the whole scan: a house annotation
       is used by every controller, and reading its source once per controller
       would be the slowest thing in here. */
    return { annotations: new Map<string, AnnotationMeaning>() };
  },

  detect(file: SourceFile, index: DetectorIndex, root: RepoRoot): DetectResult {
    const ix = index as SpringIndex;
    const findings: Finding[] = [];
    const unresolved: Unresolved[] = [];

    const src = stripNoise(file.text);
    const ctrl = readController(root, file.path, file.text, ix.annotations);
    if (!ctrl.isController) return { findings, unresolved };

    /*
      The context path is NOT joined onto the path here.

      It belongs to the base URL — `http://localhost:8443/checkout-api/v2` — and
      putting it in both produced
      `{{baseUrl}}/checkout-api/v2/api/checkout` against a baseUrl that already
      ended in `/checkout-api/v2`. Every request in the collection would have
      hit the prefix twice and 404'd, which is the exact failure this feature
      exists to prevent. One place, and it is the variable.
    */

    /* Every mapping annotation in the file, with the method it sits on. */
    const mappingRe = /@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\b/g;
    for (const m of src.matchAll(mappingRe)) {
      const at = m.index! + m[0].length;
      const args = annotationArgs(src, at);
      const annName = m[1];

      /* The class-level @RequestMapping is a prefix, not an endpoint. It is the
         one directly above the class declaration, which readController already
         consumed — skip any mapping that is not above a method. */
      const sig = methodAfter(src, at);
      if (!sig) continue;

      const verb: HttpMethod | undefined = annName === 'RequestMapping'
        ? (attribute(args, 'method')?.replace(/^RequestMethod\./, '').trim() as HttpMethod | undefined)
        : VERB_ANNOTATIONS[annName] as HttpMethod;
      if (!verb) {
        unresolved.push({
          expression: `@RequestMapping on ${sig.name} with no method`,
          why: 'A mapping with no method answers every verb; the scan will not pick one for you.',
          source: { file: file.path, line: lineOf(src, m.index!), snippet: m[0] },
          detector: 'spring',
        });
        continue;
      }

      const rawPath = attribute(args, 'value') ?? attribute(args, 'path') ?? '';
      /* An unquoted value is a constant reference the scan could not fold. */
      if (rawPath && !rawPath.startsWith('/') && /^[A-Z_][\w.]*$/.test(rawPath)) {
        unresolved.push({
          expression: `${annName}(${rawPath})`,
          why: 'The path is a constant this scan could not follow to a literal.',
          source: { file: file.path, line: lineOf(src, m.index!), snippet: m[0] },
          detector: 'spring',
        });
        continue;
      }

      const joined = normalisePathParams(joinPath(ctrl.prefix, rawPath));
      const source: SourceRef = {
        file: file.path,
        line: lineOf(src, m.index!),
        snippet: `@${annName}${args !== undefined ? `("${rawPath}")` : ''}`,
      };

      const params = readHandlerParams(sig.params);
      /* A `{name}` in the path with no `@PathVariable` for it is still a path
         parameter — Spring binds it by name. */
      for (const n of pathParamNames(joined)) {
        if (!params.pathParams.some(p => p.name === n)) {
          params.pathParams.push({ name: n, value: '', required: true });
        }
      }

      const provenance: Record<string, Provenance> = {
        path: ctrl.via
          ? { kind: 'resolved', at: ctrl.at ?? source, from: ctrl.via }
          : { kind: 'read', at: source },
        method: { kind: 'read', at: source },
      };

      const disc = discriminatorOf(args);
      if (disc?.header) params.headers.push(disc.header);

      const body = params.bodyType ? bodyFromType(root, params.bodyType) : undefined;
      if (body) {
        provenance.body = body.provenance;
      }

      /*
        `@ResponseStatus` is usually written BELOW the mapping annotation, not
        above it, so looking only at what precedes the mapping missed every
        declared status. The block between this annotation and the method
        declaration is where the rest of the handler's annotations live.
      */
      /* Up to the handler's own opening paren — `headEnd` — because the
         annotations between the mapping and the method are inside that span and
         bounding at the start of it excluded the very thing being looked for. */
      const block = src.slice(m.index!, sig.headEnd);
      const rs = /@ResponseStatus\b/.exec(block);
      const statusArgs = rs ? annotationArgs(block, rs.index + rs[0].length) : undefined;
      const status = statusFrom(statusArgs);
      provenance.status = status.declared
        ? { kind: 'read', at: { file: file.path, line: lineOf(src, m.index! + rs!.index), snippet: '@ResponseStatus' } }
        : { kind: 'generated', rule: 'no @ResponseStatus — Spring returns 200' };

      findings.push({
        method: verb,
        path: joined,
        name: nameFromMethod(sig.name),
        pathParams: params.pathParams,
        queryParams: params.queryParams,
        headers: params.headers,
        body: body?.shape,
        response: { status: status.status },
        provenance,
        source,
        detector: 'spring',
        discriminator: disc?.label,
      });
    }

    return { findings, unresolved: dedupeUnresolved(unresolved) };
  },

  baseUrl(root, profile) {
    return springBaseUrl(root, profile);
  },
};

/**
 * The method signature immediately after an annotation.
 *
 * Returns undefined when what follows is a class or a field, which is how a
 * class-level `@RequestMapping` is told from a handler's own.
 */
function methodAfter(src: string, from: number): { name: string; params: string; headEnd: number } | undefined {
  const window = src.slice(from, from + 4000);

  /*
    Find the name and the opening paren, then balance.

    The parameter list cannot be matched with `[^)]*`: a handler's parameters
    carry their own annotations, and `@RequestParam(defaultValue = "0")` closes
    a paren the method's list has not finished with. That cut every multi-line
    signature short and silently produced a request with no query parameters.
  */
  const head = /(?:^|\n)\s*(?:@\w+(?:\([^()]*\))?\s*\n\s*)*(?:public|protected|private|\s)*\s*[\w.<>\[\],?\s]+?\s+(\w+)\s*\(/.exec(window);
  if (!head) return undefined;
  /* A class declaration between here and there means this annotation was on
     the class, not on a method. */
  if (/\bclass\s+\w+/.test(window.slice(0, head.index))) return undefined;

  const open = head.index + head[0].length - 1;
  let depth = 0;
  for (let i = open; i < window.length; i++) {
    if (window[i] === '(') depth++;
    else if (window[i] === ')') {
      depth--;
      if (depth === 0) return { name: head[1], params: window.slice(open + 1, i), headEnd: from + open };
    }
  }
  return undefined;
}

/** One row per distinct expression: a constant used ten times is one problem. */
function dedupeUnresolved(list: Unresolved[]): Unresolved[] {
  const seen = new Set<string>();
  return list.filter(u => {
    const k = `${u.source.file}:${u.expression}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
