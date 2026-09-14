/**
 * Hapi.
 *
 * ── Routes as data ──
 *
 * Hapi declares a route as an object — `{ method, path, options }` — rather
 * than as a call with a path argument. That cuts both ways. It is easier to
 * read, because everything about a route is in one literal and the auth
 * strategy is right there beside the path. And it is easier to build at
 * runtime, because an object is a value: a route table assembled by mapping
 * over a list is idiomatic Hapi and completely opaque to a reader.
 *
 * So: object literals are read, and anything that is not a literal is reported.
 */

import type {
  ApiDetector, DetectResult, Finding, HttpMethod, Param, Provenance,
  SourceFile, Unresolved,
} from '../api-detector';
import { HTTP_METHODS, normalisePathParams, pathParamNames } from '../api-detector';
import {
  balanced, fileConstants, lineOf, literal, packageDeps, property, resolvePath,
  splitArgs, stripComments,
} from './js-source';
import { nameFor } from './express-detector';

const JS = /\.(js|jsx|mjs|cjs|ts|tsx)$/;

/** `server.route(...)`, `server.route([...])`, and a plugin's own `route`. */
const ROUTE_CALL = /\b(?:server|srv|app)\s*\.\s*route\s*\(/g;

export const hapiDetector: ApiDetector = {
  id: 'hapi',
  label: 'Hapi.js',

  present(root) {
    for (const f of root.files) {
      if (!/(^|\/)package\.json$/.test(f)) continue;
      const deps = packageDeps(root.read(f) ?? '');
      if (deps.has('@hapi/hapi') || deps.has('hapi')) return true;
    }
    return false;
  },

  candidates(root) {
    return root.files.filter(f =>
      JS.test(f)
      && !/\.(test|spec)\.[jt]sx?$/.test(f)
      && !/(^|\/)(test|tests|__tests__)\//.test(f));
  },

  detect(file: SourceFile): DetectResult {
    const src = stripComments(file.text);
    const constants = fileConstants(src);
    const findings: Finding[] = [];
    const unresolved: Unresolved[] = [];

    for (const call of src.matchAll(ROUTE_CALL)) {
      const open = call.index! + call[0].length - 1;
      const args = balanced(src, open);
      if (args === undefined) continue;

      const at = { file: file.path, line: lineOf(src, call.index!), snippet: 'server.route' };
      const body = args.trim();

      /* An array of routes, or one route. Both are ordinary here. */
      const objects = body.startsWith('[')
        ? splitArgs(balanced(body, 0) ?? '')
        : [body];

      for (const raw of objects) {
        const obj = raw.trim();
        if (!obj.startsWith('{')) {
          /* A spread, a variable, a call — a route table built somewhere else. */
          unresolved.push({
            expression: `server.route(${obj.slice(0, 60)})`,
            why: 'The route is a value rather than a literal, so its path cannot be read here.',
            source: at,
            detector: 'hapi',
          });
          continue;
        }

        const inner = balanced(obj, 0);
        if (inner === undefined) continue;

        const pathExpr = property(inner, 'path');
        const methodExpr = property(inner, 'method');
        if (!pathExpr || !methodExpr) continue;

        const path = resolvePath(pathExpr, constants);
        if (path === undefined) {
          unresolved.push({
            expression: `path: ${pathExpr.slice(0, 60)}`,
            why: 'The path is built at runtime — daakia will not guess a URL.',
            source: at,
            detector: 'hapi',
          });
          continue;
        }

        /* `method: 'GET'` or `method: ['GET', 'POST']` — both are real, and the
           second is several routes rather than one to choose between. */
        const methods = readMethods(methodExpr);
        if (!methods.length) {
          unresolved.push({
            expression: `method: ${methodExpr.slice(0, 40)}`,
            why: 'The method is computed; daakia will not pick one for you.',
            source: at,
            detector: 'hapi',
          });
          continue;
        }

        const full = normalisePathParams(path);
        const pathParams: Param[] = pathParamNames(full).map(n => ({ name: n, value: '', required: true }));
        const auth = readAuth(inner);

        for (const method of methods) {
          const provenance: Record<string, Provenance> = {
            method: { kind: 'read', at },
            path: { kind: 'read', at },
            ...(auth ? { auth: { kind: 'read' as const, at } } : {}),
          };
          findings.push({
            method,
            path: full,
            name: nameFor(method, full),
            pathParams,
            queryParams: [],
            headers: [],
            auth,
            provenance,
            source: at,
            detector: 'hapi',
            /* Several methods on one path is Hapi's own shorthand for several
               routes, and they are told apart by the method itself. */
            discriminator: methods.length > 1 ? method.toLowerCase() : undefined,
          });
        }
      }
    }

    return { findings, unresolved };
  },

  baseUrl(root) {
    /* `Hapi.server({ port: 3000 })`. */
    for (const f of root.files) {
      if (!JS.test(f)) continue;
      const text = root.read(f);
      if (!text || !/\.server\s*\(/.test(text)) continue;
      const src = stripComments(text);
      const m = /\.server\s*\(/.exec(src);
      if (!m) continue;
      const args = balanced(src, m.index + m[0].length - 1);
      if (!args) continue;
      const inner = args.trim().startsWith('{') ? balanced(args.trim(), 0) : undefined;
      const port = inner && property(inner, 'port');
      const num = port && /(\d{2,5})/.exec(port)?.[1];
      if (!num) continue;
      return {
        url: `http://localhost:${num}`,
        parts: {
          scheme: { kind: 'generated', rule: 'http — no TLS configured in the source' },
          port: { kind: 'read', at: { file: f, line: lineOf(src, m.index) } },
        },
      };
    }
    return undefined;
  },
};

/** `'GET'`, `['GET','POST']`, or `'*'` — which Hapi means as every method. */
export function readMethods(expr: string): HttpMethod[] {
  const t = expr.trim();
  const one = literal(t);
  if (one) {
    /* `*` answers everything. Seven requests for one handler is noise, and
       picking one is a guess — so it is neither, and the caller reports it. */
    if (one === '*') return [];
    const up = one.toUpperCase() as HttpMethod;
    return HTTP_METHODS.includes(up) ? [up] : [];
  }
  if (t.startsWith('[')) {
    const inner = balanced(t, 0);
    if (inner === undefined) return [];
    const out: HttpMethod[] = [];
    for (const part of splitArgs(inner)) {
      const v = literal(part);
      if (!v) continue;
      const up = v.toUpperCase() as HttpMethod;
      if (HTTP_METHODS.includes(up)) out.push(up);
    }
    return out;
  }
  return [];
}

/**
 * What the route says about authentication.
 *
 * `auth: false` is a statement, not an absence: it means this route is
 * deliberately open, which is worth knowing and worth showing.
 */
export function readAuth(inner: string): { scheme: 'none' | 'bearer' | 'unknown'; named?: string } | undefined {
  const options = property(inner, 'options') ?? property(inner, 'config');
  const scope = options?.trim().startsWith('{') ? balanced(options.trim(), 0) ?? inner : inner;
  const auth = property(scope, 'auth');
  if (auth === undefined) return undefined;

  const t = auth.trim();
  if (t === 'false') return { scheme: 'none' };
  const named = literal(t);
  if (named) return { scheme: 'bearer', named };

  /* `auth: { strategy: 'jwt', mode: 'try' }`. */
  if (t.startsWith('{')) {
    const obj = balanced(t, 0) ?? '';
    const strategy = literal(property(obj, 'strategy') ?? property(obj, 'strategies') ?? '');
    if (strategy) return { scheme: 'bearer', named: strategy };
  }
  return { scheme: 'unknown' };
}
