/**
 * Next.js.
 *
 * The odd one of the six: there is no path to parse, because the path IS the
 * file's own location on disk. `app/api/orders/[id]/route.ts` serves
 * `/api/orders/{id}` and nothing in the file says so.
 *
 * That makes the path the most reliable of any detector here — it cannot be
 * built at runtime — and makes the METHOD the interesting question instead.
 *
 * ── The two routers ──
 *
 * App router: `app/**​/route.ts` exports a function per method — `export async
 * function GET(...)`. The exports are the methods, exactly.
 *
 * Pages router: `pages/api/**.ts` exports one default handler for every method,
 * and which methods it actually serves is decided inside it by looking at
 * `req.method`. So those are read out of the comparisons in the body, and when
 * there are none the honest answer is GET with the assumption marked.
 */

import type {
  ApiDetector, DetectResult, Finding, HttpMethod, Param, Provenance,
  RepoRoot, SourceFile,
} from '../api-detector';
import { HTTP_METHODS, joinPath, normalisePathParams, pathParamNames } from '../api-detector';
import { balanced, literal, lineOf, packageDeps, stripComments } from './js-source';
import { nameFor } from './express-detector';

const ROUTE_FILE = /(^|\/)route\.(ts|tsx|js|jsx|mjs)$/;
const PAGES_API = /(^|\/)pages\/api\/.+\.(ts|tsx|js|jsx|mjs)$/;

/**
 * The URL a file serves, from where it sits.
 *
 * Route groups — `(marketing)` — organise files without appearing in the URL,
 * and a private folder — `_lib` — is not a route at all. Both are Next.js
 * conventions and both silently corrupt a path if they are taken literally.
 */
export function pathFromFile(file: string): string | undefined {
  const parts = file.split('/');

  const appAt = parts.findIndex(p => p === 'app');
  const pagesAt = parts.findIndex(p => p === 'pages');

  let segments: string[];
  if (ROUTE_FILE.test(file) && appAt !== -1) {
    segments = parts.slice(appAt + 1, -1);
  } else if (pagesAt !== -1 && parts[pagesAt + 1] === 'api') {
    segments = parts.slice(pagesAt + 1);
    const last = segments.pop()!;
    const base = last.replace(/\.(ts|tsx|js|jsx|mjs)$/, '');
    /* `pages/api/orders/index.ts` is `/api/orders`, not `/api/orders/index`. */
    if (base !== 'index') segments.push(base);
  } else {
    return undefined;
  }

  const kept: string[] = [];
  for (const s of segments) {
    if (s === '') continue;
    /* `(group)` organises; it is not part of the URL. */
    if (/^\(.*\)$/.test(s)) continue;
    /* `_lib` and `@slot` are not routes. */
    if (s.startsWith('_') || s.startsWith('@')) return undefined;
    kept.push(s);
  }

  return normalisePathParams('/' + kept.join('/'));
}

