/**
 * The collection the wizard asked for, built from the spec.
 *
 * Generic on purpose, so one collection runs against any copy of the service:
 *   - every URL starts `{{baseUrl}}`, and each environment says what that is;
 *   - each auth scheme reads its credential from an environment variable,
 *     marked secret, so it is encrypted at rest and redacted on export;
 *   - a path parameter the user shared is `{{petId}}`, a collection variable;
 *     one they did not stays in the URL with the spec's example, or as a
 *     variable of its own name when there is none.
 *
 * The most-used auth scheme goes on the collection, and every folder inherits
 * it. A request that asks for another scheme carries that one itself.
 */
import { randomUUID } from 'crypto';
import type { OpenAPISpec, OpenAPIParameter } from '../openapi-importer';
import { buildHeaders, buildQueryParams, extractRequestBody } from '../openapi-importer';
import { eachOperation, type SpecOutline, type OutlineScheme } from './spec-outline';

export interface ImportPlan {
  collectionName: string;
  folders: { id: string; name: string; parentId: string | null }[];
  /** In the order they should appear; `opId` is an outline operation id. */
  requests: { opId: string; folderId: string | null; name: string }[];
  pathVars: { name: string; shared: boolean; value: string }[];
  environments: { name: string; values: Record<string, string> }[];
}

export interface BuiltCollection {
  root: { id: string; name: string; data: Record<string, unknown> };
  folders: { id: string; name: string; parentId: string }[];
  requests: { id: string; folderId: string; name: string; method: string; url: string; data: Record<string, unknown>; sortOrder: number }[];
  environments: { id: string; name: string; variables: { id: string; key: string; initialValue: string; currentValue: string; isSecret: boolean }[] }[];
}

const v = (k: string) => `{{${k}}}`;

/** Daakia's auth for one scheme, every credential a variable. */
export function authFor(s: OutlineScheme): { authType: string; authData: Record<string, string> } {
  const cred = s.variables[0]?.key ?? 'token';
  switch (s.kind) {
    case 'api-key':
      return { authType: 'api-key', authData: { apiKeyName: s.apiKeyName ?? s.name, apiKeyValue: v(cred), apiKeyIn: s.apiKeyIn ?? 'header' } };
    case 'basic':
      return { authType: 'basic', authData: { username: v(s.variables[0].key), password: v(s.variables[1]?.key ?? 'password') } };
    case 'bearer':
      return { authType: 'bearer', authData: { token: v(cred) } };
    case 'oauth2': {
      const data: Record<string, string> = {
        oauth2GrantType: s.grantType ?? 'authorization_code',
        accessToken: v(cred),
        oauth2ClientId: v(s.variables.find(x => x.key.startsWith('clientId'))?.key ?? 'clientId'),
      };
      const secret = s.variables.find(x => x.key.startsWith('clientSecret'));
      if (secret) data.oauth2ClientSecret = v(secret.key);
      if (s.authorizationUrl) data.oauth2AuthUrl = s.authorizationUrl;
      if (s.tokenUrl) data.oauth2TokenUrl = s.tokenUrl;
      if (s.scopes?.length) data.oauth2Scope = s.scopes.join(' ');
      return { authType: 'oauth2', authData: data };
    }
  }
}

/** A JSON example for a schema: its own example, else one built from its properties. */
export function exampleFor(schema: unknown, spec: OpenAPISpec, depth = 0): unknown {
  if (!schema || typeof schema !== 'object' || depth > 6) return undefined;
  let s = schema as Record<string, unknown>;
  const ref = s.$ref;
  if (typeof ref === 'string' && ref.startsWith('#/')) {
    const target = ref.slice(2).split('/').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined), spec);
    return exampleFor(target, spec, depth + 1);
  }
  if (s.example !== undefined) return s.example;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (s.default !== undefined) return s.default;
  for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
    const list = s[key];
    if (Array.isArray(list) && list.length) {
      if (key !== 'allOf') return exampleFor(list[0], spec, depth + 1);
      const merged: Record<string, unknown> = {};
      for (const part of list) {
        const ex = exampleFor(part, spec, depth + 1);
        if (ex && typeof ex === 'object' && !Array.isArray(ex)) Object.assign(merged, ex);
      }
      return merged;
    }
  }
  const type = s.type ?? (s.properties ? 'object' : undefined);
  if (type === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, sub] of Object.entries((s.properties ?? {}) as Record<string, unknown>)) {
      const ex = exampleFor(sub, spec, depth + 1);
      if (ex !== undefined) out[k] = ex;
    }
    return out;
  }
  if (type === 'array') {
    const item = exampleFor(s.items, spec, depth + 1);
    return item === undefined ? [] : [item];
  }
  if (type === 'integer' || type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'string') {
    s = s as { format?: string };
    if (s.format === 'date-time') return '2026-01-01T00:00:00Z';
    if (s.format === 'date') return '2026-01-01';
    if (s.format === 'email') return 'user@example.com';
    if (s.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
    return 'string';
  }
  return undefined;
}

