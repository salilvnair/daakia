import { create } from 'zustand';
import { postMsg } from '../vscode';
import { setKeymapOverrides } from '../services/keyboard';

export interface ProxySettings {
  mode: 'none' | 'system' | 'manual';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  bypass?: string[];
}

/** id → combo, or null when the user deliberately cleared the binding. */
export type KeymapOverrides = Record<string, {
  key: string; altKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean;
} | null>;

export interface GeneralAppSettings {
  followRedirects: boolean;
  sslVerification: boolean;
  timeout: number;
  saveResponseInHistory: boolean;
  maxHistoryEntries: number;
  maxAiChatMessages: number;
  /**
   * How many previous question/answer pairs a dk8s follow-up carries with it.
   *
   * Not unlimited, and not zero. Zero makes every follow-up a fresh question
   * about evidence the model has already been shown, so "and the restarts?"
   * arrives with nothing to attach itself to. Unlimited re-sends a growing
   * transcript on every turn, which on a log analysis is the expensive half of
   * the request — the evidence is already large before any of the conversation
   * is added to it.
   */
  dk8sAiHistoryTurns: number;
  encoding: 'enable' | 'disable' | 'auto';
  proxy: ProxySettings;
  /** User keyboard-shortcut rebinds, applied over each feature's registered default. */
  keymap: KeymapOverrides;
}

const DEFAULTS: GeneralAppSettings = {
  followRedirects: true,
  sslVerification: true,
  timeout: 0,
  saveResponseInHistory: true,
  maxHistoryEntries: 500,
  maxAiChatMessages: 200,
  dk8sAiHistoryTurns: 5,
  encoding: 'enable',
  proxy: { mode: 'none' },
  keymap: {},
};

interface AppSettingsState {
  settings: GeneralAppSettings;
  /** True once the real persisted settings have been loaded from the extension host. */
  loaded: boolean;
  /** Request the persisted settings from the extension host. Call once, at app boot. */
  load: () => void;
  /** Apply a settingsData response from the extension host. */
  setSettings: (patch: Partial<GeneralAppSettings>) => void;
  /** Optimistically apply a local change and persist it — the single write path for every
   * Settings > General/Encoding/Proxy control, so there is only one place a toggle's value
   * can come from (no per-component default-then-refetch race/flicker). */
  save: (patch: Partial<GeneralAppSettings>) => void;
}

/** Populated once from the 'init' → getSettings round trip (see use-extension-messages.ts) —
 * every Settings > General/Encoding/Proxy control reads/writes through this single store
 * instead of independently fetching on its own mount. */
export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  load: () => { postMsg({ type: 'getSettings' }); },
  setSettings: (patch) => set((s) => {
    const settings = { ...s.settings, ...patch };
    // Push rebinds into the keyboard layer as soon as persisted settings arrive, so a
    // custom shortcut works from app start rather than only after visiting Settings.
    setKeymapOverrides(settings.keymap ?? {});
    return { settings, loaded: true };
  }),
  save: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    if (patch.keymap) setKeymapOverrides(settings.keymap ?? {});
    postMsg({ type: 'saveSettings', settings });
  },
}));
