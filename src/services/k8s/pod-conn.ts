/**
 * "Can this pod reach that?" — answered by the pod's own python.
 *
 * The question behind most "it works on my machine": the service runs in a
 * pod whose network is not yours — its DNS, its egress rules, its proxy. So
 * the check runs inside the container, with nothing but the standard library,
 * and reports each step on its own: the name resolved (or not), a TCP
 * connection made (or refused, or timed out), the TLS handshake, and what
 * HTTP answered. A failure then says where it failed, which is the whole point.
 *
 * Three kinds of check:
 *  - http — a real request, any method, with headers and a body: a POST to the
 *    endpoint the service actually calls, not only a GET of its health page;
 *  - tcp  — just open a connection to host:port, and optionally shake hands
 *    over TLS: a database, a broker, a cache, anything that does not speak HTTP;
 *  - dns  — only resolve the name, every address it has.
 * (No ping: ICMP needs a raw socket, which a container almost never has.)
 *
 * Everything goes in on stdin as JSON, never on the command line: argv is
 * visible to anything that can list processes in the container, and a proxy
 * URL, a header or a body can carry a password.
 */
import type { PodTarget } from './pod-files';
import { execArgsWithStdin } from './pod-python';

export type ConnKind = 'http' | 'tcp' | 'dns';
export const CONN_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type ConnMethod = typeof CONN_METHODS[number];

export interface ConnRequest {
  kind: ConnKind;
  /** http: the URL. tcp: `host:port` (or a URL, whose host and port are used). dns: a host (or a URL). */
  url: string;
  timeoutSeconds: number;
  /* http only */
  method?: ConnMethod;
  proxy?: string;
  headers?: { key: string; value: string }[];
  body?: string;
  /* http (https) and tcp with tls */
  insecure?: boolean;
  /* tcp only: shake hands over TLS once connected */
  tls?: boolean;
}

export interface ConnStep { ok: boolean; ms?: number; error?: string }
export interface ConnResult {
  kind?: ConnKind;
  url: string;
  method?: string;
  /** The proxy actually used: the one given, else one from the pod's environment. */
  proxy?: string;
  proxyFrom?: 'given' | 'env';
  dns: ConnStep & { host?: string; addresses?: string[]; canonical?: string };
  tcp: ConnStep & { to?: string };
  tls?: ConnStep & { version?: string; cipher?: string; subject?: string; issuer?: string; notAfter?: string; verified?: boolean };
  http: ConnStep & { status?: number; reason?: string; server?: string; contentType?: string; preview?: string; bytes?: number };
  ok: boolean;
}

const MAX_URL = 2048;
const MAX_BODY = 256 * 1024;
const MAX_HEADERS = 50;
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const HOST = /^[A-Za-z0-9._-]+$|^\[?[0-9A-Fa-f:.]+\]?$/;

type Raw = {
  kind?: unknown; url?: unknown; proxy?: unknown; timeoutSeconds?: unknown;
  method?: unknown; headers?: unknown; body?: unknown; insecure?: unknown; tls?: unknown;
};

function parseHttpUrl(s: string, what: string): URL | { error: string } {
  if (!s || s.length > MAX_URL || /\s/.test(s)) return { error: `That ${what} does not look right.` };
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: `The ${what} has to start with http:// or https://.` };
    if (!u.hostname) return { error: `The ${what} has no host.` };
    return u;
  } catch { return { error: `That ${what} does not look right.` }; }
}

/** `host:port`, `[::1]:5432`, or a URL (its host, and its port or the scheme's). */
export function parseHostPort(s: string, needPort: boolean): { host: string; port?: number } | { error: string } {
  const v = s.trim();
  if (!v || v.length > 512 || /\s/.test(v)) return { error: 'That host does not look right.' };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const known: Record<string, number> = { 'http:': 80, 'https:': 443, 'ws:': 80, 'wss:': 443, 'ftp:': 21, 'redis:': 6379, 'postgres:': 5432, 'postgresql:': 5432, 'mysql:': 3306, 'mongodb:': 27017, 'amqp:': 5672, 'amqps:': 5671 };
      const port = u.port ? Number(u.port) : known[u.protocol];
      const host = u.hostname.replace(/^\[|\]$/g, '');
      if (!host) return { error: 'That URL has no host.' };
      if (needPort && !port) return { error: 'Add a port: host:port.' };
      return { host, ...(port ? { port } : {}) };
    } catch { return { error: 'That URL does not look right.' }; }
  }
  let host = v; let portText = '';
  const v6 = v.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (v6) { host = v6[1]; portText = v6[2] ?? ''; }
  else if ((v.match(/:/g) ?? []).length === 1) { [host, portText] = v.split(':'); }
  if (!host || !HOST.test(host)) return { error: 'That host does not look right.' };
  if (portText) {
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'The port has to be between 1 and 65535.' };
    return { host, port };
  }
  if (needPort) return { error: 'Add a port: host:port.' };
  return { host };
}

