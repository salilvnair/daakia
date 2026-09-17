/**
 * Two pods' logs, side by side, each following on its own.
 *
 * ── Why this is a store and not a prop ──
 *
 * Following two replicas to see which of them is the one failing is the thing
 * a split is for, and nothing about the single-pod path could do it. The host
 * held one stream handle and replaced it on every open; the pod store holds
 * one `logs` array, one filter, one tail, one follow. Both are exactly right
 * for a view that shows one pod and both are a hard no for a view that shows
 * two.
 *
 * So a pane owns its own everything: its lines, and every control in the log
 * view's toolbar. The host now keys its streams by pod, and each pane's lines
 * are routed here by the cluster, namespace and pod they arrived with — the
 * pod name alone is not an address, because two namespaces can hold one of the
 * same name and its lines would land in the other pane.
 *
 * ── What a pane deliberately does NOT own ──
 *
 * Anything about the pod that is not its log. The detail view — describe,
 * YAML, doctor, the shell — stays single and stays where it is. A split is for
 * reading output next to output; making it a second copy of the whole detail
 * view would be four screens where somebody wanted two logs.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { useK8sStore } from './k8s-store';
import type { LogLine, LogLevel, LogStatus, PodSummary } from './k8s-store';
import type { FieldFilter } from '../components/k8s/log-view';

/** Panes across, panes down, or a square of four. */
export type SplitMode = 'vertical' | 'horizontal' | 'grid';

/**
 * How many panes a mode can hold.
 *
 * Two either way, four in a grid. Past that each pane is too small to read a
 * log line in, which is the one thing every pane exists to do — a six-way
 * split is a screenshot rather than a tool.
 */
export const MAX_PANES: Record<SplitMode, number> = {
  vertical: 3,
  horizontal: 3,
  grid: 4,
};

export interface SplitPane {
  /** Stable for the life of the pane; the key everything renders by. */
  id: string;
  pod: string;
  namespace: string;
  context: string;
  containers: string[];

  // ── The stream ──
  logs: LogLine[];
  status: LogStatus;
  detail?: string;
  dropped: number;
  formatId?: string;
  formatName?: string;

  // ── The toolbar, per pane ──
  filter: string;
  levels: LogLevel[];
  fields: FieldFilter[];
  tail: number;
  direction: 'first' | 'last';
  follow: boolean;
  live: boolean;
  wrap: boolean;
  previous: boolean;
  requestedAt: number;
}

interface SplitState {
  /** Empty means no split is open; the pod grid is what you see. */
  panes: SplitPane[];
  mode: SplitMode;
  /** Which pane the keyboard and the "one pane" actions belong to. */
  focused?: string;

  /*
    Where Back goes.

    A split opened from the pod grid closes onto the grid, which is where it
    came from. One opened from a search result has a whole screen behind it —
    the hits that named these pods in the first place — and dropping the reader
    on the grid instead makes them find their way back to a result they were
    reading a moment ago.
  */
  origin?: 'pods' | 'results';
  open: (pods: PodSummary[], mode: SplitMode, tail: number, origin?: 'pods' | 'results') => void;
  close: () => void;
  closePane: (id: string) => void;
  setMode: (mode: SplitMode) => void;
  focus: (id: string) => void;
  patch: (id: string, over: Partial<SplitPane>) => void;
  /** Ask the host for this pane's lines again, with whatever it now wants. */
  refetch: (id: string) => void;
  apply: (msg: Record<string, unknown>) => void;
}

function keyOf(p: { context: string; namespace: string; pod: string }): string {
  return `${p.context}/${p.namespace}/${p.pod}`;
}

/**
 * The pod behind a pane, for handing to the detail view.
 *
 * The grid's own row when it still has one, because it carries the health, the
 * workload and the real container list. What the pane recorded when it does
 * not — a pod deleted while its pane was open still has a detail worth
 * opening, and refusing to open it would be a dead end at exactly the moment
 * somebody wants to know what happened.
 */
function podForPane(pane: SplitPane): PodSummary {
  const live = useK8sStore.getState().pods.find(
    p => p.name === pane.pod && p.namespace === pane.namespace
      && (p.context ?? '') === pane.context,
  );
  return live ?? ({
    name: pane.pod,
    namespace: pane.namespace,
    context: pane.context,
    uid: pane.id,
    phase: 'Unknown',
    ready: { current: 0, total: 0 },
    restarts: 0,
    containers: pane.containers.map(name => ({
      name, ready: false, restarts: 0, image: '',
    })),
    healthy: false,
    deleting: false,
  } as PodSummary);
}

/** How many lines a pane keeps. The same ceiling the single view uses. */
const MAX_LINES = 20_000;

