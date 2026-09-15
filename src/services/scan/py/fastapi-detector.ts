/**
 * FastAPI.
 *
 * The richest of the six, because FastAPI asks people to declare what REST
 * leaves implicit: a Pydantic model is a real body shape, `response_model` is a
 * real response shape, and `status_code` is the status rather than a guess.
 *
 * ── The two prefixes ──
 *
 * `APIRouter(prefix="/orders")` puts a prefix on the router, and
 * `app.include_router(router, prefix="/api")` puts another one on the include —
 * and both apply. Reading only the first gives every path in a large
 * application a missing segment; reading only the second gives them all a
 * different one. `index()` gathers the includes, the file supplies its own.
 */

import type {
  ApiDetector, DetectorIndex, DetectResult, Finding, HttpMethod, Param,
  Provenance, RepoRoot, SourceFile, Unresolved,
} from '../api-detector';
import { HTTP_METHODS, joinPath, normalisePathParams, pathParamNames } from '../api-detector';
import {
  balanced, declaresPackage, decoratorsAbove, keyword, literal, lineOf, moduleConstants,
  positional, resolvePath, splitArgs, stripComments,
} from './py-source';

interface FastApiIndex extends DetectorIndex {
  /** Prefix contributed by whoever included this module's router. */
  includePrefix: Map<string, string>;
}

const PY = /\.py$/;

/** `from .orders import router` / `from app.api.orders import router`. */
function moduleToFile(root: RepoRoot, fromFile: string, module: string): string | undefined {
  const dir = fromFile.split('/').slice(0, -1);
  /* A leading dot is relative; each extra dot climbs one level. */
  const dots = /^\.+/.exec(module)?.[0].length ?? 0;
  const rest = module.slice(dots).split('.').filter(Boolean);
  const base = dots > 0 ? [...dir.slice(0, dir.length - (dots - 1)), ...rest] : rest;
  const candidates = [`${base.join('/')}.py`, `${base.join('/')}/__init__.py`];
  return candidates.find(c => root.files.includes(c));
}

/**
 * Every `include_router(x, prefix=...)`, resolved to the file `x` came from.
 *
 * Iterated, because a router included into a router that is itself included
 * carries both prefixes and a single pass would only ever see one.
 */
