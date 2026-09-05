/**
 * The pod grid — the screen people look at.
 *
 * Two rules do most of the work. Colour means status and nothing else, so a
 * failing pod is findable from across the room. And healthy pods recede —
 * quieter cards, because thirteen of them are not what you came for and
 * giving them equal weight is how a dashboard becomes a wall.
 *
 * They recede through colour and grouping, not through shape or size: every
 * pod gets the same card, and a healthy one is simply green. Two shapes on one
 * screen — or two heights — reads as an unfinished layout rather than a
 * hierarchy.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SparklineView, SearchInputView, SegmentedControlView, CheckSquareIcon, EmptySquareIcon,
  ModalView, ButtonView, FilterInputView,
} from '@salilvnair/dui';
import { useLongPress } from './use-long-press';
import { PodContextMenu } from './PodContextMenu';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import {
  useFavoriteKeys, toggleFavorite, favoriteKey, favoritesFirst,
} from '../../store/dk8s-favorites-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { ExportLogsModal } from './ExportLogsModal';
import { LogSearchModal } from './LogSearchModal';
import { useDk8sSearchStore } from '../../store/dk8s-search-store';
import {
  FolderExportIcon, CloseIcon, SearchIcon, ChevronDownIcon, ChevronRightIcon,
  StarIcon,
} from '../../icons';
import {
  sortPods, severityOf, severityColor, matchesFilter, shortAge,
  formatBytes, formatCpu, restartLabel, pulse, isRecentRestart, groupPods,
  type Severity, type PodGroup,
} from './pod-view';

const ACCENT = 'var(--color-dk8s)';
/* Amber, not the dk8s accent: a star is a personal mark, not a status, and
   reusing the accent made starred rows look selected. */
const FAV_COLOR = 'var(--color-warning)';

// ── Cluster pulse ───────────────────────────────────────────────────────────

function Stat({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[22px] font-semibold leading-none tabular-nums"
            style={{ color: color ?? 'var(--color-text-primary)' }}>{n}</span>
      <span className="text-[10.5px] text-[var(--color-text-muted)]">{label}</span>
    </div>
  );
}

/**
 * A watch dies quietly. If the grid keeps rendering the last thing it saw it
 * looks perfectly healthy while being completely stale, which is the worst
 * failure a live view can have — so the state is always on screen.
 */
function WatchIndicator() {
  const { watchStatus, watchDetail, lastEventAt } = useK8sStore();
  const map: Record<string, { label: string; color: string }> = {
    idle: { label: 'starting', color: 'var(--color-text-muted)' },
    connected: { label: 'watching', color: 'var(--color-method-get)' },
    reconnecting: { label: 'reconnecting', color: 'var(--color-warning)' },
    stopped: { label: 'stopped', color: 'var(--color-text-muted)' },
  };
  const s = map[watchStatus] ?? map.idle;

  /*
    Re-read on a timer, because the age changes while nothing else does.

    A minute is the right grain: the tooltip is read to answer "is this
    stale", and no one needs that answered to the second — a second-by-second
    re-render of the whole header to move a number nobody is looking at is a
    worse trade.
  */
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  /*
    How long since the watch last said anything.

    "watching" means the stream is up. On a quiet namespace that is
    indistinguishable from a stream that has heard nothing in an hour, and
    those are very different situations to be reading a pod list in.
  */
  const since = lastEventAt === undefined ? undefined : Date.now() - lastEventAt;
  const ago = since === undefined ? 'nothing yet'
    : since < 60_000 ? 'just now'
      : since < 3_600_000 ? `${Math.floor(since / 60_000)}m ago`
        : `${Math.floor(since / 3_600_000)}h ago`;

  const title = [
    watchDetail || 'live watch on this namespace',
    `last change: ${ago}`,
  ].join(' — ');

  /*
    The dot breathes only while the stream is live.

    A still dot and a live one looked identical, so the row said "watching"
    and left you to believe it. Motion is the one signal that cannot be
    faked by a stale render — if the pane froze, the dot stops with it.

    Deliberately not on the other states: a reconnecting or stopped watch is
    not doing anything, and animating it would say it was.
    `.breathing-connected` is the app's existing pulse, so this reads as the
    same idea as everywhere else it appears.
  */
  const live = watchStatus === 'connected';

  return (
    <span className="flex items-center gap-1.5 flex-shrink-0" title={title}>
      <span
        className={live ? 'breathing-connected' : undefined}
        style={{ width: 6, height: 6, borderRadius: 3, background: s.color, color: s.color }}
      />
      <span className="text-[10.5px]" style={{ color: s.color }}>{s.label}</span>
    </span>
  );
}

