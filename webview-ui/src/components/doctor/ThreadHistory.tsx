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
 *
 * The gaps between those bars are drawn as running. That is an inference, not a
 * measurement: JFR emits no "this thread was runnable" event, so all we know is
 * that the thread was not in a wait we recorded. It is the right inference — a
 * lane of islands on an empty track reads as "mostly no data" when the truth is
 * "mostly working" — but it is labelled `not waiting` rather than `runnable`,
 * because the honest claim is the absence of a wait, not the presence of work.
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

/** The lane's ground: time this thread spent in no recorded wait. */
const RUNNING = 'var(--color-success)';

/**
 * Threads that blocked at nearly the same moment.
 *
 * This is the entire reason the view exists. Three workers going red within
 * 40 ms of each other is a lock; three going red at random across the window is
 * load, and the two need opposite fixes. Rather than leave the reader to spot
 * the alignment, find the tightest cluster of monitor blocks and mark it.
 */
const TOGETHER_MS = 250;

function coBlock(spans: WaitSpan[]): { atMs: number; threads: number; spreadMs: number } | undefined {
  const starts = spans
    .filter(s => s.kind === 'monitor')
    .sort((a, b) => a.startMs - b.startMs);
  if (starts.length < 2) return undefined;

  let best: { atMs: number; threads: number; spreadMs: number } | undefined;
  for (let i = 0; i < starts.length; i++) {
    const seen = new Set<string>();
    let j = i;
    while (j < starts.length && starts[j].startMs - starts[i].startMs <= TOGETHER_MS) {
      seen.add(starts[j].thread); j++;
    }
    // Distinct threads, not events: one thread blocking six times in a row on
    // the same lock is a retry loop, not a queue.
    if (seen.size >= 2 && (!best || seen.size > best.threads)) {
      best = {
        atMs: starts[i].startMs,
        threads: seen.size,
        spreadMs: starts[j - 1].startMs - starts[i].startMs,
      };
    }
  }
  return best;
}

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
  const together = coBlock(spans);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          {lanes.length} thread{lanes.length === 1 ? '' : 's'} that waited, over {ms(span)}
        </span>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5 text-[10px]"
              style={{ color: 'var(--color-text-muted)' }}>
          <span style={{ width: 9, height: 6, borderRadius: 2, background: RUNNING }} />
          not waiting
        </span>
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
            {/*
              The ground is `not waiting`, so a lane is always fully covered and
              a wait reads as an interruption of work rather than as the only
              thing that happened. Opacity keeps it quiet: it is the inferred
              state, and the measured ones should be what the eye lands on.
            */}
            <span style={{
              position: 'relative', flex: 1, height: 9, borderRadius: 3,
              background: RUNNING, opacity: 0.9,
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
                    }}
                  />
                );
              })}
            </span>
          </div>
        ))}

        {/*
          The moment itself, marked. The crosshair below is a tool the reader
          drives; this is the view stating where to look, which is the
          difference between a chart and a finding.
        */}
        {together && (
          <span style={{
            position: 'absolute', top: 0, bottom: 0, width: 2,
            left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${(together.atMs - fromMs) / span})`,
            background: 'var(--color-text-primary)', opacity: 0.42, pointerEvents: 'none',
          }} />
        )}

        {/* One crosshair across every lane: the whole point is reading down a
            moment and seeing who was blocked at the same instant. */}
        {hoverMs !== null && (
          <span style={{
            position: 'absolute', top: 0, bottom: 0, width: 1,
            left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${(hoverMs - fromMs) / span})`,
            background: 'var(--color-text-muted)', opacity: 0.7, pointerEvents: 'none',
          }} />
        )}
      </div>

      <div className="flex items-center justify-between text-[10px]"
           style={{ color: 'var(--color-text-muted)', paddingLeft: LABEL_W }}>
        <span>0s</span>
        <span>
          {hoverMs !== null
            ? `${((hoverMs - fromMs) / 1000).toFixed(2)}s`
            : together
              ? `${together.threads} threads block within ${Math.round(together.spreadMs)}ms of each other — that is a lock, not load`
              : 'no two threads blocked together — these waits are load, not a queue'}
        </span>
        <span>{(span / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}
