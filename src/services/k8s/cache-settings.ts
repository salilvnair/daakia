/**
 * Whether dk8s remembers what the cluster told it, and for how long.
 *
 * ── Why this is a setting and not a decision ──
 *
 * Caching a cluster read is a trade, and which side of it you want depends on
 * the cluster. On a laptop against a local kind, every call is 80ms and
 * freshness is free. Through a VPN to a managed cluster, the same call is
 * 800ms and opening one pod was firing fifty of them — there, remembering the
 * answers is the difference between a tool and a stopwatch.
 *
 * And a reader debugging an RBAC change wants none of it: they granted a role
 * thirty seconds ago and need dk8s to stop telling them what was true before.
 * So it turns off, and turning it off restores exactly the behaviour that was
 * there before any of this existed.
 *
 * ── What is never cached, whatever this says ──
 *
 * Logs. They are the one thing you open dk8s to read RIGHT NOW, and a
 * remembered log is not a log. Same for anything the reader just asked for by
 * pressing something — a refresh means refresh.
 *
 * ── What stays on even when this is off ──
 *
 * De-duplicating calls that are ALREADY IN FLIGHT. Four probes firing the same
 * `auth can-i` in the same instant and waiting on one answer instead of four
 * is not caching — none of them could have seen a different result, because
 * they overlap in time. Turning that off would buy nothing but load.
 */

/** Remembered by default: the common case is a remote cluster. */
const DEFAULT_ON = true;

/**
 * An hour, for facts about your token and about an image.
 *
 * These are the long-lived ones — whether you may exec into a namespace,
 * whether a container has bash. They change when somebody grants a role or
 * ships a new image, on a timescale of days, not minutes.
 */
export const DEFAULT_TTL_MINUTES = 60;

/** Below this it stops being a cache and above it stops being honest. */
export const MIN_TTL_MINUTES = 1;
export const MAX_TTL_MINUTES = 24 * 60;

let enabled: boolean | undefined;
let ttlMinutes: number | undefined;

export function clampTtlMinutes(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_TTL_MINUTES;
  return Math.min(MAX_TTL_MINUTES, Math.max(MIN_TTL_MINUTES, n));
}

export function setCacheEnabled(on: boolean | undefined): void {
  enabled = on;
}

export function setCacheTtlMinutes(minutes: number | undefined): void {
  ttlMinutes = minutes === undefined ? undefined : clampTtlMinutes(minutes);
}

export function cacheEnabled(): boolean {
  return enabled ?? DEFAULT_ON;
}

export function cacheTtlMinutes(): number {
  return ttlMinutes ?? DEFAULT_TTL_MINUTES;
}

/**
 * How long a long-lived fact may be remembered, in ms.
 *
 * Zero when caching is off — which `askOnce` reads as "de-duplicate the burst
 * but remember nothing", so the behaviour goes back to what it was while
 * keeping the part that was never a trade.
 */
export function longLivedTtlMs(): number {
  return cacheEnabled() ? cacheTtlMinutes() * 60_000 : 0;
}

/**
 * And for a fact about a running pod, which restarts and moves.
 *
 * A fraction of the long one and capped, because this is not the same kind of
 * claim: a pod's spec at 10 seconds old is nearly always still true, and at an
 * hour old it is a guess. The cap holds even if somebody sets the long TTL to
 * a day.
 */
export function shortLivedTtlMs(): number {
  return cacheEnabled() ? Math.min(30_000, cacheTtlMinutes() * 60_000) : 0;
}
