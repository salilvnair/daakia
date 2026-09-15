/**
 * Express.
 *
 * ── The hard part ──
 *
 * The route file does not know its own prefix. `router.get('/:id')` in
 * `routes/orders.js` serves `/api/orders/:id` because some other file said
 * `app.use('/api/orders', ordersRouter)` — so a detector that reads one file at
 * a time reports every path wrong, and wrong in a way that looks right.
 *
 * So `index()` reads the mounts first: every `app.use(path, x)` in the
 * repository, resolved to the file `x` was imported from. Then a route in that
 * file knows what it hangs off.
 *
 * Nested mounts are followed — a router mounted on a router — because an
 * application of any size has them, and a one-level answer would again be wrong
 * and look right.
 */

import type {
  ApiDetector, DetectorIndex, DetectResult, Finding, HttpMethod, Param,
  Provenance, RepoRoot, SourceFile, Unresolved,
} from '../api-detector';
import { DETECTOR_LABELS, HTTP_METHODS, joinPath, normalisePathParams, pathParamNames } from '../api-detector';
import {
  balanced, fileConstants, lineOf, literal, packageDeps, resolvePath, splitArgs, stripComments,
} from './js-source';

interface Mount {
  /** The prefix the mounted thing serves under. */
  prefix: string;
  /** Repo-relative path of the file that was mounted, when it could be resolved. */
  target?: string;
  at: { file: string; line: number };
}

interface ExpressIndex extends DetectorIndex {
  /** Prefixes by the file that is mounted at them. */
  prefixOf: Map<string, string>;
}

const JS = /\.(js|jsx|mjs|cjs|ts|tsx)$/;

/** `./routes/orders` from `routes/index.js` → `routes/orders.js`, if it exists. */
export function resolveImport(root: RepoRoot, fromFile: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined;          // a package, not a file
  const dir = fromFile.split('/').slice(0, -1);
  const parts = spec.split('/');
  const out = [...dir];
  for (const p of parts) {
    if (p === '.' || p === '') continue;
    else if (p === '..') out.pop();
    else out.push(p);
  }
  const base = out.join('/');
  const candidates = [
    base,
    ...['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx'].map(e => base + e),
    ...['index.js', 'index.ts', 'index.mjs', 'index.cjs'].map(e => `${base}/${e}`),
  ];
  return candidates.find(c => root.files.includes(c));
}

