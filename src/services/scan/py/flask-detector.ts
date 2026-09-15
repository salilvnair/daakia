/**
 * Flask.
 *
 * ── Two things Flask does that trip a reader ──
 *
 * `methods` defaults to `["GET"]` when it is not stated. Every scanner that
 * forgets this produces a route with no method and drops it, which silently
 * loses most of a read-only API.
 *
 * A blueprint's prefix can be declared in two places and either may be the one
 * used: `Blueprint(..., url_prefix="/api")` at the declaration, or
 * `app.register_blueprint(bp, url_prefix="/api")` at the registration — and
 * the registration wins when both are given. So both are read, and the
 * registration overrides.
 */

import type {
  ApiDetector, DetectorIndex, DetectResult, Finding, HttpMethod, Param,
  Provenance, RepoRoot, SourceFile, Unresolved,
} from '../api-detector';
import { HTTP_METHODS, joinPath, normalisePathParams, pathParamNames } from '../api-detector';
import {
  balanced, declaresPackage, keyword, literal, lineOf, moduleConstants,
  positional, resolvePath, splitArgs, stringList, stripComments,
} from './py-source';
import { defAfter, nameFromDef } from './fastapi-detector';

interface FlaskIndex extends DetectorIndex {
  /** The prefix a registration gave this module's blueprint, if any. */
  registeredPrefix: Map<string, string>;
}

const PY = /\.py$/;

function moduleToFile(root: RepoRoot, fromFile: string, module: string): string | undefined {
  const dir = fromFile.split('/').slice(0, -1);
  const dots = /^\.+/.exec(module)?.[0].length ?? 0;
  const rest = module.slice(dots).split('.').filter(Boolean);
  const base = dots > 0 ? [...dir.slice(0, dir.length - (dots - 1)), ...rest] : rest;
  return [`${base.join('/')}.py`, `${base.join('/')}/__init__.py`]
    .find(c => root.files.includes(c));
}

/** Every `register_blueprint(bp, url_prefix=...)`, by the file `bp` came from. */
export function buildRegistrations(root: RepoRoot): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of root.files) {
    if (!PY.test(f)) continue;
    const text = root.read(f);
    if (!text || !text.includes('register_blueprint')) continue;
    const src = stripComments(text);

    const from = new Map<string, string>();
    for (const m of src.matchAll(/^\s*from\s+([\w.]+)\s+import\s+(.+)$/gm)) {
      for (const name of m[2].split(',')) {
        const clean = name.trim().split(/\s+as\s+/).pop()?.trim();
        if (clean) from.set(clean, m[1]);
      }
    }

    for (const m of src.matchAll(/\bregister_blueprint\s*\(/g)) {
      const args = balanced(src, m.index! + m[0].length - 1);
      if (!args) continue;
      const first = (splitArgs(args)[0] ?? '').trim();
      const holder = first.includes('.') ? first.split('.')[0] : first;
      const module = from.get(holder);
      const target = module ? moduleToFile(root, f, module) : undefined;
      if (!target) continue;
      const prefix = literal(keyword(args, 'url_prefix') ?? '');
      /* Only a registration that actually states a prefix overrides; one that
         does not leaves the blueprint's own declaration in charge. */
      if (prefix !== undefined) out.set(target, prefix);
    }
  }
  return out;
}

