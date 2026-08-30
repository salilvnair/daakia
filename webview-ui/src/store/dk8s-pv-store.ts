/**
 * Archived logs on a mounted volume — the settings side.
 *
 * The draft is kept separate from what is saved so the probe can be run
 * against a path you are still typing: confirming a template against the real
 * tree before saving is the difference between "no matches because nothing
 * matched" and "no matches because the path was wrong", and those two look
 * identical from a result list.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

export interface PvLogConfig {
  enabled: boolean;
  root: string;
  template?: string;
  pattern?: string;
  extensions?: string[];
  maxAgeDays?: number;
}

export interface PvProbe {
  ok: boolean;
  error?: string;
  root: string;
  topLevel: string[];
  fileCount: number;
  totalBytes: number;
  newest?: number;
  oldest?: number;
  sample: { rel: string; bytes: number; mtime: number }[];
}

export const DEFAULT_PV: PvLogConfig = {
  enabled: false,
  root: '',
  // The layout most teams end up with, offered so the field is not a blank
  // box with no clue what belongs in it.
  template: '{namespace}/{app}/{date}/*.log*',
  extensions: ['.log'],
  maxAgeDays: 0,
};

interface PvState {
  config: PvLogConfig;
  /** Unsaved edits. Saved config is what a search actually uses. */
  draft: PvLogConfig;
  probe?: PvProbe;
  probing: boolean;
  dirty: boolean;

  load: () => void;
  patch: (p: Partial<PvLogConfig>) => void;
  runProbe: () => void;
  save: () => void;
  reset: () => void;
  apply: (msg: Record<string, unknown>) => void;
}

export const useDk8sPvStore = create<PvState>((set, get) => ({
  config: DEFAULT_PV,
  draft: DEFAULT_PV,
  probing: false,
  dirty: false,

  load: () => postMsg({ type: 'dk8s:probePv' }),

  patch: (p) => set(s => ({ draft: { ...s.draft, ...p }, dirty: true })),

  runProbe: () => {
    set({ probing: true });
    postMsg({ type: 'dk8s:probePv', config: get().draft });
  },

  save: () => {
    const cfg = get().draft;
    set({ config: cfg, dirty: false, probing: true });
    postMsg({ type: 'dk8s:savePv', config: cfg });
  },

  reset: () => set(s => ({ draft: s.config, dirty: false })),

  apply: (msg) => {
    switch (msg.type) {
      case 'dk8s:pvConfig': {
        const cfg = (msg.config as PvLogConfig | null) ?? DEFAULT_PV;
        set(s => ({
          config: cfg,
          // Edits in progress are not thrown away by a message from the host.
          draft: s.dirty ? s.draft : cfg,
        }));
        break;
      }
      case 'dk8s:pvProbe':
        set({ probe: msg.probe as PvProbe, probing: false });
        break;
    }
  },
}));
