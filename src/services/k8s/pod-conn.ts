/**
 * "Can this pod reach that URL?" — answered by the pod's own python.
 *
 * The question behind most "it works on my machine": the service runs in a
 * pod whose network is not yours — its DNS, its egress rules, its proxy. So
 * the check runs inside the container, with nothing but the standard library,
 * and reports each step on its own: the name resolved (or not), a TCP
 * connection made (or refused, or timed out), and what HTTP answered. A
 * failure then says where it failed, which is the whole point.
 *
 * The URL and the proxy go in on stdin as JSON, never on the command line:
 * argv is visible to anything that can list processes in the container, and a
 * proxy URL can carry a password.
 */
import type { PodTarget } from './pod-files';
import { execArgsWithStdin } from './pod-python';

export interface ConnRequest { url: string; proxy?: string; timeoutSeconds: number }

export interface ConnStep { ok: boolean; ms?: number; error?: string }
export interface ConnResult {
  url: string;
  /** The proxy actually used: the one given, else one from the pod's environment. */
  proxy?: string;
  proxyFrom?: 'given' | 'env';
  dns: ConnStep & { host?: string; addresses?: string[] };
  tcp: ConnStep & { to?: string };
  http: ConnStep & { status?: number; reason?: string; server?: string; contentType?: string };
  ok: boolean;
}

const MAX_URL = 2048;

/** http(s) only, a real host, no spaces — or the reason it is not one. */
export function checkConnRequest(raw: { url?: unknown; proxy?: unknown; timeoutSeconds?: unknown }): ConnRequest | { error: string } {
  const url = String(raw.url ?? '').trim();
  const proxy = raw.proxy === undefined || raw.proxy === null ? '' : String(raw.proxy).trim();
  const parse = (s: string, what: string): URL | { error: string } => {
    if (!s || s.length > MAX_URL || /\s/.test(s)) return { error: `That ${what} does not look right.` };
    try {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: `The ${what} has to start with http:// or https://.` };
      if (!u.hostname) return { error: `The ${what} has no host.` };
      return u;
    } catch { return { error: `That ${what} does not look right.` }; }
  };
  const u = parse(url, 'URL');
  if ('error' in u) return u;
  if (proxy) {
    const p = parse(proxy, 'proxy');
    if ('error' in p) return p;
  }
  const t = Number(raw.timeoutSeconds);
  const timeoutSeconds = Number.isFinite(t) ? Math.min(60, Math.max(1, Math.round(t))) : 10;
  return { url, ...(proxy ? { proxy } : {}), timeoutSeconds };
}

/**
 * The check, run as `python -c`. Standard library only, Python 3.5+.
 * Prints one line of JSON; never raises past main().
 */
export const CONN_CHECK = String.raw`
import json, socket, ssl, sys, time
try:
    from urllib.parse import urlsplit
    import urllib.request as ur
except ImportError:
    print(json.dumps({"fatal": "python 3 is needed"})); sys.exit(0)

def ms(t0): return int((time.time() - t0) * 1000)

def env_proxy(scheme):
    try:
        return ur.getproxies().get(scheme)
    except Exception:
        return None

def main():
    req = json.loads(sys.stdin.read() or "{}")
    url = req["url"]; given = req.get("proxy") or None; timeout = float(req.get("timeoutSeconds") or 10)
    u = urlsplit(url)
    host = u.hostname; port = u.port or (443 if u.scheme == "https" else 80)
    proxy = given or env_proxy(u.scheme)
    out = {"url": url, "dns": {"ok": False, "host": host}, "tcp": {"ok": False}, "http": {"ok": False}, "ok": False}
    if proxy:
        out["proxy"] = proxy; out["proxyFrom"] = "given" if given else "env"

    # Through a proxy, the pod resolves and connects to the proxy; the proxy does the rest.
    first = urlsplit(proxy) if proxy else u
    rhost = first.hostname
    rport = first.port or (443 if first.scheme == "https" else 80) if proxy else port
    out["dns"]["host"] = rhost
    t0 = time.time()
    try:
        infos = socket.getaddrinfo(rhost, rport, 0, socket.SOCK_STREAM)
        out["dns"].update(ok=True, ms=ms(t0), addresses=sorted(set(i[4][0] for i in infos))[:6])
    except Exception as e:
        out["dns"].update(ms=ms(t0), error=str(e) or type(e).__name__)
        print(json.dumps(out)); return

    t0 = time.time()
    out["tcp"]["to"] = "%s:%s" % (rhost, rport)
    try:
        s = socket.create_connection((rhost, rport), timeout=timeout); s.close()
        out["tcp"].update(ok=True, ms=ms(t0))
    except Exception as e:
        out["tcp"].update(ms=ms(t0), error=str(e) or type(e).__name__)
        print(json.dumps(out)); return

    handlers = [ur.ProxyHandler({u.scheme: proxy} if proxy else {})]
    if u.scheme == "https":
        handlers.append(ur.HTTPSHandler(context=ssl.create_default_context()))
    opener = ur.build_opener(*handlers)
    t0 = time.time()
    try:
        r = opener.open(ur.Request(url, method="GET", headers={"User-Agent": "daakia-dk8s-conncheck"}), timeout=timeout)
        out["http"].update(ok=True, ms=ms(t0), status=r.status, reason=r.reason,
                           server=r.headers.get("Server"), contentType=r.headers.get("Content-Type"))
        r.close()
    except ur.HTTPError as e:
        # An answer is an answer: the network worked, the server said no.
        out["http"].update(ok=True, ms=ms(t0), status=e.code, reason=str(e.reason),
                           server=e.headers.get("Server") if e.headers else None)
    except Exception as e:
        reason = getattr(e, "reason", None)
        out["http"].update(ms=ms(t0), error=str(reason or e) or type(e).__name__)
    out["ok"] = out["http"]["ok"]
    print(json.dumps(out))

try:
    main()
except Exception as e:
    print(json.dumps({"fatal": str(e) or type(e).__name__}))
`;

export function connArgs(t: PodTarget, interpreter: string): string[] {
  return execArgsWithStdin(t, [interpreter, '-c', CONN_CHECK]);
}

/** The check's one line of JSON, or what went wrong getting it. */
export function parseConn(stdout: string, failure?: string): ConnResult | { error: string } {
  const line = stdout.trim().split(/\r?\n/).filter(l => l.startsWith('{')).pop();
  if (!line) return { error: (failure ?? '').trim().split(/\r?\n/).slice(-3).join(' ') || 'The check printed nothing.' };
  try {
    const o = JSON.parse(line) as ConnResult & { fatal?: string };
    if (o.fatal) return { error: o.fatal };
    if (!o.dns || !o.tcp || !o.http) return { error: 'The check answered in a shape it should not have.' };
    return o;
  } catch {
    return { error: 'The check printed something that is not JSON.' };
  }
}
