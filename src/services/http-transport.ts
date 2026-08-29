/**
 * Proxy and TLS for the protocols that drive Node's http module directly.
 *
 * SOAP and SSE cannot go through axios — SOAP needs control of the raw body and
 * SSE has to keep the response open and read it as a stream — so neither picked
 * up the proxy handling every axios-based protocol got for free. Both silently
 * ignored a configured proxy, and both verified certificates unconditionally
 * regardless of the SSL setting.
 *
 * The fix is the same for both, so it lives here once rather than being written
 * out twice and drifting.
 */
import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import type { ResolvedProxy } from './proxy-config';
import { sniFor } from './tls-policy';

export interface TransportOptions {
  /** Routing decision from the shared resolver. */
  proxy?: ResolvedProxy;
  /** Certificate verification, resolved by the caller from settings. */
  rejectUnauthorized?: boolean;
  timeout?: number;
}

/**
 * Build request options that honour the proxy and TLS decisions.
 *
 * Returns options for `http.request`/`https.request` against `url`, already
 * rewritten for the proxy where one applies.
 */
export function requestOptions(
  url: URL,
  method: string,
  headers: Record<string, string>,
  opts: TransportOptions,
): https.RequestOptions {
  const isHttps = url.protocol === 'https:';
  const targetPort = Number(url.port || (isHttps ? 443 : 80));
  const timeout = opts.timeout;
  // Verify unless the caller resolved the settings and said otherwise.
  const verifyCert = opts.rejectUnauthorized ?? true;
  const viaProxy = opts.proxy?.used ? opts.proxy.axiosProxy : undefined;

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: targetPort,
    path: url.pathname + url.search,
    method,
    headers,
    ...(timeout !== undefined ? { timeout } : {}),
    ...(isHttps ? { rejectUnauthorized: verifyCert, servername: sniFor(url.hostname) } : {}),
  };

  if (!viaProxy || typeof viaProxy !== 'object') return options;

  if (!isHttps) {
    // Plain HTTP through a proxy is an ordinary request to the proxy with the
    // absolute URL as the request target.
    options.hostname = viaProxy.host;
    options.port = viaProxy.port;
    options.path = url.toString();
    (options.headers as Record<string, string>).Host = url.host;
    if (viaProxy.auth) {
      (options.headers as Record<string, string>)['Proxy-Authorization'] = basicAuth(viaProxy.auth);
    }
    return options;
  }

  // An HTTPS target cannot be given to the proxy in the clear: the proxy opens
  // a raw tunnel with CONNECT and TLS is negotiated end-to-end through it, so
  // the proxy never sees the request.
  options.createConnection = ((_o: unknown, cb: (err: Error | null, sock?: net.Socket) => void) => {
    const connect = http.request({
      host: viaProxy.host,
      port: viaProxy.port,
      method: 'CONNECT',
      path: `${url.hostname}:${targetPort}`,
      headers: {
        host: `${url.hostname}:${targetPort}`,
        ...(viaProxy.auth ? { 'proxy-authorization': basicAuth(viaProxy.auth) } : {}),
      },
      ...(timeout !== undefined ? { timeout } : {}),
    });
    connect.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        cb(new Error(`Proxy refused the CONNECT tunnel: ${res.statusCode} ${res.statusMessage ?? ''}`.trim()));
        return;
      }
      cb(null, tls.connect({ socket, servername: sniFor(url.hostname), rejectUnauthorized: verifyCert }));
    });
    connect.on('error', (err) => cb(err));
    connect.on('timeout', () => {
      connect.destroy();
      cb(new Error(`Proxy did not answer CONNECT within ${Math.round((timeout ?? 0) / 1000)}s`));
    });
    connect.end();
    return undefined as unknown as net.Socket;   // the socket arrives via cb
  }) as unknown as https.RequestOptions['createConnection'];

  return options;
}

/** The transport to call `.request()` on, which is chosen by the TARGET's scheme. */
export function transportFor(url: URL): typeof http | typeof https {
  // Note this is the target scheme, not the proxy's: a CONNECT tunnel carries
  // TLS end to end, so an https target stays https even via a plain proxy.
  return url.protocol === 'https:' ? https : http;
}

function basicAuth(auth: { username: string; password: string }): string {
  return `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
}
