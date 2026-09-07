/**
 * The OpenAPI document, as far as it can be built from a collection.
 *
 * Split out of `collection-exporter` because that module imports `vscode` for
 * its save dialogs, and none of this needs an editor to be true — the pieces
 * that decide what the spec SAYS are worth testing without one.
 */

export interface OAParam { name: string; in: string; schema: { type: string }; required?: boolean; }
export interface OAMediaType {
  schema: Record<string, unknown>;
  /** One saved response, shown as the example for this media type. */
  example?: unknown;
}
export interface OARequestBody { content: Record<string, OAMediaType>; required: boolean; }
export interface OAResponse { description: string; content?: Record<string, OAMediaType>; }
export interface OAOperation {
  summary: string; description?: string; operationId: string; tags: string[];
  parameters?: OAParam[]; requestBody?: OARequestBody;
  security?: Record<string, string[]>[];
  responses: Record<string, OAResponse>;
}

type OASecurityScheme =
  | { type: 'http'; scheme: string; bearerFormat?: string }
  | { type: 'apiKey'; in: 'header' | 'query'; name: string };

/** What a walk over the tree collects besides the paths themselves. */
export interface OAContext {
  paths: Record<string, Record<string, OAOperation>>;
  /** Distinct base URLs — an origin, or the variable a collection templates on. */
  servers: Set<string>;
  /** Named schemes, by the name the operations reference them under. */
  schemes: Map<string, OASecurityScheme>;
}

/**
 * The path, and where it is served from.
 *
 * Two things were wrong with taking `new URL(...).pathname` and nothing else.
 * A collection that templates its host — `{{baseUrl}}/users`, the convention
 * every exported Postman collection uses — parsed as a host of
 * `placeholder{{baseurl}}`, so the base URL vanished and, worse, an operation
 * whose whole path was the variable collapsed to `/`. And `{id}`, OpenAPI's
 * own path-templating syntax, came back percent-encoded as `%7Bid%7D`, which
 * no tool reads as a parameter.
 */
export function splitUrl(raw: string): { path: string; server?: string } {
  const url = (raw || '').trim();
  if (!url) return { path: '/' };

  // A leading {{var}} is the base URL, stated the way Daakia states it.
  const templated = url.match(/^(\{\{[\w.\-]+\}\})(.*)$/);
  const rest = templated ? templated[2] : url;
  const server = templated ? templated[1] : undefined;

  let path = rest;
  if (!templated) {
    try {
      const u = new URL(url.startsWith('http') ? url : `http://placeholder/${url.replace(/^\/+/, '')}`);
      path = u.pathname || '/';
      if (url.startsWith('http')) return { path: decodeBraces(path), server: u.origin };
    } catch {
      path = '/';
    }
  } else {
    // Strip the query; OpenAPI carries those as parameters, not in the path.
    path = rest.split('?')[0] || '/';
  }
  path = decodeBraces(path.split('?')[0] || '/');
  if (!path.startsWith('/')) path = `/${path}`;
  return server ? { path, server } : { path };
}

/** `%7Bid%7D` is `{id}` — OpenAPI's path parameter, not an escaped literal. */
function decodeBraces(path: string): string {
  return path.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
}

/**
 * The auth a request already carries, as a scheme a spec can name.
 *
 * Every request holds a fully specified auth type, and the exported document
 * had no `securitySchemes` block at all — so the bearer or API key someone
 * spent time configuring simply vanished on export, and the spec described an
 * API that needs no credentials.
 */
export function schemeFor(d: Record<string, unknown>): { name: string; scheme: OASecurityScheme } | null {
  const authType = (d.authType as string) || '';
  const authData = (d.authData as Record<string, unknown>) || {};
  if (authType === 'bearer') return { name: 'bearerAuth', scheme: { type: 'http', scheme: 'bearer' } };
  if (authType === 'basic') return { name: 'basicAuth', scheme: { type: 'http', scheme: 'basic' } };
  if (authType === 'apikey') {
    const key = String(authData.key ?? '').trim();
    if (!key) return null;
    const where = (authData.addTo as string) === 'query' ? 'query' : 'header';
    // Named after the key, because two API-key headers in one collection are
    // two schemes, not one with the last one's name.
    return { name: `apiKey_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`, scheme: { type: 'apiKey', in: where, name: key } };
  }
  return null;
}

/**
 * The document itself.
 *
 * `servers` and `components.securitySchemes` are the two blocks the export was
 * missing entirely: the base URL was baked into every path, and the auth every
 * request carries was simply absent, so the spec described an API that needs
 * no credentials and lives nowhere.
 *
 * 3.1.0, because the AI doc generator has always said OpenAPI 3.1 and this
 * said 3.0.3 — one app, two spec versions, depending which button you pressed.
 */
