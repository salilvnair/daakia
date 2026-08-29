/**
 * The pod grid — the screen people look at.
 *
 * Two rules do most of the work. Colour means status and nothing else, so a
 * failing pod is findable from across the room. And healthy pods recede —
 * smaller, quieter cards, because thirteen of them are not what you came for
 * and giving them equal weight is how a dashboard becomes a wall.
 *
 * They recede by weight, not by shape: "cards" has to mean cards throughout,
 * so the quiet ones stay cards rather than turning into list rows.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SparklineView, SearchInputView } from '@salilvnair/dui';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import {
  sortPods, severityOf, severityColor, matchesFilter, shortAge,
  formatBytes, formatCpu, restartLabel, pulse, isRecentRestart,
  type Severity,
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
  const quiet = severity === 'quiet';
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span style={{ width: 6, height: 6, borderRadius: 3, background: color, opacity: quiet ? 0.75 : 1 }} />
      <span className="text-[11.5px] font-medium"
            style={{ color: quiet ? 'var(--color-text-muted)' : color }}>
        {label}
      </span>
      <span className="text-[10.5px] font-mono text-[var(--color-text-muted)] tabular-nums">
        {pod.ready.current}/{pod.ready.total}
      </span>
      <span className="text-[10.5px] font-mono text-[var(--color-text-muted)]">
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
        border: `1px solid ${quiet ? 'var(--color-surface-border)' : `color-mix(in srgb, ${color} 40%, var(--color-surface-border))`}`,
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
              style={{ color: recent ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
          {pod.restarts ? `↻ ${restartLabel(pod)}` : usage ? `${formatBytes(usage.memBytes)} · ${formatCpu(usage.cpuMilli)}` : ''}
        </span>
        {/* A trend needs at least two samples to mean anything. */}
        {history && history.length > 1 && (
          <SparklineView data={history} width={72} height={18} color={color} filled />
        )}
      </div>
    </button>
  );
}

/**
 * A healthy pod, as a smaller quieter card.
 *
 * The first version rendered these as list rows, which made "cards" mean two
 * different shapes on one screen. Healthy pods should recede by WEIGHT — less
 * contrast, less height, no status text — not by becoming a different kind of
 * object.
 */
function QuietCard({ pod, onOpen }: { pod: PodSummary; onOpen: () => void }) {
  const usage = useK8sStore(s => s.usage[pod.name]);
  const history = useK8sStore(s => s.usageHistory[pod.name]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-1 p-2.5 rounded-lg text-left cursor-pointer transition-colors relative overflow-hidden"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        opacity: 0.86,
        minWidth: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '0.86'; e.currentTarget.style.background = 'var(--color-surface)'; }}
    >
      <span style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: 'var(--color-method-get)', opacity: 0.5,
      }} />

      <div className="flex items-center gap-2 pl-2 min-w-0">
        <span className="text-[11px] font-mono truncate flex-1 min-w-0 text-[var(--color-text-secondary)]"
              title={pod.name}>
          {pod.name}
        </span>
        <span className="text-[10px] font-mono text-[var(--color-text-muted)] tabular-nums flex-shrink-0">
          {pod.ready.current}/{pod.ready.total}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 pl-2 min-w-0">
        <span className="text-[10px] font-mono text-[var(--color-text-muted)] truncate">
          {usage ? formatBytes(usage.memBytes) : (pod.workload?.name ?? pod.node ?? '')}
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {history && history.length > 1 && (
            <SparklineView data={history} width={56} height={14} color="var(--color-method-get)" filled />
          )}
          <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
            {shortAge(pod.startedAt)}
          </span>
        </span>
      </div>
    </button>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

function PodTable({ pods, onOpen }: { pods: PodSummary[]; onOpen: (p: PodSummary) => void }) {
  const usage = useK8sStore(s => s.usage);
  const metrics = useK8sStore(s => s.metricsAvailable);
  return (
    <div className="overflow-auto">
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Pod', 'Status', 'Ready', '↻', 'Age', 'Node', ...(metrics ? ['Memory', 'CPU'] : [])].map(h => (
              <th key={h}
                  className="text-[9.5px] uppercase tracking-wider text-left font-semibold px-3 py-1.5 text-[var(--color-text-muted)]"
                  style={{ borderBottom: '1px solid var(--color-surface-border)', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pods.map(pod => {
            const sev = severityOf(pod);
            const color = severityColor(sev);
            const u = usage[pod.name];
            return (
              <tr key={pod.uid}
                  onClick={() => onOpen(pod)}
                  className="cursor-pointer transition-colors"
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <td className="text-[11px] font-mono px-3 py-1.5 text-[var(--color-text-primary)]"
                    style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                  <span style={{
                    display: 'inline-block', width: 5, height: 5, borderRadius: 3,
                    background: color, opacity: sev === 'quiet' ? 0.6 : 1, marginRight: 8,
                  }} />
                  {pod.name}
                </td>
                <td className="text-[11px] px-3 py-1.5" style={{ borderBottom: '1px solid var(--color-surface-border)', color: sev === 'quiet' ? 'var(--color-text-muted)' : color }}>
                  {pod.reason || pod.phase}
                </td>
                <td className="text-[11px] font-mono px-3 py-1.5 tabular-nums text-[var(--color-text-secondary)]" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                  {pod.ready.current}/{pod.ready.total}
                </td>
                <td className="text-[11px] font-mono px-3 py-1.5 tabular-nums" style={{ borderBottom: '1px solid var(--color-surface-border)', color: isRecentRestart(pod) ? 'var(--color-warning)' : 'var(--color-text-muted)' }}
                    title={restartLabel(pod)}>
                  {pod.restarts}
                </td>
                <td className="text-[11px] font-mono px-3 py-1.5 text-[var(--color-text-muted)]" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                  {shortAge(pod.startedAt)}
                </td>
                <td className="text-[11px] font-mono px-3 py-1.5 text-[var(--color-text-muted)] truncate" style={{ borderBottom: '1px solid var(--color-surface-border)', maxWidth: 160 }}>
                  {pod.node ?? '—'}
                </td>
                {metrics && (
                  <>
                    <td className="text-[11px] font-mono px-3 py-1.5 tabular-nums text-[var(--color-text-secondary)]" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                      {formatBytes(u?.memBytes)}
                    </td>
                    <td className="text-[11px] font-mono px-3 py-1.5 tabular-nums text-[var(--color-text-secondary)]" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
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

// ── The grid ────────────────────────────────────────────────────────────────

export function PodGrid() {
  const { pods, filter, view, setFilter, setView, startWatch, selectPod, watchStatus } = useK8sStore();
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
  const attention = visible.filter(p => severityOf(p, now) !== 'quiet');
  const quiet = visible.filter(p => severityOf(p, now) === 'quiet');

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
          <div className="flex flex-col gap-4">
            {attention.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  Needs attention first
                </span>
                <div className="grid gap-2.5"
                     style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                  {attention.map(p => (
                    <PodCard key={p.uid} pod={p} onOpen={() => selectPod(p.name)} />
                  ))}
                </div>
              </div>
            )}

            {quiet.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  Healthy · {quiet.length}
                </span>
                <div className="grid gap-2"
                     style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                  {quiet.map(p => (
                    <QuietCard key={p.uid} pod={p} onOpen={() => selectPod(p.name)} />
                  ))}
                </div>
              </div>
            )}

            {!visible.length && (
              <span className="text-[12px] text-[var(--color-text-muted)] py-6 text-center">
                No pod matches “{filter}”.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
