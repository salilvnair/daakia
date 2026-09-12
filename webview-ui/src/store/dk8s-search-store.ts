/**
 * Multi-pod log search.
 *
 * Its own store because its lifetime is different from everything else: a
 * result set is worth keeping while you click through pods, and folding it
 * into the pod store would throw it away on the next watch update.
 *
 * Nothing here holds a log. The host matches lines as they stream and posts
 * only the hits, so what this store contains is bounded by the caps the host
 * enforces, not by how much the pods logged.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { logUiEvent } from './ui-audit-store';
import type { LogLevel } from './k8s-store';

export interface SearchMatch {
  pod: string;
  namespace: string;
  context: string;
  line: number;
  ts?: number;
  level: LogLevel;
  text: string;
  hits: [number, number][];
  before: string[];
  after: string[];
}

export interface PodSearchResult {
  pod: string;
  namespace: string;
  context: string;
  scanned: number;
  matched: number;
  /** More matched than were kept. The count is still the true one. */
  capped: boolean;
  elapsedMs: number;
  error?: string;
}

import { type TimeWindow, defaultWindow, windowOptions } from '../components/k8s/TimeWindow';

export interface SearchOptions {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  contextLines: number;
  tailLines: number;
  sinceSeconds?: number;
  /** An absolute window, epoch ms, when the range is a `Between…`. */
  fromMs?: number;
  toMs?: number;
  includePrevious: boolean;
}

export const DEFAULT_OPTIONS: SearchOptions = {
  query: '',
  regex: false,
  caseSensitive: false,
  contextLines: 2,
  tailLines: 5000,
  includePrevious: false,
};

/** One archived file that had hits, for the file list under a group. */
export interface PvFileResult {
  rel: string;
  file: string;
  bytes: number;
  mtime: number;
  scanned: number;
  matched: number;
  error?: string;
}

/**
 * What identifies a result row.
 *
 * One pod produces two groups when it has archived logs as well as live ones,
 * and every piece of per-row state — ticked for export, collapsed, file list
 * open — was keyed on the pod name alone. So the two rows shared one state:
 * ticking either ticked both, collapsing either collapsed both, and exporting
 * "one" of them exported whichever the map happened to hold.
 *
 * The source is what tells them apart, so it belongs in the key.
 */
export function groupKey(g: { result: { pod: string }; source?: 'live' | 'archive' }): string {
  return `${g.source ?? 'live'}:${g.result.pod}`;
}

export interface PodGroup {
  result: PodSearchResult;
  matches: SearchMatch[];
  /**
   * Where these hits came from.
   *
   * A hit in a rotated file from last week means something different from one
   * in a running pod, so the group says which it is rather than leaving the
   * reader to infer it from the timestamps.
   */
  source?: 'live' | 'archive';
  /** `archive` only: every file that matched, for the expandable list. */
  files?: PvFileResult[];
}

interface SearchState {
  open: boolean;
  options: SearchOptions;
  running: boolean;
  progress: { done: number; total: number; pod?: string };
  /** Results in completion order, so the list fills in as pods finish. */
  groups: PodGroup[];
  /**
   * Logs or files.
   *
   * In the store for the same reason the results are: opening a hit unmounts
   * the dialog, and coming back to a Files search that had silently reverted
   * to Logs — with the file results still held but not shown — is worse than
   * losing them outright, because it looks like the search found nothing.
   */
  searchIn: 'logs' | 'files';
  setSearchIn: (v: 'logs' | 'files') => void;
  /**
   * File-search results, held here for the same reason the log ones are.
   *
   * They started in the modal's own state, which meant opening a hit — the
   * whole point of the results — unmounted the dialog and threw them away, so
   * "back to search" returned to an empty panel. Anything you can navigate
   * away from and come back to has to outlive the component.
   */
  fileSearch: {
    running: boolean;
    ran: boolean;
    results: {
      pod: string; namespace: string; context: string;
      hits: { path: string; name: string }[];
      capped: boolean; command: string; error?: string;
    }[];
    scanned: number;
    total: number;
    matched: number;
    podsWithHits: number;
    collapsed: string[];
    /**
     * The hit last opened, kept so returning lands on it.
     *
     * A pixel offset would not survive the list re-rendering; a path does, and
     * it is also what the row needs to show itself as selected.
     */
    selected?: string;
  };
  setFileSearch: (patch: Partial<SearchState['fileSearch']>) => void;
  addFileSearchPod: (r: SearchState['fileSearch']['results'][number]) => void;
  summary?: { pods: number; matched: number; scanned: number; stopped: boolean };
  /** Pods the user has collapsed in the result list. */
  collapsed: string[];
  /** Whether this search included the mounted volume. */
  archiveSearched: boolean;
  /** True while the archive half is running, which is the slow half. */
  scanningArchive: boolean;
  /** Archive groups whose file list is expanded, keyed by pod. */
  filesOpen: string[];
  toggleFiles: (pod: string) => void;
  /**
   * Where the result list was scrolled, and whether a pod was opened from a
   * hit. Together these are what makes Back a return rather than an exit:
   * clicking a match halfway down 9 results and coming back to the top of the
   * list means finding your place again by hand.
   */
  resultScroll: number;
  cameFromSearch: boolean;
  /**
   * Pods to search, by uid.
   *
   * Separate from the grid's selection because the search can now be started
   * from inside a single pod's log view — "Search Everywhere" — where there is
   * no grid selection to inherit. Empty means "fall back to whatever the grid
   * has selected", which is what opening the modal from the pod list should do.
   */
  picked: string[];
  /** Whether the pod table is expanded. Open by default when nothing is picked. */
  pickerOpen: boolean;

