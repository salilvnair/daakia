/**
 * Starred workloads, kept across sessions.
 *
 * ── What a star is attached to ──
 *
 * Not the pod. A pod name carries the ReplicaSet's hash and the pod's own
 * suffix — `zp-backend-oom-7bb88bcc45-27sqb` — and both change on every
 * rollout. Starring that name gives you a favourite that survives until the
 * next deploy and then silently refers to something that no longer exists,
 * which is the worst behaviour available: it looks like it worked.
 *
 * So the star goes on the workload, and the pods of that workload wear it.
 * Star `Deployment/zp-backend-oom` and the star is still there tomorrow on
 * whichever pod is currently serving it. A bare pod with no owner — a job
 * runner, a debug shell — is starred under its own name, because there is
 * nothing more stable to hang it on.
 *
 * One consequence worth knowing: starring one pod of a three-replica
 * Deployment stars all three. They are the same thing to the person who
 * starred it, and singling out a replica by name lands back in the problem
 * above.
 *
 * ── Where it is kept ──
 *
 * In `prefs`, which is already debounced into SQLite by the host and hydrated
 * on load. A second persistence mechanism for one string array would be a
 * second thing to keep working.
 */
import { useMemo } from 'react';
import { useUiStateStore } from './ui-state-store';
import { logUiEvent } from './ui-audit-store';
import type { PodSummary } from './k8s-store';

const PREF = 'dk8s.favorites';

/**
 * The stable identity of what a pod belongs to.
 *
 * Context and namespace are in the key because names are only unique inside
 * them — two clusters both running `Deployment/api` are two different things,
 * and starring one should not light up the other.
 */
export function favoriteKey(pod: {
  name: string; namespace: string; context?: string;
  workload?: { kind: string; name: string };
}, mode: FavoriteMode = 'workload'): string {
  const scope = `${pod.context ?? ''}/${pod.namespace}`;
  return pod.workload && mode === 'workload'
    ? `${scope}/${pod.workload.kind}/${pod.workload.name}`
    : `${scope}/Pod/${pod.name}`;
}

/**
 * Which of the two things a star can be on.
 *
 * `workload` is nearly always what somebody means and stays the default. But
 * a pod is sometimes the subject in its own right — one replica of five that
 * keeps falling over, the one run of a Job that failed — and a star that
 * silently widened to the whole Deployment gave them five starred pods and no
 * way to say otherwise.
 */
export type FavoriteMode = 'workload' | 'pod';

/** What a star on this pod would be attached to, either way. */
export function favoriteChoices(pod: {
  name: string; namespace: string; context?: string;
  workload?: { kind: string; name: string };
}): { mode: FavoriteMode; key: string; label: string; detail: string }[] {
  const out: { mode: FavoriteMode; key: string; label: string; detail: string }[] = [];
  if (pod.workload) {
    out.push({
      mode: 'workload',
      key: favoriteKey(pod, 'workload'),
      label: `${pod.workload.kind} · ${pod.workload.name}`,
      detail: 'Every pod of it, including the ones that replace this one',
    });
  }
  out.push({
    mode: 'pod',
    key: favoriteKey(pod, 'pod'),
    label: `Pod · ${pod.name}`,
    detail: pod.workload
      ? 'Only this one. It goes away when the pod does.'
      : 'This pod has no owning workload, so its own name is all there is.',
  });
  return out;
}

/** Whichever key is actually starred for this pod, if either is. */
export function starredKeyOf(pod: {
  name: string; namespace: string; context?: string;
  workload?: { kind: string; name: string };
}, keys: string[]): string | undefined {
  return favoriteChoices(pod).map(c => c.key).find(k => keys.includes(k));
}

function parse(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    // Anything else under this key is a half-written value or someone else's
    // data; an empty list is a better answer than a crash on load.
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The starred keys, straight out of `prefs`.
 *
 * Deliberately not a second store holding its own copy. A copy needs to be
 * seeded at startup from prefs that arrive asynchronously — and the window
 * between "component mounted" and "host sent the saved state" is exactly when
 * someone looks at the pod list, so a copy shows an empty star list for the
 * first moment of every session and then pops. Reading through means
 * hydration is not a case this code has to handle at all.
 *
 * The raw string is what's subscribed to, so the parsed array is rebuilt only
 * when the stored value actually changes rather than on every render.
 */
export function useFavoriteKeys(): string[] {
  const raw = useUiStateStore(s => s.prefs[PREF]);
  return useMemo(() => parse(raw), [raw]);
}

export function toggleFavorite(key: string): void {
  const prefs = useUiStateStore.getState();
  const keys = parse(prefs.prefs[PREF]);
  const next = keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key];
  logUiEvent('dk8s.pod_favorite', {
    workload: key, starred: next.length > keys.length, total: next.length,
  });
  prefs.setPref(PREF, JSON.stringify(next));
}

/**
 * Starred first, then everything else in the order it arrived.
 *
 * A stable partition, so within each group the caller's ordering — severity,
 * name, whatever it chose — survives. Starring a pod should lift it, not
 * reshuffle the ranking it was lifted out of.
 */
export function favoritesFirst<T extends PodSummary>(pods: T[], keys: string[]): T[] {
  if (!keys.length) return pods;
  const fav = new Set(keys);
  const starred: T[] = [];
  const rest: T[] = [];
  /* Either kind of star lifts a pod: somebody who starred one replica by name
     means that row, and it has to rise the same way. */
  for (const p of pods) {
    const on = fav.has(favoriteKey(p, 'workload')) || fav.has(favoriteKey(p, 'pod'));
    (on ? starred : rest).push(p);
  }
  return [...starred, ...rest];
}
