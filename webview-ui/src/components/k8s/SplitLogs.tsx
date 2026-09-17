/**
 * Several pods' logs at once, each pane a real log view.
 *
 * ── What this is for ──
 *
 * Two replicas of one Deployment are serving the same traffic and one of them
 * is the reason a request failed. Reading them one after the other does not
 * answer that: by the time the second is on screen the first has moved on, and
 * the thing you are comparing is a memory. Side by side it is a glance.
 *
 * ── Why each pane is the whole view and not a cut-down one ──
 *
 * A pane is `LogViewer` behind a `LogSource`, the same component the detail
 * tab uses. Everything it can do it can do here: the filter, the levels, the
 * field rail, wrap, stack folding, Analyze, the selection menu. The alternative
 * was a smaller log view for panes, and a smaller log view is one that is
 * missing whichever control the reader wants at the moment they want it.
 *
 * The state behind each source is the pane's own — see `dk8s-split-store`. Two
 * panes following two pods means two streams, two filters and two tails, and
 * the single-pod store has one of each.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { IconSize, SplitPanelView, type SplitDirection } from '@salilvnair/dui';
import {
  CloseIcon, ChevronLeftIcon, ColumnsIcon, RowsIcon, LayoutGridIcon,
} from '../../icons';
import { LogViewer } from './LogViewer';
import { LogSourceProvider, type LogSource } from './log-source';
import {
  useSplitStore, MAX_PANES, type SplitMode, type SplitPane,
} from '../../store/dk8s-split-store';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import { useTabsStore } from '../../store/tabs-store';
import { severityColor, severityOf, workloadColor } from './pod-view';
import { ACCENT } from './tone';

/**
 * The arrangements a selection can be opened in.
 *
 * Exported because two places offer them — the action bar and the pod's own
 * right-click menu — and a second copy would be two lists that drift, with the
 * menu offering a mode the bar does not.
 *
 * Which one reads best depends on the log rather than the count: long lines
 * want rows so each gets the full width, short ones want columns so more
 * history fits. Nobody knows which until the logs are up, so it stays
 * changeable once they are.
 */
export const SPLIT_MODES: { id: SplitMode; label: string; Icon: typeof ColumnsIcon }[] = [
  { id: 'vertical', label: 'Side by side', Icon: ColumnsIcon },
  { id: 'horizontal', label: 'Stacked', Icon: RowsIcon },
  { id: 'grid', label: 'Grid', Icon: LayoutGridIcon },
];

/**
 * One pane: a title strip that says which pod, and the log view under it.
 *
 * The strip is deliberately thin. Every pixel it takes is one the log does not
 * have, and in a four-way split the log is already down to a quarter of the
 * screen — so it carries the pod, its health, and the way out, and nothing
 * else.
 */
