/**
 * Settings → DK8S → Port forwarding, as prefs.
 *
 * Read by the forward store when it starts one (reconnect tries, follow, idle
 * limit, the production patterns) and by the Ports tab when a local port is
 * taken. Saved sets live here too, under a key shared with the workspace so
 * a teammate opens your "backend local dev" and has it.
 */
import { useMemo } from 'react';
import { useUiStateStore } from '../../store/ui-state-store';

export const PF_RECONNECT_PREF = 'dk8s.pf.reconnect';
export const PF_TRIES_PREF = 'dk8s.pf.tries';
export const PF_FOLLOW_PREF = 'dk8s.pf.follow';
export const PF_IDLE_PREF = 'dk8s.pf.idleMinutes';
export const PF_PROD_PREF = 'dk8s.pf.prodPatterns';
export const PF_TAKEN_PREF = 'dk8s.pf.whenTaken';
/** Saved sets — synced with the workspace (see dk8s-shared-prefs.ts). */
export const PF_SETS_PREF = 'dk8s.pf.sets';
/** The forwards that were up when Daakia last closed — for "Start them again?". */
export const PF_LAST_OPEN_PREF = 'dk8s.pf.lastOpen';

export type WhenTaken = 'next' | 'plus10000' | 'ask';

export interface PfPrefs {
  reconnect: boolean;
  tries: number;
  follow: boolean;
  /** 0 for never. */
  idleMinutes: number;
  /** Extra contexts treated as production, besides `*prod*`, which always is. */
  prodPatterns: string[];
  whenTaken: WhenTaken;
}

export const PF_DEFAULTS: PfPrefs = { reconnect: true, tries: 5, follow: true, idleMinutes: 30, prodPatterns: [], whenTaken: 'next' };

export function pfPrefs(prefs: Record<string, string>): PfPrefs {
  const n = (k: string, d: number, lo: number, hi: number) => {
    const v = Number(prefs[k]); return Number.isFinite(v) && v >= lo && v <= hi ? v : d;
  };
  const taken = prefs[PF_TAKEN_PREF];
  return {
    reconnect: prefs[PF_RECONNECT_PREF] !== 'off',
    tries: n(PF_TRIES_PREF, PF_DEFAULTS.tries, 1, 10),
    follow: prefs[PF_FOLLOW_PREF] !== 'off',
    idleMinutes: n(PF_IDLE_PREF, PF_DEFAULTS.idleMinutes, 0, 24 * 60),
    prodPatterns: (prefs[PF_PROD_PREF] ?? '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean).slice(0, 12),
    whenTaken: taken === 'plus10000' || taken === 'ask' ? taken : 'next',
  };
}

export function usePfPrefs(): PfPrefs {
  const prefs = useUiStateStore(s => s.prefs);
  return useMemo(() => pfPrefs(prefs), [prefs]);
}

export function currentPfPrefs(): PfPrefs {
  return pfPrefs(useUiStateStore.getState().prefs);
}

// ── Saved sets ─────────────────────────────────────────────────────────────

export interface SetItem {
  context: string;
  namespace: string;
  /** The pod when it was saved — the workload finds its current one. */
  pod: string;
  workload?: { kind: string; name: string };
  service?: string;
  ports: { local: number; remote: number; name?: string; role?: string }[];
}

export interface ForwardSet {
  id: string;
  name: string;
  items: SetItem[];
}

export function parseSets(raw: string | undefined): ForwardSet[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(s => s && typeof s.name === 'string' && Array.isArray(s.items)) : [];
  } catch { return []; }
}

export function useSets(): ForwardSet[] {
  const raw = useUiStateStore(s => s.prefs[PF_SETS_PREF]);
  return useMemo(() => parseSets(raw), [raw]);
}

export function saveSets(sets: ForwardSet[]): void {
  useUiStateStore.getState().setPref(PF_SETS_PREF, JSON.stringify(sets));
}

/** Put a forward into a set — a new one by name, or an existing one by id. */
export function addToSet(item: SetItem, target: { id?: string; name?: string }): ForwardSet[] {
  const sets = parseSets(useUiStateStore.getState().prefs[PF_SETS_PREF]);
  const same = (a: SetItem) => a.context === item.context && a.namespace === item.namespace
    && (a.workload && item.workload ? a.workload.name === item.workload.name : a.pod === item.pod)
    && (a.service ?? '') === (item.service ?? '') && a.ports.map(p => p.remote).join() === item.ports.map(p => p.remote).join();
  let next: ForwardSet[];
  if (target.id && sets.some(s => s.id === target.id)) {
    next = sets.map(s => (s.id === target.id ? { ...s, items: [...s.items.filter(i => !same(i)), item] } : s));
  } else {
    const name = (target.name ?? '').trim() || 'My forwards';
    next = [...sets, { id: `set-${Date.now().toString(36)}`, name, items: [item] }];
  }
  saveSets(next);
  return next;
}

export function removeSet(id: string): void {
  saveSets(parseSets(useUiStateStore.getState().prefs[PF_SETS_PREF]).filter(s => s.id !== id));
}