/** `Blueprint("orders", __name__, url_prefix="/orders")` in this module. */
export function blueprintPrefix(src: string): string | undefined {
  const m = /\bBlueprint\s*\(/.exec(src);
  if (!m) return undefined;
  const args = balanced(src, m.index + m[0].length - 1);
  return literal(keyword(args ?? '', 'url_prefix') ?? '');
}

export const flaskDetector: ApiDetector = {
  id: 'flask',
  label: 'Flask',

  present(root) {
    for (const f of root.files) {
      if (!/(^|\/)(requirements[\w.-]*\.txt|pyproject\.toml|Pipfile|setup\.cfg)$/.test(f)) continue;
      const text = root.read(f) ?? '';
      /* Quart and Flask-RESTful are Flask-shaped enough that the same reader
         works, and a repository using them is not served by finding nothing. */
      if (declaresPackage(text, 'flask') || declaresPackage(text, 'quart')) return true;
    }
    return false;
  },

  candidates(root) {
    return root.files.filter(f => {
      if (!PY.test(f)) return false;
      if (/(^|\/)(tests?|__tests__)\//.test(f)) return false;
      if (/(^|\/)test_[^/]*\.py$/.test(f)) return false;
      if (/_test\.py$/.test(f)) return false;
      const text = root.read(f) ?? '';
      /*
        Only files that import Flask, and never one that imports FastAPI.

        `@router.get("/x")` is valid in both, so without this each Python
        detector reads the other's files and every endpoint in a repo using
        both is reported twice — once with the wrong prefix, because the
        prefixes come from different places.
      */
      if (/\bfrom\s+fastapi\b|\bimport\s+fastapi\b|APIRouter/.test(text)) return false;
      return /\bfrom\s+(flask|quart)\b|\bimport\s+(flask|quart)\b|Blueprint/i.test(text);
    });
  },

  index(root) {
    return { registeredPrefix: buildRegistrations(root) } satisfies FlaskIndex;
  },

  detect(file: SourceFile, index: DetectorIndex): DetectResult {
    const ix = index as FlaskIndex;
    const src = stripComments(file.text);
    const constants = moduleConstants(src);

    /* The registration wins over the declaration when both state a prefix. */
    const declared = blueprintPrefix(src);
    const registered = ix.registeredPrefix.get(file.path);
    const prefix = registered ?? declared ?? '';

    const findings: Finding[] = [];
    const unresolved: Unresolved[] = [];

    for (const m of src.matchAll(/@(\w+)\.(route|get|post|put|patch|delete)\s*\(/g)) {
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
          detector: 'flask',
        });
        continue;
      }

      /*
        `methods` is absent far more often than it is present, and its absence
        means GET. A reader that treats "no methods" as "no route" loses most
        of a read-only API without saying anything.
      */
      const stated = stringList(keyword(args, 'methods'));
      const methods = m[2] === 'route'
        ? (stated.length ? stated : ['GET'])
        : [m[2].toUpperCase()];
      const methodsDeclared = m[2] !== 'route' || stated.length > 0;

      const full = normalisePathParams(stripConverters(joinPath(prefix, path)));
      const pathParams: Param[] = pathParamNames(full).map(n => ({ name: n, value: '', required: true }));

      const def = defAfter(src, m.index!);
      /* Flask spells a guard as another decorator on the same function. */
      const block = src.slice(m.index!, def ? src.indexOf(`def ${def.name}`, m.index!) : m.index! + 200);
      const guard = /@\w*(login_required|jwt_required|auth\.\w+_required|requires_auth|token_required)/.exec(block);

      for (const raw of methods) {
        const method = raw.toUpperCase() as HttpMethod;
        if (!HTTP_METHODS.includes(method)) continue;

        const provenance: Record<string, Provenance> = {
          method: methodsDeclared
            ? { kind: 'read', at }
            : { kind: 'generated', rule: 'no methods= — Flask defaults to GET' },
          path: prefix ? { kind: 'resolved', at, from: `blueprint prefix ${prefix}` } : { kind: 'read', at },
          ...(guard ? { auth: { kind: 'read' as const, at } } : {}),
        };

        findings.push({
          method,
          path: full,
          name: def ? nameFromDef(def.name) : `${method} ${full}`,
          pathParams,
          queryParams: [],
          headers: [],
          auth: guard ? { scheme: 'bearer', named: guard[1] } : undefined,
          provenance,
          source: at,
          detector: 'flask',
          discriminator: methods.length > 1 ? method.toLowerCase() : undefined,
        });
      }
    }

    return { findings, unresolved };
  },

  baseUrl(root) {
    for (const f of root.files) {
      if (!PY.test(f)) continue;
      const text = root.read(f);
      if (!text || !/app\.run\s*\(|FLASK_RUN_PORT/.test(text)) continue;
      const src = stripComments(text);
      const m = /app\.run\s*\(/.exec(src);
      const args = m && balanced(src, m.index + m[0].length - 1);
      const port = (args && /port\s*=\s*(\d{2,5})/.exec(args)?.[1])
        ?? /FLASK_RUN_PORT\s*=\s*(\d{2,5})/.exec(src)?.[1];
      if (!port) continue;
      return {
        url: `http://localhost:${port}`,
        parts: {
          scheme: { kind: 'generated', rule: 'http — no TLS configured in the source' },
          port: { kind: 'read', at: { file: f, line: lineOf(src, m?.index ?? 0) } },
        },
      };
    }
    /* Flask's own default, which is what `flask run` gives you. */
    for (const f of root.files) {
      if (!/(^|\/)(requirements[\w.-]*\.txt|pyproject\.toml)$/.test(f)) continue;
      return {
        url: 'http://localhost:5000',
        parts: {
          scheme: { kind: 'generated', rule: 'http — no TLS configured in the source' },
          port: { kind: 'generated', rule: 'no port in the source — flask run uses 5000' },
        },
      };
    }
    return undefined;
  },
};

/**
 * `<int:order_id>` → `{order_id}`.
 *
 * Flask's converters are part of the routing rule, not of the URL — a request
 * to `/orders/<int:id>` literally asks for those characters.
 */
export function stripConverters(path: string): string {
  return path.replace(/<(?:[\w.]+(?:\([^)]*\))?:)?(\w+)>/g, '{$1}');
}
