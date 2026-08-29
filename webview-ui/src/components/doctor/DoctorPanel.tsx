/**
 * DoctorPanel — Daakia Diagnostics.
 *
 * Post-mortem analysis of a misbehaving JVM, sitting next to the API client that
 * called it. Three analyzers share one shell because they share one pipeline:
 * ingest a large artifact → index it locally → compute findings deterministically
 * → distil a small evidence pack → let the AI narrate it.
 *
 *   Heap    — .hprof dominator tree, retained sizes, leak suspects   (in progress)
 *   Threads — deadlocks, lock contention, thread-state distribution  (planned)
 *   Logs    — pattern extraction, burst and anomaly detection        (planned)
 *
 * Nothing here uploads an artifact. Parsing and analysis run on this machine; only
 * a redacted evidence pack ever reaches a model, and only when the user asks.
 */
import { useState, useEffect } from 'react';
import { StethoscopeIcon, MemoryIcon, LayersIcon, DocumentIcon } from '../../icons';
import { useUiStateStore } from '../../store/ui-state-store';
import { HeapAnalyzerView } from './HeapAnalyzerView';
import { ThreadAnalyzerView } from './ThreadAnalyzerView';
import { LogAnalyzerView } from './LogAnalyzerView';

const ACCENT = 'var(--color-doctor)';

type AnalyzerId = 'heap' | 'threads' | 'logs';

interface Analyzer {
  id: AnalyzerId;
  label: string;
  icon: React.ReactNode;
  tagline: string;
  ready: boolean;
}

const ANALYZERS: Analyzer[] = [
  { id: 'heap', label: 'Heap Dump', icon: <MemoryIcon size={14} />, tagline: 'Retained sizes, dominators and leak suspects from a .hprof', ready: true },
  { id: 'threads', label: 'Thread Dump', icon: <LayersIcon size={14} />, tagline: 'Deadlocks, lock contention and thread-state distribution', ready: true },
  { id: 'logs', label: 'Logs', icon: <DocumentIcon size={14} />, tagline: 'Pattern extraction, bursts and anomaly detection', ready: true },
];

export function DoctorPanel() {
  const stored = useUiStateStore(s => s.prefs['doctor.analyzer']) as AnalyzerId | undefined;
  const [analyzer, setAnalyzerLocal] = useState<AnalyzerId>(stored || 'heap');

  const setAnalyzer = (id: AnalyzerId) => {
    setAnalyzerLocal(id);
    useUiStateStore.getState().setPref('doctor.analyzer', id);
  };

  // Follow the stored value when it changes from outside — dk8s sets it when
  // it hands an artifact over, and without this the tab opens on whichever
  // analyzer was last used rather than the one now holding the dump.
  useEffect(() => {
    if (stored && stored !== analyzer) setAnalyzerLocal(stored);
    // Deliberately keyed on `stored` alone: including `analyzer` would fight
    // the user's own clicks back to the stored value on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  const active = ANALYZERS.find(a => a.id === analyzer) ?? ANALYZERS[0];

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 flex-shrink-0"
        style={{ height: 42, borderBottom: '1px solid var(--color-surface-border)' }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 24, height: 24, borderRadius: 6,
            background: 'color-mix(in srgb, var(--color-doctor) 18%, transparent)',
          }}
        >
          <StethoscopeIcon size={14} style={{ color: ACCENT }} />
        </div>
        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Doctor</span>
        <span className="text-[11px] text-[var(--color-text-muted)]">Diagnostics</span>

        {/* Analyzer switcher */}
        <div className="flex items-center gap-1 ml-3">
          {ANALYZERS.map(a => {
            const on = a.id === analyzer;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAnalyzer(a.id)}
                title={a.tagline}
                className="flex items-center gap-1.5 h-[24px] px-2.5 rounded-md text-[11.5px] cursor-pointer"
                style={{
                  color: on ? ACCENT : 'var(--color-text-secondary)',
                  background: on ? 'color-mix(in srgb, var(--color-doctor) 14%, transparent)' : 'transparent',
                  border: `1px solid ${on ? 'color-mix(in srgb, var(--color-doctor) 34%, transparent)' : 'transparent'}`,
                }}
              >
                {a.icon}
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {analyzer === 'heap' ? <HeapAnalyzerView />
         : analyzer === 'threads' ? <ThreadAnalyzerView />
         : analyzer === 'logs' ? <LogAnalyzerView />
         : (
        <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
          <StethoscopeIcon size={40} strokeWidth={1} style={{ color: ACCENT, opacity: 0.4 }} />
          <p className="text-[13px] text-[var(--color-text-primary)] m-0">{active.label} analyzer</p>
          <p className="text-[12px] text-[var(--color-text-muted)] m-0 max-w-[420px] leading-relaxed">
            {active.tagline}.
          </p>
          <p className="text-[11px] text-[var(--color-text-muted)] m-0 opacity-70">
            Not built yet — the heap analyzer came first.
          </p>
        </div>
        )}
      </div>
    </div>
  );
}
