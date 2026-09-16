/**
 * A search result, taken out of the dialog and kept.
 *
 * ── Why this is a snapshot and not a view of the live store ──
 *
 * `dk8s-search-store` holds *the* search — the one the dialog is running,
 * which the next search overwrites. A page you opened to read cannot be that:
 * you open it precisely so you can go back to the pods, search for something
 * else, and still have the first answer in front of you. Reading through to
 * the live store would replace the page under the reader the moment they ran
 * another search, which is the one thing a result you deliberately kept must
 * never do.
 *
 * So the groups are copied in at the moment Open is pressed, and nothing here
 * changes afterwards. The page is a record of a search that happened.
 */
import { create } from 'zustand';
import type { PodGroup } from './dk8s-search-store';
import type { LogLevel } from './k8s-store';
import type { FieldFilter } from '../components/k8s/log-view';

export interface ResultTabState {
  /** What was searched for, verbatim — the page's title and its highlight. */
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  /**
   * How many lines either side of each hit the SEARCH brought back.
   *
   * It is a hard ceiling on this page. The neighbours of a hit are only here
   * because the search fetched them; nothing on a result can reach back into
   * the pod for more, so a "±100 lines around" that the search ran at ±2 would
   * be a control that silently does nothing.
   */
  contextLines: number;
  /** Every pod's results, exactly as they were when the page was opened. */
  groups: PodGroup[];
  /** When the search ran, so a page kept open says how old it is. */
  at: number;
  /** Lines counted across the live half, where they were counted at all. */
  scanned: number;
  /** In-pod archive roots the search looked under. */
  archiveRoots: string[];
  /**
   * Every pod the search covered, hits or no hits.
   *
   * `groups` only holds pods that matched something — the results list drops
   * the rest, which is right for a list of results and wrong for a page that
   * claims to say what the search did. "It looked in this pod and there was
   * nothing" is an answer, and it is the one somebody checks when they expected
   * a hit there.
   */
  searched: { pod: string; namespace: string }[];

  // ── What the page is showing, which is the reader's and not the search's ──
  tab: 'logs' | 'overview';
  setTab: (t: 'logs' | 'overview') => void;
  /** A second filter, applied to the results rather than to the cluster. */
  filter: string;
  setFilter: (q: string) => void;
  levels: LogLevel[];
  setLevels: (l: LogLevel[]) => void;
  /** Which pods are shown. Empty means all of them. */
  pods: string[];
  setPods: (p: string[]) => void;
  fields: FieldFilter[];
  addField: (f: FieldFilter) => void;
  removeField: (f: FieldFilter) => void;
  wrap: boolean;
  setWrap: (w: boolean) => void;

  open: (snapshot: {
    query: string; regex: boolean; caseSensitive: boolean; contextLines: number;
    groups: PodGroup[]; scanned: number; archiveRoots: string[];
    searched: { pod: string; namespace: string }[];
  }) => void;
}

export const useResultTabStore = create<ResultTabState>((set, get) => ({
  query: '',
  regex: false,
  caseSensitive: false,
  contextLines: 0,
  groups: [],
  at: 0,
  scanned: 0,
  archiveRoots: [],
  searched: [],

  tab: 'logs',
  setTab: (tab) => set({ tab }),
  filter: '',
  setFilter: (filter) => set({ filter }),
  levels: [],
  setLevels: (levels) => set({ levels }),
  pods: [],
  setPods: (pods) => set({ pods }),
  fields: [],
  addField: (f) => set(s => (
    s.fields.some(x => x.field === f.field && x.value === f.value && x.mode === f.mode)
      ? s
      : { fields: [...s.fields, f] }
  )),
  removeField: (f) => set(s => ({
    fields: s.fields.filter(x => !(x.field === f.field && x.value === f.value && x.mode === f.mode)),
  })),
  wrap: false,
  setWrap: (wrap) => set({ wrap }),

  /*
    Opening replaces what was here, and resets what the reader had set.

    A filter left over from the previous result, applied to a new one, hides
    lines for a reason that is no longer on screen — the box would say
    `checkout` while the page is about a different search entirely.
  */
  open: (snapshot) => set({
    ...snapshot,
    at: Date.now(),
    tab: 'logs',
    filter: '',
    levels: [],
    pods: [],
    fields: [],
    wrap: get().wrap,
  }),
}));