function jsonBodyFor(op: { requestBody?: unknown; parameters?: OpenAPIParameter[] }, spec: OpenAPISpec): string | null {
  const content = (op.requestBody as { content?: Record<string, { schema?: unknown }> } | undefined)?.content;
  const schema = content?.['application/json']?.schema
    ?? (op.parameters as unknown as { in: string; schema?: unknown }[] | undefined)?.find(p => p.in === 'body')?.schema;
  if (!schema) return null;
  const ex = exampleFor(schema, spec);
  return ex === undefined ? null : JSON.stringify(ex, null, 2);
}

export function buildCollection(spec: OpenAPISpec, outline: SpecOutline, plan: ImportPlan): BuiltCollection {
  const isSwagger2 = !!spec.swagger;
  const ops = new Map(eachOperation(spec).map(o => [`${o.method} ${o.path}`, o]));
  const outlineOps = new Map(outline.operations.map(o => [o.id, o]));
  const schemes = new Map(outline.schemes.map(s => [s.name, s]));

  // The collection's own auth: the scheme the most requests ask for.
  const used = new Map<string, number>();
  for (const r of plan.requests) {
    const first = outlineOps.get(r.opId)?.security[0];
    if (first && schemes.has(first)) used.set(first, (used.get(first) ?? 0) + 1);
  }
  const main = [...used.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const rootAuth = main ? authFor(schemes.get(main)!) : { authType: 'none', authData: {} };

  const shared = new Map(plan.pathVars.filter(p => p.shared).map(p => [p.name, p.value]));
  const rootId = randomUUID();
  const root = {
    id: rootId,
    name: plan.collectionName.trim() || outline.title,
    data: {
      headers: [],
      ...rootAuth,
      variables: [...shared.entries()].map(([key, value]) => ({ key, value, enabled: true })),
      preRequestScript: '',
      postResponseScript: '',
    } as Record<string, unknown>,
  };
  const schemas = spec.components?.schemas ?? (spec as { definitions?: Record<string, unknown> }).definitions;
  if (schemas && Object.keys(schemas).length) root.data.schemas = schemas;

  // Folders keep the wizard's ids only long enough to be renamed to real ones.
  const ids = new Map<string, string>(plan.folders.map(f => [f.id, randomUUID()]));
  const folders = plan.folders.map(f => ({
    id: ids.get(f.id)!,
    name: f.name.trim() || 'Untitled folder',
    parentId: f.parentId && ids.has(f.parentId) ? ids.get(f.parentId)! : rootId,
  }));

  const requests = plan.requests.flatMap((r, i) => {
    const o = ops.get(r.opId);
    const meta = outlineOps.get(r.opId);
    if (!o || !meta) return [];
    const pathOnly = o.path.replace(/\{([^}]+)\}/g, (_m, name: string) => {
      if (shared.has(name)) return v(name);
      const p = o.params.find(x => x.in === 'path' && x.name === name);
      const ex = p?.example ?? p?.schema?.example ?? p?.schema?.default;
      return ex !== undefined && ex !== null ? encodeURIComponent(String(ex)) : v(name);
    });
    const headers = buildHeaders(o.params);
    const body = extractRequestBody({ ...o.op, parameters: o.params }, isSwagger2);
    if (body.bodyMode === 'json') {
      const generated = (!body.bodyRaw || body.bodyRaw === '{}') ? jsonBodyFor({ ...o.op, parameters: o.params } as never, spec) : null;
      if (generated) body.bodyRaw = generated;
      if (!headers.some(h => h.key.toLowerCase() === 'content-type')) headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
    }
    // Auth: inherit the collection's unless this operation asks for something else.
    // ('none' on a request means "inherit" in Daakia, so an operation the spec
    // marks open still gets the collection's credential — harmless, and the
    // alternative is a flag nothing reads.)
    let auth: { authType: string; authData: Record<string, string> } = { authType: 'none', authData: {} };
    const wants = meta.security.filter(n => schemes.has(n));
    if (wants.length && !wants.includes(main ?? '')) auth = authFor(schemes.get(wants[0])!);
    return [{
      id: randomUUID(),
      folderId: r.folderId && ids.has(r.folderId) ? ids.get(r.folderId)! : rootId,
      name: r.name.trim() || meta.summary || meta.operationId || `${meta.method} ${meta.path}`,
      method: o.method,
      url: `${v('baseUrl')}${pathOnly}`,
      data: { headers, params: buildQueryParams(o.params), ...body, ...auth },
      sortOrder: i,
    }];
  });

  const varKeys = [{ key: 'baseUrl', secret: false }, ...outline.schemes.flatMap(s => s.variables)];
  const environments = plan.environments.map(env => ({
    id: randomUUID(),
    name: env.name.trim() || 'Untitled',
    variables: varKeys.map(k => {
      const value = env.values[k.key] ?? '';
      return { id: randomUUID(), key: k.key, initialValue: value, currentValue: value, isSecret: k.secret };
    }),
  }));

  return { root, folders, requests, environments };
}
