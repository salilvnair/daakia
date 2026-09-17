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
  ModalView, ButtonView, IconSize, EmptyStateView,
  LoadingStateView } from '@salilvnair/dui';
import { useLongPress } from './use-long-press';
import { PodContextMenu } from './PodContextMenu';
import { PvCheckModal } from './PvCheckModal';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import {
  useFavoriteKeys, toggleFavorite, favoriteKey, favoritesFirst,
  starredKeyOf,
} from '../../store/dk8s-favorites-store';
import { isScheduled } from '@daakia/k8s-workload';
import { PodFilterPopup } from './PodFilterPopup';
import {
  matchesPodFilter, filterChips, withoutChip, isEmptyFilter, NO_POD_FILTER,
} from './pod-filter';
import { looksLikePodLink, parsePodLink, type LogTarget } from './pod-link';
import { useSplitStore, MAX_PANES } from '../../store/dk8s-split-store';
import { SPLIT_MODES } from './SplitLogs';
import { logLineSettings } from './log-settings';
import { useMetricsAuto, METRICS_AUTO_KEY } from '../settings/metrics-refresh';
import { postMsg } from '../../vscode';
import { HIDE_CRONJOBS_PREF } from '../settings/cronjob-visibility';
import { useUiStateStore } from '../../store/ui-state-store';
import { ExportLogsModal } from './ExportLogsModal';
import { LogSearchModal } from './LogSearchModal';
import { useDk8sSearchStore } from '../../store/dk8s-search-store';
import {
  FolderExportIcon, CloseIcon, SearchIcon, LayersIcon, ChevronDownIcon, ChevronRightIcon,
  FilterIcon, CloseCircleIcon,
  StarIcon, Dk8sIcon, ColumnsIcon, RowsIcon, LayoutGridIcon, CpuIcon, RefreshIcon,
} from '../../icons';
import {
  sortPods, severityOf, severityColor, matchesFilter, shortAge,
  formatBytes, formatCpu, restartLabel, pulse, isRecentRestart, groupPods,
  type Severity, type PodGroup, workloadColor,
} from './pod-view';

import { ACCENT, OK, MUTED, MATCH } from './tone';
import { isTypingTarget } from '../../utils/typing-target';
import { RunningCommand } from './RunningCommand';
/* Amber, not the dk8s accent: a star is a personal mark, not a status, and
   reusing the accent made starred rows look selected. */
/* Scheduled work reads as its own thing — not an error, not a service. */
const SCHEDULED_COLOR = 'var(--color-info)';

/**
 * A colour per workload kind, so the badges are told apart at a glance.
 *
 * A Deployment and a CronJob are the two you see most and they mean opposite
 * things — one is meant to be up, the other is meant to have finished — so
 * they are the two furthest apart.
 */
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
  const {
    watchStatus, watchDetail, lastEventAt, lastListedAt: listedAt, refreshing,
  } = useK8sStore();
  /* With live on the screen is keeping itself current, so it says that
     instead of naming a moment that has already moved on. */
  const liveOn = useMetricsAuto();
  const map: Record<string, { label: string; color: string }> = {
    idle: { label: 'starting', color: 'var(--color-text-muted)' },
    // Health, not a REST verb. This took the GET colour because it was
    // the right green, which tied the cluster's status to the REST
    // palette — change one and the other moves with it.
    connected: { label: 'watching', color: OK },
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
  /*
    The dot no longer breathes here.

    Motion means "this is arriving as you watch", and the text beside it is now
    a timestamp — a fact about a moment that has passed. Breathing next to it
    said the opposite of what the words said. The only thing on this row that
    IS live is the metrics toggle, and its dot breathes when it is on.

    The colour stays: reconnecting and stopped still need to be visible, and
    that is what the colour was always for.
  */

  /*
    When this was read, rather than the word "watching".

    "watching" is a claim about the machinery; "on 09/16/2026 21:55:03" is a
    fact about the rows underneath it. They are not the same thing — a watch
    can be connected and the list beneath it half an hour old, which is exactly
    the failure that made the grid silently stale — and only one of the two
    tells a reader whether to trust what is on screen.

    The dot stays. It is the one signal a stale render cannot fake: it breathes
    while the stream is live, so a frozen pane stops it, and its colour still
    says reconnecting or stopped.
  */
  const stamp = listedAt ? readable(listedAt) : 'not read yet';

  return (
    <span className="flex items-center gap-1.5 flex-shrink-0" title={title}>
      {/*
        Nothing here unless there is something to say.

        A healthy watch needs no word for itself — "watching" describes the
        machinery, and the reader can see the pods. What is worth a line is
        when the rows were read, and only while nothing is refreshing them:
        with `live` on that question is already answered by the lit toggle
        beside it.

        A watch that is NOT connected is the exception, and the only time a
        dot earns its place — then it says so, in the colour of what is wrong.
      */}
      {watchStatus !== 'connected' && (
        <>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: s.color }} />
          <span className="text-[10.5px]" style={{ color: s.color }}>{s.label}</span>
        </>
      )}
      {watchStatus === 'connected' && (refreshing || !liveOn) && (
        <span
          className={`text-[10.5px] tabular-nums${refreshing ? ' refreshing-text' : ''}`}
          style={refreshing ? undefined : { color: 'var(--color-text-muted)' }}
        >
          {refreshing ? 'refreshing…' : `on ${stamp}`}
        </span>
      )}
    </span>
  );
}

