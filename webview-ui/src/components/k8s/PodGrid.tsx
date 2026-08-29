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
import { useEffect, useMemo, useRef, useState } from 'react';
import { SparklineView, SearchInputView } from '@salilvnair/dui';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import {
  sortPods, severityOf, severityColor, matchesFilter, shortAge,
  formatBytes, formatCpu, restartLabel, pulse, isRecentRestart, groupPods,
  type Severity, type PodGroup,
} from './pod-view';

const ACCENT = 'var(--color-dk8s)';

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

function Pulse({ pods }: { pods: PodSummary[] }) {
  const counts = useMemo(() => pulse(pods), [pods]);
  return (
    <div className="flex items-center gap-5 flex-wrap px-4 py-2.5 flex-shrink-0"
         style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">
        Namespace
      </span>
      <Stat n={counts.total} label="pods" />
      <Stat n={counts.ready} label="ready" color="var(--color-method-get)" />
      {counts.degraded > 0 && <Stat n={counts.degraded} label="degraded" color="var(--color-warning)" />}
      {counts.critical > 0 && <Stat n={counts.critical} label="failing" color="var(--color-error)" />}
      {counts.restartsLastHour > 0 && (
        <Stat n={counts.restartsLastHour} label="restarted in the last hour" color="var(--color-warning)" />
      )}
    </div>
  );
}

// ── Connection state ────────────────────────────────────────────────────────

/**
 * A watch dies quietly. If the grid keeps rendering the last thing it saw it
 * looks perfectly healthy while being completely stale, which is the worst
 * failure a live view can have — so the state is always on screen.
 */
function WatchIndicator() {
  const { watchStatus, watchDetail } = useK8sStore();
  const map: Record<string, { label: string; color: string }> = {
    idle: { label: 'starting', color: 'var(--color-text-muted)' },
    connected: { label: 'watching', color: 'var(--color-method-get)' },
    reconnecting: { label: 'reconnecting', color: 'var(--color-warning)' },
    stopped: { label: 'stopped', color: 'var(--color-text-muted)' },
  };
  const s = map[watchStatus] ?? map.idle;
  return (
    <span className="flex items-center gap-1.5 flex-shrink-0"
          title={watchDetail || 'live watch on this namespace'}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: s.color }} />
      <span className="text-[10.5px]" style={{ color: s.color }}>{s.label}</span>
    </span>
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