/** What was asked, made safe to run — or the reason it is not. */
export function checkConnRequest(raw: Raw): ConnRequest | { error: string } {
  const kind: ConnKind = raw.kind === 'tcp' || raw.kind === 'dns' ? raw.kind : 'http';
  const url = String(raw.url ?? '').trim();
  const t = Number(raw.timeoutSeconds);
  const timeoutSeconds = Number.isFinite(t) ? Math.min(60, Math.max(1, Math.round(t))) : 10;

  if (kind === 'dns') {
    const hp = parseHostPort(url, false);
    if ('error' in hp) return hp;
    return { kind, url, timeoutSeconds };
  }
  if (kind === 'tcp') {
    const hp = parseHostPort(url, true);
    if ('error' in hp) return hp;
    return { kind, url, timeoutSeconds, ...(raw.tls ? { tls: true } : {}), ...(raw.tls && raw.insecure ? { insecure: true } : {}) };
  }

  const u = parseHttpUrl(url, 'URL');
  if ('error' in u) return u;
  const proxy = raw.proxy === undefined || raw.proxy === null ? '' : String(raw.proxy).trim();
  if (proxy) {
    const p = parseHttpUrl(proxy, 'proxy');
    if ('error' in p) return p;
  }
  const method = String(raw.method ?? 'GET').toUpperCase() as ConnMethod;
  if (!CONN_METHODS.includes(method)) return { error: `${method} is not a method this test can send.` };

  const headers: { key: string; value: string }[] = [];
  if (Array.isArray(raw.headers)) {
    for (const h of raw.headers as { key?: unknown; value?: unknown }[]) {
      const key = String(h?.key ?? '').trim();
      const value = String(h?.value ?? '');
      if (!key) continue;
      if (!TOKEN.test(key)) return { error: `"${key}" is not a header name.` };
      if (/[\r\n]/.test(value)) return { error: `The value of ${key} has a line break in it.` };
      headers.push({ key, value });
    }
    if (headers.length > MAX_HEADERS) return { error: `At most ${MAX_HEADERS} headers.` };
  }
  const body = raw.body === undefined || raw.body === null ? '' : String(raw.body);
  if (body.length > MAX_BODY) return { error: 'The body is over 256 KB.' };

  return {
    kind, url, timeoutSeconds,
    ...(method !== 'GET' ? { method } : {}),
    ...(proxy ? { proxy } : {}),
    ...(headers.length ? { headers } : {}),
    ...(body ? { body } : {}),
    ...(raw.insecure && u.protocol === 'https:' ? { insecure: true } : {}),
  };
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

PREVIEW = 4096
KNOWN = {"http": 80, "https": 443, "ws": 80, "wss": 443, "ftp": 21, "redis": 6379, "postgres": 5432,
         "postgresql": 5432, "mysql": 3306, "mongodb": 27017, "amqp": 5672, "amqps": 5671}

def ms(t0): return int((time.time() - t0) * 1000)
def err(e): return str(getattr(e, "reason", None) or e) or type(e).__name__

def env_proxy(scheme):
    try:
        return ur.getproxies().get(scheme)
    except Exception:
        return None

def host_port(s):
    if "://" in s:
        u = urlsplit(s)
        return u.hostname, (u.port or KNOWN.get(u.scheme))
    if s.startswith("["):
        h, _, rest = s[1:].partition("]")
        return h, (int(rest[1:]) if rest.startswith(":") else None)
    if s.count(":") == 1:
        h, p = s.split(":")
        return h, int(p)
    return s, None

def resolve(out, host, port):
    out["dns"]["host"] = host
    t0 = time.time()
    try:
        infos = socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM, 0, socket.AI_CANONNAME)
        out["dns"].update(ok=True, ms=ms(t0), addresses=sorted(set(i[4][0] for i in infos))[:12])
        canon = next((i[3] for i in infos if i[3]), None)
        if canon and canon != host:
            out["dns"]["canonical"] = canon
        return True
    except Exception as e:
        out["dns"].update(ms=ms(t0), error=err(e))
        return False

def connect(out, host, port, timeout):
    out["tcp"]["to"] = "%s:%s" % (host, port)
    t0 = time.time()
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        out["tcp"].update(ok=True, ms=ms(t0))
        return s
    except Exception as e:
        out["tcp"].update(ms=ms(t0), error=err(e))
        return None

