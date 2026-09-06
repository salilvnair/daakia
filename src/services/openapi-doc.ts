/**
 * The OpenAPI document, as far as it can be built from a collection.
 *
 * Split out of `collection-exporter` because that module imports `vscode` for
 * its save dialogs, and none of this needs an editor to be true — the pieces
 * that decide what the spec SAYS are worth testing without one.
 */

export interface OAParam { name: string; in: string; schema: { type: string }; required?: boolean; }
export interface OARequestBody { content: Record<string, { schema: { type: string } }>; required: boolean; }
export interface OAOperation {
  summary: string; description?: string; operationId: string; tags: string[];
  parameters?: OAParam[]; requestBody?: OARequestBody;
  security?: Record<string, string[]>[];
  responses: Record<string, { description: string }>;
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