/** `MM/DD/YYYY HH:MM:SS` — the reader's own clock, to the second. */
function readable(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`
    + ` ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Whether CPU and memory are being kept up to date.
 *
 * One control, not two. A "read it once" button beside it was a second way to
 * say the same thing and read as a label — turning this on takes a reading
 * immediately, so the one-shot was a click somebody could already make.
 *
 * Off means the columns are not there at all, which is honest: without a
 * reading there is nothing to put in them, and an empty column is worse than
 * no column.
 */
function UsageControl() {
  const live = useMetricsAuto();
  const setPref = useUiStateStore(s => s.setPref);
  /*
    While a refresh is out, both of these are off.

    Refresh is asking what the rows are; `live` changes what the rows carry.
    Answering the second question while the first is still open means the
    snapshot lands into a grid that has grown or lost two columns underneath
    it, and a second refresh on top of the first is two lists racing to
    replace each other. Neither is worth the moment of being unable to press.
  */
  const busy = useK8sStore(s => s.refreshing === true);

  return (
    <span className="flex items-center gap-1 shrink-0">
      {/*
        Read the pod list again, now — and only when nothing else is.

        The `kubectl get pods` somebody would run in a terminal to check what
        is on screen is current. It matters because a watch can be alive and
        deaf while the grid looks perfectly normal.

        With `live` on, something already is: the timer is re-reading on its
        own, and a button offering to do the thing that is being done anyway
        is a control with no question behind it. So it goes away rather than
        greying out — greyed out would say "not now", and the truth is
        "nothing to ask for".
      */}
      {!live && (
      <button
        type="button"
        disabled={busy}
        onClick={() => useK8sStore.getState().refreshPods()}
        title={busy
          ? 'Reading the pod list…'
          : 'Read the pod list again — the kubectl get pods you would run yourself'}
        className="flex items-center gap-1.5 text-[10.5px] px-2 py-1 rounded-md"
        style={{
          background: 'transparent',
          border: '1px solid var(--color-surface-border)',
          color: 'var(--color-text-secondary)',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.55 : 1,
        }}
      >
        <span className={busy ? 'spinning' : undefined} style={{ display: 'flex' }}>
          <RefreshIcon size={IconSize.inline} />
        </span>
        refresh
      </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => setPref(METRICS_AUTO_KEY, live ? 'off' : 'on')}
        title={busy
          ? 'Reading the pod list…'
          : live
            ? 'Stop refreshing CPU and memory'
            : 'Keep CPU and memory up to date — one kubectl top pods per namespace, on a timer'}
        className="flex items-center gap-1.5 text-[10.5px] px-2 py-1 rounded-md"
        style={{
          background: live
            ? 'color-mix(in srgb, var(--color-success) 14%, transparent)'
            : 'transparent',
          border: `1px solid ${live
            ? 'color-mix(in srgb, var(--color-success) 42%, transparent)'
            : 'var(--color-surface-border)'}`,
          color: live ? 'var(--color-success)' : 'var(--color-text-secondary)',
          fontWeight: live ? 600 : 400,
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.55 : 1,
        }}
      >
        <span
          className={live ? 'breathing-connected' : undefined}
          style={{
            width: 6, height: 6, borderRadius: 6,
            background: live ? 'var(--color-success)' : 'var(--color-text-muted)',
            color: 'var(--color-success)',
          }}
        />
        live
      </button>
    </span>
  );
}

function Pulse({ pods }: { pods: PodSummary[] }) {
  const counts = useMemo(() => pulse(pods), [pods]);
  /* Nothing on this row acts while the list it describes is being re-read. */
  const busy = useK8sStore(s => s.refreshing === true);
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
      <Stat n={counts.total} label="pods" />
      <Stat n={counts.ready} label="ready" color={OK} />
      {counts.degraded > 0 && <Stat n={counts.degraded} label="degraded" color="var(--color-warning)" />}
      {counts.critical > 0 && <Stat n={counts.critical} label="failing" color="var(--color-error)" />}
      {counts.restartsLastHour > 0 && (
        <Stat n={counts.restartsLastHour} label="restarted in the last hour" color="var(--color-warning)" />
      )}

      {/*
        CPU and memory: asked for, or kept live.

        Shaped like the log view's Following, because it is the same bargain in
        the same words — off, you have a reading from when you asked; on,
        something is running on a timer to keep it true. Beside the counts it
        describes rather than in Settings, for the same reason Following is on
        the log and not in a menu: it is a thing you turn on for the next two
        minutes and off again.

        The default is off. `kubectl top pods` every fifteen seconds per
        namespace was two thirds of every call dk8s made, for a column, whether
        or not anybody had the tab in front of them.
      */}
      <div className="flex-1" />

      {/* When it was read, beside the controls that read it — the right-hand
          end of the row, where the things you act on live. */}
      <WatchIndicator />
      <UsageControl />
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
        disabled={busy}
        onClick={() => useDk8sSearchStore.getState().openSearch()}
        title={busy
          ? 'Reading the pod list…'
          : 'Quick Search — files and logs across every watched pod'}
        className="text-[11px] px-3 py-1 rounded-md transition-colors
                   flex items-center gap-1.5 shrink-0 font-medium"
        style={{
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.55 : 1,
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
        <SearchIcon size={IconSize.action} />
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
  const keys = useFavoriteKeys();
  /*
    One click, on the app.

    Starring offered the workload or this pod and asked which. A pod name
    carries a generated suffix that changes on every rollout, so the pod answer
    was a star that quietly stopped referring to anything — and asking made
    people choose between a right answer and a wrong one. It goes on the
    workload, and on the pod only where there is no workload to hang it on.

    `starredKeyOf` still looks for both, because a pod-scoped star made before
    this has to stay removable.
  */
  const starred = starredKeyOf(pod, keys);
  const on = !!starred;
  const key = starred ?? favoriteKey(pod);

  return (
    <span
      role="button"
      tabIndex={-1}
      aria-pressed={on}
      title={on
        ? `Unstar ${key.split('/').slice(-2).join('/')}`
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
        <span className="flex items-center gap-1.5 min-w-0">
          {/* The kind, as its own mark. A namespace with a CronJob firing
              every five minutes fills with finished runs, and reading which
              is which off the end of a truncated `Job/billing-28912345` is
              not reading. */}
          {pod.workload && (
            <span
              className="text-[9px] px-1 py-px rounded shrink-0 uppercase tracking-wide"
              title={`${pod.workload.kind}/${pod.workload.name}`}
              style={{
                color: workloadColor(pod.workload.kind),
                background: `color-mix(in srgb, ${workloadColor(pod.workload.kind)} 14%, transparent)`,
              }}
            >
              {pod.workload.kind}
            </span>
          )}
          <span className="text-[10px] text-[var(--color-text-muted)] truncate">
            {pod.workload ? pod.workload.name : pod.node ?? '—'}
          </span>
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
    /* Type, next to the name it qualifies. A namespace with a CronJob firing
       every five minutes fills with finished runs, and "is this meant to be
       up" is the first question asked of every row in it — the cards have
       said so all along and the table was the one view that did not. */
    'Name', 'Type', 'Ready', 'Status', '\u21bb', 'Node', 'Age',
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
            /* Keyed by name, not uid. The grid paints first from a table row,
               which has no uid to give — so keying on one would remount every
               row the moment the full list replaced it, and the flash would
               land exactly when the detail appeared. */
            return (
              <tr key={`${pod.namespace}/${pod.name}`}
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
                    <FavoriteStar pod={pod} size={IconSize.inline} />
                  </span>
                </td>
                <td className="text-[11px] px-3 py-1.5" style={cell}>
                  {pod.workload ? (
                    <span
                      className="text-[9px] px-1 py-px rounded uppercase tracking-wide"
                      title={`${pod.workload.kind}/${pod.workload.name}`}
                      style={{
                        color: workloadColor(pod.workload.kind),
                        background: `color-mix(in srgb, ${workloadColor(pod.workload.kind)} 14%, transparent)`,
                      }}
                    >
                      {pod.workload.kind}
                    </span>
                  ) : (
                    /* A pod with no owner is a real thing — one somebody
                       applied by hand — and saying nothing is the honest way
                       to show it. */
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
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
  /*
    Attention means critical or warning, and nothing else.

    It counted everything that was not `quiet`, which swept up `ok` — and a
    finished CronJob run is `ok`: not healthy, because healthy means Running
    and ready, but not a problem either. A namespace whose schedule had fired
    three times therefore announced "3 need attention" in red above three pods
    that had done exactly what they were asked to do.

    The row colouring a few hundred lines down already had this right; only the
    heading was counting a different thing from the rows under it.
  */
  const failing = group.pods.filter(p => {
    const sev = severityOf(p);
    return sev === 'critical' || sev === 'warning';
  }).length;
  return (
    <div
      className={`flex items-center gap-2 flex-wrap${onToggle ? ' cursor-pointer select-none' : ''}`}
      onClick={onToggle}
      title={onToggle ? (collapsed ? 'Show these pods' : 'Hide these pods') : undefined}
    >
      {onToggle && (
        collapsed
          ? <ChevronRightIcon size={IconSize.inline} style={{ color: group.tint.label }} />
          : <ChevronDownIcon size={IconSize.inline} style={{ color: group.tint.label }} />
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
          {/* Keyed by name: a card drawn from a table row has no uid yet, and
              a key that changes when the full list lands remounts the card
              under the reader. */}
          {group.pods.map(p => (
            <PodCard key={`${p.namespace}/${p.name}`} pod={p} onOpen={() => onOpen(p)} onMenu={onMenu} />
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
  const refreshing = useK8sStore(s => s.refreshing);
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
    watchDetail, clusterTimeoutSeconds,
    capped, selectMode, selected, exportOpen, exportState, busy,
    toggleSelectMode, selectAllVisible, openExport, closeExport,
  } = useK8sStore();

  /*
    ── When to stop waiting ──

    This was a 25-second stopwatch, and it was wrong in both directions.

    The pod list it waits on is bounded by the cluster timeout — 30 seconds by
    default — so at 25 the screen announced "no answer from the cluster" five
    seconds *before* the call had finished, and a merely slow cluster was called
    dead while its answer was on the way. And when the list failed for real in
    two seconds, the host said so immediately and the screen sat on that for
    twenty-three more before mentioning it.

    So: a failure is reported the moment the host reports it, and the only
    timer left is a backstop for hearing nothing at all — derived from the
    host's own ceiling, so it cannot fire first. The number is a setting now:
    Settings → DK8S → General.
  */
  const listFailed = watchStatus === 'reconnecting' && !!watchDetail;
  const [heardNothing, setHeardNothing] = useState(false);
  useEffect(() => {
    if (pods.length || watchStatus === 'connected' || listFailed) {
      setHeardNothing(false);
      return;
    }
    setHeardNothing(false);
    const backstop = clusterTimeoutSeconds * 1000 + 8_000;
    const id = window.setTimeout(() => setHeardNothing(true), backstop);
    return () => window.clearTimeout(id);
  }, [pods.length, watchStatus, listFailed, clusterTimeoutSeconds]);

  const watchNeverCame = listFailed || heardNothing;

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
      /* `isTypingTarget`, not a tag test. This listener is on `window` — the
         last stop in the bubble path — and it used to `preventDefault()` every
         `/` typed into a contenteditable anywhere in the app, so a URL typed in
         REST came out with its slashes missing and nothing said why. */
      const typing = isTypingTarget(target);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.querySelector('input')?.focus();
      } else if (e.key === 'Escape' && typing) {
        (target as HTMLInputElement).blur?.();
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

  /*
    Pods that stay up and runs of something are two different questions.

    A namespace with a CronJob firing every five minutes accumulates finished
    runs, and they sit in the same list as the services — so "is anything
    broken" and "did last night's billing job work" bury each other. The kind
    is already on the pod; this just lets you ask one at a time.
  */
  /* What it starts on comes from Settings → DK8S → General. Somebody who
     never wants to see finished runs should not have to say so per namespace,
     per session — but it stays a control here, because "did last night's job
     work" is a question they will have eventually. */
  const hideRuns = useUiStateStore(s2 => s2.prefs[HIDE_CRONJOBS_PREF]) === 'on';
  /* In the store, because the panel's background menu and a pod's right-click
     offer the same filter — see `podFilter`. */
  const podFilter = useK8sStore(s2 => s2.podFilter);
  const setPodFilter = useK8sStore(s2 => s2.setPodFilter);
  const kind = podFilter.kind;
  const setKind = useCallback(
    (k: 'all' | 'pods' | 'runs') => setPodFilter({ ...useK8sStore.getState().podFilter, kind: k }),
    [setPodFilter],
  );
  const [filterOpen, setFilterOpen] = useState(false);
  /* The popup hangs off this and positions against its rect — it is
     portalled to the body, so it has no parent to measure from. */
  const filterBtn = useRef<HTMLButtonElement>(null);
  /* Follows the setting when it changes, unless this view has been pointed
     somewhere else in the meantime. */
  const lastDefault = useRef(hideRuns);
  useEffect(() => {
    if (lastDefault.current === hideRuns) return;
    lastDefault.current = hideRuns;
    setKind(hideRuns ? 'pods' : 'all');
  }, [hideRuns, setKind]);
  /* The setting also decides what an untouched filter starts on. */
  const seededKind = useRef(false);
  useEffect(() => {
    if (seededKind.current) return;
    seededKind.current = true;
    if (hideRuns) setKind('pods');
  }, [hideRuns, setKind]);
  /* "Where would a search look for this pod?" — opened from the pod's menu. */
  const [pvCheck, setPvCheck] = useState<PodSummary | undefined>();
  /* Which arrangement, asked once when the panes are opened. */
  const [splitMenu, setSplitMenu] = useState(false);
  const openSplit = useSplitStore(s => s.open);
  /* The tail each pane opens on, from Settings → DK8S → Logs, so a pane and
     the detail view start on the same number of lines. */
  const splitPrefs = useUiStateStore(s2 => s2.prefs);
  const lineSettings = useMemo(() => logLineSettings(splitPrefs), [splitPrefs]);
  const visible = useMemo(() => {
    const matched = pods.filter(p => matchesFilter(p, filter));
    const scoped = scope === 'fav'
      ? matched.filter(p => favKeys.includes(favoriteKey(p)))
      : matched;
    const narrowed = scoped.filter(p => matchesPodFilter(p, podFilter));
    return favoritesFirst(sortPods(narrowed, now), favKeys);
  }, [pods, filter, now, scope, favKeys, podFilter]);

  /*
    What the facets get to choose from.

    The text box has already been applied, so the counts describe the list in
    front of the reader rather than the whole fleet — but this filter has NOT,
    or each facet would only ever offer the value already chosen.
  */
  const filterable = useMemo(() => {
    const matched = pods.filter(p => matchesFilter(p, filter));
    return scope === 'fav'
      ? matched.filter(p => favKeys.includes(favoriteKey(p)))
      : matched;
  }, [pods, filter, scope, favKeys]);

  const chips = useMemo(() => filterChips(podFilter), [podFilter]);
  const filterOn = !isEmptyFilter(podFilter);
  /* A link to a pod this session is not watching — see the notice below. */
  const [linkMiss, setLinkMiss] = useState<LogTarget | undefined>();

  const groups = useMemo(() => groupPods(visible, now), [visible, now]);

  /*
    Starring a selection.

    Counted over distinct workload keys, not over pods: selecting three
    replicas of one Deployment adds one favourite, and a button offering to
    add three would be lying about what it is going to do.
  */
  const selectedPods = pods.filter(p => selected.includes(p.uid));
  /*
    While the list is being read again, the bar stops taking work.

    Everything on it acts on a set of pods — split these, search these,
    export these, star these — and a refresh is the moment when "these" is
    about to change. A search started here and answered against the list
    that arrives a second later is a search of pods the reader never
    picked. Refresh is quick; the bar comes back with it.
  */
  const relisting = refreshing === true;
  const canAct = selected.length > 0 && !relisting;
  const newlyStarred = new Set(
    selectedPods.map(p => favoriteKey(p)).filter(k => !favKeys.includes(k)),
  ).size;
  const starSelected = () => {
    // Each key is toggled at most once and only when it is not already
    // starred, so `favKeys` — the snapshot this render was built from — stays
    // correct for the whole loop even though every call writes.
    for (const k of new Set(selectedPods.map(p => favoriteKey(p)))) {
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
            ? <CheckSquareIcon size={IconSize.control} color={ACCENT} />
            : <EmptySquareIcon size={IconSize.control} color="var(--color-text-muted)" />}
        </button>

        {/*
          Filter and search, side by side because they are two halves of one
          question and were previously one control pretending to be both.

          The box narrows by NAME, which is why its icon is a magnifier now: it
          was wearing a funnel and answering "which pod is called something like
          this", and the funnel is what made `prod` look like a way to see
          production rather than a substring that also matches `prod-checkout`
          in the lab.

          The funnel moved to its own button, where it opens the facets that
          actually do filter — cluster, namespace, app, type.
        */}
        <div className="shrink-0">
          <button
            ref={filterBtn}
            type="button"
            onClick={() => setFilterOpen(v => !v)}
            title={filterOn
              ? `Filtered — ${chips.length} narrowing${chips.length === 1 ? '' : 's'}`
              : 'Filter by cluster, namespace, app or type'}
            aria-expanded={filterOpen}
            className="dk-icon-btn flex items-center justify-center rounded-md border-none bg-transparent cursor-pointer"
            style={{ width: 26, height: 26, color: filterOn ? ACCENT : 'var(--color-text-muted)' }}
          >
            <FilterIcon size={IconSize.control} color="currentColor" />
            {/* A dot rather than a count: the chips below say what, and two
                numbers for one filter is one too many. */}
            {filterOn && (
              <span style={{
                position: 'absolute', top: 3, right: 3, width: 5, height: 5,
                borderRadius: 5, background: ACCENT,
              }} />
            )}
          </button>
          {filterOpen && (
            <PodFilterPopup pods={filterable} anchorRef={filterBtn}
                            onClose={() => setFilterOpen(false)} />
          )}
        </div>

        {/* Takes the row rather than capping at 560px — on a wide window the
            cap left a long dead gap between the filter and the buttons. */}
        <div ref={searchRef} className="flex-1" style={{ minWidth: 200, paddingRight: 8 }}>
          <SearchInputView
            value={filter}
            onChange={v => {
              /*
                A pasted link is not a search.

                Somebody sends you `vscode://…/dk8s/logs?…`; the only place in
                dk8s shaped like "put a thing here" is this box, so this is
                where it gets pasted. Treating it as a substring would search
                for a URL and find no pods, which looks exactly like the link
                being wrong.

                Only when the whole value is one — typing a word that happens
                to start `daakia` still searches.
              */
              if (looksLikePodLink(v)) {
                const target = parsePodLink(v);
                if (target) {
                  const how = useK8sStore.getState().openPodLink(target);
                  setLinkMiss(how === 'no-pod' ? target : undefined);
                  if (how !== 'no-pod') { setFilter(''); return; }
                }
              }
              setFilter(v);
            }}
            placeholder="Search pods  ( / )"
            size="sm"
            width="100%"
            prefix={<SearchIcon size={12}
                                color={filter ? ACCENT : 'var(--color-text-muted)'} />}
            suffix={filter ? (
              <button
                type="button"
                onClick={() => setFilter('')}
                title="Clear the search"
                aria-label="Clear the search"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', background: 'transparent', padding: 2,
                  cursor: 'pointer', color: 'var(--color-text-muted)',
                }}
              >
                <CloseCircleIcon size={12} />
              </button>
            ) : undefined}
          />
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

      {/*
        A link to a pod nobody here is watching.

        Said rather than ignored: the difference between "that link is broken"
        and "you are not watching that namespace" is the whole of what the
        reader needs, and only one of them is their problem to fix.
      */}
      {linkMiss && (
        <div className="flex items-center gap-2 mx-4 mt-2 px-3 py-2 rounded-md flex-shrink-0 text-[11px]"
             style={{
               background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
               border: '1px solid color-mix(in srgb, var(--color-warning) 35%, transparent)',
               color: 'var(--color-text-secondary)',
             }}>
          <span className="flex-1">
            That link points at{' '}
            <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>{linkMiss.pod}</code>
            {' '}in{' '}
            <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>{linkMiss.namespace}</code>
            {linkMiss.context && <> on <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>{linkMiss.context}</code></>}
            , which is not being watched here. Add it above and paste the link again.
          </span>
          <button type="button" onClick={() => setLinkMiss(undefined)}
                  className="dk-close-btn p-0.5 rounded cursor-pointer border-none bg-transparent flex">
            <CloseIcon size={IconSize.inline} color="currentColor" />
          </button>
        </div>
      )}

      {/*
        What the filter is doing, where the pods it removed used to be.

        A filter with nothing on screen to show for it was the failure this is
        for: the grid says 3 pods where it said twelve, and the only record of
        why is a menu you have to reopen to read. Each chip names its own facet
        — `prod` and `orders` mean nothing on their own — and removes only
        itself, so a filter can be widened one step at a time instead of
        cleared and rebuilt.
      */}
      {chips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mx-4 mt-2 flex-shrink-0">
          <span className="text-[9.5px] uppercase tracking-wider shrink-0"
                style={{ color: 'var(--color-text-muted)' }}>
            filtered
          </span>
          {chips.map(c => (
            <button
              key={`${c.facet}:${c.value}`}
              type="button"
              onClick={() => setPodFilter(withoutChip(podFilter, c))}
              title={`Remove — ${c.label}`}
              className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10.5px] cursor-pointer"
              style={{
                background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                border: `1px solid color-mix(in srgb, ${ACCENT} 38%, transparent)`,
                color: ACCENT,
              }}
            >
              <span className="font-mono">{c.label}</span>
              <CloseIcon size={9} color="currentColor" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPodFilter(NO_POD_FILTER)}
            className="text-[10.5px] cursor-pointer border-none bg-transparent px-1"
            style={{ color: 'var(--color-text-muted)', textDecoration: 'underline' }}
          >
            clear
          </button>
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            {visible.length} of {filterable.length}
          </span>
        </div>
      )}

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

          {/*
            Open the selection as panes.

            Two replicas serving the same traffic and one of them is the reason
            a request failed: reading them one after the other does not answer
            that, because by the time the second is on screen the first has
            moved on. The submenu is the arrangement, which is worth asking —
            long lines want rows and short ones want columns, and nobody knows
            which until the logs are up.
          */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSplitMenu(v => !v)}
              disabled={selected.length < 2 || relisting}
              title={relisting
                ? 'Reading the pod list…'
                : selected.length < 2
                  ? 'Pick two or more pods to open them side by side'
                  : `Open ${selected.length} pods as panes`}
              className="text-[11px] px-3 py-1.5 rounded-md cursor-pointer transition-colors flex items-center gap-1.5"
              style={{
                background: selected.length > 1 && !relisting
                  ? `color-mix(in srgb, ${ACCENT} 16%, transparent)`
                  : 'transparent',
                color: selected.length > 1 && !relisting ? ACCENT : 'var(--color-text-muted)',
                border: `1px solid ${selected.length > 1 && !relisting
                  ? `color-mix(in srgb, ${ACCENT} 45%, transparent)`
                  : 'var(--color-surface-border)'}`,
                fontWeight: 600,
                cursor: selected.length > 1 && !relisting ? 'pointer' : 'not-allowed',
              }}
            >
              <ColumnsIcon size={IconSize.action} strokeWidth={2} />
              Split open
            </button>

            {splitMenu && selected.length > 1 && (
              <div
                className="absolute right-0 bottom-full mb-1.5 rounded-lg overflow-hidden z-40"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-surface-border)',
                  boxShadow: '0 8px 24px rgba(0,0,0,.34)',
                  minWidth: 210,
                }}
              >
                {SPLIT_MODES.map(({ id, label, Icon }) => {
                  const room = Math.min(selected.length, MAX_PANES[id]);
                  return (
                    <button
                      key={id} type="button"
                      onClick={() => {
                        setSplitMenu(false);
                        openSplit(
                          pods.filter(p => selected.includes(p.uid)),
                          id,
                          lineSettings.tailDefault,
                        );
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-[11.5px] cursor-pointer border-none bg-transparent text-left"
                      style={{ color: 'var(--color-text-primary)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${ACCENT} 12%, transparent)`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Icon size={IconSize.item} color={ACCENT} />
                      <span className="flex-1">{label}</span>
                      {/* Said before it is chosen: picking five pods and a mode
                          that holds three is a choice about which two get
                          dropped, and it should not be a surprise. */}
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {room < selected.length ? `first ${room}` : `${room} panes`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Search sits beside Export because they take the same selection.
              Searching is the cheaper of the two — it reads the logs and keeps
              only hits — so it comes first. */}
          <button
            type="button"
            onClick={openSearch}
            disabled={!canAct}
            title={relisting ? 'Reading the pod list…' : undefined}
            className="text-[11px] px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
            style={{
              background: canAct
                ? 'color-mix(in srgb, var(--color-dk8s) 16%, transparent)'
                : 'transparent',
              color: canAct ? 'var(--color-dk8s)' : 'var(--color-text-muted)',
              border: `1px solid ${canAct
                ? 'color-mix(in srgb, var(--color-dk8s) 45%, transparent)'
                : 'var(--color-surface-border)'}`,
              fontWeight: 600,
              cursor: canAct ? 'pointer' : 'not-allowed',
            }}
          >
            <SearchIcon size={IconSize.action} strokeWidth={2} />
            Search {selected.length || ''} log{selected.length === 1 ? '' : 's'}
          </button>

          <button
            type="button"
            onClick={openExport}
            disabled={!canAct}
            title={relisting ? 'Reading the pod list…' : undefined}
            className="text-[11px] px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
            style={{
              // Amber, matching the export mark on the toolbar toggle. This is
              // the button that actually writes files, so it should read as
              // the export action rather than as generic dk8s chrome.
              background: canAct ? 'var(--color-warning)' : 'var(--color-surface-hover)',
              color: canAct ? 'var(--color-panel)' : 'var(--color-text-muted)',
              border: 'none', fontWeight: 600,
              cursor: canAct ? 'pointer' : 'not-allowed',
            }}
          >
            <FolderExportIcon size={IconSize.action} strokeWidth={2} />
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
            disabled={!newlyStarred || relisting}
            title={relisting
              ? 'Reading the pod list…'
              : newlyStarred
                ? `Star ${newlyStarred} workload${newlyStarred === 1 ? '' : 's'}`
                : 'Every selected pod is already starred'}
            className="text-[11px] px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
            style={{
              background: newlyStarred && !relisting
                ? `color-mix(in srgb, ${FAV_COLOR} 16%, transparent)`
                : 'var(--color-surface-hover)',
              color: newlyStarred && !relisting ? FAV_COLOR : 'var(--color-text-muted)',
              border: `1px solid ${newlyStarred && !relisting
                ? `color-mix(in srgb, ${FAV_COLOR} 45%, transparent)`
                : 'transparent'}`,
              fontWeight: 600,
              cursor: newlyStarred && !relisting ? 'pointer' : 'not-allowed',
            }}
          >
            <StarIcon size={IconSize.action} filled={!newlyStarred} />
            Add {newlyStarred || ''} to favourites
          </button>
        </div>
      )}

      {/* Where the files went. Worth a persistent line rather than a toast —
          the path is the thing you need next, and a toast takes it away. */}
      {exportState?.phase === 'done' && (
        <div className="flex items-center gap-3 mx-4 mt-3 px-4 py-3 rounded-lg flex-shrink-0 text-[11.5px]"
             style={{
               background: `color-mix(in srgb, ${OK} 10%, var(--color-surface))`,
               border: `1px solid color-mix(in srgb, ${OK} 30%, transparent)`,
               color: OK,
             }}>
          <FolderExportIcon size={IconSize.item} strokeWidth={1.8} />
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

      {/*
        Right-clicking the background asks what should be in the list.

        It used to raise the editor's own Copy / Select All, which is a menu
        about text on a screen with no text in it. The filter was a segmented
        control in the toolbar, where it sat next to seven other controls and
        was the only one most people never touch — so it moves here, to the
        empty space that had nothing to offer.

        Marked rather than handled: `useSurfaceMenu` in K8sPanel walks up from
        whatever was clicked to the nearest `data-menu`, which is how every
        other panel in the app does this.
      */}
      <div className="flex-1 overflow-auto px-4 pt-3 pb-4" data-menu="pod-grid">
        {!pods.length ? (
          /*
            A column, not a row.

            Every branch below is two blocks — the loader and the kubectl line
            under it — and a plain `flex` laid them side by side, then centred
            the PAIR. So the spinner sat left of centre with the command beside
            it, which is neither of the two things it should look like. The
            command belongs *below* the loader, and the loader belongs in the
            middle of the space.
          */
          <div className="flex flex-col items-center justify-center h-full" style={{ paddingBottom: '14%' }}>
            {/*
              WatchStatus has no failure state — idle, connected, reconnecting,
              stopped — so a watch that never comes up stays 'idle' and this
              said "Loading pods…" for as long as the tab was open. Silence is
              not a state the reader can act on; after the host's own timeouts
              have had their chance, it becomes one.
            */}
            {/* A retry replaces the report of the last failure rather than
                sitting under it: the same rule as the pickers, and the reason
                is the same — when the answer is the same failure, nothing on
                screen changes and the button looks dead. */}
            {relisting ? (
              <>
              <LoadingStateView
                icon={<Dk8sIcon size={IconSize.hero} />}
                medallionSize={84}
                messageWidth="72ch"
                title="Reaching the cluster"
                message="Checking the API server answers, then opening the watch again."
                accentColor={ACCENT}
                slowAfterSeconds={8}
                slowMessage="Taking longer than usual. A cluster in another region, or one behind a VPN that is not up, answers in seconds rather than milliseconds."
              />
              <RunningCommand />
              </>
            ) : watchNeverCame ? (
              <div className="flex flex-col items-center gap-2 text-center px-4">
                <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-warning)' }}>
                  {listFailed ? 'The cluster refused the pod list' : 'No pods, and nothing back from the cluster'}
                </span>
                <span className="text-[11.5px]"
                      style={{ color: 'var(--color-text-muted)', maxWidth: '52ch', lineHeight: 1.6 }}>
                  {listFailed
                    ? watchDetail
                    : `Nothing has come back in ${clusterTimeoutSeconds + 8} seconds — longer than `
                      + 'the wait dk8s allows a cluster call, so the answer is not simply late. A '
                      + 'stopped cluster or a VPN that is not up looks like this; a namespace that '
                      + 'is genuinely empty says so instead. The wait is yours to change in '
                      + 'Settings → DK8S → General.'}
                </span>
                {/* What it opened and what came back — the whole point of the
                    complaint this state exists for. */}
                <RunningCommand match="get pods" mode="settled" />
                <ButtonView label="Try again" size="sm" variant="secondary"
                            onClick={() => {
                              /* Clears the local verdict too — without this the
                                 backstop stays fired and the failure comes back
                                 the instant the probe ends, whatever it found.
                                 The host's own verdict clears when the watch
                                 reports again. */
                              setHeardNothing(false);
                              useK8sStore.getState().probe();
                            }} />
              </div>
            ) : (
              watchStatus === 'connected' ? (
                /* Connected and genuinely empty is not a wait — it is an
                   answer, and it gets the empty state rather than a loader. */
                <span className="text-[12px] text-[var(--color-text-muted)]">
                  No pods in this namespace.
                </span>
              ) : (
                <>
                <LoadingStateView
                  /* Panel-filling, like the file browser's. A 22px glyph
                     centred in an empty grid reads as something that failed to
                     load rather than as the thing being waited for. */
                  icon={<Dk8sIcon size={IconSize.hero} />}
                  medallionSize={84}
                  messageWidth="72ch"
                  title={watchStatus === 'reconnecting' ? 'Reconnecting to the cluster' : 'Reading pods'}
                  message={watchStatus === 'reconnecting'
                    ? 'The watch dropped. Picking it up from where it left off.'
                    : 'Opening a watch, so the grid updates as pods change rather than on a timer.'}
                  accentColor={ACCENT}
                  slowAfterSeconds={8}
                  slowMessage="Taking longer than usual. A cluster in another region, or one behind a VPN, answers in seconds rather than milliseconds."
                />
                  <RunningCommand match="get pods" />
                </>
              )
            )}
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
              /* The filter is echoed in the match colour, so the reader can
                 see the typo without looking back up at the box. */
              <div className="grid place-items-center px-8 py-10">
                <EmptyStateView
                  variant="medallion"
                  icon={<SearchIcon size={IconSize.medallion} />}
                  title="No pod matches"
                  message="Nothing in the namespaces being watched has that in its name."
                  accentColor={MUTED}
                  hints={[
                    { key: <SearchIcon size={IconSize.action} />,
                      text: (
                        <span>
                          filtering on{' '}
                          <span className="font-mono" style={{ color: MATCH, fontWeight: 600 }}>
                            {filter}
                          </span>
                        </span>
                      ) as unknown as string },
                    { key: <LayersIcon size={IconSize.action} />,
                      text: 'a pod in another namespace needs that namespace watched' },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {pvCheck && <PvCheckModal pod={pvCheck} onClose={() => setPvCheck(undefined)} />}

      <PodContextMenu
        pod={menu?.pod}
        at={menu?.at}
        onClose={closeMenu}
        onConfirmUnfavorite={setUnstar}
        onTestPv={setPvCheck}
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
