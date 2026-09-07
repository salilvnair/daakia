/**
 * Request interceptor — a forward proxy that captures what goes through it.
 *
 * ── What this replaces ──
 *
 * The panel posted `interceptor:start` and nothing listened. "Start Proxy" set
 * a spinner, the capture list stayed at "0 captured" forever, and there was no
 * error to explain it because no code path existed to produce one.
 *
 * ── What it captures, and what it does not ──
 *
 * Plain HTTP through the proxy is captured in full: method, absolute URL,
 * headers, and the request body.
 *
 * HTTPS is **tunnelled, not opened**. A browser sends `CONNECT host:443` and
 * everything after that is encrypted end-to-end. Reading it would mean
 * terminating TLS with a generated certificate and asking the user to trust a
 * new root CA on their machine — a real, permanent hole in their trust store,
 * and not something to install behind a "Start Proxy" button. So an HTTPS
 * request is recorded as the one thing that is honestly visible: that a tunnel
 * to that host was opened. The panel says so rather than showing an empty list
 * and letting the user conclude the proxy is broken.
 *
 * ── Binding ──
 *
 * Loopback by default. The listen host is accepted from the panel but anything
 * other than a loopback address is refused: an open forward proxy on a LAN
 * interface is an open relay, and a developer tool should not be one by
 * accident.
 */
import * as http from 'http';
import * as net from 'net';

type PostMessage = (msg: unknown) => void;

export interface InterceptorConfig {
  port: number;
  listenHost: string;
  filterPath: string;
  filterDomain: string;
  excludeStaticAssets: boolean;
}

const STATIC_ASSET = /\.(js|mjs|css|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|map|mp4|webm)(\?|$)/i;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CAPTURES = 500;

let server: http.Server | null = null;
let captureCount = 0;

/** Loopback only. An open forward proxy on a routable interface is a relay. */
function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost' || /^127\./.test(host);
}

function shouldCapture(cfg: InterceptorConfig, url: string, host: string): boolean {
  if (cfg.excludeStaticAssets && STATIC_ASSET.test(url)) return false;
  if (cfg.filterDomain.trim() && !host.includes(cfg.filterDomain.trim())) return false;
  if (cfg.filterPath.trim()) {
    try {
      if (!new URL(url).pathname.startsWith(cfg.filterPath.trim())) return false;
    } catch {
      if (!url.includes(cfg.filterPath.trim())) return false;
    }
  }
  return true;
}

export function handleInterceptorStop(_msg: Record<string, unknown>, postMessage: PostMessage): void {
  if (!server) {
    postMessage({ type: 'interceptor:stopped' });
    return;
  }
  const closing = server;
  server = null;
  closing.close(() => postMessage({ type: 'interceptor:stopped' }));
  closing.closeAllConnections?.();
}

export function handleInterceptorStart(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const raw = (msg.config ?? {}) as Partial<InterceptorConfig>;
  const cfg: InterceptorConfig = {
    port: Number(raw.port) || 8888,
    listenHost: String(raw.listenHost ?? '127.0.0.1'),
    filterPath: String(raw.filterPath ?? ''),
    filterDomain: String(raw.filterDomain ?? ''),
    excludeStaticAssets: raw.excludeStaticAssets !== false,
  };

  if (server) {
    postMessage({ type: 'interceptor:error', error: 'The proxy is already running. Stop it before starting another.' });
    return;
  }
  if (!isLoopback(cfg.listenHost)) {
    postMessage({
      type: 'interceptor:error',
      error: `Refusing to listen on ${cfg.listenHost} — a forward proxy reachable from the network is an open relay. Use 127.0.0.1.`,
    });
    return;
  }
  if (!Number.isInteger(cfg.port) || cfg.port < 1024 || cfg.port > 65535) {
    postMessage({ type: 'interceptor:error', error: `Port ${cfg.port} is out of range — pick something between 1024 and 65535.` });
    return;
  }

  captureCount = 0;

  const capture = (request: {
    id: string; method: string; url: string;
    headers: Record<string, string>; body?: string; tunnelled?: boolean;
  }) => {
    if (captureCount >= MAX_CAPTURES) return;
    captureCount++;
    postMessage({ type: 'interceptor:request', request: { ...request, timestamp: Date.now() } });
  };

  const proxy = http.createServer((req, res) => {
    /* A forward proxy receives the absolute URL on the request line. Anything
       else is somebody pointing a browser straight at this port. */
    const target = req.url ?? '';
    if (!/^https?:\/\//i.test(target)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Daakia interceptor: configure this as an HTTP proxy, not as a destination.\n');
      return;
    }

    let parsed: URL;
    try { parsed = new URL(target); } catch {
      res.writeHead(400).end();
      return;
    }

    const chunks: Buffer[] = [];
    let bodyBytes = 0;
    req.on('data', (c: Buffer) => {
      bodyBytes += c.length;
      if (bodyBytes <= MAX_BODY_BYTES) chunks.push(c);
    });

    const upstream = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method: req.method,
      headers: { ...req.headers, host: parsed.host },
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    });

    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Daakia interceptor: upstream request failed.\n');
    });

    req.on('end', () => {
      if (shouldCapture(cfg, target, parsed.hostname)) {
        capture({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          method: req.method ?? 'GET',
          url: target,
          headers: Object.fromEntries(
            Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')]),
          ),
          body: chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : undefined,
        });
      }
    });

    req.pipe(upstream);
  });

  /*
    HTTPS arrives as CONNECT and is tunnelled byte-for-byte. Opening it would
    mean a generated certificate and a new trusted root on the user's machine;
    what is honestly visible is that a tunnel to this host was opened, so that
    is what gets recorded.
  */
  proxy.on('connect', (req, clientSocket, head) => {
    const [host, portText] = (req.url ?? '').split(':');
    const port = Number(portText) || 443;
    if (!host) { clientSocket.destroy(); return; }

    if (shouldCapture(cfg, `https://${host}/`, host)) {
      capture({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        method: 'CONNECT',
        url: `https://${host}${port === 443 ? '' : `:${port}`}/`,
        headers: { host },
        tunnelled: true,
      });
    }

    const upstream = net.connect(port, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });

    const drop = () => { upstream.destroy(); clientSocket.destroy(); };
    upstream.on('error', drop);
    clientSocket.on('error', drop);
  });

  proxy.on('error', (err: NodeJS.ErrnoException) => {
    server = null;
    postMessage({
      type: 'interceptor:error',
      error: err.code === 'EADDRINUSE'
        ? `Port ${cfg.port} is already in use — something else is listening there.`
        : err.message,
    });
  });

  proxy.listen(cfg.port, cfg.listenHost, () => {
    server = proxy;
    postMessage({ type: 'interceptor:started', host: cfg.listenHost, port: cfg.port });
  });
}