export const useSplitStore = create<SplitState>((set, get) => ({
  panes: [],
  mode: 'vertical',

  open: (pods, mode, tail, origin = 'pods') => {
    const capped = pods.slice(0, MAX_PANES[mode]);
    const panes: SplitPane[] = capped.map(p => ({
      id: keyOf({ context: p.context ?? '', namespace: p.namespace, pod: p.name }),
      pod: p.name,
      namespace: p.namespace,
      context: p.context ?? '',
      containers: p.containers.map(c => c.name),
      logs: [],
      status: 'loading',
      dropped: 0,
      filter: '',
      levels: [],
      fields: [],
      tail,
      direction: 'last',
      follow: true,
      live: false,
      /* The view seeds this from the remembered choice on mount — see
         `log-view-prefs`. The value here is only what it opens with before
         that lands, so it matches the detail view's own default. */
      wrap: true,
      previous: false,
      requestedAt: Date.now(),
    }));

    set({ panes, mode, focused: panes[0]?.id, origin });

    /*
      Every pane asks at once, and every one but the first says `alongside`.

      The first open clears whatever the detail view left streaming — nobody is
      looking at it any more. The rest must not, or each would stop the one
      before it and the split would end up showing only its last pane.
    */
    panes.forEach((pane, i) => postMsg({
      type: 'dk8s:openLogs',
      context: pane.context,
      namespace: pane.namespace,
      pod: pane.pod,
      tailLines: pane.tail,
      direction: 'last',
      follow: false,
      alongside: i > 0,
    }));
  },

  close: () => {
    for (const pane of get().panes) {
      postMsg({
        type: 'dk8s:closeLogs',
        context: pane.context, namespace: pane.namespace, pod: pane.pod,
      });
    }
    set({ panes: [], focused: undefined, origin: undefined });
  },

  closePane: (id) => {
    const pane = get().panes.find(p => p.id === id);
    if (pane) {
      postMsg({
        type: 'dk8s:closeLogs',
        context: pane.context, namespace: pane.namespace, pod: pane.pod,
      });
    }

    const left = get().panes.filter(p => p.id !== id);

    /*
      A split of one is not a split.

      Closing panes until one is left used to leave that pod in a pane: a title
      strip, a mode switcher offering to arrange one thing three ways, and a
      log view with none of the rest of the pod behind it. Everything the
      detail view has — Overview, Terminal, Doctor, Explorer, Describe, YAML —
      was two steps away, through a Back that went to the grid.

      Closing the last but one is a statement about which pod you care about,
      so it opens that pod properly. `openDetail` starts its own log stream
      without `alongside`, which closes the pane's, so nothing is left running
      behind it.
    */
    if (left.length === 1) {
      const last = left[0];
      set({ panes: [], focused: undefined, origin: undefined });
      useK8sStore.getState().openDetail(podForPane(last));
      return;
    }

    set(s => ({
      panes: left,
      focused: s.focused === id ? left[0]?.id : s.focused,
    }));
  },

  setMode: (mode) => {
    /*
      A mode that holds fewer panes drops the ones past its limit.

      Their streams stop with them: a pane nobody can see is a kubectl process
      nobody is reading, and leaving it running is how a tool ends up holding
      connections open for pods the reader closed an hour ago.
    */
    const { panes } = get();
    for (const p of panes.slice(MAX_PANES[mode])) {
      postMsg({
        type: 'dk8s:closeLogs',
        context: p.context, namespace: p.namespace, pod: p.pod,
      });
    }
    const kept = panes.slice(0, MAX_PANES[mode]);
    set(s => ({
      mode,
      panes: kept,
      focused: kept.some(p => p.id === s.focused) ? s.focused : kept[0]?.id,
    }));
  },

  focus: (focused) => set({ focused }),

  patch: (id, over) => set(s => ({
    panes: s.panes.map(p => (p.id === id ? { ...p, ...over } : p)),
  })),

  refetch: (id) => {
    const pane = get().panes.find(p => p.id === id);
    if (!pane) return;
    set(s => ({
      panes: s.panes.map(p => (p.id === id
        ? { ...p, logs: [], dropped: 0, status: 'loading', requestedAt: Date.now() }
        : p)),
    }));
    postMsg({
      type: 'dk8s:openLogs',
      context: pane.context,
      namespace: pane.namespace,
      pod: pane.pod,
      tailLines: pane.tail,
      direction: pane.direction,
      follow: pane.live,
      previous: pane.previous,
      /* Always alongside: a refetch in one pane must not stop the others. */
      alongside: true,
    });
  },

  apply: (msg) => {
    const panes = get().panes;
    if (!panes.length) return;

    const id = keyOf({
      context: String(msg.context ?? ''),
      namespace: String(msg.namespace ?? ''),
      pod: String(msg.pod ?? ''),
    });
    if (!panes.some(p => p.id === id)) return;

    const on = (fn: (p: SplitPane) => SplitPane) => set(s => ({
      panes: s.panes.map(p => (p.id === id ? fn(p) : p)),
    }));

    switch (msg.type) {
      case 'dk8s:logLines':
        on(p => ({
          ...p,
          logs: [...p.logs, ...((msg.lines as LogLine[]) ?? [])].slice(-MAX_LINES),
        }));
        break;
      case 'dk8s:logStatus':
        on(p => ({
          ...p,
          status: msg.status as LogStatus,
          detail: msg.detail as string | undefined,
        }));
        break;
      case 'dk8s:logDropped':
        on(p => ({ ...p, dropped: p.dropped + Number(msg.count ?? 0) }));
        break;
      case 'dk8s:logFormat':
        on(p => ({
          ...p,
          formatId: msg.formatId as string | undefined,
          formatName: msg.formatName as string | undefined,
        }));
        break;
      default:
        break;
    }
  },
}));