function Pane({ pane, focused }: { pane: SplitPane; focused: boolean }) {
  const { patch, refetch, closePane, focus, panes } = useSplitStore();
  const logLineNumbers = useK8sStore(s => s.logLineNumbers);
  const pod = useK8sStore(s => s.pods.find(
    p => p.name === pane.pod && p.namespace === pane.namespace,
  ));

  const color = pod ? severityColor(severityOf(pod)) : 'var(--color-text-muted)';

  /*
    A pod-shaped stand-in for the view's own uses — export, Analyze, the
    container chip. The real pod when the grid still has it; what the pane
    knows when it does not, because a pod deleted while its pane is open still
    has lines worth reading.
  */
  const asPod = useMemo<PodSummary>(() => pod ?? ({
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
  } as PodSummary), [pod, pane]);

  const source = useMemo(() => ({
    logs: pane.logs,
    logStatus: pane.status,
    logDetail: pane.detail,
    logDropped: pane.dropped,
    logFilter: pane.filter,
    logLevels: pane.levels,
    logRequestedAt: pane.requestedAt,
    logFieldFilters: pane.fields,
    addFieldFilter: (f: SplitPane['fields'][number]) => patch(pane.id, {
      fields: pane.fields.some(x => x.field === f.field && x.value === f.value && x.mode === f.mode)
        ? pane.fields
        : [...pane.fields, f],
    }),
    removeFieldFilter: (f: SplitPane['fields'][number]) => patch(pane.id, {
      fields: pane.fields.filter(
        x => !(x.field === f.field && x.value === f.value && x.mode === f.mode),
      ),
    }),
    clearFieldFilters: () => patch(pane.id, { fields: [] }),
    logFollow: pane.follow,
    logLive: pane.live,
    logTail: pane.tail,
    logDirection: pane.direction,
    logSince: 0,
    logWrap: pane.wrap,
    logPrevious: pane.previous,
    logFrom: undefined,
    logTo: undefined,
    logLineNumbers,
    logContainer: undefined,
    logExportOpen: false,
    detail: asPod,
    runtime: undefined,
    setLogFilter: (filter: string) => patch(pane.id, { filter }),
    toggleLogLevel: (level: SplitPane['levels'][number]) => patch(pane.id, {
      levels: pane.levels.includes(level)
        ? pane.levels.filter(l => l !== level)
        : [...pane.levels, level],
    }),
    setLogWrap: (wrap: boolean) => patch(pane.id, { wrap }),
    setLogFollow: (follow: boolean) => patch(pane.id, { follow }),
    setLogLive: (live: boolean) => { patch(pane.id, { live }); refetch(pane.id); },
    setLogTail: (tail: number) => patch(pane.id, { tail }),
    setLogDirection: (direction: 'first' | 'last') => patch(pane.id, { direction }),
    setLogPrevious: (previous: boolean) => patch(pane.id, { previous }),
    setLogSince: () => {},
    setLogWindow: () => {},
    setLogSelection: () => {},
    setLogContainer: () => {},
    fetchLogs: () => refetch(pane.id),
    openLogExport: () => {},
    closeLogExport: () => {},
    /* The view's own "back" closes this pane rather than the whole split. */
    closeDetail: () => closePane(pane.id),
  } as unknown as LogSource), [pane, asPod, logLineNumbers, patch, refetch, closePane]);

  return (
    <div
      /*
        `h-full`, because the panel around this one is a block box.

        Without a height of its own the pane is as tall as its log — six
        thousand pixels of it — and the panel simply clips what will not fit.
        On a wide screen that went unnoticed: the lines were short, the content
        happened to come out near the panel's height, and it looked right. Narrow
        the window until the lines wrap and the pane grows past the bottom of
        the screen, taking its own scrollbar with it: the log no longer scrolls
        inside the pane, it is just cut off.

        With a height, the pane fills the panel and the log list under it
        scrolls where it is supposed to, at any width.
      */
      className="flex flex-col h-full w-full min-w-0 min-h-0 overflow-hidden"
      onFocusCapture={() => focus(pane.id)}
      onMouseDown={() => focus(pane.id)}
      style={{
        border: `1px solid ${focused && panes.length > 1
          ? `color-mix(in srgb, ${ACCENT} 45%, transparent)`
          : 'var(--color-surface-border)'}`,
        borderRadius: 6,
        background: 'var(--color-panel)',
      }}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5 shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span style={{
          width: 6, height: 6, borderRadius: 6, background: color, flexShrink: 0,
        }} />
        <span className="text-[11.5px] font-mono truncate"
              style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {pane.pod}
        </span>
        {pod?.workload && (
          <span className="text-[9px] px-1 py-px rounded uppercase tracking-wide shrink-0"
                style={{
                  color: workloadColor(pod.workload.kind),
                  background: `color-mix(in srgb, ${workloadColor(pod.workload.kind)} 14%, transparent)`,
                }}>
            {pod.workload.kind}
          </span>
        )}
        <span className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
          {pane.namespace}
        </span>
        <span className="flex-1" />
        {/* The one destructive control in the strip, and it says so on the way
            in rather than after the fact — see `.dk-close-btn`. `currentColor`
            so the icon travels with it. */}
        <button type="button" onClick={() => closePane(pane.id)}
                title={`Close ${pane.pod}`}
                className="dk-close-btn p-0.5 rounded cursor-pointer border-none bg-transparent flex">
          <CloseIcon size={IconSize.inline} color="currentColor" />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <LogSourceProvider value={source}>
          <LogViewer />
        </LogSourceProvider>
      </div>
    </div>
  );
}

/*
  Which way DUI splits, for one of our modes.

  The two vocabularies are opposites and it is worth saying so once here rather
  than being confused by it at every call site: our `vertical` means the divider
  stands vertically and the panes sit side by side, and DUI's `horizontal` means
  the box lays its children out in a row — which is the same arrangement.
*/
const DUI_DIRECTION: Record<'vertical' | 'horizontal', SplitDirection> = {
  vertical: 'horizontal',
  horizontal: 'vertical',
};

/** Nothing smaller than this, as a share of the axis. */
const MIN_PANE_PCT = 12;

/**
 * Lay panes along one axis with a draggable divider between each pair.
 *
 * `SplitPanelView` takes two sides, so three panes are a split whose second
 * side is another split. The first pane gets `100 / n` of the axis and the
 * nested remainder divides what is left the same way, which comes out even —
 * three panes at 33/50 are a third and two halves of two thirds.
 *
 * Every divider is independent once it exists: dragging the outer one moves
 * the boundary between the first pane and the other two together, and the
 * inner one moves the boundary inside that pair. That is the behaviour you
 * want when one log is the one you are reading and the others are context.
 */
function chain(nodes: React.ReactNode[], direction: SplitDirection): React.ReactNode {
  if (nodes.length <= 1) return nodes[0] ?? null;
  return (
    <SplitPanelView
      direction={direction}
      defaultSplit={100 / nodes.length}
      minFirstPct={MIN_PANE_PCT}
      minSecondPct={MIN_PANE_PCT}
      accentColor={ACCENT}
      first={nodes[0]}
      second={chain(nodes.slice(1), direction)}
      style={{ height: '100%', width: '100%' }}
    />
  );
}

