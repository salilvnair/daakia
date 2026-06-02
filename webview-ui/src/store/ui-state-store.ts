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
