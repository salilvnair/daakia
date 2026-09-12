/**
 * Who holds the lock, and who is stuck behind it.
 *
 * A thread list can say seven threads are BLOCKED. It cannot say they are all
 * blocked on the *same* monitor, and it cannot say what the thread holding
 * that monitor is doing — which is the only question worth asking, because the
 * fix depends entirely on the answer.
 *
 * The shape is the finding. One owner on the left, the monitor in the middle,
 * the waiters fanned out on the right: the moment there is more than one
 * waiter, the picture says "queue" without a word of explanation. And when the
 * owner is itself blocked — on a socket, say — the graph has told you the
 * whole story: the lock is not slow, the thing holding it is waiting on the
 * network, and every thread behind it is paying for that.
 *
 * Drawn as SVG rather than a graph library because it is one fixed shape, and
 * a layout engine would be free to arrange it in ways that say less.
 */
import { AskChip } from './AskChip';

export interface LockGroup {
  /** The monitor's identity from the dump, e.g. `0x00000007c1a0`. */
  address: string;
  /** The declared type, when the dump gives one. */
  className?: string;
  owner?: { name: string; state: string; blockedOn?: string };
  /**
   * `blockedMs` is present only when the source can measure it.
   *
   * A SIGQUIT dump is one instant and carries no clock, so "blocked 4.1 s"
   * is not a number it can produce; a JFR recording carries every wait with a
   * duration and can. Showing the state alone where the duration is unknown is
   * the honest form — an invented elapsed time would be the worst kind of
   * plausible.
   */
  waiters: { name: string; state: string; blockedMs?: number }[];
}

