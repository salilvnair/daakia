/**
 * HeapVerdictView — what you see first after a dump is parsed.
 *
 * Deliberately not a tree. MAT opens on a histogram and makes you go find the
 * leak; the point of this screen is that the diagnosis is already on it. Live
 * composition, then the suspects ranked by retained share, each naming the
 * container the memory actually sits in.
 *
 * Every number here is computed by the analysis engine. Nothing on this screen
 * comes from a model.
 */
import { useEffect, useState } from 'react';
import { postMsg } from '../../vscode';
import { MemoryIcon, StethoscopeIcon, CloseCircleIcon } from '../../icons';
import { ButtonView } from '@salilvnair/dui';
import { HeapHistogramView } from './HeapHistogramView';
import { HeapTreemapView } from './HeapTreemapView';
import { HeapGraphView } from './HeapGraphView';

const ACCENT = 'var(--color-doctor)';

interface Suspect {
  className: string;
  retainedBytes: number;
  retainedPercent: number;
  retainedObjects: number;
  accumulates?: { className: string; count: number };
  heldIn?: { className: string; retainedBytes: number };
  pathToRoot: { className: string; retainedBytes: number }[];
}

interface Verdict {
  liveBytes: number;
  liveObjects: number;
  unreachableObjects: number;
  unreachableBytes: number;
  suspects: Suspect[];
  topRetainedClasses: { className: string; retainedBytes: number; instances: number }[];
}

interface Summary {
  objects: number;
  classes: number;
  gcRoots: number;
  totalBytes: number;
  references: number;
  histogram: { name: string; instances: number; shallowBytes: number }[];
  verdict?: Verdict;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; name: string; pass: string; percent: number }
  | { kind: 'done'; name: string; summary: Summary }
  | { kind: 'error'; message: string };

/** Bytes at heap scale — always three significant figures so columns line up. */
function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

const PASS_LABEL: Record<string, string> = {
  A: 'Reading classes and objects',
  B: 'Counting references',
  C: 'Building the object graph',
  analyze: 'Computing dominators and retained sizes',
};

/** Severity by retained share — the same thresholds the suspect list uses. */
function severityColor(percent: number): string {
  if (percent >= 50) return 'var(--color-error)';
  if (percent >= 20) return 'var(--color-warning)';
  return ACCENT;
}

type SubView = 'verdict' | 'histogram' | 'treemap' | 'graph';

const SUB_VIEWS: { id: SubView; label: string }[] = [
  { id: 'verdict', label: 'Verdict' },
  { id: 'histogram', label: 'Histogram' },
  { id: 'treemap', label: 'Treemap' },
  { id: 'graph', label: 'Retention' },
];

