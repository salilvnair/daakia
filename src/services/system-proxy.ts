/**
 * What the operating system thinks the proxy is.
 *
 * "System proxy" used to mean one thing: `HTTP_PROXY` / `HTTPS_PROXY` in the
 * environment. On Linux and in a terminal-launched editor that is right. On
 * Windows it is almost always wrong — the Settings app writes to the registry
 * and sets no environment variables at all, so a machine with a corporate
 * proxy configured reported "direct (no HTTP(S)_PROXY is set)" and every
 * request went out unproxied. The same is true of macOS, where the setting
 * lives in the system configuration store and is read with `scutil --proxy`.
 *
 * So this asks the OS. Three shapes come back, and Windows can produce any of
 * them (they are the three groups in Settings → Network → Proxy):
 *
 *   manual   an explicit host:port, with a bypass list
 *   pac      a URL to a proxy auto-config script          ("Use setup script")
 *   wpad     find that script by convention               ("Automatically detect")
 *
 * Reading it is best-effort by design. A registry read that fails, a `scutil`
 * that is missing, a PAC file that will not parse — none of those should stop
 * a request. Each one degrades to "direct", and says why, because a proxy that
 * silently does not apply is the bug this whole area keeps producing.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

export interface SystemProxy {
  kind: 'none' | 'manual' | 'pac' | 'wpad';
  /** `manual` only: what to proxy through, per scheme. */
  http?: { host: string; port: number };
  https?: { host: string; port: number };
  /** `pac` only: where the script lives. */
  pacUrl?: string;
  /** Hosts that go direct, in NO_PROXY syntax. */
  bypass: string[];
  /** Where this came from, for the network log. */
  source: string;
}

const NONE: SystemProxy = { kind: 'none', bypass: [], source: 'no system proxy configured' };

/**
 * Cached, because this runs per request and a registry read or a `scutil` spawn
 * per request would be absurd. Short enough that toggling the OS setting is
 * picked up within a minute rather than needing a restart.
 */
let cached: { at: number; value: SystemProxy } | undefined;
const TTL_MS = 60_000;

export function clearSystemProxyCache(): void {
  cached = undefined;
}

export async function readSystemProxy(now = Date.now()): Promise<SystemProxy> {
  if (cached && now - cached.at < TTL_MS) return cached.value;
  let value = NONE;
  try {
    value = process.platform === 'win32' ? await readWindows()
      : process.platform === 'darwin' ? await readMac()
        : readEnv();
    // Every platform honours the environment as an override, because that is
    // how a proxy is set for one launch without changing the machine.
    const env = readEnv();
    if (env.kind !== 'none') value = env;
    else if (value.kind !== 'none') value = { ...value, bypass: [...value.bypass, ...envBypass()] };
  } catch {
    value = NONE;
  }
  cached = { at: now, value };
  return value;
}

// ────────────────────── environment ──────────────────────

/** `NO_PROXY`, which was never merged in before — see readSystemProxy. */
export function envBypass(): string[] {
  const raw = process.env.NO_PROXY || process.env.no_proxy || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function readEnv(): SystemProxy {
  const https = process.env.HTTPS_PROXY || process.env.https_proxy;
  const http = process.env.HTTP_PROXY || process.env.http_proxy;
  if (!https && !http) return NONE;
  const out: SystemProxy = {
    kind: 'manual', bypass: envBypass(),
    source: `environment (${https ? 'HTTPS_PROXY' : 'HTTP_PROXY'})`,
  };
  if (http) out.http = parseHostPort(http);
  if (https) out.https = parseHostPort(https);
  // One set means both: a lone HTTPS_PROXY is conventionally the proxy for
  // everything, and leaving http unset would send plain requests direct.
  out.http ??= out.https;
  out.https ??= out.http;
  return out;
}

/** `http://user:pass@host:3128`, `host:3128`, or a bare `host`. */
export function parseHostPort(raw: string): { host: string; port: number } | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  try {
    const u = new URL(s.includes('://') ? s : `http://${s}`);
    if (!u.hostname) return undefined;
    return { host: u.hostname, port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80) };
  } catch {
    return undefined;
  }
}

// ────────────────────── Windows ──────────────────────

/**
 * Parse `ProxyServer`.
 *
 * Two shapes, and both are common: a bare `host:port` meaning "everything", or
 * a per-scheme list `http=a:80;https=b:443;ftp=...`. Treating the second as a
 * hostname is how a machine with a split configuration ends up trying to
 * resolve a host called "http=a".
 */
export function parseWindowsProxyServer(raw: string): { http?: { host: string; port: number }; https?: { host: string; port: number } } {
  const out: { http?: { host: string; port: number }; https?: { host: string; port: number } } = {};
  if (!raw.includes('=')) {
    const one = parseHostPort(raw);
    return one ? { http: one, https: one } : {};
  }
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const scheme = part.slice(0, eq).trim().toLowerCase();
    const hp = parseHostPort(part.slice(eq + 1));
    if (!hp) continue;
    if (scheme === 'http') out.http = hp;
    else if (scheme === 'https') out.https = hp;
  }
  // A configuration that names only http still proxies https through it in
  // practice, via CONNECT.
  out.http ??= out.https;
  out.https ??= out.http;
  return out;
}

