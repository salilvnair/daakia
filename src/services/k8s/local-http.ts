/**
 * Calls into a forwarded port — `http://127.0.0.1:<port>/…` — from the host.
 *
 * The webview cannot: in the browser build it is another origin, and a pod's
 * actuator sends no CORS headers. Only loopback is reachable from here, and
 * only on a port a running forward holds (the handler checks), so this can
 * never be pointed somewhere else.
 */
import * as http from 'http';
import * as fs from 'fs';

export interface LocalResponse {
  /** 0 when nothing answered. */
  status: number;
  contentType: string;
  body: string;
  /** The body was longer than `maxBytes` and was cut there. */
  truncated?: boolean;
  ms: number;
  error?: string;
}

export interface LocalRequest {
  port: number;
  path: string;
  method?: 'GET' | 'POST';
  /** JSON, sent with `Content-Type: application/json`. */
  json?: unknown;
  accept?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

const MAX_BYTES = 4 * 1024 * 1024;

function request(r: LocalRequest, onResponse: (res: http.IncomingMessage, done: (v: Partial<LocalResponse>) => void) => void): Promise<LocalResponse> {
  const started = Date.now();
  return new Promise(resolve => {
    let settled = false;
    const done = (v: Partial<LocalResponse>) => {
      if (settled) return; settled = true;
      resolve({ status: 0, contentType: '', body: '', ms: Date.now() - started, ...v });
    };
    const payload = r.json === undefined ? undefined : Buffer.from(JSON.stringify(r.json));
    const req = http.request({
      host: '127.0.0.1', port: r.port, path: r.path.startsWith('/') ? r.path : `/${r.path}`, method: r.method ?? 'GET',
      headers: {
        Accept: r.accept ?? 'application/json, */*;q=0.5',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) } : {}),
      },
    }, res => onResponse(res, done));
    req.setTimeout(r.timeoutMs ?? 10_000, () => { req.destroy(); done({ error: `No answer within ${Math.round((r.timeoutMs ?? 10_000) / 1000)} s.` }); });
    req.on('error', e => done({ error: e.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

/** A request whose answer is text or JSON — health, info, loggers, a thread dump. */
export function callLocal(r: LocalRequest): Promise<LocalResponse> {
  const max = r.maxBytes ?? MAX_BYTES;
  return request(r, (res, done) => {
    const chunks: Buffer[] = [];
    let size = 0; let truncated = false;
    res.on('data', (c: Buffer) => {
      if (size >= max) { truncated = true; return; }
      chunks.push(c.subarray(0, max - size)); size += c.length;
      if (size > max) truncated = true;
    });
    res.on('end', () => done({
      status: res.statusCode ?? 0, contentType: String(res.headers['content-type'] ?? ''),
      body: Buffer.concat(chunks).toString('utf8'), truncated: truncated || undefined,
    }));
    res.on('error', e => done({ status: res.statusCode ?? 0, error: e.message }));
  });
}

/** A request whose answer is a file — a heap dump — streamed to `dest`. */
export function downloadLocal(r: LocalRequest & { dest: string; onProgress?: (bytes: number) => void }): Promise<LocalResponse & { bytes: number }> {
  let bytes = 0;
  return request({ timeoutMs: 300_000, ...r }, (res, done) => {
    if ((res.statusCode ?? 0) >= 400) {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => { if (chunks.length < 64) chunks.push(c); });
      res.on('end', () => done({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8').slice(0, 2000) }));
      return;
    }
    const out = fs.createWriteStream(r.dest);
    res.on('data', (c: Buffer) => { bytes += c.length; r.onProgress?.(bytes); });
    res.pipe(out);
    out.on('finish', () => done({ status: res.statusCode ?? 0, contentType: String(res.headers['content-type'] ?? '') }));
    out.on('error', e => done({ status: res.statusCode ?? 0, error: e.message }));
    res.on('error', e => { out.destroy(); done({ status: res.statusCode ?? 0, error: e.message }); });
  }).then(v => ({ ...v, bytes }));
}