export function buildIncludePrefixes(root: RepoRoot): Map<string, string> {
  interface Inc { host: string; target?: string; prefix: string }
  const all: Inc[] = [];

  for (const f of root.files) {
    if (!PY.test(f)) continue;
    const text = root.read(f);
    if (!text || !text.includes('include_router')) continue;
    const src = stripComments(text);

    /* Which module each name came from. */
    const from = new Map<string, string>();
    for (const m of src.matchAll(/^\s*from\s+([\w.]+)\s+import\s+(.+)$/gm)) {
      for (const name of m[2].split(',')) {
        const clean = name.trim().split(/\s+as\s+/).pop()?.trim();
        if (clean) from.set(clean, m[1]);
      }
    }
    for (const m of src.matchAll(/^\s*import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm)) {
      from.set(m[2] ?? m[1].split('.').pop()!, m[1]);
    }

    for (const m of src.matchAll(/\binclude_router\s*\(/g)) {
      const args = balanced(src, m.index! + m[0].length - 1);
      if (!args) continue;
      const parts = splitArgs(args);
      const first = parts[0] ?? '';
      /* `orders.router` or `router` — the module is the part before the dot,
         or the name itself. */
      const holder = first.includes('.') ? first.split('.')[0] : first;
      const module = from.get(holder.trim());
      const prefix = literal(keyword(args, 'prefix') ?? '') ?? '';
      all.push({
        host: f,
        target: module ? moduleToFile(root, f, module) : undefined,
        prefix,
      });
    }
  }

  const out = new Map<string, string>();
  for (let pass = 0; pass < 3; pass++) {
    for (const inc of all) {
      if (!inc.target) continue;
      const parent = out.get(inc.host) ?? '';
      const full = joinPath(parent, inc.prefix);
      if (out.get(inc.target) !== full) out.set(inc.target, full);
    }
  }
  return out;
}

/** `APIRouter(prefix="/orders")` declared in this module. */
export function routerPrefix(src: string): string {
  const m = /\bAPIRouter\s*\(/.exec(src);
  if (!m) return '';
  const args = balanced(src, m.index + m[0].length - 1);
  return literal(keyword(args ?? '', 'prefix') ?? '') ?? '';
}

export const fastapiDetector: ApiDetector = {
  id: 'fastapi',
  label: 'FastAPI',

  present(root) {
    for (const f of root.files) {
      if (!/(^|\/)(requirements[\w.-]*\.txt|pyproject\.toml|Pipfile|setup\.cfg)$/.test(f)) continue;
      if (declaresPackage(root.read(f) ?? '', 'fastapi')) return true;
    }
    return false;
  },

  candidates(root) {
    return root.files.filter(f =>
      PY.test(f)
      && !/(^|\/)(tests?|__tests__)\//.test(f)
      && !/(^|\/)test_[^/]*\.py$/.test(f)
      && !/_test\.py$/.test(f)
      /*
        Only files that import FastAPI.

        `@router.get("/x")` is valid Flask too, so without this the two Python
        detectors each read the other's files and every endpoint in a repo that
        uses both is reported twice, once with the wrong prefix.
      */
      && /\bfrom\s+fastapi\b|\bimport\s+fastapi\b|APIRouter/.test(root.read(f) ?? ''));
  },

  index(root) {
    return { includePrefix: buildIncludePrefixes(root) } satisfies FastApiIndex;
  },

  detect(file: SourceFile, index: DetectorIndex, root: RepoRoot): DetectResult {
    const ix = index as FastApiIndex;
    const src = stripComments(file.text);
    const constants = moduleConstants(src);
    const prefix = joinPath(ix.includePrefix.get(file.path) ?? '', routerPrefix(src));

    const findings: Finding[] = [];
    const unresolved: Unresolved[] = [];

    const verbs = HTTP_METHODS.map(v => v.toLowerCase()).join('|');
    const re = new RegExp(`@(\\w+)\\.(${verbs})\\s*\\(`, 'g');

    for (const m of src.matchAll(re)) {
      const args = balanced(src, m.index! + m[0].length - 1);
      if (args === undefined) continue;

      const at = { file: file.path, line: lineOf(src, m.index!), snippet: `@${m[1]}.${m[2]}` };
      const rawPath = positional(args) ?? '';
      const path = resolvePath(rawPath, constants);
      if (path === undefined) {
        unresolved.push({
          expression: `@${m[1]}.${m[2]}(${rawPath.slice(0, 50)})`,
          why: 'The path is built at runtime — daakia will not guess a URL.',
          source: at,
          detector: 'fastapi',
        });
        continue;
      }

      const full = normalisePathParams(joinPath(prefix, path));
      const provenance: Record<string, Provenance> = {
        method: { kind: 'read', at },
        path: prefix ? { kind: 'resolved', at, from: `router prefix ${prefix}` } : { kind: 'read', at },
      };

      const pathParams: Param[] = pathParamNames(full).map(n => ({ name: n, value: '', required: true }));

      /* `status_code=201` is a declaration; its absence means FastAPI's own
         200, which is an assumption and is marked as one. */
      const statusRaw = keyword(args, 'status_code');
      const status = statusRaw && /^\d+$/.test(statusRaw.trim()) ? Number(statusRaw.trim()) : 200;
      provenance.status = statusRaw
        ? { kind: 'read', at }
        : { kind: 'generated', rule: 'no status_code — FastAPI returns 200' };

      /* The function under the decorator: its signature names the body type,
         and `Depends(...)` in it is how FastAPI spells a guard. */
      const def = defAfter(src, m.index!);
      const body = def ? bodyFromSignature(root, def.params) : undefined;
      if (body) provenance.body = body.provenance;

      const guarded = def ? /Depends\s*\(|Security\s*\(/.test(def.params) : false;
      const routerGuard = /dependencies\s*=/.test(src.slice(Math.max(0, m.index! - 400), m.index!));

      findings.push({
        method: m[2].toUpperCase() as HttpMethod,
        path: full,
        name: def ? nameFromDef(def.name) : `${m[2].toUpperCase()} ${full}`,
        pathParams,
        queryParams: [],
        headers: body ? [{ name: 'Content-Type', value: 'application/json', required: true }] : [],
        body: body?.shape,
        auth: guarded || routerGuard ? { scheme: 'bearer', named: 'Depends' } : undefined,
        response: { status },
        provenance: guarded || routerGuard
          ? { ...provenance, auth: { kind: 'read' as const, at } }
          : provenance,
        source: at,
        detector: 'fastapi',
      });
    }

    return { findings, unresolved };
  },

  baseUrl(root) {
    /* `uvicorn.run(app, port=8000)`, or the default everybody leaves alone. */
    for (const f of root.files) {
      if (!PY.test(f)) continue;
      const text = root.read(f);
      if (!text || !/uvicorn\.run|--port/.test(text)) continue;
      const src = stripComments(text);
      const m = /uvicorn\.run\s*\(/.exec(src);
      const args = m && balanced(src, m.index + m[0].length - 1);
      const port = args && /port\s*=\s*(\d{2,5})/.exec(args)?.[1];
      if (!port) continue;
      return {
        url: `http://localhost:${port}`,
        parts: {
          scheme: { kind: 'generated', rule: 'http — no TLS configured in the source' },
          port: { kind: 'read', at: { file: f, line: lineOf(src, m!.index) } },
        },
      };
    }
    return undefined;
  },
};

/**
 * The `def` immediately under a decorator, and its parameter list.
 *
 * `from` is the index of the decorator's own `@`, so the scan starts after
 * that decorator's arguments — the first version searched from the `@` itself
 * and then rejected every match, because its guard against "another route
 * decorator in between" kept finding the decorator it had started from.
 */
export function defAfter(src: string, from: number): { name: string; params: string } | undefined {
  /* Step over this decorator's own call before looking for anything. */
  const openIdx = src.indexOf('(', from);
  let start = from;
  if (openIdx !== -1) {
    let depth = 0, quote: string | undefined;
    for (let i = openIdx; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === '\\') { i++; continue; }
        if (c === quote) quote = undefined;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) { start = i + 1; break; } }
    }
  }

  const window = src.slice(start, start + 3000);
  const m = /\n\s*(?:async\s+)?def\s+(\w+)\s*\(/.exec(window);
  if (!m) return undefined;
  /* A second route decorator between here and the def means this one belongs
     to a different function. */
  if (/@\w+\.(get|post|put|patch|delete|head|options)\s*\(/.test(window.slice(0, m.index))) {
    return undefined;
  }
  const open = start + m.index + m[0].length - 1;
  const params = balanced(src, open);
  return params === undefined ? undefined : { name: m[1], params };
}

/** `create_checkout` → `Create checkout`. */
export function nameFromDef(def: string): string {
  const words = def.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const SCALARS = new Set(['str', 'int', 'float', 'bool', 'UUID', 'datetime', 'date', 'Decimal']);

/**
 * The request body, from whichever parameter is a Pydantic model.
 *
 * A parameter annotated with a model FastAPI has not been told otherwise about
 * IS the body — that is the framework's own rule, and it is why FastAPI gives a
 * better answer here than anything else on this list.
 */
export function bodyFromSignature(
  root: RepoRoot, params: string,
): { shape: { mode: 'raw'; raw: string; from: string }; provenance: Provenance } | undefined {
  for (const part of splitArgs(params)) {
    const m = /^(\w+)\s*:\s*([\w.]+)/.exec(part.trim());
    if (!m) continue;
    const type = m[2].split('.').pop()!;
    if (SCALARS.has(type) || type === 'Request' || type === 'BackgroundTasks') continue;
    if (/Depends|Security|Query|Path|Header|Cookie/.test(part)) continue;

    const model = findModel(root, type);
    if (!model) continue;
    return {
      shape: { mode: 'raw', raw: JSON.stringify(model.json, null, 2), from: type },
      provenance: model.generated.length
        ? { kind: 'generated', rule: model.generated.slice(0, 4).join(', ') }
        : { kind: 'read', at: { file: model.file, line: model.line } },
    };
  }
  return undefined;
}

/** A Pydantic model's fields, walked one level into nested models. */
function findModel(
  root: RepoRoot, name: string, depth = 0, seen = new Set<string>(),
): { json: Record<string, unknown>; file: string; line: number; generated: string[] } | undefined {
  if (depth > 2 || seen.has(name)) return undefined;
  for (const f of root.files) {
    if (!PY.test(f)) continue;
    const text = root.read(f);
    if (!text) continue;
    const src = stripComments(text);
    const decl = new RegExp(`^class\\s+${name}\\s*\\(([^)]*)\\)\\s*:`, 'm').exec(src);
    if (!decl) continue;
    if (!/BaseModel|BaseSettings|\bSchema\b/.test(decl[1])) continue;

    const body = src.slice(decl.index + decl[0].length);
    const end = /\n(?=\S)/.exec(body)?.index ?? body.length;
    const json: Record<string, unknown> = {};
    const generated: string[] = [];
    const next = new Set(seen).add(name);

    for (const fm of body.slice(0, end).matchAll(/^\s+(\w+)\s*:\s*([\w.\[\], ]+?)\s*(?:=\s*(.+))?$/gm)) {
      const field = fm[1];
      const type = fm[2].trim();
      const bare = type.replace(/^Optional\[|^List\[|^list\[|\]$/g, '').split('.').pop()!.trim();
      const isList = /^(List|list)\[/.test(type);

      /* `Field(gt=0)` and friends state a constraint; a value produced to
         satisfy one is generated, and says which rule produced it. */
      const dflt = fm[3]?.trim();
      const constrained = dflt && /Field\s*\(/.test(dflt)
        ? valueFromField(dflt, bare)
        : undefined;
      if (constrained) {
        json[field] = isList ? [constrained.value] : constrained.value;
        generated.push(`${field}: ${constrained.rule}`);
        continue;
      }

      const nested = SCALARS.has(bare) ? undefined : findModel(root, bare, depth + 1, next);
      const value = nested ? nested.json : zeroFor(bare);
      json[field] = isList ? [value] : value;
      if (nested) generated.push(...nested.generated.map(g => `${field}.${g}`));
    }
    return { json, file: f, line: lineOf(src, decl.index), generated };
  }
  return undefined;
}

function valueFromField(dflt: string, type: string): { value: unknown; rule: string } | undefined {
  const gt = /\bgt\s*=\s*(\d+)/.exec(dflt)?.[1];
  const ge = /\bge\s*=\s*(\d+)/.exec(dflt)?.[1];
  if (gt) return { value: Number(gt) + 1, rule: `Field(gt=${gt})` };
  if (ge) return { value: Number(ge), rule: `Field(ge=${ge})` };
  const minLen = /\bmin_length\s*=\s*(\d+)/.exec(dflt)?.[1];
  if (minLen && type === 'str') return { value: 'x'.repeat(Number(minLen)), rule: `Field(min_length=${minLen})` };
  return undefined;
}

function zeroFor(type: string): unknown {
  if (/^(int|float|Decimal)$/.test(type)) return 0;
  if (type === 'bool') return false;
  return '';
}
