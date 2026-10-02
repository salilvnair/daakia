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

/**
 * A pod the search covered, with enough to go back and ask it again.
 *
 * The name and namespace are what the Overview lists. The cluster and the
 * containers are what a re-fetch needs — downloading a wider window than the
 * page holds means re-running the search, and a target without a context
 * cannot be run at all.
 */
export interface SearchedPod {
  pod: string;
  namespace: string;
  context: string;
  containers: string[];
}
import type { LogLevel } from './k8s-store';
import type { FieldFilter } from '../components/k8s/log-view';
import type { Condition } from '../components/k8s/follow';

/**
 * Following a value from a hit: the conditions, and where it started.
 *
 * Kept with the page, not in the Follow view, so "Back to the hits" and then
 * Follow again on another card lands on a fresh follow while the hits behind
 * it are exactly as they were left.
 */
export interface FollowState {
  conds: Condition[];
  /** The line it was followed from: its pod, its instant, its text. */
  anchor: { pod: string; ts?: number; text: string };
  /** Seconds either side of the anchor. */
  width: number;
  /** Merge the pods into one timeline, or keep each pod whole. */
  oneTimeline: boolean;
  /** Only the anchor's pod — a thread name means nothing on another pod. */
  onlyPod: boolean;
  /** The tagged search that answers it; a new tag per run. */
  tag: string;
  /** The pods to read, where they are not the result's own — a saved follow reopened. */
  pods?: SearchedPod[];
}

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
  searched: SearchedPod[];

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
  /** Adding one that is there flips it — the same as the pod view's field menu. */
  addField: (f: FieldFilter) => void;
  removeField: (field: string, value: string) => void;
  clearFields: () => void;
  wrap: boolean;
  setWrap: (w: boolean) => void;

  /** The line whose fields the rail shows. */
  selected?: number;
  setSelected: (seq: number | undefined) => void;
  /** Fields drawn as columns: "Add as column". */
  columns: string[];
  toggleColumn: (key: string) => void;
  /** "Only when ≥ N", per numeric field. */
  floors: { field: string; min: number }[];
  setFloor: (field: string, min: number | undefined) => void;
  /** Numeric fields charted in the rail: "Chart it". */
  charts: string[];
  toggleChart: (field: string) => void;

  follow?: FollowState;
  setFollow: (f: FollowState | undefined) => void;
  patchFollow: (p: Partial<FollowState>) => void;

  open: (snapshot: {
    query: string; regex: boolean; caseSensitive: boolean; contextLines: number;
    groups: PodGroup[]; scanned: number; archiveRoots: string[];
    searched: SearchedPod[];
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
  /*
    The pod view's rule: a chip that is already there flips between "only
    these" and "not these" rather than doubling. The view calls remove with a
    field and a value, never a whole filter — this used to take a filter and
    compare it against those two strings, so removing a chip did nothing.
  */
  addField: (f) => set(s => {
    const existing = s.fields.find(x => x.field === f.field && x.value === f.value);
    if (!existing) return { fields: [...s.fields, f] };
    if (existing.mode === f.mode && f.mode === 'include') return s;
    return {
      fields: s.fields.map(x => (x === existing
        ? { ...x, mode: x.mode === 'include' ? 'exclude' as const : 'include' as const }
        : x)),
    };
  }),
  removeField: (field, value) => set(s => ({
    fields: s.fields.filter(x => !(x.field === field && x.value === value)),
  })),
  clearFields: () => set({ fields: [] }),
  wrap: false,
  setWrap: (wrap) => set({ wrap }),

  selected: undefined,
  setSelected: (selected) => set({ selected }),
  columns: [],
  toggleColumn: (key) => set(s => ({
    columns: s.columns.includes(key) ? s.columns.filter(k => k !== key) : [...s.columns, key],
  })),
  floors: [],
  setFloor: (field, min) => set(s => ({
    floors: min === undefined
      ? s.floors.filter(f => f.field !== field)
      : [...s.floors.filter(f => f.field !== field), { field, min }],
  })),
  charts: [],
  toggleChart: (field) => set(s => ({
    charts: s.charts.includes(field) ? s.charts.filter(k => k !== field) : [...s.charts, field],
  })),

  follow: undefined,
  setFollow: (follow) => set({ follow }),
  patchFollow: (p) => set(s => (s.follow ? { follow: { ...s.follow, ...p } } : s)),

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
    selected: undefined,
    columns: [],
    floors: [],
    charts: [],
    follow: undefined,
  }),
}));