export function HeapAnalyzerView() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [view, setView] = useState<SubView>('verdict');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'heap:started') {
        setView('verdict');
        setPhase({ kind: 'running', name: msg.name, pass: 'A', percent: 0 });
      } else if (msg?.type === 'heap:progress') {
        setPhase(p => p.kind === 'running'
          ? { ...p, pass: msg.pass, percent: msg.totalBytes ? (msg.bytesRead / msg.totalBytes) * 100 : p.percent }
          : p);
      } else if (msg?.type === 'heap:done') {
        setPhase({ kind: 'done', name: msg.name, summary: msg.summary });
      } else if (msg?.type === 'heap:cancelled') {
        setPhase({ kind: 'idle' });
      } else if (msg?.type === 'heap:error') {
        setPhase({ kind: 'error', message: msg.message });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Empty ──
  if (phase.kind === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <StethoscopeIcon size={40} strokeWidth={1} style={{ color: ACCENT, opacity: 0.4 }} />
        <p className="text-[13px] text-[var(--color-text-primary)] m-0">Analyze a heap dump</p>
        <p className="text-[12px] text-[var(--color-text-muted)] m-0 max-w-[420px] leading-relaxed">
          Open a <code>.hprof</code> file to get retained sizes, the dominator tree and ranked leak
          suspects. Parsing runs on this machine — nothing is uploaded.
        </p>
        <ButtonView
          variant="primary" size="sm"
          style={{ backgroundColor: ACCENT, borderColor: ACCENT, marginTop: 4 }}
          onClick={() => postMsg({ type: 'heap:open' })}
        >
          Open heap dump
        </ButtonView>
      </div>
    );
  }

  // ── Parsing ──
  if (phase.kind === 'running') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <MemoryIcon size={34} strokeWidth={1.2} style={{ color: ACCENT }} />
        <p className="text-[13px] text-[var(--color-text-primary)] m-0">{phase.name}</p>
        <p className="text-[11.5px] text-[var(--color-text-muted)] m-0">
          {PASS_LABEL[phase.pass] ?? 'Working'}…
        </p>
        <div style={{ width: 260, height: 4, borderRadius: 2, background: 'var(--color-surface-hover)', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, Math.max(2, phase.percent))}%`, height: '100%',
            background: ACCENT, transition: 'width 120ms linear',
          }} />
        </div>
        <ButtonView variant="secondary" size="sm" onClick={() => postMsg({ type: 'heap:cancel' })}>
          Cancel
        </ButtonView>
      </div>
    );
  }

  // ── Failed ──
  if (phase.kind === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <CloseCircleIcon size={32} style={{ color: 'var(--color-error)' }} />
        <p className="text-[13px] text-[var(--color-text-primary)] m-0">Could not analyze that dump</p>
        <p className="text-[12px] text-[var(--color-text-muted)] m-0 max-w-[460px] leading-relaxed">
          {phase.message}
        </p>
        <ButtonView variant="secondary" size="sm" onClick={() => setPhase({ kind: 'idle' })}>
          Try another file
        </ButtonView>
      </div>
    );
  }

  // ── Loaded ──
  const { summary, name } = phase;
  const v = summary.verdict;
  const liveBytes = v?.liveBytes ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Dump header + view switcher */}
      <div className="flex items-center gap-2.5 px-4 py-2 flex-wrap flex-shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <MemoryIcon size={15} style={{ color: ACCENT }} />
        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{name}</span>
        <span className="text-[11.5px] text-[var(--color-text-muted)] font-mono">
          {summary.objects.toLocaleString()} objects · {summary.references.toLocaleString()} refs
        </span>
        <div className="flex items-center gap-1 ml-2">
          {SUB_VIEWS.map(sv => (
            <button
              key={sv.id} type="button" onClick={() => setView(sv.id)}
              className="h-[24px] px-2.5 rounded-md text-[11.5px] cursor-pointer"
              style={{
                color: view === sv.id ? ACCENT : 'var(--color-text-secondary)',
                background: view === sv.id ? 'color-mix(in srgb, var(--color-doctor) 14%, transparent)' : 'transparent',
                border: `1px solid ${view === sv.id ? 'color-mix(in srgb, var(--color-doctor) 34%, transparent)' : 'transparent'}`,
              }}
            >
              {sv.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <ButtonView variant="secondary" size="sm" onClick={() => postMsg({ type: 'heap:open' })}>
          Open another
        </ButtonView>
      </div>

      {view === 'histogram' && <HeapHistogramView liveBytes={liveBytes} />}
      {view === 'treemap' && <HeapTreemapView />}
      {view === 'graph' && <HeapGraphView liveBytes={liveBytes} />}
      {view === 'verdict' && (
      <div className="flex flex-col gap-4 px-4 py-4 overflow-y-auto flex-1 min-h-0">

      {/* Composition */}
      {v && (
        <div className="rounded-lg p-3.5 flex flex-col gap-2.5"
             style={{ border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[22px] font-semibold text-[var(--color-text-primary)] tabular-nums">
              {bytes(v.liveBytes)}
            </span>
            <span className="text-[11.5px] text-[var(--color-text-muted)]">
              live across {v.liveObjects.toLocaleString()} objects
            </span>
            {v.unreachableObjects > 0 && (
              <span className="text-[11.5px] text-[var(--color-text-muted)]">
                · {bytes(v.unreachableBytes)} unreachable ({v.unreachableObjects.toLocaleString()} objects
                awaiting collection)
              </span>
            )}
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-hover)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${summary.totalBytes ? (v.liveBytes / summary.totalBytes) * 100 : 100}%`, background: ACCENT }} />
            <div style={{ width: `${summary.totalBytes ? 100 - (v.liveBytes / summary.totalBytes) * 100 : 0}%`, background: 'var(--color-text-muted)', opacity: 0.35 }} />
          </div>
        </div>
      )}

      {/* Suspects */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Leak suspects
        </span>
        {!v?.suspects.length && (
          <p className="text-[12px] text-[var(--color-text-muted)] m-0">
            No single object retains an outsized share of this heap. That usually means memory is
            spread evenly rather than accumulating in one place.
          </p>
        )}
        {v?.suspects.map((s, i) => (
          <div key={i} className="rounded-lg p-3.5 flex flex-col gap-2"
               style={{
                 border: '1px solid var(--color-surface-border)',
                 borderLeft: `3px solid ${severityColor(s.retainedPercent)}`,
                 background: 'var(--color-surface)',
               }}>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-[15px] font-semibold tabular-nums" style={{ color: severityColor(s.retainedPercent) }}>
                {s.retainedPercent.toFixed(1)}%
              </span>
              <span className="text-[12.5px] font-mono text-[var(--color-text-primary)]">{bytes(s.retainedBytes)}</span>
              <span className="text-[11.5px] text-[var(--color-text-muted)]">
                {s.retainedObjects.toLocaleString()} objects retained
              </span>
            </div>
            <span className="text-[12.5px] font-mono break-all text-[var(--color-text-primary)]">{s.className}</span>
            {s.heldIn && (
              <span className="text-[11.5px] text-[var(--color-text-secondary)]">
                Held in <span className="font-mono">{s.heldIn.className}</span> ({bytes(s.heldIn.retainedBytes)})
              </span>
            )}
            {s.accumulates && (
              <span className="text-[11.5px] text-[var(--color-text-secondary)]">
                Accumulating {s.accumulates.count.toLocaleString()} ×{' '}
                <span className="font-mono">{s.accumulates.className}</span>
              </span>
            )}
            {s.pathToRoot.length > 0 && (
              <span className="text-[11px] text-[var(--color-text-muted)] font-mono break-all">
                {s.pathToRoot.map(p => p.className).join('  →  ')}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Retained by class */}
      {v && v.topRetainedClasses.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Largest by retained size
          </span>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-surface-border)' }}>
            {v.topRetainedClasses.slice(0, 10).map((c, i) => {
              const share = v.liveBytes ? (c.retainedBytes / v.liveBytes) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-[11.5px]"
                     style={{
                       background: 'var(--color-surface)',
                       borderTop: i === 0 ? 'none' : '1px solid var(--color-surface-border)',
                     }}>
                  <span className="font-mono tabular-nums text-right text-[var(--color-text-primary)]" style={{ width: 72 }}>
                    {bytes(c.retainedBytes)}
                  </span>
                  <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--color-surface-hover)', overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ width: `${share}%`, height: '100%', background: ACCENT }} />
                  </div>
                  <span className="font-mono tabular-nums text-[var(--color-text-muted)] text-right" style={{ width: 64 }}>
                    {c.instances.toLocaleString()}
                  </span>
                  <span className="font-mono truncate text-[var(--color-text-primary)]">{c.className}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}