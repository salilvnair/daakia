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
  /**
   * Per layout id: the real files that row claims on the probed volume.
   *
   * Computed host-side, where the walk already happened. An id missing from
   * here was not in the config when the probe ran — a row added or edited
   * since — and has to read as unknown rather than as nothing found.
   */
  layouts?: Record<string, { rel: string[]; count: number }>;
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
  /**
   * Per layout id: the real files that row claims on the probed volume.
   *
   * Computed host-side, where the walk already happened. An id missing from
   * here was not in the config when the probe ran — a row added or edited
   * since — and has to read as unknown rather than as nothing found.
   */
  layouts?: Record<string, { rel: string[]; count: number }>;
}

/** The key the probe reports the in-force template under. See PvLogSettings. */
const CURRENT_LAYOUT = '@current';

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

/** Value equality, so retyping the same path does not discard a good probe. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export const useDk8sPvStore = create<PvState>((set, get) => ({
  config: DEFAULT_PV,
  draft: DEFAULT_PV,
  probing: false,
  dirty: false,

  load: () => postMsg({ type: 'dk8s:probePv' }),

  /*
    Editing what the walk reads throws the last probe away.

    The panel is a report on a specific set of mounts, and it outlived them:
    clearing the mount path left the file listing, the byte total and the
    resolved path from the previous walk on screen, describing a directory the
    config no longer names. The most confusing possible moment to keep showing
    an answer is right after the question changed.

    Only the fields the walk actually consumes count. Editing the template
    leaves the listing standing, which is the point of "check your template
    against these" — you change the template and compare it to the files that
    are still there.
  */
  patch: (p) => set(s => {
    const walked: (keyof PvLogConfig)[] = ['mounts', 'root', 'extensions', 'maxAgeDays'];
    const stale = walked.some(k => k in p && !same(p[k], s.draft[k]));
    return {
      draft: { ...s.draft, ...p },
      dirty: true,
      ...(stale ? { probe: undefined } : {}),
    };
  }),

  runProbe: () => {
    set({ probing: true });
    postMsg({ type: 'dk8s:probePv', config: get().draft });
  },

  save: () => {
    const cfg = get().draft;
    set({ config: cfg, dirty: false, probing: true });
    /*
      The record says what was saved, not merely that something was.

      It carried a mount count and an extension list — true, and useless for
      the question this row gets read for, which is "what changed about where
      dk8s looks". The template is the setting; the layout is the name someone
      would say out loud for it; and the match count is the only field that
      says whether the thing just saved finds anything at all.
    */
    const probe = get().probe;
    const layout = layoutFor(cfg.template, cfg.layouts);
    const found = probe?.layouts?.[layout?.id ?? CURRENT_LAYOUT];
    logUiEvent('dk8s.pv_mapping_save', {
      enabled: cfg.enabled,
      mounts: cfg.mounts?.length ?? 0,
      layout: layout?.name ?? '(not a saved layout)',
      template: cfg.template,
      // Only from a probe of this same config; stale numbers would be worse
      // than none, because a count reads as a measurement.
      filesItFinds: found?.count,
      filesSeen: probe?.fileCount,
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
      case 'dk8s:pvProbe':
        set({ probe: msg.probe as PvProbe, probing: false });
        break;
    }
  },
}));
