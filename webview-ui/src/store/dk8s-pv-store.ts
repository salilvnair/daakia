/**
 * Archived logs on a volume — the settings side.
 *
 * Every path here is a path *inside the pod*. The page used to describe a
 * volume mounted on this machine and check it with `fs`, which answered about
 * `C:\prodapp-prod-pvc\…` when asked about `/prodapp-prod-pvc/…` — a drive
 * letter nobody typed, on a machine that was never involved. A claim lives in
 * the cluster and only a pod can reach it, so the pod is what gets asked; see
 * `dk8s-pod-check-store`.
 *
 * The draft is kept separate from what is saved because a search uses what was
 * saved, and a half-typed path should not change where logs are looked for.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { logUiEvent } from './ui-audit-store';

export interface PvMount {
  path: string;
  label?: string;
  context?: string;
  namespace?: string;
  template?: string;
}

import { layoutFor, type PvLayout } from '@daakia/pv-layouts';

export interface PvLogConfig {
  enabled: boolean;
  mounts?: PvMount[];
  /** @deprecated the old single mount; still read so existing configs work. */
  root?: string;
  template?: string;
  /**
   * Layouts saved from the settings screen, offered beside the shipped ones.
   *
   * Stored with the rest of the PV config rather than on their own: a layout
   * only means anything next to the mounts it describes.
   */
  layouts?: PvLayout[];
  pattern?: string;
  extensions?: string[];
  maxAgeDays?: number;
  /** The zone the log's own timestamps are written in. Defaults to UTC. */
  logTimeZone?: string;
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
  logTimeZone: 'UTC',
};

interface PvState {
  config: PvLogConfig;
  /** Unsaved edits. Saved config is what a search actually uses. */
  draft: PvLogConfig;
  dirty: boolean;

  load: () => void;
  patch: (p: Partial<PvLogConfig>) => void;
  save: () => void;
  reset: () => void;
  apply: (msg: Record<string, unknown>) => void;
}

export const useDk8sPvStore = create<PvState>((set, get) => ({
  config: DEFAULT_PV,
  draft: DEFAULT_PV,
  dirty: false,

  load: () => postMsg({ type: 'dk8s:loadPv' }),

  patch: (p) => set(s => ({ draft: { ...s.draft, ...p }, dirty: true })),

  save: () => {
    const cfg = get().draft;
    set({ config: cfg, dirty: false });
    /*
      The record says what was saved, not merely that something was.

      It carried a mount count and an extension list — true, and useless for
      the question this row gets read for, which is "what changed about where
      dk8s looks". The template is the setting; the layout is the name someone
      would say out loud for it; and the match count is the only field that
      says whether the thing just saved finds anything at all.
    */
    const layout = layoutFor(cfg.template, cfg.layouts);
    logUiEvent('dk8s.pv_mapping_save', {
      enabled: cfg.enabled,
      mounts: cfg.mounts?.length ?? 0,
      layout: layout?.name ?? '(not a saved layout)',
      template: cfg.template,
      layouts: cfg.layouts?.length,
      pattern: cfg.pattern,
      extensions: cfg.extensions,
      maxAgeDays: cfg.maxAgeDays,
    });
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
    }
  },
}));
