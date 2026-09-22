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
import { createTunnelAgent } from '../http/proxy-tunnel';

/*
  Marks options that go through a proxy Daakia chose. transportFor() sends
  those through http.ClientRequest directly: inside VS Code the http/https
  module functions are patched (`http.proxySupport`, default "override") and
  replace the request's agent with VS Code's own, which ignored this proxy and
  went direct. See http/proxy-tunnel.ts.
*/
const VIA_DAAKIA_PROXY = Symbol('daakia.viaProxy');

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
    (options as Record<symbol, boolean>)[VIA_DAAKIA_PROXY] = true;
    return options;
  }

  // An HTTPS target cannot be given to the proxy in the clear: the proxy opens
  // a raw tunnel with CONNECT and TLS is negotiated end-to-end through it, so
  // the proxy never sees the request. The tunnel is an agent now rather than a
  // createConnection hook — VS Code's patch substitutes its own agent, and an
  // agent always wins over createConnection, so the hook was never reached.
  options.agent = createTunnelAgent(viaProxy, { rejectUnauthorized: verifyCert, timeout });
  (options as Record<symbol, boolean>)[VIA_DAAKIA_PROXY] = true;
  return options;
}

/** The transport to call `.request()` on, which is chosen by the TARGET's scheme. */
export function transportFor(url: URL): {
  request: (options: https.RequestOptions, cb?: (res: http.IncomingMessage) => void) => http.ClientRequest;
} {
  // Note this is the target scheme, not the proxy's: a CONNECT tunnel carries
  // TLS end to end, so an https target stays https even via a plain proxy.
  const native = url.protocol === 'https:' ? https : http;
  return {
    request: (options, cb) => ((options as Record<symbol, boolean>)[VIA_DAAKIA_PROXY]
      /* Not through the patched module function: see VIA_DAAKIA_PROXY. */
      ? new http.ClientRequest({ ...options, protocol: url.protocol }, cb)
      : native.request(options, cb)),
  };
}

function basicAuth(auth: { username: string; password: string }): string {
  return `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
}
