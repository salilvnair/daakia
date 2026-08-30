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

export interface SearchOptions {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  contextLines: number;
  tailLines: number;
  sinceSeconds?: number;
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

export interface PodGroup {
  result: PodSearchResult;
  matches: SearchMatch[];
}

interface SearchState {
  open: boolean;
  options: SearchOptions;
  running: boolean;
  progress: { done: number; total: number; pod?: string };
  /** Results in completion order, so the list fills in as pods finish. */
  groups: PodGroup[];
  summary?: { pods: number; matched: number; scanned: number; stopped: boolean };
  /** Pods the user has collapsed in the result list. */
  collapsed: string[];
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
  run: (targets: { context: string; namespace: string; pod: string; containers?: string[] }[]) => void;
  cancel: () => void;
  toggleCollapsed: (pod: string) => void;
  clear: () => void;
  apply: (msg: Record<string, unknown>) => void;
}

export const useDk8sSearchStore = create<SearchState>((set, get) => ({
  open: false,
  resultScroll: 0,
  cameFromSearch: false,
  picked: [],
  pickerOpen: false,
  options: DEFAULT_OPTIONS,
  running: false,
  progress: { done: 0, total: 0 },
  groups: [],
  collapsed: [],

  // Opened from the pod grid, so the grid's selection is what you meant —
  // clear any picks a previous Search Everywhere left behind, or they would
  // silently override it.
  openSearch: () => set({ open: true, picked: [], pickerOpen: false }),
  // The way back is dropped on a deliberate close: you chose to leave.
  closeSearch: () => set({ open: false, cameFromSearch: false }),

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
        set({ running: true, groups: [], summary: undefined,
              progress: { done: 0, total: msg.total as number } });
        break;

      case 'dk8s:searchProgress':
        set({ progress: {
          done: msg.done as number, total: msg.total as number, pod: msg.pod as string,
        } });
        break;

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
