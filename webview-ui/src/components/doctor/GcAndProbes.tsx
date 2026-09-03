/**
 * Garbage collections, and what the process talked to.
 *
 * Both are tables rather than charts because both are lists of discrete events
 * with several dimensions each, and a chart of "pause over time" hides the two
 * columns that decide what to do about it: the cause, and the heap either side.
 *
 * A 1,204 ms pause is a fact. "1,204 ms, Allocation Failure, 192 → 190 MB" is
 * a diagnosis — the collection ran, took over a second, and freed two
 * megabytes, so the heap is too small or something is holding it.
 */
import { useState } from 'react';

export interface GcRow {
  gcId: number;
  atMs: number;
  name: string;
  cause: string;
  pauseMs: number;
  longestPauseMs: number;
  heapBeforeBytes?: number;
  heapAfterBytes?: number;
  phases: { name: string; ms: number }[];
}

export interface GcSummary {
  count: number;
  totalPauseMs: number;
  maxPauseMs: number;
  pausePercent: number;
  byCause: { cause: string; count: number; totalMs: number; maxMs: number }[];
  byCollector: { name: string; count: number; totalMs: number }[];
  rows: GcRow[];
}

export interface ProbeSite {
  kind: 'monitor' | 'wait' | 'park' | 'socket' | 'file';
  target: string;
  site: string;
  count: number;
  totalMs: number;
  maxMs: number;
  threads: { name: string; count: number; totalMs: number }[];
}

function bytes(v?: number): string {
  if (v === undefined) return '—';
  if (v < 1024) return `${Math.round(v)} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(0)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(0)} MB`;
  return `${(v / 1024 ** 3).toFixed(1)} GB`;
}

