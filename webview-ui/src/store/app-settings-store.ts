import { create } from 'zustand';
import { postMsg } from '../vscode';

export interface ProxySettings {
  mode: 'none' | 'system' | 'manual';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  bypass?: string[];
}

export interface GeneralAppSettings {
  followRedirects: boolean;
  sslVerification: boolean;
  timeout: number;
  saveResponseInHistory: boolean;
  maxHistoryEntries: number;
  maxAiChatMessages: number;
  encoding: 'enable' | 'disable' | 'auto';
  proxy: ProxySettings;
}

const DEFAULTS: GeneralAppSettings = {
  followRedirects: true,
  sslVerification: true,
  timeout: 0,
  saveResponseInHistory: true,
  maxHistoryEntries: 500,
  maxAiChatMessages: 200,
  encoding: 'enable',
  proxy: { mode: 'none' },
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
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch }, loaded: true })),
  save: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    postMsg({ type: 'saveSettings', settings });
  },
}));