/** What each identifier in a file was imported from. */
export function importsOf(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])([^'"]+)\2/g)) {
    out.set(m[1], m[3]);
  }
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*(['"])([^'"]+)\2\s*\)/g)) {
    out.set(m[1], m[3]);
  }
  return out;
}

/** Every `app.use('/prefix', thing)` in one file. */
export function mountsIn(root: RepoRoot, file: string, src: string): Mount[] {
  const constants = fileConstants(src);
  const imports = importsOf(src);
  const out: Mount[] = [];

  for (const m of src.matchAll(/\b(\w+)\s*\.\s*use\s*\(/g)) {
    const open = m.index! + m[0].length - 1;
    const args = balanced(src, open);
    if (!args) continue;
    const parts = splitArgs(args);
    if (parts.length < 2) continue;                     // `app.use(middleware)` — no prefix

    const prefix = resolvePath(parts[0], constants);
    if (prefix === undefined) continue;                 // a computed mount: not ours to guess

    /* The mounted thing is usually the last argument — anything before it is
       middleware, which does not change the path. */
    const target = parts[parts.length - 1].trim().replace(/\(.*\)$/, '');
    const spec = imports.get(target);
    out.push({
      prefix,
      target: spec ? resolveImport(root, file, spec) : undefined,
      at: { file, line: lineOf(src, m.index!) },
    });
  }
  return out;
}

/**
 * The full prefix for every mounted file, following mounts of mounts.
 *
 * Breadth-first from the unmounted files, so a router mounted three deep gets
 * all three prefixes rather than only its own.
 */
export function buildPrefixes(root: RepoRoot): Map<string, string> {
  const all: Mount[] = [];
  for (const f of root.files) {
    if (!JS.test(f)) continue;
    const text = root.read(f);
    if (!text || !/\.\s*use\s*\(/.test(text)) continue;
    all.push(...mountsIn(root, f, stripComments(text)));
  }

  const prefixOf = new Map<string, string>();
  /* Mounts whose own file is itself mounted need their parent's prefix first,
     so iterate to a fixed point rather than once. Three passes is enough for
     any nesting a person would write, and it terminates on a cycle. */
  for (let pass = 0; pass < 3; pass++) {
    for (const m of all) {
      if (!m.target) continue;
      const parent = prefixOf.get(m.at.file) ?? '';
      const full = joinPath(parent, m.prefix);
      const existing = prefixOf.get(m.target);
      if (existing !== full) prefixOf.set(m.target, full);
    }
  }
  return prefixOf;
}

export const expressDetector: ApiDetector = {
  id: 'express',
  label: DETECTOR_LABELS.express,

  present(root) {
    for (const f of root.files) {
      if (!/(^|\/)package\.json$/.test(f)) continue;
      const deps = packageDeps(root.read(f) ?? '');
      if (deps.has('express')) return true;
    }
    return false;
  },

  candidates(root) {
    return root.files.filter(f =>
      JS.test(f)
      && !/\.(test|spec)\.[jt]sx?$/.test(f)
      && !/(^|\/)(test|tests|__tests__)\//.test(f));
  },

  index(root) {
    return { prefixOf: buildPrefixes(root) } satisfies ExpressIndex;
  },

  detect(file: SourceFile, index: DetectorIndex): DetectResult {
    const ix = index as ExpressIndex;
    const src = stripComments(file.text);
    const constants = fileConstants(src);
    const prefix = ix.prefixOf.get(file.path) ?? '';

    const findings: Finding[] = [];
    const unresolved: Unresolved[] = [];

    /* `app.get(`, `router.post(` — and not `.use(`, which is a mount. */
    const verbs = HTTP_METHODS.map(v => v.toLowerCase()).join('|');
    const re = new RegExp(`\\b(\\w+)\\s*\\.\\s*(${verbs}|all)\\s*\\(`, 'g');

    for (const m of src.matchAll(re)) {
      const open = m.index! + m[0].length - 1;
      const args = balanced(src, open);
      if (!args) continue;
      const parts = splitArgs(args);
      if (!parts.length) continue;

      const at = { file: file.path, line: lineOf(src, m.index!), snippet: m[0].replace(/\($/, '') };
      const raw = parts[0];
      const path = resolvePath(raw, constants);

      if (path === undefined) {
        unresolved.push({
          expression: `${m[1]}.${m[2]}(${raw.trim().slice(0, 60)})`,
          why: 'The path is built at runtime — daakia will not guess a URL.',
          source: at,
          detector: 'express',
        });
        continue;
      }

      /*
        `.all` answers every verb. Picking one would be a guess, and producing
        seven requests for one handler is noise — so it is reported.
      */
      if (m[2] === 'all') {
        unresolved.push({
          expression: `${m[1]}.all('${path}')`,
          why: 'Answers every method; daakia will not pick one for you.',
          source: at,
          detector: 'express',
        });
        continue;
      }

      const full = normalisePathParams(joinPath(prefix, path));
      const provenance: Record<string, Provenance> = {
        method: { kind: 'read', at },
        path: prefix
          ? { kind: 'resolved', at, from: `mounted at ${prefix}` }
          : { kind: 'read', at },
      };

      const pathParams: Param[] = pathParamNames(full).map(name => ({ name, value: '', required: true }));

      /*
        Guarded by middleware?

        `router.post('/x', requireAuth, handler)` — anything between the path
        and the handler is middleware, and a name that looks like an auth guard
        is the only signal Express gives about whether a route needs a token.
      */
      const middleware = parts.slice(1, -1).map(p => p.trim());
      const guard = middleware.find(x => /auth|jwt|token|passport|protect|requireUser|ensureLogged/i.test(x));

      findings.push({
        method: m[2].toUpperCase() as HttpMethod,
        path: full,
        name: nameFor(m[2].toUpperCase(), full),
        pathParams,
        queryParams: [],
        headers: [],
        auth: guard ? { scheme: 'bearer', named: guard } : undefined,
        provenance: guard
          ? { ...provenance, auth: { kind: 'resolved', at, from: `${guard} middleware` } }
          : provenance,
        source: at,
        detector: 'express',
      });
    }

    return { findings, unresolved };
  },

  baseUrl(root) {
    /* `app.listen(3000)` or `process.env.PORT || 3000` — the literal is what an
       unset environment gives you, which is the situation a scan is in. */
    for (const f of root.files) {
      if (!JS.test(f)) continue;
      const text = root.read(f);
      if (!text || !/\.listen\s*\(/.test(text)) continue;
      const src = stripComments(text);
      const m = /\.listen\s*\(/.exec(src);
      if (!m) continue;
      const args = balanced(src, m.index + m[0].length - 1);
      if (!args) continue;
      const first = splitArgs(args)[0] ?? '';
      const port = /(\d{2,5})/.exec(first)?.[1];
      if (!port) continue;
      const at = { file: f, line: lineOf(src, m.index) };
      return {
        url: `http://localhost:${port}`,
        parts: {
          scheme: { kind: 'generated', rule: 'http — no TLS configured in the source' },
          port: { kind: 'read', at },
        },
      };
    }
    return undefined;
  },
};

/** `GET /api/orders/{id}` → `Get orders by id`. Express has no handler name to use. */
export function nameFor(method: string, path: string): string {
  const segments = path.split('/').filter(Boolean);
  const words: string[] = [];
  for (const s of segments) {
    if (s.startsWith('{')) words.push('by', s.replace(/[{}]/g, ''));
    else words.push(s.replace(/[-_]+/g, ' '));
  }
  const subject = words.join(' ').trim() || 'root';
  const verb = method.charAt(0) + method.slice(1).toLowerCase();
  return `${verb} ${subject}`;
}