/** `basePath: '/docs'` in next.config — it prefixes every route. */
export function basePathOf(root: RepoRoot): string {
  for (const f of root.files) {
    if (!/(^|\/)next\.config\.(js|mjs|ts|cjs)$/.test(f)) continue;
    const text = root.read(f);
    if (!text) continue;
    const m = /basePath\s*:\s*(['"`][^'"`]*['"`])/.exec(stripComments(text));
    const v = m && literal(m[1]);
    if (v) return v;
  }
  return '';
}

/** The methods an app-router file exports. */
export function exportedMethods(src: string): HttpMethod[] {
  const out: HttpMethod[] = [];
  for (const m of src.matchAll(/\bexport\s+(?:async\s+)?(?:function|const)\s+([A-Z]+)\b/g)) {
    const v = m[1] as HttpMethod;
    if (HTTP_METHODS.includes(v) && !out.includes(v)) out.push(v);
  }
  /* `export { GET, POST }` — a re-export is still a declaration of methods. */
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim() as HttpMethod | undefined;
      if (name && HTTP_METHODS.includes(name) && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

/**
 * The methods a pages-router handler actually answers.
 *
 * Read from what the body compares `req.method` against. It is the only signal
 * there is, and it is a good one: a handler that serves POST almost always
 * says so in a comparison or a switch.
 */
export function methodsFromBody(src: string): HttpMethod[] {
  const out: HttpMethod[] = [];
  const add = (v: string) => {
    const up = v.toUpperCase() as HttpMethod;
    if (HTTP_METHODS.includes(up) && !out.includes(up)) out.push(up);
  };
  for (const m of src.matchAll(/\breq(?:uest)?\.method\s*[=!]==?\s*(['"`])(\w+)\1/g)) add(m[2]);
  for (const m of src.matchAll(/\bcase\s+(['"`])(\w+)\1\s*:/g)) add(m[2]);
  /* `['GET','POST'].includes(req.method)` */
  for (const m of src.matchAll(/\[([^\]]*)\]\s*\.\s*includes\s*\(\s*req(?:uest)?\.method/g)) {
    for (const part of m[1].split(',')) {
      const v = literal(part.trim());
      if (v) add(v);
    }
  }
  return out;
}

export const nextjsDetector: ApiDetector = {
  id: 'nextjs',
  label: 'Next.js',

  present(root) {
    for (const f of root.files) {
      if (!/(^|\/)package\.json$/.test(f)) continue;
      if (packageDeps(root.read(f) ?? '').has('next')) return true;
    }
    return false;
  },

  candidates(root) {
    return root.files.filter(f =>
      (ROUTE_FILE.test(f) || PAGES_API.test(f))
      && !/\.(test|spec)\.[jt]sx?$/.test(f)
      /* `.next` is build output; a route found there is the same route twice. */
      && !/(^|\/)\.next\//.test(f));
  },

  index(root) {
    return { basePath: basePathOf(root) };
  },

  detect(file: SourceFile, index): DetectResult {
    const base = String((index as { basePath?: string }).basePath ?? '');
    const routePath = pathFromFile(file.path);
    if (!routePath) return { findings: [], unresolved: [] };

    const src = stripComments(file.text);
    const at = { file: file.path, line: 1, snippet: file.path };
    const full = joinPath(base, routePath);
    const pathParams: Param[] = pathParamNames(full).map(n => ({ name: n, value: '', required: true }));

    const isApp = ROUTE_FILE.test(file.path);
    const exported = isApp ? exportedMethods(src) : [];
    const fromBody = isApp ? [] : methodsFromBody(src);

    /*
      An app-router file with no exported verb is a route file that does not
      serve anything yet — not a GET. A pages handler with no comparison is
      almost always a GET, and saying so with the assumption marked beats
      dropping it.
    */
    const methods: HttpMethod[] = isApp
      ? exported
      : (fromBody.length ? fromBody : ['GET']);
    const declared = isApp || fromBody.length > 0;

    const findings: Finding[] = methods.map(method => {
      const provenance: Record<string, Provenance> = {
        /* The path is the file's own location: the one thing in this whole
           feature that cannot have been built at runtime. */
        path: { kind: 'read', at },
        method: declared
          ? { kind: 'read', at }
          : { kind: 'generated', rule: 'no req.method check — assumed GET' },
      };
      return {
        method,
        path: full,
        name: nameFor(method, full),
        pathParams,
        queryParams: [],
        headers: [],
        provenance,
        source: at,
        detector: 'nextjs',
        discriminator: methods.length > 1 ? method.toLowerCase() : undefined,
      };
    });

    return { findings, unresolved: [] };
  },

  baseUrl(root) {
    const base = basePathOf(root);
    /* Next's own default; the port is only elsewhere if a script says `-p`. */
    let port = '3000';
    let read = false;
    for (const f of root.files) {
      if (!/(^|\/)package\.json$/.test(f)) continue;
      const m = /"dev"\s*:\s*"[^"]*?(?:-p|--port)[= ](\d{2,5})/.exec(root.read(f) ?? '');
      if (m) { port = m[1]; read = true; }
    }
    return {
      url: `http://localhost:${port}${base}`,
      parts: {
        scheme: { kind: 'generated', rule: 'http — next dev serves plain HTTP' },
        port: read
          ? { kind: 'read', at: { file: 'package.json', line: 1 } }
          : { kind: 'generated', rule: 'no -p in the dev script — next uses 3000' },
        ...(base ? { contextPath: { kind: 'read' as const, at: { file: 'next.config.js', line: 1 } } } : {}),
      },
    };
  },
};

/** Exported so the walker can be told these files are worth opening. */
export { ROUTE_FILE, PAGES_API };
