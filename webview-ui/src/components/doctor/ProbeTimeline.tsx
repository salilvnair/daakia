/**
 * What the process talked to, and WHEN.
 *
 * The probes table totals each endpoint: how many calls, how many bytes, the
 * slowest one. That answers "which dependency is expensive" and hides the two
 * things that decide what to do about it.
 *
 * The first is shape. Four hundred calls spread evenly across thirty seconds
 * is a service doing its job; four hundred in one burst is a retry storm, an
 * N+1, or a cache that just expired — same total, same average, completely
 * different bug. A table cannot tell them apart and a timeline cannot hide it.
 *
 * The second is coincidence. When the slow call to one endpoint lines up with
 * a burst on another, the second is usually causing the first, and reading
 * down a shared clock is the only way that shows up.
 *
 * Lanes are per ENDPOINT rather than per thread — the thread lanes already
 * exist in Thread history, and the question here is about dependencies.
 */
import { useMemo, useState } from 'react';

export interface WaitSpan {
  thread: string;
  kind: 'monitor' | 'wait' | 'park' | 'socket' | 'file';
  target: string;
  startMs: number;
  durationMs: number;
}

const LANE_H = 22;
const LABEL_W = 210;

const KIND_COLOUR = {
  socket: 'var(--color-protocol-graphql, #e535ab)',
  file: 'var(--color-success)',
} as const;

function ms(v: number): string {
  return v < 1 ? `${v.toFixed(2)} ms` : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`;
}

/**
 * `postgres:5432 read` and `postgres:5432 write` are one endpoint.
 *
 * The direction matters in the table, where it is a column. On a timeline it
 * doubles the lanes and splits a conversation with one dependency across two
 * rows that have to be read together.
 */
function endpointOf(target: string): string {
  return target.replace(/\s+(read|write)$/, '');
}

export function ProbeTimeline({ spans, fromMs, toMs }: {
  spans: WaitSpan[];
  fromMs: number;
  toMs: number;
}) {
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const span = Math.max(1, toMs - fromMs);

  const lanes = useMemo(() => {
    const io = spans.filter(s => s.kind === 'socket' || s.kind === 'file');
    const byEndpoint = new Map<string, WaitSpan[]>();
    for (const s of io) {
      const key = endpointOf(s.target);
      const list = byEndpoint.get(key);
      if (list) list.push(s); else byEndpoint.set(key, [s]);
    }
    return [...byEndpoint]
      .map(([endpoint, items]) => ({
        endpoint,
        items,
        kind: items[0].kind,
        total: items.reduce((a, s) => a + s.durationMs, 0),
        max: items.reduce((m, s) => Math.max(m, s.durationMs), 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 24);
  }, [spans]);

  if (!lanes.length) {
    return (
      <div className="px-2 py-6 text-[12px] leading-relaxed"
           style={{ color: 'var(--color-text-muted)', maxWidth: '44em' }}>
        {/*
          The same distinction the probes table draws: an application that did
          no recorded I/O, versus one whose I/O was too fast to record. Neither
          is a fault, and saying "no data" for both would hide which.
        */}
        No socket or file activity was recorded, so there is no timeline to
        draw. JFR writes these events above a threshold, so an application that
        talks only to something very fast leaves no trace here.
      </div>
    );
  }

  const busiest = Math.max(...lanes.map(l => l.items.length), 1);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap px-1">
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          {lanes.length} endpoint{lanes.length === 1 ? '' : 's'} over {(span / 1000).toFixed(1)} s
        </span>
        <span className="flex-1" />
        {[...new Set(lanes.map(l => l.kind))].map(k => (
          <span key={k} className="flex items-center gap-1.5 text-[10px]"
                style={{ color: 'var(--color-text-muted)' }}>
            <span style={{ width: 9, height: 6, borderRadius: 2, background: KIND_COLOUR[k as 'socket' | 'file'] }} />
            {k}
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
          <div key={lane.endpoint} className="flex items-center" style={{ height: LANE_H }}>
            <span className="text-[10.5px] font-mono truncate shrink-0 pr-2"
                  style={{ width: LABEL_W, color: 'var(--color-text-secondary)' }}
                  title={`${lane.endpoint} — ${lane.items.length.toLocaleString()} calls, ${ms(lane.total)} total, slowest ${ms(lane.max)}`}>
              {lane.endpoint}
            </span>

            <span style={{
              position: 'relative', flex: 1, height: 10, borderRadius: 3,
              background: 'var(--color-surface-hover)',
            }}>
              {lane.items.map((s, i) => {
                const left = ((s.startMs - fromMs) / span) * 100;
                const width = (s.durationMs / span) * 100;
                return (
                  <span
                    key={i}
                    title={`${s.target} — ${ms(s.durationMs)} on ${s.thread}`}
                    style={{
                      position: 'absolute', top: 0, height: '100%', borderRadius: 2,
                      left: `${Math.max(0, Math.min(100, left))}%`,
                      /*
                        A floor, because these are the calls that matter least
                        individually and most in aggregate: a 0.3 ms read is a
                        sub-pixel bar, and four hundred of them rounding to
                        nothing is a lane that looks idle while the process
                        hammers a database.
                      */
                      width: `${Math.max(0.3, Math.min(100 - left, width))}%`,
                      background: KIND_COLOUR[s.kind as 'socket' | 'file'],
                      opacity: 0.85,
                    }}
                  />
                );
              })}
            </span>

            <span className="text-[10px] font-mono tabular-nums shrink-0 pl-2"
                  style={{ width: 62, textAlign: 'right', color: 'var(--color-text-muted)' }}>
              {lane.items.length.toLocaleString()} ×
            </span>
            <span className="text-[10px] font-mono tabular-nums shrink-0 pl-2"
                  style={{
                    width: 62, textAlign: 'right',
                    color: lane.max >= 1000 ? 'var(--color-error)' : 'var(--color-text-secondary)',
                  }}>
              {ms(lane.max)}
            </span>
          </div>
        ))}

        {hoverMs !== null && (
          <span style={{
            position: 'absolute', top: 0, bottom: 0, width: 1,
            left: `calc(${LABEL_W}px + (100% - ${LABEL_W + 124}px) * ${(hoverMs - fromMs) / span})`,
            background: 'var(--color-text-muted)', opacity: 0.7, pointerEvents: 'none',
          }} />
        )}
      </div>

      <div className="flex items-center justify-between text-[10px]"
           style={{ color: 'var(--color-text-muted)', paddingLeft: LABEL_W, paddingRight: 124 }}>
        <span>0s</span>
        <span>
          {hoverMs === null
            ? busiest > 20
              ? 'calls bunched together are a retry loop or an N+1; spread evenly is steady work'
              : 'read down a moment to see which dependencies were busy at once'
            : `${((hoverMs - fromMs) / 1000).toFixed(2)}s`}
        </span>
        <span>{(span / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}
