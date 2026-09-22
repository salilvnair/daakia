/**
 * HTTPS through a proxy that Daakia chose — without asking VS Code.
 *
 * ── Why this exists ──
 *
 * Inside VS Code, Node's `http`/`https` are patched so extensions follow the
 * editor's proxy settings (`http.proxySupport`, default "override"). In
 * override mode the patch replaces the agent a request brings with its own,
 * resolved from VS Code's proxy configuration. A request sent with
 * Settings → Proxy → Manual carried a CONNECT-tunnelling agent for the office
 * proxy; VS Code swapped it for one that — with no `http.proxy` of its own —
 * went direct, and the firewall answered "proxy required". `curl -x` through
 * the same proxy worked, and so did the browser build, which is plain Node.
 *
 * So when Daakia has resolved a proxy for an HTTPS request, the tunnel is
 * built here from `net` and `tls`, which VS Code does not patch, and the
 * request is made with `http.ClientRequest` directly rather than through the
 * patched `https.request`. Redirects are still followed, by follow-redirects
 * driven with those same unpatched constructors.
 *
 * It also settles a second problem: the certificate settings (SSL
 * verification off, a trusted host) now apply to the TLS session inside the
 * tunnel, where before they were lost on the way to it.
 */
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as tls from 'tls';
import type { Duplex } from 'stream';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const followRedirects = require('follow-redirects') as {
  wrap: (protocols: Record<string, { request: (o: http.RequestOptions, cb?: (res: http.IncomingMessage) => void) => http.ClientRequest }>) =>
    Record<string, { request: (o: http.RequestOptions, cb?: (res: http.IncomingMessage) => void) => http.ClientRequest }>;
};
import { sniFor } from '../services/tls-policy';

export interface TunnelProxy {
  host: string;
  port: number;
  auth?: { username: string; password: string };
}

export class ProxyTunnelError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
    this.name = 'ProxyTunnelError';
  }
}

/** Read the proxy's reply to CONNECT, up to the blank line. */
function readConnectReply(socket: net.Socket, timeoutMs: number): Promise<{ status: number; line: string; rest: Buffer }> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const timer = timeoutMs > 0 ? setTimeout(() => { cleanup(); reject(new ProxyTunnelError(`The proxy did not answer CONNECT within ${timeoutMs}ms.`)); }, timeoutMs) : undefined;
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) {
        if (buf.length > 16 * 1024) { cleanup(); reject(new ProxyTunnelError('The proxy sent an oversized reply to CONNECT.')); }
        return;
      }
      cleanup();
      const head = buf.subarray(0, end).toString('latin1');
      const line = head.split('\r\n')[0] ?? '';
      const status = Number(line.split(' ')[1]) || 0;
      resolve({ status, line, rest: buf.subarray(end + 4) });
    };
    const onError = (err: Error) => { cleanup(); reject(err); };
    const onClose = () => { cleanup(); reject(new ProxyTunnelError('The proxy closed the connection before answering CONNECT.')); };
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

function describeRefusal(status: number, line: string, proxy: TunnelProxy): string {
  if (status === 407) {
    return proxy.auth
      ? `The proxy ${proxy.host}:${proxy.port} rejected the username and password (407 Proxy Authentication Required).`
      : `The proxy ${proxy.host}:${proxy.port} needs a username and password (407 Proxy Authentication Required). Add them in Settings → Proxy.`;
  }
  return `The proxy ${proxy.host}:${proxy.port} refused the tunnel: ${line || `status ${status}`}.`;
}

/**
 * An https.Agent whose connections are CONNECT tunnels through `proxy`.
 *
 * `rejectUnauthorized` is this request's certificate decision, applied to the
 * TLS session with the origin — the one that matters, and the one a
 * forwarded agent option used to miss.
 */
export function createTunnelAgent(proxy: TunnelProxy, opts: { rejectUnauthorized: boolean; timeout?: number }): https.Agent {
  const agent = new https.Agent({ keepAlive: false, rejectUnauthorized: opts.rejectUnauthorized });

  (agent as unknown as {
    createConnection: (o: https.RequestOptions & { host?: string }, cb: (err: Error | null, s?: Duplex) => void) => undefined;
  }).createConnection = (options, cb) => {
    const host = String(options.hostname ?? options.host ?? '').replace(/^\[|\]$/g, '');
    const port = Number(options.port) || 443;
    const authority = host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;

    const socket = net.connect(proxy.port, proxy.host);
    socket.once('error', (err) => cb(new ProxyTunnelError(`Could not reach the proxy ${proxy.host}:${proxy.port}: ${err.message}`)));
    socket.once('connect', () => {
      const headers = [`CONNECT ${authority} HTTP/1.1`, `Host: ${authority}`];
      if (proxy.auth) {
        headers.push(`Proxy-Authorization: Basic ${Buffer.from(`${proxy.auth.username}:${proxy.auth.password}`).toString('base64')}`);
      }
      socket.write(headers.join('\r\n') + '\r\n\r\n');
      readConnectReply(socket, opts.timeout ?? 30_000).then(({ status, line, rest }) => {
        if (status !== 200) {
          socket.destroy();
          cb(new ProxyTunnelError(describeRefusal(status, line, proxy), status));
          return;
        }
        if (rest.length) socket.unshift(rest);
        const secure = tls.connect({
          socket,
          servername: sniFor(host),
          rejectUnauthorized: opts.rejectUnauthorized,
          ALPNProtocols: ['http/1.1'],
        });
        cb(null, secure);
      }, (err: Error) => {
        socket.destroy();
        cb(err instanceof ProxyTunnelError ? err : new ProxyTunnelError(err.message));
      });
    });
    return undefined;
  };
  return agent;
}

