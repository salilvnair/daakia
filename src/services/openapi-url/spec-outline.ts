/**
 * A spec, read into what the Swagger URL import wizard shows.
 *
 * The wizard never sees the spec itself — it can be megabytes — only this
 * outline: one row per operation, the tags, the servers resolved to real
 * URLs, the auth schemes with the variable each one will read, and the path
 * parameters every request shares. The host keeps the parsed spec and builds
 * the collection from it when the wizard sends back its arrangement.
 */
import * as yaml from 'js-yaml';
import { HTTP_METHODS, type OpenAPISpec, type OpenAPIOperation, type OpenAPIParameter } from '../openapi-importer';

export interface OutlineOperation {
  /** Stable within one outline: `${method} ${path}`. */
  id: string;
  method: string;
  path: string;
  summary: string;
  operationId: string;
  tag: string;
  deprecated: boolean;
  /** Names of the security schemes this operation asks for, in order. */
  security: string[];
}

export interface OutlineServer { url: string; resolved: string; description: string }

export interface OutlineScheme {
  name: string;
  /** What Daakia sets on the collection: api-key, bearer, basic or oauth2. */
  kind: 'api-key' | 'bearer' | 'basic' | 'oauth2';
  label: string;
  detail: string;
  /** Environment variables this scheme reads, the first being its credential. */
  variables: { key: string; secret: boolean }[];
  apiKeyName?: string;
  apiKeyIn?: 'header' | 'query';
  grantType?: 'authorization_code' | 'client_credentials' | 'password';
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  operationCount: number;
}

export interface OutlinePathParam { name: string; type: string; example: string; used: number }

export interface SpecOutline {
  title: string;
  version: string;
  specVersion: string;
  format: 'JSON' | 'YAML';
  operations: OutlineOperation[];
  tags: { name: string; count: number }[];
  servers: OutlineServer[];
  schemes: OutlineScheme[];
  pathParams: OutlinePathParam[];
  schemaCount: number;
}

interface FullScheme {
  type?: string;
  scheme?: string;
  name?: string;
  in?: string;
  flow?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: Record<string, string>;
  flows?: Record<string, { authorizationUrl?: string; tokenUrl?: string; scopes?: Record<string, string> }>;
  openIdConnectUrl?: string;
}

/** Parse JSON or YAML; throw a readable error for anything that is not a spec. */
export function parseSpec(text: string): { spec: OpenAPISpec; format: 'JSON' | 'YAML' } {
  const trimmed = text.trim();
  let spec: OpenAPISpec;
  let format: 'JSON' | 'YAML';
  if (trimmed.startsWith('{')) {
    spec = JSON.parse(trimmed);
    format = 'JSON';
  } else {
    spec = yaml.load(trimmed) as OpenAPISpec;
    format = 'YAML';
  }
  if (!spec || typeof spec !== 'object' || (!spec.openapi && !spec.swagger)) {
    throw new Error('That document is not an OpenAPI 3 or Swagger 2 spec.');
  }
  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    throw new Error('The spec has no paths, so there is nothing to import.');
  }
  return { spec, format };
}

/** Every operation in path order, with the parameters it actually takes. */
export function eachOperation(spec: OpenAPISpec): { method: string; path: string; op: OpenAPIOperation; params: OpenAPIParameter[] }[] {
  const out: { method: string; path: string; op: OpenAPIOperation; params: OpenAPIParameter[] }[] = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    if (!item || typeof item !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      // Operation-level parameters override path-level ones of the same name and place.
      const byKey = new Map<string, OpenAPIParameter>();
      for (const p of [...(item.parameters ?? []), ...(op.parameters ?? [])]) {
        if (p && typeof p === 'object' && 'name' in p) byKey.set(`${p.in}:${p.name}`, p);
      }
      out.push({ method: method.toUpperCase(), path, op, params: [...byKey.values()] });
    }
  }
  return out;
}

/**
 * Servers as URLs you can send to.
 *
 * `/api/v3` is resolved against the address the spec came from — Petstore's
 * own server entry is relative — and `{var}` takes its default. A Swagger 2
 * spec without a `host` is served from the host it was fetched from.
 */
export function resolveServers(spec: OpenAPISpec, specUrl: string): OutlineServer[] {
  const base = (() => { try { return new URL(specUrl); } catch { return null; } })();
  const resolve = (u: string) => {
    if (!base) return u;
    try { return new URL(u, base).toString().replace(/\/$/, ''); } catch { return u; }
  };
  if (spec.servers?.length) {
    return spec.servers.map(s => {
      const vars = (s as { variables?: Record<string, { default?: string }> }).variables ?? {};
      const url = String(s.url ?? '').replace(/\{([^}]+)\}/g, (m, k) => vars[k]?.default ?? m);
      return { url: String(s.url ?? ''), resolved: resolve(url || '/'), description: s.description ?? '' };
    });
  }
  if (spec.swagger) {
    const scheme = spec.schemes?.[0] ?? (base?.protocol.replace(':', '') || 'https');
    const host = spec.host ?? base?.host ?? '';
    const url = `${scheme}://${host}${spec.basePath ?? ''}`;
    return [{ url, resolved: url.replace(/\/$/, ''), description: '' }];
  }
  return base ? [{ url: '/', resolved: base.origin, description: '' }] : [];
}

function camel(s: string): string {
  const parts = s.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'apiKey';
  return parts.map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p[0].toLowerCase() + p.slice(1))).join('');
}

function readSchemes(spec: OpenAPISpec): { name: string; s: FullScheme }[] {
  const raw = ((spec.components?.securitySchemes ?? spec.securityDefinitions) ?? {}) as Record<string, FullScheme>;
  return Object.entries(raw).filter(([, s]) => s && typeof s === 'object').map(([name, s]) => ({ name, s }));
}

