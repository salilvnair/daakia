/**
 * What each thread was doing, over time.
 *
 * A thread dump is one instant, so it can say ten workers are blocked and
 * cannot say whether they blocked together. A recording carries every wait
 * with a start and a duration, and laid out as lanes on a shared clock the
 * difference is immediate: threads that block *within milliseconds of each
 * other* are queueing on one lock, and threads that block at random are simply
 * busy. Those two need opposite fixes, and no other view separates them.
 *
 * The lanes are drawn from wait events rather than sampled states, so a bar is
 * a fact — this thread was blocked on that monitor from here to here — rather
 * than an interpolation between samples.
 */
import { useMemo, useState } from 'react';

export interface WaitSpan {
  thread: string;
  kind: 'monitor' | 'wait' | 'park' | 'socket' | 'file';
  target: string;
  startMs: number;
  durationMs: number;
}

const KIND_COLOUR: Record<WaitSpan['kind'], string> = {
  monitor: 'var(--color-error)',
  wait: 'var(--color-dk8s)',
  park: 'var(--color-warning)',
  socket: 'var(--color-protocol-graphql, #e535ab)',
  file: 'var(--color-success)',
};

const KIND_LABEL: Record<WaitSpan['kind'], string> = {
  monitor: 'blocked on a lock', wait: 'waiting', park: 'parked',
  socket: 'socket', file: 'file',
};

const LANE_H = 20;
const LABEL_W = 168;

function ms(v: number): string {
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`;
}

export function ThreadHistory({ spans, fromMs, toMs }: {
  spans: WaitSpan[];
  fromMs: number;
  toMs: number;
}) {
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const span = Math.max(1, toMs - fromMs);

  /*
    Threads ordered by how long they spent waiting.

    Alphabetical would scatter the interesting ones through a list of idle
    housekeeping threads; the ones that waited most are the reason anyone
    opened this.
  */
  const lanes = useMemo(() => {
    const byThread = new Map<string, WaitSpan[]>();
    for (const s of spans) {
      const list = byThread.get(s.thread);
      if (list) list.push(s); else byThread.set(s.thread, [s]);
    }
    return [...byThread]
      .map(([thread, items]) => ({
        thread, items,
        total: items.reduce((a, s) => a + s.durationMs, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 24);
  }, [spans]);

  if (!lanes.length) {
    return (
      <div className="px-2 py-6 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        No thread waited long enough to be recorded. Nothing was queueing.
      </div>
    );
  }

  const kinds = [...new Set(spans.map(s => s.kind))];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          {lanes.length} thread{lanes.length === 1 ? '' : 's'} that waited, over {ms(span)}
        </span>
        <span className="flex-1" />
        {kinds.map(k => (
          <span key={k} className="flex items-center gap-1.5 text-[10px]"
                style={{ color: 'var(--color-text-muted)' }}>
            <span style={{ width: 9, height: 6, borderRadius: 2, background: KIND_COLOUR[k] }} />
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>

      <div
        style={{ position: 'relative', userSelect: 'none' }}
        onMouseLeave={() => setHoverMs(null)}
        onMouseMove={e => {
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const x = e.clientX - box.left - LABEL_W;
          const w = box.width - LABEL_W;
          setHoverMs(x < 0 || w <= 0 ? null : fromMs + (x / w) * span);
        }}
      >
        {lanes.map(lane => (
          <div key={lane.thread} className="flex items-center" style={{ height: LANE_H }}>
            <span className="text-[10.5px] font-mono truncate shrink-0 pr-2"
                  style={{ width: LABEL_W, color: 'var(--color-text-secondary)' }}
                  title={`${lane.thread} — ${ms(lane.total)} waiting`}>
              {lane.thread}
            </span>
            <span style={{
              position: 'relative', flex: 1, height: 9, borderRadius: 3,
              background: 'var(--color-surface-hover)',
            }}>
              {lane.items.map((s, i) => {
                const left = ((s.startMs - fromMs) / span) * 100;
                const width = (s.durationMs / span) * 100;
                return (
                  <span
                    key={i}
                    title={`${s.target} — ${ms(s.durationMs)}`}
                    style={{
                      position: 'absolute', top: 0, height: '100%', borderRadius: 2,
                      left: `${Math.max(0, Math.min(100, left))}%`,
                      // A sub-pixel bar is invisible; a wait that happened has
                      // to leave a mark or the lane lies by omission.
                      width: `${Math.max(0.35, Math.min(100 - left, width))}%`,
                      background: KIND_COLOUR[s.kind],
                      opacity: 0.85,
                    }}
                  />
                );
              })}
            </span>
          </div>
        ))}

        {/* One crosshair across every lane: the whole point is reading down a
            moment and seeing who was blocked at the same instant. */}
        {hoverMs !== null && (
          <span style={{
            position: 'absolute', top: 0, bottom: 0, width: 1,
            left: `calc(${LABEL_W}px + ${((hoverMs - fromMs) / span) * 100}% - ${LABEL_W * ((hoverMs - fromMs) / span)}px)`,
            background: 'var(--color-text-muted)', opacity: 0.7, pointerEvents: 'none',
          }} />
        )}
      </div>

      <div className="flex items-center justify-between text-[10px]"
           style={{ color: 'var(--color-text-muted)', paddingLeft: LABEL_W }}>
        <span>0s</span>
        <span>
          {hoverMs === null
            ? 'threads blocking together are queueing on one lock; blocking at random is load'
            : `${((hoverMs - fromMs) / 1000).toFixed(2)}s`}
        </span>
        <span>{(span / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}