function Pulse({ pods }: { pods: PodSummary[] }) {
  const counts = useMemo(() => pulse(pods), [pods]);
  return (
    <div className="flex items-center gap-5 flex-wrap px-4 py-2.5 flex-shrink-0"
         style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      {/*
        The watch state leads the row.

        A "Namespace" label sat here with nothing after it — a field name whose
        value was never rendered, so it read as a bug on every screen. The
        namespaces are already named in the breadcrumb above and on each group
        heading below, which is why nothing was ever put here.

        What the row does need at its head is whether the numbers to its right
        are still true, and that is what the watch state says.
      */}
      <WatchIndicator />
      <Stat n={counts.total} label="pods" />
      <Stat n={counts.ready} label="ready" color="var(--color-method-get)" />
      {counts.degraded > 0 && <Stat n={counts.degraded} label="degraded" color="var(--color-warning)" />}
      {counts.critical > 0 && <Stat n={counts.critical} label="failing" color="var(--color-error)" />}
      {counts.restartsLastHour > 0 && (
        <Stat n={counts.restartsLastHour} label="restarted in the last hour" color="var(--color-warning)" />
      )}

      <div className="flex-1" />
      {/*
        Searching across pods, where the pods are.

        It lived only in the command palette and in a pod's own log view, so
        the one screen that lists every pod — the place you are standing when
        the question "which of these logged that" occurs — had no way to ask
        it. Beside the watch state, because both are about the set of pods
        rather than about any one of them.
      */}
      <button
        type="button"
        onClick={() => useDk8sSearchStore.getState().openSearch()}
        title="Quick Search — files and logs across every watched pod"
        className="text-[11px] px-3 py-1 rounded-md cursor-pointer transition-colors
                   flex items-center gap-1.5 shrink-0 font-medium"
        style={{
          /*
            The same tinted, bordered shape as "Search N logs" below it — the
            two do the same job from different starting points, and one of them
            looking like a link made that hard to see.

            In the tab's own cyan. A warmer accent was tried and read as a
            warning on a list where red and amber already mean a pod is in
            trouble — the one colour a control here must not borrow.
          */
          background: `color-mix(in srgb, ${ACCENT} 18%, transparent)`,
          color: ACCENT,
          border: `1px solid color-mix(in srgb, ${ACCENT} 45%, transparent)`,
        }}
      >
        <SearchIcon size={12} />
        Quick Search
      </button>

    </div>
  );
}

// ── Cards ───────────────────────────────────────────────────────────────────

function StatusLine({ pod, severity }: { pod: PodSummary; severity: Severity }) {
  const color = severityColor(severity);
  const label = pod.reason || pod.phase;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
      <span className="text-[11.5px] font-medium" style={{ color }}>{label}</span>
      <span className="text-[10.5px] font-mono tabular-nums" style={{ color, opacity: 0.75 }}>
        {pod.ready.current}/{pod.ready.total}
      </span>
      <span className="text-[10.5px] font-mono" style={{ color, opacity: 0.75 }}>
        {shortAge(pod.startedAt)}
      </span>
    </div>
  );
}

/**
 * The star, in both views.
 *
 * A `span` with a click handler rather than a `button`, because in the card it
 * sits inside one — the card itself is the button that opens the pod — and a
 * button inside a button is invalid HTML that browsers resolve by dropping the
 * inner one. `stopPropagation` is what keeps starring from also opening the
 * pod detail.
 *
 * Hollow when off, filled and amber when on, and it holds its box either way
 * so nothing shifts as it toggles.
 */
function FavoriteStar({ pod, size = 13 }: { pod: PodSummary; size?: number }) {
  const key = favoriteKey(pod);
  const on = useFavoriteKeys().includes(key);

  return (
    <span
      role="button"
      tabIndex={-1}
      aria-pressed={on}
      title={on
        ? `Unstar ${pod.workload ? `${pod.workload.kind}/${pod.workload.name}` : pod.name}`
        : `Star ${pod.workload ? `${pod.workload.kind}/${pod.workload.name}` : pod.name} — keeps it at the top`}
      onClick={e => { e.stopPropagation(); toggleFavorite(key); }}
      /*
        Off-stars appear on hover; on-stars are always there.

        A grey star on every row is twenty-eight pieces of furniture for a
        feature most rows are not using — and worse, it makes the handful of
        real stars hard to pick out, which is the one thing the star is for.
        Hovering a row is already how you find out what you can do to it.
      */
      className={`flex items-center justify-center shrink-0 cursor-pointer transition-opacity ${
        on ? 'opacity-100' : 'opacity-0 group-hover:opacity-45 hover:!opacity-100'
      }`}
      style={{
        width: size + 6, height: size + 6, borderRadius: 4,
        color: on ? FAV_COLOR : 'var(--color-text-muted)',
      }}
    >
      <StarIcon size={size} filled={on} />
    </span>
  );
}