def context(insecure):
    if insecure:
        c = ssl.create_default_context(); c.check_hostname = False; c.verify_mode = ssl.CERT_NONE
        return c
    return ssl.create_default_context()

def name_of(rdn):
    try:
        return ", ".join("%s=%s" % kv for part in rdn for kv in part)
    except Exception:
        return None

def handshake(out, sock, host, timeout, insecure):
    out["tls"] = {"ok": False, "verified": not insecure}
    t0 = time.time()
    try:
        sock.settimeout(timeout)
        ss = context(insecure).wrap_socket(sock, server_hostname=host)
        out["tls"].update(ok=True, ms=ms(t0), version=ss.version(), cipher=(ss.cipher() or [None])[0])
        cert = ss.getpeercert() or {}
        if cert:
            out["tls"].update(subject=name_of(cert.get("subject", ())), issuer=name_of(cert.get("issuer", ())),
                              notAfter=cert.get("notAfter"))
        ss.close()
    except Exception as e:
        out["tls"].update(ms=ms(t0), error=err(e))
        try: sock.close()
        except Exception: pass

def check_dns(req, out):
    host, _ = host_port(req["url"])
    out["ok"] = resolve(out, host, None)

def check_tcp(req, out, timeout):
    host, port = host_port(req["url"])
    if not resolve(out, host, port): return
    s = connect(out, host, port, timeout)
    if not s: return
    if req.get("tls"):
        handshake(out, s, host, timeout, bool(req.get("insecure")))
        out["ok"] = out["tls"]["ok"]
    else:
        s.close()
        out["ok"] = True

def check_http(req, out, timeout):
    url = req["url"]; given = req.get("proxy") or None
    method = req.get("method") or "GET"
    out["method"] = method
    u = urlsplit(url)
    host = u.hostname; port = u.port or (443 if u.scheme == "https" else 80)
    proxy = given or env_proxy(u.scheme)
    if proxy:
        out["proxy"] = proxy; out["proxyFrom"] = "given" if given else "env"

    # Through a proxy, the pod resolves and connects to the proxy; the proxy does the rest.
    first = urlsplit(proxy) if proxy else u
    rhost = first.hostname
    rport = (first.port or (443 if first.scheme == "https" else 80)) if proxy else port
    if not resolve(out, rhost, rport): return
    s = connect(out, rhost, rport, timeout)
    if not s: return
    s.close()

    handlers = [ur.ProxyHandler({u.scheme: proxy} if proxy else {})]
    if u.scheme == "https":
        handlers.append(ur.HTTPSHandler(context=context(bool(req.get("insecure")))))
    opener = ur.build_opener(*handlers)
    headers = {"User-Agent": "daakia-dk8s-conncheck"}
    for h in req.get("headers") or []:
        headers[h["key"]] = h["value"]
    body = req.get("body")
    data = body.encode("utf-8") if body else None
    t0 = time.time()
    try:
        r = opener.open(ur.Request(url, data=data, method=method, headers=headers), timeout=timeout)
        out["http"].update(ok=True, ms=ms(t0), status=r.status, reason=r.reason,
                           server=r.headers.get("Server"), contentType=r.headers.get("Content-Type"))
        read_preview(out, r, method)
        r.close()
    except ur.HTTPError as e:
        # An answer is an answer: the network worked, the server said no.
        out["http"].update(ok=True, ms=ms(t0), status=e.code, reason=str(e.reason),
                           server=e.headers.get("Server") if e.headers else None,
                           contentType=e.headers.get("Content-Type") if e.headers else None)
        read_preview(out, e, method)
    except Exception as e:
        out["http"].update(ms=ms(t0), error=err(e))
    out["ok"] = out["http"]["ok"]

def read_preview(out, r, method):
    if method == "HEAD": return
    try:
        raw = r.read(PREVIEW + 1)
        out["http"]["bytes"] = len(raw[:PREVIEW])
        text = raw[:PREVIEW].decode("utf-8", "replace")
        out["http"]["preview"] = text + ("\n..." if len(raw) > PREVIEW else "")
    except Exception:
        pass

def main():
    req = json.loads(sys.stdin.read() or "{}")
    kind = req.get("kind") or "http"
    timeout = float(req.get("timeoutSeconds") or 10)
    out = {"kind": kind, "url": req["url"], "dns": {"ok": False}, "tcp": {"ok": False}, "http": {"ok": False}, "ok": False}
    if kind == "dns": check_dns(req, out)
    elif kind == "tcp": check_tcp(req, out, timeout)
    else: check_http(req, out, timeout)
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