function waitedFor(v: number): string {
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`;
}

const OWNER = 'var(--color-success)';
const MONITOR = 'var(--color-warning)';
const WAITER = 'var(--color-error)';
const MUTED = 'var(--color-text-muted)';

const ROW_H = 62;
const W = 900;

export function LocksGraph({ groups, deadlocks, onAsk }: {
  groups: LockGroup[];
  /** Cycles the JVM itself reported. */
  deadlocks?: number;
  /**
   * Explain one monitor. Omitted where no AI surface is wired, and the chip
   * simply does not render — a dead sparkle is worse than none.
   */
  onAsk?: (g: LockGroup) => void;
}) {
  const contended = groups.filter(g => g.waiters.length > 0);

  if (!contended.length) {
    return (
      <div className="px-2 py-6 text-[12px] leading-relaxed" style={{ color: MUTED }}>
        {/*
          "No contention" is a real answer and must not read like a missing
          feature. A dump where every monitor is held by exactly one thread and
          nobody is queueing is a healthy dump.
        */}
        No thread is waiting to enter a monitor. Locks are being held and released
        without anyone queueing behind them, which is what a healthy dump looks like.
        {deadlocks === 0 && <> The JVM reported no deadlock either.</>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          {contended.length} contended monitor{contended.length === 1 ? '' : 's'}
        </span>
        <span className="text-[11px]" style={{ color: deadlocks ? 'var(--color-error)' : MUTED }}>
          · {deadlocks ? `${deadlocks} deadlock cycle${deadlocks === 1 ? '' : 's'}` : 'no deadlock'}
        </span>
      </div>

      {contended.map(g => {
        const h = Math.max(160, 60 + g.waiters.length * ROW_H);
        const midY = h / 2;
        const monX = 360;
        const waitX = 610;
        const ownerBlocked = !!g.owner?.blockedOn;

        return (
          <div key={g.address} className="rounded-lg overflow-x-auto"
               style={{ border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
            {onAsk && (
              <div className="flex items-center gap-2 px-3 py-1.5"
                   style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                <span className="text-[10.5px] font-mono truncate min-w-0 flex-1"
                      style={{ color: 'var(--color-text-muted)' }}>
                  {g.className ?? g.address}
                </span>
                <AskChip onClick={() => onAsk(g)} />
              </div>
            )}
            <svg viewBox={`0 0 ${W} ${h}`} style={{ width: '100%', minWidth: 620, height: 'auto', display: 'block' }}
                 role="img"
                 aria-label={`${g.waiters.length} threads waiting to enter ${g.className ?? g.address}`
                   + (g.owner ? `, held by ${g.owner.name}` : ', with no owner in this dump')}>
              <defs>
                <marker id={`own-${g.address}`} viewBox="0 0 10 10" refX="10" refY="5"
                        markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={OWNER} />
                </marker>
                <marker id={`wait-${g.address}`} viewBox="0 0 10 10" refX="10" refY="5"
                        markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={WAITER} />
                </marker>
              </defs>

              {/* ── the owner ── */}
              {g.owner ? (
                <>
                  <rect x={24} y={midY - 30} width={252} height={60} rx={10}
                        fill="color-mix(in srgb, var(--color-success) 8%, var(--color-panel))"
                        stroke={OWNER} strokeWidth={1.6} />
                  <text x={44} y={midY - 6} fontSize={12.5} fontWeight={600}
                        fontFamily="ui-monospace, monospace" fill="var(--color-text-primary)">
                    {g.owner.name.slice(0, 26)}
                  </text>
                  <text x={44} y={midY + 14} fontSize={10.5} fontFamily="ui-monospace, monospace"
                        fill={ownerBlocked ? WAITER : MUTED}>
                    {ownerBlocked ? `holds it, ${g.owner.blockedOn}` : `holds it · ${g.owner.state.toLowerCase()}`}
                  </text>
                  <line x1={276} y1={midY} x2={monX - 6} y2={midY}
                        stroke={OWNER} strokeWidth={1.8} markerEnd={`url(#own-${g.address})`} />
                  <text x={(276 + monX) / 2} y={midY - 8} fontSize={10} textAnchor="middle" fill={OWNER}>owns</text>
                </>
              ) : (
                /* A monitor with waiters and no owner in the dump is worth
                   saying out loud — it usually means the holder is a thread
                   the dump did not capture. */
                <text x={44} y={midY} fontSize={11} fontFamily="ui-monospace, monospace" fill={MUTED}>
                  no owner in this dump
                </text>
              )}

              {/* ── the monitor ── */}
              <rect x={monX} y={midY - 30} width={200} height={60} rx={10}
                    fill="color-mix(in srgb, var(--color-warning) 8%, var(--color-panel))"
                    stroke={MONITOR} strokeWidth={2} />
              <text x={monX + 100} y={midY - 6} fontSize={12.5} fontWeight={700} textAnchor="middle"
                    fontFamily="ui-monospace, monospace" fill="var(--color-text-primary)">
                {(g.className ?? 'monitor').split('.').pop()}
              </text>
              <text x={monX + 100} y={midY + 14} fontSize={10} textAnchor="middle"
                    fontFamily="ui-monospace, monospace" fill={MUTED}>
                {g.address} · monitor
              </text>

              {/* ── the waiters ── */}
              {g.waiters.map((w, i) => {
                const y = midY - ((g.waiters.length - 1) * ROW_H) / 2 + i * ROW_H;
                return (
                  <g key={w.name}>
                    <path d={`M${monX + 200} ${midY} C ${monX + 250} ${midY}, ${waitX - 40} ${y}, ${waitX - 6} ${y}`}
                          fill="none" stroke={WAITER} strokeWidth={1.4} strokeDasharray="5 4"
                          markerEnd={`url(#wait-${g.address})`} opacity={0.85} />
                    <rect x={waitX} y={y - 21} width={256} height={42} rx={9}
                          fill="var(--color-panel)" stroke={WAITER} strokeWidth={1.3} />
                    <text x={waitX + 16} y={y - 3} fontSize={11.5} fontFamily="ui-monospace, monospace"
                          fill="var(--color-text-primary)">{w.name.slice(0, 26)}</text>
                    {/*
                      The thread's own state, not a hardcoded "blocked". A
                      waiter queued on a monitor via a timed entry is
                      TIMED_WAITING, and printing "blocked" for it states
                      something the dump does not say.
                    */}
                    <text x={waitX + 16} y={y + 13} fontSize={10} fontFamily="ui-monospace, monospace"
                          fill={WAITER}>
                      {w.state.toLowerCase().replace(/_/g, ' ')}
                      {w.blockedMs !== undefined && ` ${waitedFor(w.blockedMs)}`}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* The sentence the picture is making, for anyone who wants it
                stated rather than inferred. */}
            <div className="px-3 py-2 text-[11px]" style={{ color: MUTED, borderTop: '1px solid var(--color-surface-border)' }}>
              {ownerBlocked
                ? <>the owner is not slow — it is {g.owner!.blockedOn}, holding the lock while it waits</>
                : <>{g.waiters.length} thread{g.waiters.length === 1 ? '' : 's'} waiting to enter a monitor held by {g.owner?.name ?? 'a thread not in this dump'}</>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