type RequestFn = (o: http.RequestOptions, cb?: (res: http.IncomingMessage) => void) => http.ClientRequest;

/* Requests made with the constructor, not the patched module functions. */
const directHttp: RequestFn = (o, cb) => new http.ClientRequest({ ...o, protocol: 'http:' }, cb);
const directHttps: RequestFn = (o, cb) => new http.ClientRequest({ ...o, protocol: 'https:' }, cb);
const followed = followRedirects.wrap({ http: { request: directHttp }, https: { request: directHttps } });

/**
 * An axios `transport` for a request Daakia routes through its own tunnel.
 *
 * axios hands a custom transport the same options it would give its built-in
 * one, including the redirect hook that strips credentials when a redirect
 * leaves the origin; this adds back the two things only its built-in
 * follow-redirects branch would have set — the redirect limit and that hook
 * of ours — and pins the agents per scheme, because a redirect from https to
 * http must not be handed the TLS tunnel.
 */
export function tunnelTransport(opts: {
  maxRedirects: number;
  beforeRedirect?: (options: Record<string, unknown>, res?: unknown, req?: unknown) => void;
  httpsAgent: https.Agent;
  httpAgent?: http.Agent;
}): { request: RequestFn } {
  return {
    request(o, cb) {
      const options = o as http.RequestOptions & {
        maxRedirects?: number;
        beforeRedirects?: Record<string, unknown>;
        agents?: Record<string, http.Agent | undefined>;
      };
      if (opts.maxRedirects === 0) {
        const isTls = (options.protocol ?? 'https:') === 'https:';
        return (isTls ? directHttps : directHttp)({ ...options, agent: isTls ? opts.httpsAgent : opts.httpAgent }, cb);
      }
      options.maxRedirects = opts.maxRedirects;
      if (opts.beforeRedirect && options.beforeRedirects) options.beforeRedirects.config = opts.beforeRedirect;
      options.agents = { https: opts.httpsAgent, http: opts.httpAgent };
      const scheme = (options.protocol ?? 'https:') === 'http:' ? 'http' : 'https';
      return followed[scheme].request(options, cb);
    },
  };
}

/**
 * The axios options that send one request through Daakia's own tunnel, or
 * nothing when it does not need one — plain HTTP, or no proxy chosen.
 *
 * One function so every axios caller routes the same way; REST and GraphQL
 * both had the proxy handed to axios, and both lost it to VS Code's agent.
 */
export function tunnelledAxiosOptions(url: string, resolved: { used: boolean; axiosProxy: unknown }, opts: {
  rejectUnauthorized: boolean;
  timeout?: number;
  maxRedirects: number;
  beforeRedirect?: (options: Record<string, unknown>, res?: unknown, req?: unknown) => void;
}): { proxy?: false; httpsAgent: https.Agent; transport: { request: RequestFn } } | undefined {
  let isTls = false;
  try { isTls = new URL(url).protocol === 'https:'; } catch { return undefined; }
  const via = resolved.used ? resolved.axiosProxy : undefined;
  if (!via || typeof via !== 'object') return undefined;
  const httpsAgent = createTunnelAgent(via as TunnelProxy, { rejectUnauthorized: opts.rejectUnauthorized, timeout: opts.timeout || 30_000 });
  const transport = tunnelTransport({ maxRedirects: opts.maxRedirects, beforeRedirect: opts.beforeRedirect, httpsAgent });
  /* HTTPS: our tunnel, so axios must not build its own. Plain HTTP: axios
     keeps its forward-proxy mode (the request is addressed to the proxy, and
     it re-applies the proxy on every redirect) — only the patched module
     function is avoided. httpsAgent covers a redirect up to https. */
  return isTls ? { proxy: false, httpsAgent, transport } : { httpsAgent, transport };
}
