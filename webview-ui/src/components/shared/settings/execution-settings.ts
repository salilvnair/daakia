/**
 * Execution settings, webview side.
 *
 * A mirror of src/services/execution-settings.ts, which is the authority: the
 * host resolves the three levels and the executor acts on the result. This
 * copy exists because the webview build only includes `webview-ui/src`, so the
 * host module cannot be imported here.
 *
 * Nothing here resolves anything. What the *inherited* value of a field is
 * depends on the collection blob and the app settings, both of which live on
 * the host, so the editor asks for them (`settings:getEffective`) rather than
 * recomputing the resolution and risking a second answer that disagrees with
 * the one the request actually runs with.
 */

export type QueryEncoding = 'enable' | 'disable' | 'auto';
export type ProxyMode = 'none' | 'system' | 'manual';
export type ProxyType = 'http' | 'https' | 'socks5';

export interface ProxyConfig {
  mode: ProxyMode;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  bypass: string[];
}

/** `undefined` on every field means "inherit from the level above". */
export interface ExecutionSettings {
  timeout?: number;
  followRedirects?: boolean;
  sslVerification?: boolean;
  saveResponseInHistory?: boolean;
  encoding?: QueryEncoding;
  proxy?: ProxyConfig;
}

/** What the levels above resolve to — shown beside each Inherit option. */
export interface EffectiveSettings {
  timeout: number;
  followRedirects: boolean;
  sslVerification: boolean;
  saveResponseInHistory: boolean;
  encoding: QueryEncoding;
  proxy?: ProxyConfig;
}

export type SettingsLevel = 'default' | 'global' | 'collection' | 'request';

export const DEFAULT_PROXY: ProxyConfig = {
  mode: 'none', type: 'http', host: '', port: 8080,
  bypass: ['localhost', '127.0.0.1', '::1'],
};

const FIELDS = [
  'timeout', 'followRedirects', 'sslVerification',
  'saveResponseInHistory', 'encoding', 'proxy',
] as const;

/** How many fields this level pins — the badge on the Settings tab. */
export function countOverrides(s: ExecutionSettings | undefined): number {
  if (!s) return 0;
  return FIELDS.filter(f => {
    const v = s[f];
    if (v === undefined || v === null) return false;
    if (f === 'proxy') return !!(v as ProxyConfig).mode;
    return true;
  }).length;
}

/** Where a value came from, in words, for the line under each control. */
export const LEVEL_LABEL: Record<SettingsLevel, string> = {
  default: 'the built-in default',
  global: 'Settings',
  collection: 'this collection',
  request: 'this request',
};

export function describeProxy(p: ProxyConfig | undefined): string {
  if (!p || p.mode === 'none') return 'no proxy';
  if (p.mode === 'system') return 'system proxy';
  return p.host ? `${p.type}://${p.host}:${p.port}` : 'manual proxy (no host set)';
}

/** Milliseconds as something readable — 60000 is hard to read as a minute. */
export function describeTimeout(ms: number): string {
  if (!ms) return 'no timeout';
  if (ms % 60_000 === 0) return `${ms / 60_000} min`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms} ms`;
}
