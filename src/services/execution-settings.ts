/**
 * Execution settings, and where a request's come from.
 *
 * Timeouts, redirects, SSL verification, query encoding and the proxy were
 * global-only: one set of values for every request in the app. That does not
 * survive contact with real work — one slow report endpoint needs a 60s
 * timeout while everything else should fail fast at 5s, one internal host is
 * behind the corporate proxy while a localhost mock must not be, and a
 * collection full of legacy services needs relaxed SSL that you do not want
 * applied to production.
 *
 * So settings now exist at three levels and are resolved per request:
 *
 *     global  →  collection  →  request
 *
 * Later wins, **per field**. Everything is optional and `undefined` means
 * inherit, which is the part that makes this usable: a request that pins a
 * timeout still follows the global proxy, and changing the global proxy still
 * moves it. If overrides were whole objects, saving a request would freeze a
 * snapshot of every global default as it stood that day, and later changes to
 * those globals would silently stop reaching it.
 *
 * The proxy is the one field resolved whole rather than per key. A proxy
 * assembled from a global host and a request's port is a proxy nobody
 * configured and nobody can debug.
 */

import type { ProxyConfig } from './proxy-config';

/** How query parameters are encoded before they go on the wire. */
export type QueryEncoding = 'enable' | 'disable' | 'auto';

export interface ExecutionSettings {
  /** Milliseconds. 0 means no timeout, which is why this is not `|| default`. */
  timeout?: number;
  followRedirects?: boolean;
  sslVerification?: boolean;
  saveResponseInHistory?: boolean;
  encoding?: QueryEncoding;
  proxy?: ProxyConfig;
}

/** Every field filled in — what the executor actually acts on. */
export interface EffectiveSettings {
  timeout: number;
  followRedirects: boolean;
  sslVerification: boolean;
  saveResponseInHistory: boolean;
  encoding: QueryEncoding;
  proxy?: ProxyConfig;
}

/** Used when no level supplies a value. Matches the app's shipped defaults. */
export const SETTINGS_DEFAULTS: EffectiveSettings = {
  timeout: 0,
  followRedirects: true,
  sslVerification: true,
  saveResponseInHistory: true,
  encoding: 'enable',
};

/** Which level a value came from, so the UI can say so rather than guess. */
export type SettingsLevel = 'default' | 'global' | 'collection' | 'request';

export interface ResolvedSettings extends EffectiveSettings {
  /** Level each field was taken from. */
  from: Record<keyof EffectiveSettings, SettingsLevel>;
}

const FIELDS = [
  'timeout', 'followRedirects', 'sslVerification',
  'saveResponseInHistory', 'encoding', 'proxy',
] as const;

/**
 * Fold the levels into the values one request will run with.
 *
 * Layers are given outermost first. A layer may be undefined — an unsaved
 * request has no collection — and is skipped rather than treated as empty,
 * which would be the same thing here but is not once a caller passes `{}` to
 * mean "this level exists and overrides nothing".
 */
export function resolveExecutionSettings(
  global?: ExecutionSettings,
  collection?: ExecutionSettings,
  request?: ExecutionSettings,
): ResolvedSettings {
  const out = { ...SETTINGS_DEFAULTS } as EffectiveSettings;
  const from = {} as Record<keyof EffectiveSettings, SettingsLevel>;
  for (const f of FIELDS) from[f] = 'default';

  const layers: [SettingsLevel, ExecutionSettings | undefined][] = [
    ['global', global], ['collection', collection], ['request', request],
  ];

  for (const [level, layer] of layers) {
    if (!layer) continue;
    for (const f of FIELDS) {
      const v = layer[f];
      // `null` is treated as absent too: JSON round-trips through the DB and
      // through postMessage, and a cleared field can arrive either way.
      if (v === undefined || v === null) continue;
      // A blank proxy object is not an override. `mode: 'none'` is — that is
      // someone deliberately saying "not through the proxy for this one".
      if (f === 'proxy' && !(v as ProxyConfig).mode) continue;
      (out as Record<string, unknown>)[f] = v;
      from[f] = level;
    }
  }

  return { ...out, from };
}

/** True when this level sets anything at all — for the "overridden" dot. */
export function hasOverrides(s: ExecutionSettings | undefined): boolean {
  if (!s) return false;
  return FIELDS.some(f => {
    const v = s[f];
    if (v === undefined || v === null) return false;
    if (f === 'proxy') return !!(v as ProxyConfig).mode;
    return true;
  });
}

/** How many fields this level pins — the badge count on the Settings tab. */
export function countOverrides(s: ExecutionSettings | undefined): number {
  if (!s) return 0;
  return FIELDS.filter(f => {
    const v = s[f];
    if (v === undefined || v === null) return false;
    if (f === 'proxy') return !!(v as ProxyConfig).mode;
    return true;
  }).length;
}

/**
 * Apply the query-encoding choice to a URL's query string.
 *
 * This setting existed in the UI and was read by nothing — three radio
 * buttons that changed no behaviour at all. The three modes:
 *
 *   enable   percent-encode reserved characters in values. The safe default.
 *   disable  send values exactly as typed. For APIs that expect a literal
 *            `,` or `:` in a value and 404 on `%2C` — which is common enough
 *            in older Java and .NET stacks to be worth an escape hatch.
 *   auto     encode only what has to be encoded: leave a value alone if it is
 *            already percent-encoded, so `%20` does not become `%2520`.
 *
 * Only the query is touched. The path is left as the user typed it, because
 * re-encoding a path can change which resource is addressed.
 */
export function applyQueryEncoding(url: string, mode: QueryEncoding): string {
  if (mode === 'disable') return url;

  const q = url.indexOf('?');
  if (q === -1) return url;

  // The fragment is not part of the query and is never sent to the server.
  const hash = url.indexOf('#', q);
  const head = url.slice(0, q + 1);
  const query = hash === -1 ? url.slice(q + 1) : url.slice(q + 1, hash);
  const tail = hash === -1 ? '' : url.slice(hash);

  const encoded = query
    .split('&')
    .map(pair => {
      if (!pair) return pair;
      const eq = pair.indexOf('=');
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const v = eq === -1 ? undefined : pair.slice(eq + 1);
      const enc = (s: string) => {
        // `auto` leaves anything already encoded alone. Re-encoding it is the
        // double-encoding bug this mode exists to avoid.
        if (mode === 'auto' && /%[0-9a-fA-F]{2}/.test(s)) return s;
        // `+` is a valid space in a query and decodeURIComponent would reject
        // a stray `%`, so decode defensively before re-encoding.
        let raw = s;
        try { raw = decodeURIComponent(s.replace(/\+/g, ' ')); } catch { raw = s; }
        return encodeURIComponent(raw);
      };
      return v === undefined ? enc(k) : `${enc(k)}=${enc(v)}`;
    })
    .join('&');

  return head + encoded + tail;
}
