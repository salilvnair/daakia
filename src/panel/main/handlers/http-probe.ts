/**
 * One HTTP request, measured.
 *
 * The load tester and the bulk URL tester both need the same small thing: send
 * a request, time it, count the bytes, report what came back — and never throw,
 * because a run of ten thousand requests must not end on the first refused
 * connection. Two copies of that would drift, and this codebase has already
 * watched two copies of an HTTP contract drift apart.
 */
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface ProbeOptions {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  followRedirects: boolean;
  insecureTls?: boolean;
  agents?: { http: http.Agent; https: https.Agent };
  /** Redirect hops still allowed; callers do not set this. */
  redirectsLeft?: number;
}

export interface ProbeResult {
  /** 0 when the request never got a response. */
  status: number;
  statusText: string;
  ms: number;
  bytes: number;
  /** How many redirects were followed to get here. */
  redirects: number;
  contentType: string;
  /** Set when the request failed outright — a refusal, a timeout, a bad URL. */
  error?: string;
}

/**
 * A message worth showing for a failed request.
 *
 * Node's happy-eyeballs path rejects a refused localhost connection with an
 * `AggregateError` whose own `message` is the empty string — the real reasons
 * are on `.errors`. Reading `.message` alone gave the panel a red row with
 * nothing written on it.
 */
function describeError(err: unknown): string {
  const e = err as { message?: string; code?: string; errors?: unknown[] };
  if (e?.message) return e.code && !e.message.includes(e.code) ? `${e.code}: ${e.message}` : e.message;
  if (Array.isArray(e?.errors) && e.errors.length > 0) {
    const parts = e.errors.map(describeError).filter(Boolean);
    if (parts.length > 0) return [...new Set(parts)].join('; ');
  }
  if (e?.code) return e.code;
  return 'Request failed';
}

export function probe(options: ProbeOptions): Promise<ProbeResult> {
  const t0 = Date.now();
  const redirectsLeft = options.redirectsLeft ?? 5;

  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(options.url);
    } catch {
      resolve({ status: 0, statusText: '', ms: 0, bytes: 0, redirects: 0, contentType: '', error: 'Not a valid URL' });
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ status: 0, statusText: '', ms: 0, bytes: 0, redirects: 0, contentType: '', error: `Unsupported protocol ${parsed.protocol}` });
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const bodyBuffer = options.body ? Buffer.from(options.body, 'utf8') : null;

    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method.toUpperCase(),
      timeout: options.timeoutMs,
      agent: options.agents ? (isHttps ? options.agents.https : options.agents.http) : undefined,
      headers: bodyBuffer ? { ...options.headers, 'Content-Length': bodyBuffer.length } : options.headers,
      rejectUnauthorized: !options.insecureTls,
    }, (res) => {
      const status = res.statusCode ?? 0;

      if (options.followRedirects && status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(res.headers.location, options.url).toString();
        probe({ ...options, url: next, redirectsLeft: redirectsLeft - 1 })
          .then(r => resolve({ ...r, ms: Date.now() - t0, redirects: r.redirects + 1 }));
        return;
      }

      /* Counted, not kept: the callers want the size, and holding megabytes of
         response body per request is how a bulk run runs the host out of heap. */
      let bytes = 0;
      res.on('data', (c: Buffer) => { bytes += c.length; });
      res.on('end', () => resolve({
        status,
        statusText: res.statusMessage ?? '',
        ms: Date.now() - t0,
        bytes,
        redirects: 0,
        contentType: String(res.headers['content-type'] ?? '').split(';')[0],
      }));
      res.on('error', (e) => resolve({
        status, statusText: '', ms: Date.now() - t0, bytes, redirects: 0, contentType: '', error: describeError(e),
      }));
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, statusText: '', ms: Date.now() - t0, bytes: 0, redirects: 0, contentType: '', error: 'Timed out' });
    });
    req.on('error', (e) => resolve({
      status: 0, statusText: '', ms: Date.now() - t0, bytes: 0, redirects: 0, contentType: '', error: describeError(e),
    }));

    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

/**
 * "GET https://example.com/health" or just "https://example.com/health".
 *
 * A bulk list is pasted by hand, so it has blank lines, comment lines and a
 * method in front of some entries but not others.
 */
export function parseUrlLine(line: string, defaultMethod: string): { method: string; url: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;

  const match = trimmed.match(/^([A-Za-z]+)\s+(\S+)$/);
  if (match && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(match[1])) {
    return { method: match[1].toUpperCase(), url: match[2] };
  }
  return { method: defaultMethod.toUpperCase(), url: trimmed };
}