  openSearch: () => void;
  closeSearch: () => void;
  setPicked: (uids: string[]) => void;
  setPickerOpen: (open: boolean) => void;
  /** Search across pods, starting from a term highlighted in one pod's log. */
  searchEverywhere: (query: string) => void;
  /** Opening a pod from a hit — records the way back. */
  jumpedToPod: (scrollTop: number) => void;
  /** Back from that pod: reopens the results where they were. */
  returnToSearch: () => void;
  setOptions: (patch: Partial<SearchOptions>) => void;
  /**
   * The range control's state, shared by the search and its export.
   *
   * Held here rather than in either dialog because the export inherits it:
   * having searched the 1st to the 5th, the export of those results means the
   * same window, and asking for it twice is how the two come to disagree.
   */
  timeWindow: TimeWindow;
  setTimeWindow: (w: TimeWindow) => void;
  run: (targets: {
    context: string; namespace: string; pod: string;
    containers?: string[]; workload?: string;
  }[]) => void;
  cancel: () => void;
  toggleCollapsed: (pod: string) => void;
  clear: () => void;
  apply: (msg: Record<string, unknown>) => void;
}

/**
 * A file search that has not run.
 *
 * Named rather than written out at each site: it is set from three places —
 * the initial state, opening the dialog fresh, and closing it — and the bug
 * that made this worth extracting was one of those three quietly not clearing.
 */
const NO_FILE_SEARCH = {
  running: false, ran: false, results: [] as SearchState['fileSearch']['results'],
  scanned: 0, total: 0, matched: 0, podsWithHits: 0,
  collapsed: [] as string[], selected: undefined as string | undefined,
};

