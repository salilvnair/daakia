/**
 * The request a template is allowed to read, built from the one about to be sent.
 *
 * ── Why this exists ──
 *
 * `renderTemplate` has always taken a `TemplateRequestContext`, and the mock
 * servers fill it from a request that has just ARRIVED — that is what makes
 * `{{request.body.email}}` work in a mock response.
 *
 * The same shape, filled from the request about to LEAVE, is what makes
 * `{{jsonPath request.body '$.orderId'}}` work in one of its own headers. It
 * is the only piece the request side was missing; every helper that reads it
 * was already written.
 *
 * ── What is deliberately absent ──
 *
 * `pathParams` and `stateVars` are empty here and stay that way. They are
 * things a mock server knows because it matched the request against a stub it
 * owns — an outgoing request has been matched against nothing, and inventing
 * plausible values for them would be worse than leaving them blank.
 */
import type { TemplateRequestContext } from './render';

export interface OutgoingRequest {
  method: string;
  url: string;
  /** Rows as the UI holds them, or an already-flattened map. */
  headers?: { key: string; value: string; enabled?: boolean }[] | Record<string, string>;
  body?: string;
}

function headerMap(
  headers: OutgoingRequest['headers'],
): Record<string, string> {
  if (!headers) return {};
  if (!Array.isArray(headers)) return { ...headers };
  const out: Record<string, string> = {};
  for (const h of headers) {
    if (h.key && h.enabled !== false) out[h.key] = h.value;
  }
  return out;
}

/**
 * Split a URL without throwing on the half-typed ones people actually send.
 *
 * `new URL()` rejects `localhost:8080/x` and `{{host}}/orders`, and a template
 * that threw here would take the whole request down over a query string
 * nothing in it even referenced.
 */
function parseUrl(url: string): Pick<TemplateRequestContext, 'path' | 'host' | 'port' | 'queryParams' | 'pathSegments'> {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`);
    const queryParams: Record<string, string> = {};
    u.searchParams.forEach((v, k) => { queryParams[k] = v; });
    return {
      path: u.pathname,
      host: u.hostname,
      port: u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80),
      queryParams,
      pathSegments: u.pathname.split('/').filter(Boolean),
    };
  } catch {
    const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').split('?')[0];
    return { path, host: '', port: 0, queryParams: {}, pathSegments: path.split('/').filter(Boolean) };
  }
}

/** Cookies as the engine wants them, read out of a Cookie header. */
function cookieMap(headers: Record<string, string>): Record<string, string> {
  const raw = headers.Cookie ?? headers.cookie;
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(';')) {
    const eq = pair.indexOf('=');
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

export function requestContext(req: OutgoingRequest): TemplateRequestContext {
  const headers = headerMap(req.headers);
  const body = req.body ?? '';
  return {
    url: req.url,
    method: req.method,
    headers,
    cookies: cookieMap(headers),
    body,
    /*
      Parsed once and handed over, rather than re-parsed inside every
      `{{request.body.x}}`. A body that is not JSON simply has none — the
      helpers fall back to the raw string, which is the right answer for XML
      and form bodies.
    */
    parsedBody: parsedJson(body),
    pathParams: {},
    ...parseUrl(req.url),
  };
}

function parsedJson(body: string): unknown {
  if (!body || !/^\s*[[{]/.test(body)) return undefined;
  try { return JSON.parse(body); } catch { return undefined; }
}