function ms(v: number): string {
  return v < 1 ? `${v.toFixed(2)} ms` : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`;
}

function clock(atMs: number): string {
  const d = new Date(atMs);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ── Garbage collections ─────────────────────────────────────────────────────

/**
 * A pause worth reading about.
 *
 * Under a few milliseconds a young collection is doing its job, and a table of
 * three hundred of them buries the one that was not. The long ones are shown
 * first and the rest counted, rather than paginated away silently.
 */
const NOTABLE_MS = 10;

export function GcView({ gc }: { gc: GcSummary }) {
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (!gc?.count) {
    return (
      <div className="px-2 py-6 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        No collection ran during this recording. For a short recording of a
        steady application that is the expected answer, not a missing measurement.
      </div>
    );
  }

  const notable = gc.rows.filter(r => r.pauseMs >= NOTABLE_MS);
  const rows = showAll ? gc.rows : (notable.length ? notable : gc.rows.slice(0, 25));
  const hidden = gc.rows.length - rows.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[22px] font-semibold tabular-nums"
              style={{ color: 'var(--color-text-primary)' }}>{gc.count.toLocaleString()}</span>
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          collections, {ms(gc.totalPauseMs)} of total pause
        </span>
        {/* The number that decides whether GC is worth reading about at all. */}
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          · {gc.pausePercent.toFixed(2)}% of the recording spent stopped, longest {ms(gc.maxPauseMs)}
        </span>
      </div>

      <div className="flex items-center gap-3 px-2 py-1 text-[9.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text-muted)' }}>
        <span style={{ width: 60 }}>time</span>
        <span style={{ width: 96 }}>type</span>
        <span style={{ width: 74 }}>pause</span>
        <span style={{ width: 118 }}>heap after</span>
        <span>cause</span>
      </div>

      {rows.map(r => {
        const isOpen = open === r.gcId;
        const slow = r.pauseMs >= 100;
        return (
          <div key={r.gcId} className="rounded-md"
               style={{ background: isOpen ? 'var(--color-surface)' : undefined }}>
            <button type="button"
                    className="w-full flex items-center gap-3 px-2 py-1 text-left rounded-md"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={() => setOpen(isOpen ? null : r.gcId)}>
              <span className="text-[11px] font-mono tabular-nums shrink-0"
                    style={{ width: 60, color: 'var(--color-text-muted)' }}>{clock(r.atMs)}</span>
              <span className="text-[11.5px] font-mono shrink-0"
                    style={{ width: 96, color: 'var(--color-dk8s)' }}>{r.name}</span>
              <span className="text-[11.5px] font-mono tabular-nums shrink-0"
                    style={{ width: 74, color: slow ? 'var(--color-error)' : 'var(--color-text-primary)' }}>
                {ms(r.pauseMs)}
              </span>
              <span className="text-[11px] font-mono tabular-nums shrink-0"
                    style={{ width: 118, color: 'var(--color-text-secondary)' }}>
                {r.heapBeforeBytes !== undefined
                  ? <>{bytes(r.heapBeforeBytes)} → {bytes(r.heapAfterBytes)}</>
                  : bytes(r.heapAfterBytes)}
              </span>
              <span className="text-[11px] font-mono truncate min-w-0 flex-1"
                    style={{ color: /allocation failure|full/i.test(r.cause)
                      ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
                {r.cause}
              </span>
            </button>

            {/* The phases. A long pause is a different problem depending on
                where inside it the time went. */}
            {isOpen && r.phases.length > 0 && (
              <div className="px-3 pb-2 flex items-center gap-3 flex-wrap text-[10.5px] font-mono"
                   style={{ color: 'var(--color-text-muted)' }}>
                {r.phases.map((p, i) => (
                  <span key={i}>├ {p.name} {ms(p.ms)}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(true)}
                style={{
                  alignSelf: 'flex-start', font: 'inherit', fontSize: 11, cursor: 'pointer',
                  background: 'transparent', border: 'none', color: 'var(--color-dk8s)', padding: '2px 0',
                }}>
          {hidden.toLocaleString()} more collections paused under {NOTABLE_MS} ms — show them
        </button>
      )}
    </div>
  );
}

// ── Probes ──────────────────────────────────────────────────────────────────

/**
 * Sockets and files, grouped by the thing they talk to.
 *
 * JProfiler's JDBC probe needs bytecode injection to see the SQL. A socket to
 * `postgres:5432` holding a four-second read answers most of the same question
 * — which dependency is slow, and how slow — and it costs nothing, because the
 * JVM already records it.
 */
export function ProbesView({ sites, hasRecording }: {
  sites: ProbeSite[]; hasRecording: boolean;
}) {
  const io = (sites ?? []).filter(s => s.kind === 'socket' || s.kind === 'file');

  if (!io.length) {
    return (
      <div className="px-2 py-6 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        {/*
          Two different answers, and they must not read the same. A recording
          with no socket events is an application that did no I/O worth
          recording; no recording at all is a question that was never asked.
        */}
        {hasRecording
          ? <>This application did no socket or file I/O slow enough to be recorded.
              JFR only writes these above a threshold, so brief reads leave no trace —
              an application that talks to a fast local database will show nothing here.</>
          : <>Open a recording to see what the process talked to.</>}
      </div>
    );
  }

  const worst = Math.max(...io.map(s => s.maxMs), 1);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          {io.length} endpoint{io.length === 1 ? '' : 's'}, grouped by what they talk to
        </span>
      </div>

      <div className="flex items-center gap-3 px-2 py-1 text-[9.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex-1">endpoint</span>
        <span style={{ width: 70, textAlign: 'right' }}>events</span>
        <span style={{ width: 80, textAlign: 'right' }}>total wait</span>
        <span style={{ width: 74, textAlign: 'right' }}>max</span>
        <span style={{ width: 110 }} />
      </div>

      {io.map(s => (
        <div key={`${s.kind}:${s.target}:${s.site}`}
             className="flex items-center gap-3 px-2 py-1.5">
          <span className="text-[11.5px] font-mono truncate min-w-0 flex-1"
                style={{ color: 'var(--color-text-primary)' }}>
            {s.target}
            <span style={{ color: 'var(--color-text-muted)' }}> at {s.site}</span>
          </span>
          <span className="text-[11.5px] font-mono tabular-nums"
                style={{ width: 70, textAlign: 'right', color: 'var(--color-text-secondary)' }}>
            {s.count.toLocaleString()}
          </span>
          <span className="text-[11.5px] font-mono tabular-nums"
                style={{ width: 80, textAlign: 'right', color: 'var(--color-text-secondary)' }}>
            {ms(s.totalMs)}
          </span>
          <span className="text-[11.5px] font-mono tabular-nums"
                style={{
                  width: 74, textAlign: 'right',
                  color: s.maxMs >= 1000 ? 'var(--color-error)' : 'var(--color-text-primary)',
                }}>
            {ms(s.maxMs)}
          </span>
          {/* Lifetime as a length, so the slow dependency is visible without
              reading four numbers. */}
          <span style={{ width: 110 }}>
            <span style={{
              display: 'block', height: 5, borderRadius: 3,
              background: 'var(--color-surface-hover)', overflow: 'hidden',
            }}>
              <span style={{
                display: 'block', height: '100%', borderRadius: 3,
                width: `${Math.max(3, (s.maxMs / worst) * 100)}%`,
                background: s.maxMs >= 1000 ? 'var(--color-error)' : 'var(--color-success)',
              }} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