/**
 * The grid: rows of panes, and a divider on both axes.
 *
 * Two panes are a row, and a second divider across a single row would have
 * nothing to move. Past that the panes split into a top half and a bottom
 * half — so a four-way grid has one divider between the rows and one inside
 * each, and every edge on screen can be dragged.
 *
 * An odd count puts the extra pane on top, where the eye starts.
 */
function gridSplit(nodes: React.ReactNode[]): React.ReactNode {
  if (nodes.length <= 2) return chain(nodes, 'horizontal');
  const half = Math.ceil(nodes.length / 2);
  return (
    <SplitPanelView
      direction="vertical"
      defaultSplit={50}
      minFirstPct={MIN_PANE_PCT}
      minSecondPct={MIN_PANE_PCT}
      accentColor={ACCENT}
      first={chain(nodes.slice(0, half), 'horizontal')}
      second={chain(nodes.slice(half), 'horizontal')}
      style={{ height: '100%', width: '100%' }}
    />
  );
}

/**
 * The whole arrangement, sized by the reader rather than by the count.
 *
 * Equal shares is the right place to start and the wrong place to stay: one of
 * these logs is usually the one being read and the rest are there to be
 * glanced at, and which is which changes minute to minute. So they open
 * centered — no pane is guessed to be the important one — and every boundary
 * between them can be dragged from there.
 */
function Arrangement({ mode, nodes }: { mode: SplitMode; nodes: React.ReactNode[] }) {
  if (nodes.length <= 1) return <>{nodes}</>;
  return (
    <>{mode === 'grid' ? gridSplit(nodes) : chain(nodes, DUI_DIRECTION[mode])}</>
  );
}

export function SplitLogs() {
  const { panes, mode, focused, setMode, close, apply, origin } = useSplitStore();
  const focusResults = useTabsStore(s => s.focusDk8sResultsTab);

  /*
    Back goes one step, to whatever this was opened from.

    From the pod grid that is the grid. From a search result it is the result
    — the screen that named these pods in the first place — and landing on the
    grid instead makes the reader find their way back to something they were
    reading a moment ago.
  */
  const goBack = useCallback(() => {
    close();
    if (origin === 'results') focusResults();
  }, [close, origin, focusResults]);

  /* The host's lines land here. Routed by cluster, namespace and pod, because
     a pod name on its own is not an address once two panes are open. */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const t = e.data?.type;
      if (t === 'dk8s:logLines' || t === 'dk8s:logStatus'
        || t === 'dk8s:logDropped' || t === 'dk8s:logFormat') apply(e.data);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [apply]);

  if (!panes.length) return null;

  return (
    <div className="absolute inset-0 flex flex-col z-30"
         style={{ background: 'var(--color-bg, var(--color-surface))' }}>
      <div className="flex items-center gap-3 px-4 py-2 shrink-0"
           style={{
             borderBottom: '1px solid var(--color-surface-border)',
             background: `linear-gradient(to right, color-mix(in srgb, ${ACCENT} 8%, transparent), transparent 60%)`,
           }}>
        <button type="button" onClick={goBack}
                title={origin === 'results' ? 'Back to the search results' : 'Back to pods'}
                className="p-1 rounded cursor-pointer border-none bg-transparent">
          <ChevronLeftIcon size={IconSize.nav} color="var(--color-text-secondary)" />
        </button>
        <span className="text-[12.5px] font-mono truncate"
              style={{ color: 'var(--color-text-primary)', fontWeight: 600, minWidth: 0 }}>
          {/*
            The pods, by name.

            It said "2 pods, side by side", which is two facts the reader can
            already see — the panes are there, and the arrangement is lit up in
            the buttons to the right. The one thing the strip could say that
            nothing else does is WHICH two, and that is what it says now.

            Every name, not the first and a count: the whole reason to open a
            split is that the pods are nearly identical, so `orders-api-…frlf6
            and 1 more` would hide the exact character that tells them apart.
          */}
          {panes.map(p => p.pod).join(',  ')}
        </span>

        <span className="flex-1" />

        {/* The layout, changeable without reopening. Which arrangement reads
            best depends on the log — long lines want rows, short ones want
            columns — and that is not knowable until they are on screen. */}
        {SPLIT_MODES.map(({ id, label, Icon }) => (
          <button
            key={id} type="button"
            onClick={() => setMode(id)}
            title={`${label} · up to ${MAX_PANES[id]} panes`}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] cursor-pointer"
            style={{
              color: mode === id ? ACCENT : 'var(--color-text-secondary)',
              background: mode === id
                ? `color-mix(in srgb, ${ACCENT} 14%, transparent)`
                : 'transparent',
              border: `1px solid ${mode === id
                ? `color-mix(in srgb, ${ACCENT} 40%, transparent)`
                : 'var(--color-surface-border)'}`,
              fontWeight: mode === id ? 600 : 400,
            }}
          >
            <Icon size={IconSize.action} color={mode === id ? ACCENT : 'var(--color-text-muted)'} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 p-2">
        <Arrangement
          mode={mode}
          nodes={panes.map(pane => (
            <Pane key={pane.id} pane={pane} focused={pane.id === focused} />
          ))}
        />
      </div>
    </div>
  );
}
