/**
 * UI State Store — persists panel heights, scroll positions, and other layout preferences.
 * Saved to Zustand for instant access and debounced to SQLite via postMessage for persistence across sessions.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE = 1000; // 1s debounce for DB persistence

interface UiStateStore {
  /** Panel heights keyed by panel ID (e.g., "mock.rest.route.{routeId}.body") */
  panelHeights: Record<string, number>;
  /** Scroll positions keyed by container ID */
  scrollPositions: Record<string, number>;
  /** JSON tree expand state keyed by scope ID (e.g., tab ID) → set of expanded paths (session-only) */
  jsonExpandState: Record<string, Set<string>>;
  /** Generic string preferences keyed by ID (e.g., "rest.subtab.{tabId}") — persisted */
  prefs: Record<string, string>;

  // Actions
  setHeight: (id: string, height: number) => void;
  getHeight: (id: string, defaultHeight: number) => number;
  setScroll: (id: string, position: number) => void;
  getScroll: (id: string) => number;
  setPref: (id: string, value: string) => void;
  setScopedPref: (prefix: string, id: string, value: string, keep?: number) => void;
  getPref: (id: string, defaultValue?: string) => string | undefined;
  toggleJsonPath: (scopeId: string, path: string) => void;
  getJsonExpanded: (scopeId: string) => Set<string>;
  clearJsonState: (scopeId: string) => void;
  hydrate: (data: { panelHeights?: Record<string, number>; scrollPositions?: Record<string, number>; prefs?: Record<string, string> }) => void;
}

function schedulePersist(state: { panelHeights: Record<string, number>; scrollPositions: Record<string, number>; prefs: Record<string, string> }) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    postMsg({ type: 'saveUiState', data: { panelHeights: state.panelHeights, scrollPositions: state.scrollPositions, prefs: state.prefs } });
  }, SAVE_DEBOUNCE);
}

export const useUiStateStore = create<UiStateStore>((set, get) => ({
  panelHeights: {},
  scrollPositions: {},
  jsonExpandState: {},
  prefs: {},

  setHeight: (id, height) => {
    set(s => {
      const panelHeights = { ...s.panelHeights, [id]: height };
      schedulePersist({ panelHeights, scrollPositions: s.scrollPositions, prefs: s.prefs });
      return { panelHeights };
    });
  },

  getHeight: (id, defaultHeight) => {
    return get().panelHeights[id] ?? defaultHeight;
  },

  setScroll: (id, position) => {
    set(s => {
      const scrollPositions = { ...s.scrollPositions, [id]: position };
      schedulePersist({ panelHeights: s.panelHeights, scrollPositions, prefs: s.prefs });
      return { scrollPositions };
    });
  },

  getScroll: (id) => {
    return get().scrollPositions[id] ?? 0;
  },

  setPref: (id, value) => {
    set(s => {
      const prefs = { ...s.prefs, [id]: value };
      schedulePersist({ panelHeights: s.panelHeights, scrollPositions: s.scrollPositions, prefs });
      return { prefs };
    });
  },

  /**
   * A pref for one of an unbounded set of things, keeping only the recent ones.
   *
   * The existing `<area>.subtab.<id>` prefs are keyed by request tab, and there
   * are only ever a handful of those. Keying by pod is the same idea against a
   * set with no ceiling — every pod you ever open would leave a key behind, and
   * `prefs` is a single JSON blob, so after a few months on a large cluster it
   * would be thousands of dead entries carried into memory on every launch.
   *
   * So the key is rewritten rather than updated: deleting it before re-adding
   * puts it last in insertion order, which is what makes "keep the most recent
   * N" mean anything for a plain object.
   */
  setScopedPref: (prefix, id, value, keep = 50) => {
    set(s => {
      const { [`${prefix}${id}`]: _drop, ...rest } = s.prefs;
      const next: Record<string, string> = { ...rest, [`${prefix}${id}`]: value };

      const mine = Object.keys(next).filter(k => k.startsWith(prefix));
      for (const stale of mine.slice(0, Math.max(0, mine.length - keep))) delete next[stale];

      schedulePersist({ panelHeights: s.panelHeights, scrollPositions: s.scrollPositions, prefs: next });
      return { prefs: next };
    });
  },

  getPref: (id, defaultValue) => {
    return get().prefs[id] ?? defaultValue;
  },

  toggleJsonPath: (scopeId, path) => {
    set(s => {
      const existing = s.jsonExpandState[scopeId] ?? new Set<string>();
      const next = new Set(existing);
      if (next.has(path)) next.delete(path); else next.add(path);
      return { jsonExpandState: { ...s.jsonExpandState, [scopeId]: next } };
    });
  },

  getJsonExpanded: (scopeId) => {
    return get().jsonExpandState[scopeId] ?? new Set<string>();
  },

  clearJsonState: (scopeId) => {
    set(s => {
      const { [scopeId]: _, ...rest } = s.jsonExpandState;
      return { jsonExpandState: rest };
    });
  },

  hydrate: (data) => {
    set({
      panelHeights: data.panelHeights ?? {},
      scrollPositions: data.scrollPositions ?? {},
      prefs: data.prefs ?? {},
    });
  },
}));

/**
 * A piece of UI state that survives closing Daakia.
 *
 * Which settings section you were reading, which subtab, which panel was
 * expanded — all of it was `useState`, so every reopen dropped you back on the
 * first tab of the first section and you had to navigate to your place again.
 * These are single strings, which is what `prefs` already persists to SQLite,
 * so the fix is to read and write them there instead.
 *
 * `valid` guards against a stored value that no longer names anything — a
 * renamed subtab would otherwise restore as a blank pane.
 *
 * Reads follow the store rather than only seeding from it, so a write from
 * somewhere else (the command palette jumping to a section) moves an
 * already-mounted panel instead of being picked up on its next mount.
 */
export function usePersistedPref<T extends string>(
  key: string,
  fallback: T,
  valid?: readonly T[],
): [T, (v: T) => void] {
  const stored = useUiStateStore(s => s.prefs[key]) as T | undefined;
  const ok = stored !== undefined && (!valid || valid.includes(stored));
  return [
    ok ? stored : fallback,
    (v: T) => useUiStateStore.getState().setPref(key, v),
  ];
}
