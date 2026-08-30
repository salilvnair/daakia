/**
 * Proxy auto-config.
 *
 * A PAC file is a JavaScript function — `FindProxyForURL(url, host)` — that
 * returns which proxy to use for one URL. Corporate networks lean on it
 * heavily, both directly ("Use setup script") and through WPAD ("Automatically
 * detect settings"), because it is how one machine reaches an intranet host
 * directly and the internet through a gateway.
 *
 * Without support for it, choosing "System proxy" on a machine configured this
 * way silently sent everything direct, which on a locked-down network means
 * every request fails and nothing says why.
 *
 * The script is untrusted input, so it runs in a `vm` context with no require,
 * no process, no globals of ours — only the PAC helper functions the spec
 * defines — and with a timeout, because a PAC file with a runaway loop must
 * not take the extension host with it.
 */

import * as vm from 'vm';
import * as dns from 'dns';
import * as os from 'os';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

export interface PacResult {
  /** In order of preference; `undefined` host means DIRECT. */
  proxies: { host: string; port: number; type: 'http' | 'socks' }[];
  direct: boolean;
  /** The raw return value, for the network log. */
  raw: string;
}

/**
 * Parse what FindProxyForURL returned.
 *
 * `"PROXY a:8080; PROXY b:8080; DIRECT"` — a preference list. Anything
 * unrecognised is skipped rather than guessed at.
 */
export function parsePacResult(raw: string): PacResult {
  const out: PacResult = { proxies: [], direct: false, raw };
  for (const partRaw of String(raw ?? '').split(';')) {
    const part = partRaw.trim();
    if (!part) continue;
    const [kindRaw, ...rest] = part.split(/\s+/);
    const kind = kindRaw.toUpperCase();
    if (kind === 'DIRECT') { out.direct = true; continue; }
    const target = rest.join('');
    if (!target) continue;
    const at = target.lastIndexOf(':');
    if (at === -1) continue;
    const host = target.slice(0, at).trim();
    const port = Number(target.slice(at + 1));
    if (!host || !Number.isFinite(port)) continue;
    if (kind === 'PROXY' || kind === 'HTTP') out.proxies.push({ host, port, type: 'http' });
    else if (kind === 'HTTPS') out.proxies.push({ host, port, type: 'http' });
    else if (kind === 'SOCKS' || kind === 'SOCKS5' || kind === 'SOCKS4') {
      out.proxies.push({ host, port, type: 'socks' });
    }
  }
  return out;
}

// ────────────────────── the helper functions a PAC file expects ──────────────────────

/** `*.example.com` style globbing — the only pattern syntax PAC has. */
export function shExpMatch(str: string, pattern: string): boolean {
  const rx = new RegExp(
    '^' + String(pattern)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.') + '$',
  );
  return rx.test(String(str));
}

export function isPlainHostName(host: string): boolean {
  return !String(host).includes('.');
}

export function dnsDomainIs(host: string, domain: string): boolean {
  const h = String(host).toLowerCase();
  const d = String(domain).toLowerCase();
  return h.length >= d.length && h.slice(h.length - d.length) === d;
}

export function localHostOrDomainIs(host: string, hostdom: string): boolean {
  const h = String(host).toLowerCase();
  const d = String(hostdom).toLowerCase();
  return h === d || d.startsWith(h + '.');
}

export function dnsDomainLevels(host: string): number {
  return (String(host).match(/\./g) || []).length;
}

/** IPv4 only, which is what the PAC spec defines. */
export function isInNet(ip: string, pattern: string, mask: string): boolean {
  const n = (s: string) => {
    const p = String(s).split('.');
    if (p.length !== 4) return undefined;
    let v = 0;
    for (const part of p) {
      const b = Number(part);
      if (!Number.isInteger(b) || b < 0 || b > 255) return undefined;
      v = (v << 8) | b;
    }
    return v >>> 0;
  };
  const a = n(ip); const b = n(pattern); const m = n(mask);
  if (a === undefined || b === undefined || m === undefined) return false;
  return ((a & m) >>> 0) === ((b & m) >>> 0);
}

/** This machine's LAN address — PAC files branch on it to detect the office. */
export function myIpAddress(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

// ────────────────────── evaluation ──────────────────────

export interface PacEvalOptions {
  /** Resolved beforehand, because PAC's dnsResolve is synchronous and DNS is not. */
  resolved?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Run a PAC script for one URL.
 *
 * `dnsResolve` is the awkward part: the spec makes it synchronous, and Node's
 * resolver is not. The request's own host is resolved before the script runs
 * and handed in, which covers what real PAC files ask for; anything else
 * returns null, which they are required to handle.
 */
export function evaluatePac(
  script: string, url: string, host: string, opts: PacEvalOptions = {},
): PacResult {
  const resolved = opts.resolved ?? {};
  const dnsResolve = (h: string) => resolved[String(h).toLowerCase()] ?? null;

  const sandbox = {
    isPlainHostName, dnsDomainIs, localHostOrDomainIs, dnsDomainLevels,
    shExpMatch, isInNet, myIpAddress, dnsResolve,
    isResolvable: (h: string) => dnsResolve(h) !== null,
    // Time-based rules are rare and getting them subtly wrong is worse than
    // not offering them, so they answer "no" and PAC files fall through.
    weekdayRange: () => false,
    dateRange: () => false,
    timeRange: () => false,
    alert: () => undefined,
    result: '',
  };

  const context = vm.createContext(sandbox);
  new vm.Script(
    `${script}\n;result = String(FindProxyForURL(${JSON.stringify(url)}, ${JSON.stringify(host)}));`,
  ).runInContext(context, { timeout: opts.timeoutMs ?? 2000 });

  return parsePacResult(sandbox.result);
}

/** The host's address, for `dnsResolve`. Never throws — PAC handles null. */
export async function resolveForPac(host: string): Promise<Record<string, string>> {
  try {
    const { address } = await lookup(host, { family: 4 });
    return { [host.toLowerCase()]: address };
  } catch {
    return {};
  }
}

// ────────────────────── fetching the script ──────────────────────

/**
 * WPAD candidates.
 *
 * The convention is `wpad.<each parent of the local domain>/wpad.dat`, walking
 * up. Real discovery also uses DHCP option 252, which needs a raw socket and a
 * cooperating server, so this covers the DNS half — which is the half that
 * works from a developer machine.
 */
export function wpadCandidates(fqdn = os.hostname()): string[] {
  const out = ['http://wpad/wpad.dat'];
  const parts = fqdn.split('.').slice(1);
  while (parts.length >= 2) {
    out.push(`http://wpad.${parts.join('.')}/wpad.dat`);
    parts.shift();
  }
  return out;
}