function PodCard({ pod, onOpen, onMenu }: {
  pod: PodSummary;
  onOpen: () => void;
  onMenu: (pod: PodSummary, at: { x: number; y: number }) => void;
}) {
  const usage = useK8sStore(s => s.usage[pod.name]);
  const history = useK8sStore(s => s.usageHistory[pod.name]);
  const selectMode = useK8sStore(s => s.selectMode);
  const picked = useK8sStore(s => s.selected.includes(pod.uid));
  const togglePodSelected = useK8sStore(s => s.togglePodSelected);
  /*
    Holding selects. Right-clicking opens the menu.

    They were briefly the same gesture, with Select as the menu's first entry,
    and that was worse: holding a card is how you start picking several, and
    routing it through a menu put a click between each pod and the next. Two
    gestures, two jobs — the menu is still where everything else lives, and
    Select is still in it for anyone who arrives that way.
  */
  const beginSelection = useK8sStore(s => s.beginSelection);
  const { handlers, consumed } = useLongPress(() => beginSelection(pod.uid));
  const severity = severityOf(pod);
  const color = severityColor(severity);
  const quiet = severity === 'quiet';
  const recent = isRecentRestart(pod);

  return (
    <button
      type="button"
      {...handlers}
      onContextMenu={e => {
        e.preventDefault();
        onMenu(pod, { x: e.clientX, y: e.clientY });
      }}
      onClick={() => {
        // The hold already acted; the click it ends with would otherwise open
        // the pod that was just selected.
        if (consumed()) return;
        if (selectMode) togglePodSelected(pod.uid); else onOpen();
      }}
      className="group flex flex-col gap-1.5 p-3 rounded-lg text-left cursor-pointer transition-colors relative overflow-hidden select-none"
      style={{
        background: picked ? `color-mix(in srgb, ${ACCENT} 9%, var(--color-surface))` : 'var(--color-surface)',
        border: `1px solid ${picked
          ? `color-mix(in srgb, ${ACCENT} 55%, transparent)`
          : quiet
            ? 'var(--color-surface-border)'
            : `color-mix(in srgb, ${color} 40%, var(--color-surface-border))`}`,
        minWidth: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)'; }}
    >
      {/* Status rail — the one place a semantic colour gets to be a big block. */}
      <span style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: color, opacity: quiet ? 0.45 : 1,
      }} />

      <div className="flex flex-col gap-0.5 pl-2 min-w-0">
        <span className="flex items-center gap-2 min-w-0">
          {selectMode && (
            <span className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 14, height: 14, borderRadius: 4,
                    border: `1.5px solid ${picked ? ACCENT : 'var(--color-surface-border)'}`,
                    background: picked ? ACCENT : 'transparent',
                  }}>
              {picked && (
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none"
                     stroke="var(--color-panel)" strokeWidth="2.6"
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.5L4.8 8.8L9.5 3.5" />
                </svg>
              )}
            </span>
          )}
          <span className="text-[11.5px] font-mono truncate text-[var(--color-text-primary)]"
                title={pod.name}>
            {pod.name}
          </span>
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] truncate">
          {pod.workload ? `${pod.workload.kind}/${pod.workload.name}` : pod.node ?? '—'}
        </span>
      </div>

      <div className="pl-2">
        <StatusLine pod={pod} severity={severity} />
      </div>

      <div className="flex items-center justify-between gap-2 pl-2 min-w-0">
        <span className="text-[10.5px] font-mono truncate"
              style={{ color: recent ? 'var(--color-warning)' : color, opacity: recent ? 1 : 0.75 }}>
          {`↻ ${restartLabel(pod)}`}
          {usage ? ` · ${formatBytes(usage.memBytes)}` : ''}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {/* A trend needs at least two samples to mean anything. */}
          {history && history.length > 1 && (
            <SparklineView data={history} width={72} height={18} color={color} filled />
          )}
          <FavoriteStar pod={pod} />
        </span>
      </div>
    </button>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

/**
 * The dense view, in the shape k9s made everyone expect.
 *
 * The rule that makes it readable is that the whole ROW takes the severity
 * colour, not just a status cell. A failing pod becomes one continuous red
 * line you find without reading, which is the entire point of a table you
 * scan three hundred rows of.
 */
/** The tick column's header, which has no label to show. */
const SELECT_COL = '';

/** Sized to the tick it holds, with the padding a checkbox actually needs. */
const SELECT_CELL: React.CSSProperties = {
  width: 30, minWidth: 30, paddingLeft: 10, paddingRight: 0,
};

