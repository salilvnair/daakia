/**
 * Whether a URL on this machine is really production, through a forward.
 *
 * `http://localhost:18081` reads as local. With a forward up to a production
 * pod on 18081 it is that pod, and a load test pointed at it is a load test on
 * production that nobody meant to run. The Load Tester asks this before it
 * runs, and the host asks again before it sends a request (see
 * `prodForwardOnUrl` in the host's port-forward handler).
 */
import { isUp, type ForwardInfo } from '../../store/dk8s-port-forward-store';

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

/** The local port a URL reaches, or nothing when it is not this machine. */
export function localPortOf(url: string): number | undefined {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return undefined; }
  if (!LOCAL.has(u.hostname.toLowerCase())) return undefined;
  if (u.port) return Number(u.port);
  return u.protocol === 'https:' ? 443 : u.protocol === 'http:' ? 80 : undefined;
}

export interface ProdHit { forward: ForwardInfo; port: number }

/** The production forward a URL would reach, if it reaches one. */
export function prodForwardFor(url: string, forwards: ForwardInfo[]): ProdHit | undefined {
  const port = localPortOf(url);
  if (port === undefined) return undefined;
  const forward = forwards.find(f => f.prod && isUp(f) && f.ports.some(p => p.local === port));
  return forward ? { forward, port } : undefined;
}