export function buildOpenApiDoc(collectionName: string, ctx: OAContext) {
  const servers = [...ctx.servers].map(url => ({ url }));
  const schemes = Object.fromEntries(ctx.schemes);
  return {
    openapi: '3.1.0',
    info: {
      title: collectionName,
      version: '1.0.0',
      description: `OpenAPI 3.1 spec generated from Daakia collection — ${collectionName}`,
    },
    ...(servers.length ? { servers } : {}),
    ...(Object.keys(schemes).length ? { components: { securitySchemes: schemes } } : {}),
    paths: ctx.paths,
  };
}

/**
 * A JSON Schema inferred from a body that actually came back.
 *
 * Every request body exported as `{ type: 'object' }` and every response as a
 * bare description — a stub spec, produced by an app that had a real payload
 * sitting right there. This walks one, which is enough to be useful and
 * honest about what it is: a description of one example, not a contract.
 *
 * Depth and width are capped. A deeply nested response would otherwise
 * produce a spec longer than the API it describes, and nobody reads page
 * fourteen of an inferred schema.
 */
export function inferSchema(value: unknown, depth = 0): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (depth >= MAX_SCHEMA_DEPTH) return {};

  if (Array.isArray(value)) {
    // The first element, because an array of mixed shapes is a union nobody
    // can act on and a per-element walk is unbounded work for a stub.
    return value.length > 0
      ? { type: 'array', items: inferSchema(value[0], depth + 1) }
      : { type: 'array' };
  }

  switch (typeof value) {
    case 'string': return stringSchema(value);
    case 'number': return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
    case 'boolean': return { type: 'boolean' };
    case 'object': break;
    default: return {};
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_SCHEMA_PROPS);
  const properties: Record<string, unknown> = {};
  for (const [k, v] of entries) properties[k] = inferSchema(v, depth + 1);
  return {
    type: 'object',
    properties,
    /*
      Every key that was present is required.

      An inferred schema describes the one body it saw, and in that body every
      key it lists was there. Marking them optional would describe a different,
      weaker thing — and someone hand-editing the spec afterwards can relax it,
      which is easier than working out what was ever present.
    */
    ...(entries.length ? { required: entries.map(([k]) => k) } : {}),
  };
}

const MAX_SCHEMA_DEPTH = 8;
const MAX_SCHEMA_PROPS = 60;

/** Formats worth naming, recognised conservatively enough to be right. */
function stringSchema(value: string): Record<string, unknown> {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return { type: 'string', format: 'date-time' };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { type: 'string', format: 'date' };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return { type: 'string', format: 'uuid' };
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return { type: 'string', format: 'email' };
  return { type: 'string' };
}

/** Parse a body and infer from it, or say nothing rather than guess. */
export function schemaFromBody(body: string | undefined): Record<string, unknown> | undefined {
  if (!body || !body.trim()) return undefined;
  try {
    return inferSchema(JSON.parse(body));
  } catch {
    // Not JSON — XML, a form, an image. An inferred JSON schema would be a
    // claim about a body this is not.
    return undefined;
  }
}

/**
 * The `responses` block, from what this request has actually returned.
 *
 * Saved examples are the only real knowledge the app has about what comes
 * back, so a request with them describes its own responses — status by
 * status, with a schema inferred from the body and the body itself as the
 * example. Without them the old placeholder trio stands: it says nothing, but
 * it says it in a shape tools can read.
 */
export function responsesFrom(examples: unknown): Record<string, OAResponse> {
  const list = Array.isArray(examples) ? examples as Record<string, unknown>[] : [];
  const out: Record<string, OAResponse> = {};

  for (const ex of list) {
    const status = typeof ex.status === 'number' && ex.status > 0 ? String(ex.status) : null;
    if (!status || out[status]) continue;   // First example for a status wins.
    const name = typeof ex.name === 'string' ? ex.name : '';
    const statusText = typeof ex.statusText === 'string' ? ex.statusText : '';
    const body = typeof ex.body === 'string' ? ex.body : '';
    const ct = typeof ex.contentType === 'string' && ex.contentType
      ? ex.contentType.split(';')[0]!.trim()
      : 'application/json';

    const schema = schemaFromBody(body);
    out[status] = {
      description: name || statusText || `Response ${status}`,
      ...(schema ? { content: { [ct]: { schema, example: safeParse(body) } } } : {}),
    };
  }

  if (Object.keys(out).length > 0) return out;
  return {
    '200': { description: 'Successful response' },
    '400': { description: 'Bad request' },
    '500': { description: 'Server error' },
  };
}

function safeParse(body: string): unknown {
  try { return JSON.parse(body); } catch { return undefined; }
}