function PodTable({ pods, onOpen, onMenu }: {
  pods: PodSummary[];
  onOpen: (p: PodSummary) => void;
  onMenu: (pod: PodSummary, at: { x: number; y: number }) => void;
}) {
  const usage = useK8sStore(s => s.usage);
  const metrics = useK8sStore(s => s.metricsAvailable);
  const selectMode = useK8sStore(s => s.selectMode);
  const selected = useK8sStore(s => s.selected);
  const beginSelection = useK8sStore(s => s.beginSelection);
  /*
    One press timer for the table, and a ref saying which row armed it.

    Rows are rendered in a map, so they cannot each hold a hook. Only one row
    can be under the pointer at a time, which makes a single timer and the uid
    that started it exactly as much state as the gesture has.
  */
  const held = useRef<PodSummary | null>(null);
  const press = useLongPress(() => {
    if (held.current) beginSelection(held.current.uid);
  });
  const togglePodSelected = useK8sStore(s => s.togglePodSelected);

  // No Namespace column: the group heading above the table already says which
  // namespace and cluster these rows belong to, so repeating it on every row
  // is a column of identical text.
  const cols = [
    ...(selectMode ? [SELECT_COL] : []),
    'Name', 'Ready', 'Status', '\u21bb', 'Node', 'Age',
    ...(metrics ? ['Memory', 'CPU'] : []),
  ];

  return (
    <div className="overflow-auto rounded-md"
         style={{ border: '1px solid var(--color-surface-border)' }}>
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {cols.map(h => (
              <th key={h}
                  className="text-[9.5px] uppercase tracking-wider text-left font-bold px-3 py-2"
                  style={{
                    /*
                      The tick column holds a 13px box and was taking 64px,
                      because an unsized column in an auto-layout table is
                      handed a share of the row rather than the width of what
                      is in it. Sized to its content, so the name sits next to
                      the checkbox instead of across a gap from it.
                    */
                    ...(h === SELECT_COL ? SELECT_CELL : {}),
                    color: ACCENT,
                    background: 'var(--color-surface)',
                    borderBottom: `1px solid color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`,
                    whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
                  }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pods.map((pod, i) => {
            const sev = severityOf(pod);
            const color = severityColor(sev);
            const u = usage[pod.name];
            const picked = selected.includes(pod.uid);
            const failing = sev === 'critical' || sev === 'warning';
            // Healthy rows stay near the text colour, so the failing ones are
            // the only thing on screen carrying a hue.
            const rowColor = failing ? color : 'var(--color-text-secondary)';
            const zebra = i % 2 === 1
              ? 'color-mix(in srgb, var(--color-text-primary) 2.5%, transparent)'
              : 'transparent';
            const rest = failing ? `color-mix(in srgb, ${color} 8%, transparent)` : zebra;
            const cell = {
              borderBottom: '1px solid var(--color-surface-border)',
              color: rowColor,
              whiteSpace: 'nowrap' as const,
            };
            return (
              <tr key={pod.uid}
                  onPointerDown={e => {
                    // Which row is under the finger, for the shared timer.
                    held.current = pod;
                    press.handlers.onPointerDown(e);
                  }}
                  onContextMenu={e => {
                    e.preventDefault();
                    onMenu(pod, { x: e.clientX, y: e.clientY });
                  }}
                  onPointerMove={press.handlers.onPointerMove}
                  onPointerUp={press.handlers.onPointerUp}
                  onPointerLeave={press.handlers.onPointerLeave}
                  onPointerCancel={press.handlers.onPointerCancel}
                  onClick={() => {
                    // The hold already acted; the click it ends with would
                    // otherwise open the pod that was just selected.
                    if (press.consumed()) return;
                    if (selectMode) togglePodSelected(pod.uid); else onOpen(pod);
                  }}
                  className="group cursor-pointer transition-colors select-none"
                  style={{ background: picked ? `color-mix(in srgb, ${ACCENT} 13%, transparent)` : rest }}
                  onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${ACCENT} 18%, transparent)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = picked ? `color-mix(in srgb, ${ACCENT} 13%, transparent)` : rest; }}>
                {selectMode && (
                  <td className="py-1.5" style={{ ...cell, ...SELECT_CELL }}>
                    <span className="flex items-center justify-center"
                          style={{
                            width: 13, height: 13, borderRadius: 3,
                            border: `1.5px solid ${picked ? ACCENT : 'var(--color-surface-border)'}`,
                            background: picked ? ACCENT : 'transparent',
                          }}>
                      {picked && (
                        <svg width="8" height="8" viewBox="0 0 12 12" fill="none"
                             stroke="var(--color-panel)" strokeWidth="2.8"
                             strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2.5 6.5L4.8 8.8L9.5 3.5" />
                        </svg>
                      )}
                    </span>
                  </td>
                )}
                {/*
                  The star rides with the name.

                  It had its own column, which bought a fixed hit target at the
                  cost of a permanent empty gutter down the left of every table
                  — a column of whitespace on twenty-eight rows so that one row
                  could show a star. Beside the name it costs nothing when
                  nothing is starred.
                */}
                <td className="text-[11.5px] font-mono px-3 py-1.5"
                    style={{ ...cell, fontWeight: failing ? 600 : 400 }}>
                  <span className="flex items-center gap-1.5">
                    <span style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: 3,
                      background: color, opacity: failing ? 1 : 0.7, flexShrink: 0,
                    }} />
                    {pod.name}
                    <FavoriteStar pod={pod} size={11} />
                  </span>
                </td>
                <td className="text-[11px] font-mono px-3 py-1.5 tabular-nums" style={cell}>
                  {pod.ready.current}/{pod.ready.total}
                </td>
                <td className="text-[11px] px-3 py-1.5"
                    style={{ ...cell, fontWeight: failing ? 600 : 400 }}>
                  {pod.reason || pod.phase}
                </td>
                <td className="text-[11px] font-mono px-3 py-1.5 tabular-nums" style={cell}
                    title={restartLabel(pod)}>
                  {pod.restarts}
                </td>
                <td className="text-[11px] font-mono px-3 py-1.5 truncate"
                    style={{ ...cell, maxWidth: 170 }}>
                  {pod.node ?? '\u2014'}
                </td>
                <td className="text-[11px] font-mono px-3 py-1.5" style={cell}>
                  {shortAge(pod.startedAt)}
                </td>
                {metrics && (
                  <>
                    <td className="text-[11px] font-mono px-3 py-1.5 tabular-nums" style={cell}>
                      {formatBytes(u?.memBytes)}
                    </td>
                    <td className="text-[11px] font-mono px-3 py-1.5 tabular-nums" style={cell}>
                      {formatCpu(u?.cpuMilli)}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A group heading, shared by both views so they read the same way. */
/**
 * Which namespace groups are folded away.
 *
 * Module-level rather than component state so the two views agree: collapsing
 * a namespace in cards and switching to table should not silently expand it
 * again. Keyed by namespace and cluster, since two clusters can hold a
 * namespace of the same name and they are different groups.
 */
function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  return { collapsed, toggle };
}

const groupKey = (g: PodGroup) => `${g.context ?? ''}/${g.namespace}`;

function GroupHeader({ group, collapsed, onToggle }: {
  group: PodGroup;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const failing = group.pods.filter(p => severityOf(p) !== 'quiet').length;
  return (
    <div
      className={`flex items-center gap-2 flex-wrap${onToggle ? ' cursor-pointer select-none' : ''}`}
      onClick={onToggle}
      title={onToggle ? (collapsed ? 'Show these pods' : 'Hide these pods') : undefined}
    >
      {onToggle && (
        collapsed
          ? <ChevronRightIcon size={11} style={{ color: group.tint.label }} />
          : <ChevronDownIcon size={11} style={{ color: group.tint.label }} />
      )}
      <span className="text-[10px] font-mono font-semibold tracking-wide"
            style={{ color: group.tint.label }}>
        {group.namespace}
      </span>
      {group.context && (
        <span className="text-[9.5px] font-mono text-[var(--color-text-muted)]">
          {group.context}
        </span>
      )}
      <span className="flex-1" style={{ height: 1, background: group.tint.border }} />
      <span className="text-[9.5px] tabular-nums text-[var(--color-text-muted)]">
        {group.pods.length} pod{group.pods.length === 1 ? '' : 's'}
      </span>
      {failing > 0 && (
        <span className="text-[9.5px] font-semibold tabular-nums" style={{ color: 'var(--color-error)' }}>
          {failing} need{failing === 1 ? 's' : ''} attention
        </span>
      )}
      {/* The counts stay visible while collapsed — a folded group that hides
          "2 need attention" would hide the only reason to unfold it. */}
    </div>
  );
}

/** The table view's equivalent of a card group: same heading, same tint. */
function NamespaceTableGroup({ group, onOpen, onMenu, collapsed, onToggle }: {
  group: PodGroup;
  onOpen: (p: PodSummary) => void;
  onMenu: (pod: PodSummary, at: { x: number; y: number }) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg p-3"
         style={{ border: `1px solid ${group.tint.border}`, background: group.tint.wash }}>
      <GroupHeader group={group} collapsed={collapsed} onToggle={onToggle} />
      {!collapsed && <PodTable pods={group.pods} onOpen={onOpen} onMenu={onMenu} />}
    </div>
  );
}

/**
 * One namespace's pods, boxed.
 *
 * The box exists because dk8s can watch several namespaces at once, and a flat
 * grid of forty cards drawn from four namespaces is unreadable. The tint
 * identifies the group and deliberately stays washed out: semantic colour
 * belongs to pod health, and a strong namespace colour would compete with the
 * one thing the grid must never make harder to find.
 */
function NamespaceGroup({ group, onOpen, onMenu, collapsed, onToggle }: {
  group: PodGroup;
  onOpen: (p: PodSummary) => void;
  onMenu: (pod: PodSummary, at: { x: number; y: number }) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg p-3"
         style={{ border: `1px solid ${group.tint.border}`, background: group.tint.wash }}>
      <GroupHeader group={group} collapsed={collapsed} onToggle={onToggle} />

      {!collapsed && (
        <div className="grid gap-2.5"
             style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {group.pods.map(p => (
            <PodCard key={p.uid} pod={p} onOpen={() => onOpen(p)} onMenu={onMenu} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── The grid ────────────────────────────────────────────────────────────────

export function PodGrid() {
  /*
    One menu for the whole grid.

    A menu per card would be thirty portals mounted to show at most one, and
    the pod it is for is the only thing that varies — so the grid holds the
    pod and the point, and the menu reads them.
  */
  const [menu, setMenu] = useState<{ pod: PodSummary; at: { x: number; y: number } }>();
  /*
    Un-starring is asked about; starring is not.

    Starring is a list curated over weeks, and losing one entry is the kind of
    small loss you notice long after the click that caused it — there is no
    undo and nothing on screen changes enough to catch the eye.
  */
  const [unstar, setUnstar] = useState<PodSummary>();
  const probePodForMenu = useK8sStore(s => s.probePodForMenu);
  const closePodMenu = useK8sStore(s => s.closePodMenu);
  const openMenu = useCallback((pod: PodSummary, at: { x: number; y: number }) => {
    setMenu({ pod, at });
    // Asked for on open rather than on hover: it is a round trip to the
    // cluster, and hovering a grid of thirty would fire thirty of them.
    probePodForMenu(pod);
  }, [probePodForMenu]);
  const closeMenu = useCallback(() => {
    setMenu(undefined);
    closePodMenu();
  }, [closePodMenu]);

  const {
    pods, filter, view, setFilter, setView, startWatch, openDetail, setDetailTab, watchStatus,
    capped, selectMode, selected, exportOpen, exportState,
    toggleSelectMode, selectAllVisible, openExport, closeExport,
  } = useK8sStore();
  const { collapsed, toggle } = useCollapsedGroups();
  const searchOpen = useDk8sSearchStore(s => s.open);
  const openSearch = useDk8sSearchStore(s => s.openSearch);
  const closeSearch = useDk8sSearchStore(s => s.closeSearch);
  const searchRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  // Ages and "recent restart" are relative to now, so the grid has to re-render
  // periodically or a pod that restarted five minutes ago stays amber forever.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { startWatch(); }, [startWatch]);

  // `/` focuses the filter, k9s-style.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA)$/.test(target.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.querySelector('input')?.focus();
      } else if (e.key === 'Escape' && typing) {
        (target as HTMLInputElement).blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
    ── Starred, and what "default to starred" has to mean ──

    The scope defaults to `fav`, but a scope that hides everything on first run
    is a broken app rather than a preference: nobody has starred anything yet,
    so the honest reading of "start on favourites" is "start there once there
    are favourites". With an empty star list the view falls back to all pods
    and the control says so.

    In `all`, starred pods still sort to the top. That is the other half of
    what starring is for — you asked for them to come first, not only to be
    filterable.
  */
  const favKeys = useFavoriteKeys();
  /*
    Not persisted. Opening dk8s starts on starred, every time.

    It used to be a saved preference, so one look at everything left the tab
    on `all` for good — and the pods you starred, which is the whole reason
    you starred them, stopped being what you saw on arrival. Switching to
    `all` is a thing you do to go and find something, not a setting you mean
    to change; it lasts as long as you are looking.
  */
  const favScope = useK8sStore(s => s.podScope);
  const setFavScope = useK8sStore(s => s.setPodScope);
  const scope = favKeys.length === 0 ? 'all' : favScope;

  const visible = useMemo(() => {
    const matched = pods.filter(p => matchesFilter(p, filter));
    const scoped = scope === 'fav'
      ? matched.filter(p => favKeys.includes(favoriteKey(p)))
      : matched;
    return favoritesFirst(sortPods(scoped, now), favKeys);
  }, [pods, filter, now, scope, favKeys]);

  const groups = useMemo(() => groupPods(visible, now), [visible, now]);

  /*
    Starring a selection.

    Counted over distinct workload keys, not over pods: selecting three
    replicas of one Deployment adds one favourite, and a button offering to
    add three would be lying about what it is going to do.
  */
  const selectedPods = pods.filter(p => selected.includes(p.uid));
  const newlyStarred = new Set(
    selectedPods.map(favoriteKey).filter(k => !favKeys.includes(k)),
  ).size;
  const starSelected = () => {
    // Each key is toggled at most once and only when it is not already
    // starred, so `favKeys` — the snapshot this render was built from — stays
    // correct for the whole loop even though every call writes.
    for (const k of new Set(selectedPods.map(favoriteKey))) {
      if (!favKeys.includes(k)) toggleFavorite(k);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <Pulse pods={pods} />

      <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        {/* The same plain checkbox the Artifacts list uses, in the same place
            beside the filter. A labelled green button announced a mode; a
            checkbox is the mode, and it matches the one that appears on every
            card the moment it is ticked. */}
        <button
          type="button"
          onClick={toggleSelectMode}
          title={selectMode ? 'Leave selection mode' : 'Pick pods to search or export their logs'}
          className="flex items-center justify-center cursor-pointer shrink-0 border-none bg-transparent p-0"
          style={{ width: 22, height: 22, marginLeft: 4 }}
        >
          {selectMode
            ? <CheckSquareIcon size={19} color={ACCENT} />
            : <EmptySquareIcon size={19} color="var(--color-text-muted)" />}
        </button>

        {/* Takes the row rather than capping at 560px — on a wide window the
            cap left a long dead gap between the filter and the buttons. */}
        <div ref={searchRef} className="flex-1" style={{ minWidth: 200, paddingRight: 8 }}>
          <FilterInputView value={filter} onChange={setFilter}
                           placeholder="Filter pods  ( / )" size="sm"
                           accentColor={ACCENT} />
        </div>


        {/* dui's control rather than a hand-rolled one: it insets the active
            pill from the track, which is the breathing room the home-made
            version was missing — its highlight ran edge to edge against the
            border and read as cramped. `md` matches Select pods beside it. */}
        <SegmentedControlView
          value={view}
          onChange={v => setView(v as 'cards' | 'table')}
          options={[
            { value: 'cards', label: 'cards' },
            { value: 'table', label: 'table' },
          ]}
          size="md"
          variant="rounded"
          accentColor={ACCENT}
        />

        {/*
          Starred or everything.

          Its own control rather than a third position on cards|table, because
          the two are different questions — one is how the pods are drawn, the
          other is which pods there are — and folding them together would mean
          switching to the table silently changed what you were looking at.

          Hidden until something is starred: a filter whose only setting shows
          nothing is a dead end, and there is no way to star from inside it.
        */}
        {favKeys.length > 0 && (
          <SegmentedControlView
            value={scope}
            onChange={v => setFavScope(v as 'fav' | 'all')}
            options={[
              { value: 'fav', label: `★ ${favKeys.length}` },
              { value: 'all', label: 'all' },
            ]}
            size="md"
            variant="rounded"
            accentColor={FAV_COLOR}
          />
        )}
      </div>

      {selectMode && (
        <div className="flex items-center gap-3 mx-4 mt-3 px-4 py-3 rounded-lg flex-shrink-0"
             style={{
               background: `color-mix(in srgb, ${ACCENT} 9%, var(--color-surface))`,
               border: `1px solid color-mix(in srgb, ${ACCENT} 32%, transparent)`,
             }}>
          <span className="text-[11.5px]" style={{ color: ACCENT }}>
            {selected.length
              ? `${selected.length} pod${selected.length === 1 ? '' : 's'} selected`
              : 'Pick the pods whose logs you need'}
          </span>
          <button
            type="button"
            onClick={() => selectAllVisible(visible.map(p => p.uid))}
            className="text-[11px] cursor-pointer"
            style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', textDecoration: 'underline' }}
          >
            {visible.every(p => selected.includes(p.uid)) && visible.length
              ? 'Clear all'
              : `Select all ${visible.length} visible`}
          </button>
          <div className="flex-1" />

          {/* Search sits beside Export because they take the same selection.
              Searching is the cheaper of the two — it reads the logs and keeps
              only hits — so it comes first. */}
          <button
            type="button"
            onClick={openSearch}
            disabled={!selected.length}
            className="text-[11px] px-3 py-1.5 rounded-md cursor-pointer transition-colors flex items-center gap-1.5"
            style={{
              background: selected.length
                ? 'color-mix(in srgb, var(--color-dk8s) 16%, transparent)'
                : 'transparent',
              color: selected.length ? 'var(--color-dk8s)' : 'var(--color-text-muted)',
              border: `1px solid ${selected.length
                ? 'color-mix(in srgb, var(--color-dk8s) 45%, transparent)'
                : 'var(--color-surface-border)'}`,
              fontWeight: 600,
              cursor: selected.length ? 'pointer' : 'not-allowed',
            }}
          >
            <SearchIcon size={12} strokeWidth={2} />
            Search {selected.length || ''} log{selected.length === 1 ? '' : 's'}
          </button>

          <button
            type="button"
            onClick={openExport}
            disabled={!selected.length}
            className="text-[11px] px-3 py-1.5 rounded-md cursor-pointer transition-colors flex items-center gap-1.5"
            style={{
              // Amber, matching the export mark on the toolbar toggle. This is
              // the button that actually writes files, so it should read as
              // the export action rather than as generic dk8s chrome.
              background: selected.length ? 'var(--color-warning)' : 'var(--color-surface-hover)',
              color: selected.length ? 'var(--color-panel)' : 'var(--color-text-muted)',
              border: 'none', fontWeight: 600,
              cursor: selected.length ? 'pointer' : 'not-allowed',
            }}
          >
            <FolderExportIcon size={12} strokeWidth={2} />
            Export {selected.length || ''} log{selected.length === 1 ? '' : 's'}
          </button>

          {/*
            Star everything selected, in one go.

            The per-row star is fine for one pod and tedious for eight, and
            picking eight pods is already what this bar is for. It stars rather
            than toggling: a mixed selection where half are starred has no
            sensible toggle — you would be unstarring things you just asked to
            keep — so the verb is always "add", and the label says how many are
            actually new.
          */}
          <button
            type="button"
            onClick={starSelected}
            disabled={!newlyStarred}
            title={newlyStarred
              ? `Star ${newlyStarred} workload${newlyStarred === 1 ? '' : 's'}`
              : 'Every selected pod is already starred'}
            className="text-[11px] px-3 py-1.5 rounded-md cursor-pointer transition-colors flex items-center gap-1.5"
            style={{
              background: newlyStarred
                ? `color-mix(in srgb, ${FAV_COLOR} 16%, transparent)`
                : 'var(--color-surface-hover)',
              color: newlyStarred ? FAV_COLOR : 'var(--color-text-muted)',
              border: `1px solid ${newlyStarred
                ? `color-mix(in srgb, ${FAV_COLOR} 45%, transparent)`
                : 'transparent'}`,
              fontWeight: 600,
              cursor: newlyStarred ? 'pointer' : 'not-allowed',
            }}
          >
            <StarIcon size={12} filled={!newlyStarred} />
            Add {newlyStarred || ''} to favourites
          </button>
        </div>
      )}

      {/* Where the files went. Worth a persistent line rather than a toast —
          the path is the thing you need next, and a toast takes it away. */}
      {exportState?.phase === 'done' && (
        <div className="flex items-center gap-3 mx-4 mt-3 px-4 py-3 rounded-lg flex-shrink-0 text-[11.5px]"
             style={{
               background: 'color-mix(in srgb, var(--color-method-get) 10%, var(--color-surface))',
               border: '1px solid color-mix(in srgb, var(--color-method-get) 30%, transparent)',
               color: 'var(--color-method-get)',
             }}>
          <FolderExportIcon size={13} strokeWidth={1.8} />
          <span className="font-medium">{exportState.summary}</span>
          {/* Selectable, not just a tooltip: the path is the thing you need
              next, and you usually need to paste it somewhere. */}
          <span className="font-mono text-[10.5px] truncate text-[var(--color-text-muted)]"
                style={{ userSelect: 'text' }}
                title={exportState.destDir}>
            {exportState.destDir}
          </span>
          <div className="flex-1" />
          <button type="button"
                  onClick={() => useK8sStore.setState({ exportState: undefined })}
                  className="cursor-pointer text-[11px] px-2 py-1 rounded"
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
            Dismiss
          </button>
        </div>
      )}

      {capped && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-lg flex-shrink-0 text-[11.5px]"
             style={{
               background: 'color-mix(in srgb, var(--color-warning) 10%, var(--color-surface))',
               color: 'var(--color-warning)',
               border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
             }}>
          Watching {capped.watching} of {capped.requested} namespaces &mdash; dk8s holds at most{' '}
          {capped.max} live watches, because each one is a process against the API server.
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 pt-3 pb-4">
        {!pods.length ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-[var(--color-text-muted)]">
              {watchStatus === 'reconnecting' ? 'Reconnecting to the cluster…'
                : watchStatus === 'connected' ? 'No pods in this namespace.'
                : 'Loading pods…'}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map(g => (
              view === 'table'
                ? <NamespaceTableGroup key={g.key} group={g} onOpen={p => openDetail(p)}
                                       onMenu={openMenu}
                                       collapsed={collapsed.has(groupKey(g))}
                                       onToggle={() => toggle(groupKey(g))} />
                : <NamespaceGroup key={g.key} group={g} onOpen={p => openDetail(p)}
                                  onMenu={openMenu}
                                  collapsed={collapsed.has(groupKey(g))}
                                  onToggle={() => toggle(groupKey(g))} />
            ))}
            {!visible.length && (
              <span className="text-[12px] text-[var(--color-text-muted)] py-6 text-center">
                No pod matches &ldquo;{filter}&rdquo;.
              </span>
            )}
          </div>
        )}
      </div>

      <PodContextMenu
        pod={menu?.pod}
        at={menu?.at}
        onClose={closeMenu}
        onConfirmUnfavorite={setUnstar}
        onOpen={(pod, tab) => {
          openDetail(pod);
          // The tab is set after opening, because opening resets it to
          // whatever this pod was last looked at on.
          if (tab) setDetailTab(tab);
        }}
      />

      <ModalView
        open={!!unstar}
        onClose={() => setUnstar(undefined)}
        title="Remove from favourites?"
        size="sm"
        footerRight={
          <div style={{ display: 'flex', gap: 8 }}>
            <ButtonView variant="secondary" size="sm" onClick={() => setUnstar(undefined)}>
              Cancel
            </ButtonView>
            <ButtonView variant="primary" size="sm" accentColor="var(--color-warning)"
                        onClick={() => {
                          if (unstar) toggleFavorite(favoriteKey(unstar));
                          setUnstar(undefined);
                        }}>
              Remove
            </ButtonView>
          </div>
        }
      >
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          <b style={{ color: 'var(--color-text-primary)' }}>{unstar?.name}</b> stops
          sorting to the top and leaves the starred view.
        </span>
      </ModalView>

      {exportOpen && <ExportLogsModal onClose={closeExport} />}
      {searchOpen && <LogSearchModal onClose={closeSearch} />}
    </div>
  );
}
