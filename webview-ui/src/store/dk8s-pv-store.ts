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

export interface PvMount {
  path: string;
  label?: string;
  context?: string;
  namespace?: string;
  template?: string;
}

export interface PvLogConfig {
  enabled: boolean;
  mounts?: PvMount[];
  /** @deprecated the old single mount; still read so existing configs work. */
  root?: string;
  template?: string;
  pattern?: string;
  extensions?: string[];
  maxAgeDays?: number;
  /** Context substring → the token `{env}` expands to. */
  envByContext?: Record<string, string>;
  /** Pod-name substring → the token `{app}` expands to. Rarely needed. */
  appByPod?: Record<string, string>;
  /**
   * Pod name → a path template, for volumes the shared template cannot
   * describe. A glob when the key contains `*` or `?`, a substring otherwise.
   * Longest key wins, and it beats both the mount's template and the shared
   * one. See `templateForPod` in pv-logs.
   */
  pathByPod?: Record<string, string>;
}

export interface PvSampleFile { rel: string; bytes: number; mtime: number }

export interface PvMountProbe {
  ok: boolean;
  error?: string;
  path: string;
  label?: string;
  resolved: string;
  topLevel: string[];
  fileCount: number;
  totalBytes: number;
  newest?: number;
  oldest?: number;
  sample: PvSampleFile[];
}

export interface PvProbe {
  ok: boolean;
  error?: string;
  mounts: PvMountProbe[];
  fileCount: number;
  totalBytes: number;
  newest?: number;
  oldest?: number;
  sample: PvSampleFile[];
}

export const DEFAULT_PV: PvLogConfig = {
  enabled: false,
  mounts: [{ path: '' }],
  /*
    A claim named after the workload and the environment it runs in, holding a
    logs directory named the same way — which is what a Helm chart that
    templates the claim name produces, and what most Spring Boot deployments
    end up with. Offered as the default so the field is not a blank box with
    no clue what belongs in it.

    `**` spans whatever rolling directory logback is configured with, and
    `{app}*.log*` catches both the live file and every rolled name it
    produces — `zp-backend.2026-08-28.0.log`, `.log.gz`, and so on.
  */
  template: '{app}-{env}-pvc/{app}-{env}-logs/**/{app}*.log*',
  envByContext: {},
  appByPod: {},
  pathByPod: {},
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