function PodCard({ pod, onOpen }: { pod: PodSummary; onOpen: () => void }) {
  const usage = useK8sStore(s => s.usage[pod.name]);
  const history = useK8sStore(s => s.usageHistory[pod.name]);
  const severity = severityOf(pod);
  const color = severityColor(severity);
  const quiet = severity === 'quiet';
  const recent = isRecentRestart(pod);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-1.5 p-3 rounded-lg text-left cursor-pointer transition-colors relative overflow-hidden"
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${quiet
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
        <span className="text-[11.5px] font-mono truncate text-[var(--color-text-primary)]"
              title={pod.name}>
          {pod.name}
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
        {/* A trend needs at least two samples to mean anything. */}
        {history && history.length > 1 && (
          <SparklineView data={history} width={72} height={18} color={color} filled />
        )}
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
function PodTable({ pods, onOpen }: { pods: PodSummary[]; onOpen: (p: PodSummary) => void }) {
  const usage = useK8sStore(s => s.usage);
  const metrics = useK8sStore(s => s.metricsAvailable);
  const multi = useK8sStore(s => s.targets.length > 1);

  const cols = [
    'Name', ...(multi ? ['Namespace'] : []), 'Ready', 'Status', '\u21bb', 'Node', 'Age',
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
                  onClick={() => onOpen(pod)}
                  className="cursor-pointer transition-colors"
                  style={{ background: rest }}
                  onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${ACCENT} 14%, transparent)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = rest; }}>
                <td className="text-[11.5px] font-mono px-3 py-1.5"
                    style={{ ...cell, fontWeight: failing ? 600 : 400 }}>
                  <span style={{
                    display: 'inline-block', width: 6, height: 6, borderRadius: 3,
                    background: color, opacity: failing ? 1 : 0.7, marginRight: 9,
                  }} />
                  {pod.name}
                </td>
                {multi && (
                  <td className="text-[11px] font-mono px-3 py-1.5" style={cell}>{pod.namespace}</td>
                )}
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

/**
 * One namespace's pods, boxed.
 *
 * The box exists because dk8s can watch several namespaces at once, and a flat
 * grid of forty cards drawn from four namespaces is unreadable. The tint
 * identifies the group and deliberately stays washed out: semantic colour
 * belongs to pod health, and a strong namespace colour would compete with the
 * one thing the grid must never make harder to find.
 */
function NamespaceGroup({ group, multi, onOpen }: {
  group: PodGroup; multi: boolean; onOpen: (p: PodSummary) => void;
}) {
  const failing = group.pods.filter(p => severityOf(p) !== 'quiet').length;

  return (
    <div className="flex flex-col gap-2 rounded-lg p-3"
         style={{ border: `1px solid ${group.tint.border}`, background: group.tint.wash }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono font-semibold tracking-wide"
              style={{ color: group.tint.label }}>
          {group.namespace}
        </span>
        {multi && group.context && (
          <span className="text-[9.5px] font-mono text-[var(--color-text-muted)]">
            {group.context}
          </span>
        )}
        <span className="flex-1" style={{ height: 1, background: group.tint.border }} />
        <span className="text-[9.5px] tabular-nums text-[var(--color-text-muted)]">
          {group.pods.length} pod{group.pods.length === 1 ? '' : 's'}
        </span>
        {failing > 0 && (
          <span className="text-[9.5px] font-semibold tabular-nums"
                style={{ color: 'var(--color-error)' }}>
            {failing} need{failing === 1 ? 's' : ''} attention
          </span>
        )}
      </div>

      <div className="grid gap-2.5"
           style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {group.pods.map(p => (
          <PodCard key={p.uid} pod={p} onOpen={() => onOpen(p)} />
        ))}
      </div>
    </div>
  );
}

// ── The grid ────────────────────────────────────────────────────────────────

export function PodGrid() {
  const { pods, filter, view, setFilter, setView, startWatch, selectPod, watchStatus, targets, capped } = useK8sStore();
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

  const visible = useMemo(
    () => sortPods(pods.filter(p => matchesFilter(p, filter)), now),
    [pods, filter, now],
  );
  const groups = useMemo(() => groupPods(visible, now), [visible, now]);
  const multiTarget = targets.length > 1;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <Pulse pods={pods} />

      <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <div ref={searchRef} style={{ maxWidth: 280, flex: 1 }}>
          <SearchInputView value={filter} onChange={setFilter} placeholder="Filter pods  ( / )" size="sm" />
        </div>
        <div className="flex-1" />
        <WatchIndicator />
        <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--color-surface-border)' }}>
          {(['cards', 'table'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className="text-[10.5px] px-2.5 py-1 cursor-pointer transition-colors"
              style={{
                background: view === v ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
                color: view === v ? ACCENT : 'var(--color-text-muted)',
                border: 'none',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {capped && (
        <div className="px-4 py-1.5 flex-shrink-0 text-[11px]"
             style={{
               background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
               color: 'var(--color-warning)',
               borderBottom: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)',
             }}>
          Watching {capped.watching} of {capped.requested} namespaces &mdash; dk8s holds at most{' '}
          {capped.max} live watches, because each one is a process against the API server.
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 py-3">
        {!pods.length ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-[var(--color-text-muted)]">
              {watchStatus === 'reconnecting' ? 'Reconnecting to the cluster…'
                : watchStatus === 'connected' ? 'No pods in this namespace.'
                : 'Loading pods…'}
            </span>
          </div>
        ) : view === 'table' ? (
          <PodTable pods={visible} onOpen={p => selectPod(p.name)} />
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map(g => (
              <NamespaceGroup key={g.key} group={g} multi={multiTarget}
                              onOpen={p => selectPod(p.name)} />
            ))}
            {!visible.length && (
              <span className="text-[12px] text-[var(--color-text-muted)] py-6 text-center">
                No pod matches &ldquo;{filter}&rdquo;.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
