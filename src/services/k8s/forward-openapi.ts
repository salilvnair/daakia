/**
 * A pod's OpenAPI document, read through a forward and pointed at it.
 *
 * Where a running service publishes its spec, in the order tried: springdoc,
 * then the usual static names. What comes back is pointed at the forward —
 * `servers` (OpenAPI 3) or `host`/`schemes` (Swagger 2) — keeping any base
 * path, so the imported requests call `http://localhost:<port>/api/…` and not
 * whatever in-cluster address the service advertises.
 */
export const SPEC_PATHS = ['/v3/api-docs', '/v2/api-docs', '/openapi.json', '/swagger.json', '/api-docs', '/openapi.yaml', '/swagger/v1/swagger.json'];

/** The base path a spec declares, without its origin: `https://x/api/v1` → `/api/v1`. */
function basePathOf(url: string | undefined): string {
  if (!url) return '';
  const path = /^[a-z][a-z0-9+.-]*:\/\/[^/]*(\/.*)?$/i.exec(url)?.[1] ?? (url.startsWith('/') ? url : '');
  return path.replace(/\/+$/, '');
}

/**
 * The spec, pointed at `http://localhost:<port>`. JSON only — a YAML spec is
 * returned as it is, and its requests keep the address it declares.
 */
export function pointSpecAt(text: string, port: number): { text: string; pointed: boolean; title?: string } {
  let spec: Record<string, unknown>;
  try { spec = JSON.parse(text); } catch { return { text, pointed: false }; }
  if (!spec || typeof spec !== 'object') return { text, pointed: false };
  const title = (spec.info as { title?: string } | undefined)?.title;
  const origin = `http://localhost:${port}`;
  if (typeof spec.openapi === 'string') {
    const first = (spec.servers as { url?: string }[] | undefined)?.[0]?.url;
    spec.servers = [{ url: origin + basePathOf(first), description: 'dk8s port forward' }];
  } else if (typeof spec.swagger === 'string') {
    spec.host = `localhost:${port}`;
    spec.schemes = ['http'];
  } else {
    return { text, pointed: false, title };
  }
  return { text: JSON.stringify(spec), pointed: true, title };
}
