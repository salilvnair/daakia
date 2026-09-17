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
import { useEffect, useMemo } from 'react';
import { IconSize } from '@salilvnair/dui';
import {
  CloseIcon, ChevronLeftIcon, ColumnsIcon, RowsIcon, LayoutGridIcon,
} from '../../icons';
import { LogViewer } from './LogViewer';
import { LogSourceProvider, type LogSource } from './log-source';
import {
  useSplitStore, MAX_PANES, type SplitMode, type SplitPane,
} from '../../store/dk8s-split-store';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
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
      className="flex flex-col min-w-0 min-h-0 overflow-hidden"
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
        <button type="button" onClick={() => closePane(pane.id)}
                title={`Close ${pane.pod}`}
                className="p-0.5 rounded cursor-pointer border-none bg-transparent">
          <CloseIcon size={IconSize.inline} color="var(--color-text-muted)" />
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

/** How the panes are laid out, from the mode and how many there are. */
export function gridStyle(mode: SplitMode, count: number): React.CSSProperties {
  if (mode === 'grid') {
    /* Two across, and only as many rows as there are panes to fill — three
       panes in a 2×2 leaves a quarter of the screen empty for nothing. */
    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gridTemplateRows: `repeat(${Math.ceil(count / 2)}, minmax(0, 1fr))`,
    };
  }
  return {
    display: 'grid',
    gridTemplateColumns: mode === 'vertical' ? `repeat(${count}, minmax(0, 1fr))` : '1fr',
    gridTemplateRows: mode === 'horizontal' ? `repeat(${count}, minmax(0, 1fr))` : '1fr',
  };
}

export function SplitLogs() {
  const { panes, mode, focused, setMode, close, apply } = useSplitStore();

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
        <button type="button" onClick={close} title="Back to pods"
                className="p-1 rounded cursor-pointer border-none bg-transparent">
          <ChevronLeftIcon size={IconSize.nav} color="var(--color-text-secondary)" />
        </button>
        <span className="text-[12.5px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {panes.length} pod{panes.length === 1 ? '' : 's'}, side by side
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

      <div className="flex-1 min-h-0 gap-2 p-2"
           style={gridStyle(mode, panes.length)}>
        {panes.map(pane => (
          <Pane key={pane.id} pane={pane} focused={pane.id === focused} />
        ))}
      </div>
    </div>
  );
}
