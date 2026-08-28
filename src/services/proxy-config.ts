/**
 * Proxy configuration — one place that decides whether a request is proxied.
 *
 * This exists because there were previously two disconnected halves. The Proxy
 * Settings dialog wrote to webview localStorage and posted a `proxy:configure`
 * message that nothing in the extension host listened for, while the request
 * executor read `settings.proxy` — which the dialog never wrote. Saving proxy
 * settings therefore did nothing at all, silently.
 *
 * The two also disagreed on shape: the dialog used `{ enabled, type, noProxy }`
 * and the executor expected `{ mode, bypass[] }`. Normalising in one place, and
 * having every protocol resolve through the same function, is what stops that
 * happening again.
 */

export type ProxyMode = 'none' | 'system' | 'manual';
export type ProxyType = 'http' | 'https' | 'socks5';

/** The stored shape. This is what lives in settings and what executors read. */
export interface ProxyConfig {
  mode: ProxyMode;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  /** Hosts that bypass the proxy. */
  bypass: string[];
}

/** The shape the settings dialog works in. */
export interface ProxyUiConfig {
  enabled: boolean;
  type: string;
  host: string;
  port: number | string;
  username?: string;
  password?: string;
  /** Comma-separated in the UI, because that is what people type. */
  noProxy?: string;
  /** Present only when the user explicitly chose to follow system settings. */
  useSystem?: boolean;
}

export const DEFAULT_PROXY: ProxyConfig = {
  mode: 'none', type: 'http', host: '', port: 8080, bypass: ['localhost', '127.0.0.1', '::1'],
};

/** Dialog shape → stored shape. The single translation point. */
export function normalizeProxyConfig(ui: ProxyUiConfig | undefined): ProxyConfig {
  if (!ui) return { ...DEFAULT_PROXY };
  const type = (['http', 'https', 'socks5'].includes(ui.type) ? ui.type : 'http') as ProxyType;
  // Enabled-with-no-host stays 'manual' on purpose. Downgrading it to 'none'
  // would send requests direct with the reassuring message "no proxy
  // configured", when the user has plainly asked for one and mistyped — the
  // same silent failure this module exists to stop. resolveProxy warns instead.
  const mode: ProxyMode = ui.useSystem ? 'system' : ui.enabled ? 'manual' : 'none';
  return {
    mode,
    type,
    host: (ui.host ?? '').trim(),
    port: Number(ui.port) || 8080,
    username: ui.username?.trim() || undefined,
    password: ui.password || undefined,
    bypass: (ui.noProxy ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  };
}

/** Stored shape → dialog shape, so the dialog opens showing what is actually set. */
export function toUiProxyConfig(config: ProxyConfig): ProxyUiConfig {
  return {
    enabled: config.mode === 'manual',
    useSystem: config.mode === 'system',
    type: config.type,
    host: config.host,
    port: config.port,
    username: config.username ?? '',
    password: config.password ?? '',
    noProxy: config.bypass.join(', '),
  };
}

/**
 * Does this host bypass the proxy?
 *
 * Supports exact hosts and a leading-dot or wildcard suffix, which is what
 * NO_PROXY conventionally means — `.internal` and `*.internal` both match
 * `api.internal`.
 */
export function isBypassed(hostname: string, bypass: string[]): boolean {
  const host = hostname.toLowerCase();
  return bypass.some(raw => {
    const rule = raw.trim().toLowerCase();
    if (!rule) return false;
    if (rule === '*') return true;
    if (rule.startsWith('*.')) return host === rule.slice(2) || host.endsWith(rule.slice(1));
    if (rule.startsWith('.')) return host === rule.slice(1) || host.endsWith(rule);
    return host === rule;
  });
}

/** What axios should be told, plus a human-readable account of why. */
export interface ResolvedProxy {
  /**
   * The value for axios's `proxy` option.
   *  - `false`  do not proxy (also disables VS Code's own proxy agent)
   *  - `undefined` let axios pick up HTTP_PROXY/HTTPS_PROXY from the environment
   *  - an object for an explicit proxy
   */
  axiosProxy: false | undefined | { host: string; port: number; auth?: { username: string; password: string } };
  /** True when this particular request is actually going through a proxy. */
  used: boolean;
  /** One line for the network log and the audit trail. */
  description: string;
  /** Set when the configuration cannot be honoured, rather than failing silently. */
  warning?: string;
}

/**
 * Decide the proxy for one URL.
 *
 * Every protocol calls this so they cannot drift apart, and the description it
 * returns is what gets logged — a request that says "direct" when a proxy is
 * configured is the bug this whole module exists to make visible.
 */
export function resolveProxy(config: ProxyConfig | undefined, url: string): ResolvedProxy {
  const cfg = config ?? DEFAULT_PROXY;

  if (cfg.mode === 'none') {
    return { axiosProxy: false, used: false, description: 'direct (no proxy configured)' };
  }

  let hostname = '';
  try { hostname = new URL(url).hostname; } catch { /* relative or malformed */ }

  if (hostname && isBypassed(hostname, cfg.bypass)) {
    return { axiosProxy: false, used: false, description: `direct (${hostname} matches the bypass list)` };
  }

  if (cfg.mode === 'system') {
    const env = process.env.HTTPS_PROXY || process.env.https_proxy
      || process.env.HTTP_PROXY || process.env.http_proxy;
    return {
      axiosProxy: undefined,
      used: !!env,
      description: env ? `system proxy (${env})` : 'direct (system proxy requested, but no HTTP(S)_PROXY is set)',
      warning: env ? undefined : 'System proxy was selected but no HTTP_PROXY or HTTPS_PROXY is set in the environment.',
    };
  }

  if (!cfg.host) {
    return {
      axiosProxy: false, used: false,
      description: 'direct (proxy enabled but no host given)',
      warning: 'The proxy is enabled but has no host, so requests are going direct.',
    };
  }

  // Axios's `proxy` option speaks HTTP and HTTPS-over-CONNECT only. SOCKS needs
  // an agent that is not bundled, and quietly ignoring the setting would be the
  // same class of bug as the one this module was written to fix.
  if (cfg.type === 'socks5') {
    return {
      axiosProxy: false, used: false,
      description: `direct (SOCKS5 proxy ${cfg.host}:${cfg.port} is not supported)`,
      warning: 'SOCKS5 proxies are not supported. Use an HTTP or HTTPS proxy, or run a local SOCKS-to-HTTP bridge.',
    };
  }

  return {
    axiosProxy: {
      host: cfg.host,
      port: cfg.port,
      ...(cfg.username ? { auth: { username: cfg.username, password: cfg.password ?? '' } } : {}),
    },
    used: true,
    description: `${cfg.type}://${cfg.host}:${cfg.port}${cfg.username ? ` (auth as ${cfg.username})` : ''}`,
  };
}

/** Protocols that cannot be proxied by this configuration, and why. */
export const UNPROXIED_PROTOCOLS: Record<string, string> = {
  websocket: 'WebSocket connections are opened by the ws library, which is not routed through this proxy setting.',
  mqtt: 'MQTT connects over its own transport and does not use the HTTP proxy setting.',
  grpc: 'gRPC uses its own HTTP/2 channel and does not use the HTTP proxy setting.',
  socketio: 'Socket.IO opens its own transport and does not use the HTTP proxy setting.',
};
