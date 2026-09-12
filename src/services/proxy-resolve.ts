/**
 * Resolving a proxy when the answer has to be asked for.
 *
 * `resolveProxy` in proxy-config.ts is synchronous and stays that way — for an
 * explicit host:port there is nothing to look up. "System proxy" is different:
 * on Windows and macOS it means reading the OS configuration, and that
 * configuration may itself say "run this script to decide". Both are I/O, so
 * that path lives here.
 *
 * Everything is best-effort and every failure is reported rather than
 * swallowed. A PAC file that will not download, a script that throws, an
 * auto-detect that finds nothing — each falls back to direct and says so,
 * because a request that quietly ignores a configured proxy is the failure
 * this area keeps producing.
 */

import axios from 'axios';
import {
  resolveProxy, isBypassed, type ProxyConfig, type ResolvedProxy, DEFAULT_PROXY,
} from './proxy-config';
import { readSystemProxy, envBypass, type SystemProxy } from './system-proxy';
import { evaluatePac, resolveForPac, wpadCandidates, type PacResult } from './pac';

/** PAC scripts are stable and fetched per request otherwise. */
const scriptCache = new Map<string, { at: number; body: string | null }>();
const SCRIPT_TTL_MS = 5 * 60_000;

export function clearPacCache(): void {
  scriptCache.clear();
}

async function fetchScript(url: string, now = Date.now()): Promise<string | null> {
  const hit = scriptCache.get(url);
  if (hit && now - hit.at < SCRIPT_TTL_MS) return hit.body;
  let body: string | null = null;
  try {
    const res = await axios.get(url, {
      timeout: 5000,
      responseType: 'text',
      // Never through a proxy: the script is what decides whether to use one.
      proxy: false,
      transformResponse: [(d) => d],
    });
    if (res.status >= 200 && res.status < 300 && typeof res.data === 'string') body = res.data;
  } catch {
    body = null;
  }
  scriptCache.set(url, { at: now, body });
  return body;
}

/** The first WPAD candidate that answers. */
async function discoverWpad(): Promise<{ url: string; body: string } | undefined> {
  for (const url of wpadCandidates()) {
    const body = await fetchScript(url);
    if (body) return { url, body };
  }
  return undefined;
}

function pick(pac: PacResult, via: string): ResolvedProxy {
  // First usable entry wins, which is what the preference list means. SOCKS is
  // skipped rather than pretended at — axios cannot speak it.
  const http = pac.proxies.find(p => p.type === 'http');
  if (http) {
    return {
      axiosProxy: { host: http.host, port: http.port },
      used: true,
      description: `${via} → ${http.host}:${http.port}`,
    };
  }
  if (pac.direct) {
    return { axiosProxy: false, used: false, description: `${via} → direct` };
  }
  const socks = pac.proxies.find(p => p.type === 'socks');
  return {
    axiosProxy: false, used: false,
    description: `${via} → ${socks ? 'SOCKS, which is not supported' : 'nothing usable'}`,
    warning: socks
      ? `The auto-config script chose a SOCKS proxy (${socks.host}:${socks.port}), which is not supported. `
        + 'Set an HTTP proxy manually, or run a local SOCKS-to-HTTP bridge.'
      : `The auto-config script returned "${pac.raw}", which names no usable proxy.`,
  };
}

/**
 * The proxy for one URL, consulting the OS when asked to.
 *
 * Callers that only ever see explicit configuration can keep using the sync
 * `resolveProxy`; this is a superset.
 */
export async function resolveProxyFor(
  config: ProxyConfig | undefined, url: string,
): Promise<ResolvedProxy> {
  const cfg = config ?? DEFAULT_PROXY;
  if (cfg.mode !== 'system') return resolveProxy(cfg, url);

  let hostname = '';
  try { hostname = new URL(url).hostname; } catch { /* relative or malformed */ }

  // The user's own bypass list applies before anything is looked up.
  if (hostname && isBypassed(hostname, cfg.bypass)) {
    return { axiosProxy: false, used: false, description: `direct (${hostname} matches the bypass list)` };
  }

  let sys: SystemProxy;
  try {
    sys = await readSystemProxy();
  } catch {
    return {
      axiosProxy: false, used: false,
      description: 'direct (could not read the system proxy configuration)',
      warning: 'System proxy was selected but the operating system settings could not be read.',
    };
  }

  // The OS has its own exceptions — Windows ProxyOverride, macOS
  // ExceptionsList, NO_PROXY — and they are part of the configuration, not a
  // detail to drop on the way through.
  const allBypass = [...cfg.bypass, ...sys.bypass, ...envBypass()];
  if (hostname && isBypassed(hostname, allBypass)) {
    return {
      axiosProxy: false, used: false,
      description: `direct (${hostname} is in the system bypass list)`,
    };
  }

  if (sys.kind === 'manual') {
    const target = url.startsWith('https:') ? (sys.https ?? sys.http) : (sys.http ?? sys.https);
    if (!target) {
      return { axiosProxy: false, used: false, description: `direct (${sys.source}, but no usable host)` };
    }
    return {
      axiosProxy: { host: target.host, port: target.port },
      used: true,
      description: `${sys.source} → ${target.host}:${target.port}`,
    };
  }

  if (sys.kind === 'pac' || sys.kind === 'wpad') {
    let script: string | null = null;
    let via = sys.source;

    if (sys.kind === 'pac' && sys.pacUrl) {
      script = await fetchScript(sys.pacUrl);
      if (!script) {
        return {
          axiosProxy: false, used: false,
          description: `direct (the auto-config script at ${sys.pacUrl} could not be downloaded)`,
          warning: `The proxy auto-config script at ${sys.pacUrl} could not be downloaded, so requests are going direct.`,
        };
      }
    } else {
      const found = await discoverWpad();
      if (!found) {
        return {
          axiosProxy: false, used: false,
          description: 'direct (auto-detect found no wpad.dat)',
          warning: 'The system is set to detect proxy settings automatically, but no wpad.dat was found. '
            + 'If this network uses DHCP-based discovery, set the proxy manually instead.',
        };
      }
      script = found.body;
      via = `auto-detected (${found.url})`;
    }

    try {
      const resolved = hostname ? await resolveForPac(hostname) : {};
      return pick(evaluatePac(script, url, hostname, { resolved }), via);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      return {
        axiosProxy: false, used: false,
        description: `direct (the auto-config script failed: ${why})`,
        warning: `The proxy auto-config script could not be evaluated (${why}), so requests are going direct.`,
      };
    }
  }

  return {
    axiosProxy: false, used: false,
    description: `direct (${sys.source})`,
    warning: 'System proxy was selected, but the operating system has no proxy configured.',
  };
}