/** One Daakia auth per scheme, and the variables it reads — unique across schemes. */
function toSchemes(spec: OpenAPISpec, counts: Map<string, number>): OutlineScheme[] {
  const taken = new Set<string>(['baseUrl']);
  const claim = (want: string) => {
    let k = want, n = 2;
    while (taken.has(k)) k = `${want}${n++}`;
    taken.add(k);
    return k;
  };
  const out: OutlineScheme[] = [];
  for (const { name, s } of readSchemes(spec)) {
    const type = (s.type ?? '').toLowerCase();
    const opCount = counts.get(name) ?? 0;
    if (type === 'apikey') {
      const where = s.in === 'query' ? 'query' : 'header';
      const key = claim(camel(name) === 'apiKey' || /key/i.test(name) ? camel(name) : 'apiKey');
      out.push({
        name, kind: 'api-key', label: `API key · ${name}`,
        detail: `${where} ${s.name ?? name}`,
        variables: [{ key, secret: true }],
        apiKeyName: s.name ?? name, apiKeyIn: where, operationCount: opCount,
      });
    } else if (type === 'http' && (s.scheme ?? '').toLowerCase() === 'basic' || type === 'basic') {
      out.push({
        name, kind: 'basic', label: `Basic · ${name}`, detail: 'Authorization: Basic',
        variables: [{ key: claim('username'), secret: false }, { key: claim('password'), secret: true }],
        operationCount: opCount,
      });
    } else if (type === 'http') {
      out.push({
        name, kind: 'bearer', label: `Bearer · ${name}`, detail: 'Authorization: Bearer',
        variables: [{ key: claim('bearerToken'), secret: true }], operationCount: opCount,
      });
    } else if (type === 'oauth2' || type === 'openidconnect') {
      // OpenAPI 3 `flows`, or Swagger 2's single `flow`.
      const flows = s.flows ?? (s.flow ? { [s.flow]: { authorizationUrl: s.authorizationUrl, tokenUrl: s.tokenUrl, scopes: s.scopes } } : {});
      const [flowName, flow] = Object.entries(flows)[0] ?? ['', {}];
      const grantType: OutlineScheme['grantType'] =
        /client|application/i.test(flowName) ? 'client_credentials'
          : /password/i.test(flowName) ? 'password'
            : 'authorization_code';
      const label = flowName ? `OAuth 2 ${flowName.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}` : 'OpenID Connect';
      const variables = [{ key: claim('accessToken'), secret: true }, { key: claim('clientId'), secret: false }];
      if (grantType !== 'authorization_code' || /code/i.test(flowName)) variables.push({ key: claim('clientSecret'), secret: true });
      out.push({
        name, kind: 'oauth2', label: `${label} · ${name}`,
        detail: flow.authorizationUrl ?? flow.tokenUrl ?? s.openIdConnectUrl ?? '',
        variables, grantType,
        authorizationUrl: flow.authorizationUrl, tokenUrl: flow.tokenUrl,
        scopes: Object.keys(flow.scopes ?? {}), operationCount: opCount,
      });
    }
  }
  return out;
}

function paramType(p: OpenAPIParameter): string {
  const sc = (p.schema ?? p) as { type?: string; format?: string };
  return [sc.type, sc.format].filter(Boolean).join(' · ') || 'string';
}

function paramExample(p: OpenAPIParameter): string {
  const v = p.example ?? p.schema?.example ?? p.schema?.default;
  return v === undefined || v === null ? '' : String(v);
}

export function outlineSpec(spec: OpenAPISpec, format: 'JSON' | 'YAML', specUrl: string): SpecOutline {
  const ops = eachOperation(spec);
  const rootSecurity = (spec as { security?: Record<string, string[]>[] }).security;
  const counts = new Map<string, number>();
  const tagCount = new Map<string, number>();
  const pathParams = new Map<string, OutlinePathParam>();

  const operations: OutlineOperation[] = ops.map(({ method, path, op, params }) => {
    const reqs = op.security ?? rootSecurity ?? [];
    const security = [...new Set(reqs.flatMap(r => Object.keys(r ?? {})))];
    for (const name of security) counts.set(name, (counts.get(name) ?? 0) + 1);
    const tag = op.tags?.[0] ?? 'Untagged';
    tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    for (const p of params.filter(x => x.in === 'path')) {
      const seen = pathParams.get(p.name);
      if (seen) { seen.used++; if (!seen.example) seen.example = paramExample(p); }
      else pathParams.set(p.name, { name: p.name, type: paramType(p), example: paramExample(p), used: 1 });
    }
    return {
      id: `${method} ${path}`, method, path,
      summary: (op.summary ?? '').trim().replace(/\.$/, ''),
      operationId: op.operationId ?? '',
      tag, deprecated: !!op.deprecated, security,
    };
  });

  // Tags in the order the spec declares them, then any it only uses.
  const declared = (spec.tags ?? []).map(t => t.name).filter(n => tagCount.has(n));
  const rest = [...tagCount.keys()].filter(n => !declared.includes(n));
  const schemas = spec.components?.schemas ?? (spec as { definitions?: Record<string, unknown> }).definitions ?? {};

  return {
    title: spec.info?.title ?? 'Imported API',
    version: spec.info?.version ?? '',
    specVersion: spec.openapi ? `OpenAPI ${spec.openapi}` : `Swagger ${spec.swagger}`,
    format,
    operations,
    tags: [...declared, ...rest].map(name => ({ name, count: tagCount.get(name) ?? 0 })),
    servers: resolveServers(spec, specUrl),
    schemes: toSchemes(spec, counts),
    pathParams: [...pathParams.values()],
    schemaCount: Object.keys(schemas).length,
  };
}