export const useDk8sSearchStore = create<SearchState>((set, get) => ({
  open: false,
  resultScroll: 0,
  cameFromSearch: false,
  picked: [],
  pickerOpen: false,
  archiveSearched: false,
  scanningArchive: false,
  filesOpen: [],

  toggleFiles: (pod) => set(s => ({
    filesOpen: s.filesOpen.includes(pod)
      ? s.filesOpen.filter(x => x !== pod)
      : [...s.filesOpen, pod],
  })),
  options: DEFAULT_OPTIONS,
  running: false,
  progress: { done: 0, total: 0 },
  groups: [],
  searchIn: 'logs',
  setSearchIn: (searchIn) => set({ searchIn }),
  fileSearch: { ...NO_FILE_SEARCH },
  setFileSearch: (patch) => set(s => ({ fileSearch: { ...s.fileSearch, ...patch } })),
  addFileSearchPod: (r) => set(s => ({
    fileSearch: {
      ...s.fileSearch,
      scanned: s.fileSearch.scanned + 1,
      results: [...s.fileSearch.results, r],
    },
  })),
  collapsed: [],

  // Opened from the pod grid, so the grid's selection is what you meant —
  // clear any picks a previous Search Everywhere left behind, or they would
  // silently override it.
  openSearch: () => set({
    open: true, picked: [], pickerOpen: false,
    // A dialog opened from the grid is a fresh question. Leaving the previous
    // run's file hits behind made reopening look exactly like coming back from
    // the Explorer — same rows, same selected row, and a header reading "0 pods
    // selected" over results from a search nobody just ran.
    fileSearch: { ...NO_FILE_SEARCH },
  }),
  /*
    A deliberate close leaves nothing behind.

    Only `open` was cleared, so reopening showed the previous run entire — its
    query, its counts, its result rows, and its ticked pods — while the header
    said "0 pods selected", because the selection had been reset and the
    results had not. A dialog that opens onto someone else's answer is worse
    than an empty one: the numbers look current and are not.

    The typed query and its results go; the preferences beside them stay.
    `regex`, `match case`, the tail length and the context width are how you
    like to search rather than what you searched for, and re-setting them
    every time would be its own annoyance.

    Not shared with `jumpedToPod`, which also closes the dialog. That is the
    path where you open a pod from a hit and come back — the results are
    exactly what you are coming back to.
  */
  closeSearch: () => set(s => (s.cameFromSearch ? {
    /*
      Not every close is a close.

      Opening a hit's Explorer takes the dialog off screen, and the modal
      reports that as `onClose` — indistinguishable, from here, from someone
      pressing the button. Wiping state on it left the way back holding results
      with no query and no pods: the header said "0 pods selected" over 2,275
      matches. `jumpedToPod` has already flagged this one as a jump, so it only
      hides the dialog and keeps every part of what you are coming back to.
    */
    open: false,
  } : {
    open: false,
    cameFromSearch: false,
    // Cleared for the same reason the log results are: a dialog that opens
    // onto the previous run's answer is worse than an empty one, because the
    // numbers look current and are not.
    fileSearch: { ...NO_FILE_SEARCH },
    options: { ...s.options, query: '' },
    groups: [],
    collapsed: [],
    filesOpen: [],
    picked: [],
    pickerOpen: false,
    archiveSearched: false,
    scanningArchive: false,
    running: false,
    progress: { done: 0, total: 0 },
    resultScroll: 0,
  })),

  setPicked: (picked) => set({ picked }),
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),

  searchEverywhere: (query) => set(s => ({
    open: true,
    // Starts from nothing chosen and the table open: you came here from one
    // pod's log, so the grid's selection — if any — is not what you meant.
    picked: [],
    pickerOpen: true,
    options: { ...s.options, query },
    groups: [], summary: undefined,
  })),

  jumpedToPod: (scrollTop) => set({ open: false, resultScroll: scrollTop, cameFromSearch: true }),
  returnToSearch: () => set({ open: true, cameFromSearch: false }),

  setOptions: (patch) => set(s => ({ options: { ...s.options, ...patch } })),

  timeWindow: defaultWindow(),
  setTimeWindow: (timeWindow) => set(s => ({
    timeWindow,
    // Resolved straight onto the options, so whatever runs the search does not
    // have to remember to convert it.
    options: { ...s.options, sinceSeconds: undefined, fromMs: undefined, toMs: undefined,
               ...windowOptions(timeWindow) },
  })),

  run: (targets) => {
    const { options } = get();
    if (!options.query.trim() || !targets.length) return;
    set({
      running: true,
      groups: [],
      summary: undefined,
      collapsed: [],
      progress: { done: 0, total: targets.length },
    });
    logUiEvent('dk8s.logs_search', {
      query: options.query, podCount: targets.length,
      pods: targets.map((t: { pod: string }) => t.pod).slice(0, 25),
      regex: options.regex, caseSensitive: options.caseSensitive,
    });
    postMsg({ type: 'dk8s:searchLogs', targets, options });
  },

  cancel: () => {
    postMsg({ type: 'dk8s:cancelSearch' });
    set({ running: false });
  },

  toggleCollapsed: (pod) => set(s => ({
    collapsed: s.collapsed.includes(pod)
      ? s.collapsed.filter(p => p !== pod)
      : [...s.collapsed, pod],
  })),

  clear: () => set({ groups: [], summary: undefined, progress: { done: 0, total: 0 } }),

  apply: (msg) => {
    switch (msg.type) {
      case 'dk8s:searchStarted':
        set({
          running: true, groups: [], summary: undefined,
          archiveSearched: !!msg.archive,
          scanningArchive: false,
          progress: { done: 0, total: msg.total as number },
        });
        break;

      case 'dk8s:searchProgress':
        set({
          scanningArchive: !!msg.archive,
          progress: {
            done: msg.done as number, total: msg.total as number, pod: msg.pod as string,
          },
        });
        break;

      /*
        The archive half.

        Merged into the same list rather than kept apart: you are looking for
        one string, and which half of the storage it turned up in is a property
        of the hit, not a reason to read two result lists.
      */
      case 'dk8s:searchArchivePod': {
        const r = msg.result as PodSearchResult & { files?: PvFileResult[] };
        const matches = (msg.matches as SearchMatch[]) ?? [];
        if (!r.matched && !r.error) break;
        set(s => ({
          groups: [...s.groups, {
            result: r, matches, source: 'archive' as const, files: r.files ?? [],
          }].sort((a, b) => {
            if (!!a.result.error !== !!b.result.error) return a.result.error ? 1 : -1;
            // Live before archive at the same hit count: the running pod is
            // the one you can still act on.
            if (b.result.matched !== a.result.matched) return b.result.matched - a.result.matched;
            const rank = (g: PodGroup) => (g.source === 'archive' ? 1 : 0);
            return rank(a) - rank(b);
          }),
        }));
        break;
      }

      case 'dk8s:searchPod': {
        const result = msg.result as PodSearchResult;
        const matches = (msg.matches as SearchMatch[]) ?? [];
        // Pods with no hits are dropped rather than listed as empty rows. A
        // result list where most entries say "0" buries the ones that matter.
        if (!result.matched && !result.error) break;
        set(s => ({
          groups: [...s.groups, { result, matches }]
            // Most hits first, but anything that errored last — a pod that
            // could not be read is a footnote, not a finding.
            .sort((a, b) => {
              if (!!a.result.error !== !!b.result.error) return a.result.error ? 1 : -1;
              return b.result.matched - a.result.matched;
            }),
        }));
        break;
      }

      case 'dk8s:searchDone':
        set({
          running: false,
          summary: {
            pods: msg.pods as number,
            matched: msg.matched as number,
            scanned: msg.scanned as number,
            stopped: !!msg.stopped,
          },
        });
        break;

      case 'dk8s:searchCancelled':
        set({ running: false });
        break;
    }
  },
}));