/**
 * `ProxyOverride` into NO_PROXY syntax.
 *
 * Windows separates with `;`, and `<local>` is its way of saying "anything
 * without a dot in it" — the intranet short names.
 */
export function parseWindowsOverride(raw: string): string[] {
  const out: string[] = [];
  for (const part of (raw || '').split(';')) {
    const t = part.trim();
    if (!t) continue;
    if (t.toLowerCase() === '<local>') {
      out.push('localhost', '127.0.0.1', '::1');
      continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * The connection-settings blob.
 *
 * Byte 8 is a flag field, and it is the only place the "Automatically detect
 * settings" checkbox is recorded — there is no plain registry value for it.
 * 0x02 manual, 0x04 use a PAC URL, 0x08 auto-detect (WPAD).
 */
export function decodeConnectionFlags(byte: number): { manual: boolean; pac: boolean; wpad: boolean } {
  return {
    manual: (byte & 0x02) !== 0,
    pac: (byte & 0x04) !== 0,
    wpad: (byte & 0x08) !== 0,
  };
}

async function reg(path: string, name: string): Promise<string | undefined> {
  try {
    // argv array, never a shell — the paths are ours but this is the rule.
    const { stdout } = await run('reg', ['query', path, '/v', name], { timeout: 5000 });
    // `    ProxyServer    REG_SZ    proxy.corp:8080`
    const m = stdout.split(/\r?\n/)
      .map(l => l.trim())
      .find(l => l.toLowerCase().startsWith(name.toLowerCase() + ' '));
    if (!m) return undefined;
    const parts = m.split(/\s{2,}/);
    return parts.length >= 3 ? parts.slice(2).join('    ').trim() : undefined;
  } catch {
    return undefined;
  }
}

const IE_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

async function readWindows(): Promise<SystemProxy> {
  const [enable, server, override, pacUrl, blob] = await Promise.all([
    reg(IE_KEY, 'ProxyEnable'),
    reg(IE_KEY, 'ProxyServer'),
    reg(IE_KEY, 'ProxyOverride'),
    reg(IE_KEY, 'AutoConfigURL'),
    reg(IE_KEY + '\\Connections', 'DefaultConnectionSettings'),
  ]);

  const bypass = parseWindowsOverride(override ?? '');

  // Order matters and matches how Windows itself resolves: an explicit proxy
  // wins, then a script, then auto-detect.
  if (enable && parseInt(enable, 16) !== 0 && server) {
    const parsed = parseWindowsProxyServer(server);
    if (parsed.http || parsed.https) {
      return { kind: 'manual', ...parsed, bypass, source: `Windows proxy settings (${server})` };
    }
  }

  if (pacUrl) {
    return { kind: 'pac', pacUrl, bypass, source: `Windows setup script (${pacUrl})` };
  }

  // REG_BINARY comes back as hex; byte 8 is at offset 16.
  if (blob && /^[0-9a-fA-F]+$/.test(blob) && blob.length >= 18) {
    const flags = decodeConnectionFlags(parseInt(blob.slice(16, 18), 16));
    if (flags.wpad) {
      return { kind: 'wpad', bypass, source: 'Windows “Automatically detect settings”' };
    }
  }

  return { ...NONE, bypass };
}

// ────────────────────── macOS ──────────────────────

async function readMac(): Promise<SystemProxy> {
  let stdout = '';
  try {
    ({ stdout } = await run('scutil', ['--proxy'], { timeout: 5000 }));
  } catch {
    return NONE;
  }
  const get = (k: string) => {
    const m = new RegExp(`^\\s*${k}\\s*:\\s*(.+)$`, 'm').exec(stdout);
    return m ? m[1].trim() : undefined;
  };
  const on = (k: string) => get(k) === '1';

  const bypass = (get('ExceptionsList') ? exceptionsOf(stdout) : []);

  if (on('ProxyAutoConfigEnable')) {
    const pacUrl = get('ProxyAutoConfigURLString');
    if (pacUrl) return { kind: 'pac', pacUrl, bypass, source: `macOS auto-config (${pacUrl})` };
  }
  if (on('ProxyAutoDiscoveryEnable')) {
    return { kind: 'wpad', bypass, source: 'macOS auto proxy discovery' };
  }

  const out: SystemProxy = { kind: 'manual', bypass, source: 'macOS network settings' };
  if (on('HTTPEnable')) {
    const h = get('HTTPProxy'); const p = Number(get('HTTPPort'));
    if (h) out.http = { host: h, port: p || 80 };
  }
  if (on('HTTPSEnable')) {
    const h = get('HTTPSProxy'); const p = Number(get('HTTPSPort'));
    if (h) out.https = { host: h, port: p || 443 };
  }
  out.http ??= out.https;
  out.https ??= out.http;
  return out.http ? out : { ...NONE, bypass };
}

/** `scutil` prints ExceptionsList as an indented numbered block. */
function exceptionsOf(stdout: string): string[] {
  const start = stdout.indexOf('ExceptionsList');
  if (start === -1) return [];
  const rest = stdout.slice(start);
  const end = rest.indexOf('}');
  const block = end === -1 ? rest : rest.slice(0, end);
  return block.split(/\r?\n/)
    .map(l => /^\s*\d+\s*:\s*(.+)$/.exec(l)?.[1]?.trim())
    .filter((x): x is string => !!x);
}
