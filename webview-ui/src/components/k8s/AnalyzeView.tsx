/**
 * Analyze — the Doctor's analyzers, inside dk8s.
 *
 * The separate Doctor tab existed because a dump had to be opened from
 * somewhere, and dk8s did not exist yet. Now every route into an analyzer
 * starts here: a dump collected from a pod, a file already sitting in the
 * artifact folder, or one opened from disk. Sending you to another tab to
 * read the thing you just collected was the only reason that tab remained.
 *
 * The three analyzers are the Doctor's own components, unchanged — this is a
 * new way in, not a second implementation.
 *
 * Nothing here uploads an artifact. Parsing and analysis run on this machine;
 * only a redacted evidence pack ever reaches a model, and only when asked.
 */
import { useEffect, useRef, useState } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { MemoryIcon, LayersIcon, DocumentIcon, PlusIcon } from '../../icons';
import { useUiStateStore } from '../../store/ui-state-store';
import { useDk8sArtifactStore } from '../../store/dk8s-artifact-store';
import { HeapAnalyzerView } from '../doctor/HeapAnalyzerView';
import { ThreadAnalyzerView } from '../doctor/ThreadAnalyzerView';
import { LogAnalyzerView } from '../doctor/LogAnalyzerView';

const ACCENT = 'var(--color-dk8s)';

type AnalyzerId = 'heap' | 'threads' | 'logs';

const ANALYZERS: { id: AnalyzerId; label: string; icon: React.ReactNode; tagline: string }[] = [
  { id: 'heap', label: 'Heap Dump', icon: <MemoryIcon size={13} />, tagline: 'Retained sizes, dominators and leak suspects from a .hprof' },
  { id: 'threads', label: 'Thread Dump', icon: <LayersIcon size={13} />, tagline: 'Deadlocks, lock contention and thread-state distribution' },
  { id: 'logs', label: 'Logs', icon: <DocumentIcon size={13} />, tagline: 'Pattern extraction, bursts and anomaly detection' },
];

export function AnalyzeView() {
  // The same pref the artifact list writes before it switches here, so a
  // thread dump opens on the thread analyzer rather than the heap analyzer's
  // empty state — which reads as the open having failed.
  const stored = useUiStateStore(s => s.prefs['doctor.analyzer']) as AnalyzerId | undefined;
  const [analyzer, setLocal] = useState<AnalyzerId>(stored || 'heap');
  const importFile = useDk8sArtifactStore(s => s.importFile);

  useEffect(() => {
    if (stored && stored !== analyzer) setLocal(stored);
    // Keyed on `stored` alone: adding `analyzer` would fight your own clicks
    // back to the stored value on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  const pick = (id: AnalyzerId) => {
    setLocal(id);
    useUiStateStore.getState().setPref('doctor.analyzer', id);
  };

  // Which analyzers have been shown at least once, and so must stay mounted.
  const seen = useRef(new Set<AnalyzerId>()).current;
  seen.add(analyzer);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-2 shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        {ANALYZERS.map(a => {
          const on = a.id === analyzer;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => pick(a.id)}
              title={a.tagline}
              className="flex items-center gap-1.5 h-[26px] px-2.5 rounded-md text-[11.5px] cursor-pointer"
              style={{
                color: on ? ACCENT : 'var(--color-text-secondary)',
                fontWeight: on ? 600 : 400,
                background: on ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
                border: `1px solid ${on ? `color-mix(in srgb, ${ACCENT} 34%, transparent)` : 'transparent'}`,
              }}
            >
              {a.icon}
              {a.label}
            </button>
          );
        })}

        <div className="flex-1" />

        {/* The analyzers each have their own picker, but only on their empty
            state — once one holds a dump, opening a different file meant
            going back to the artifact list. */}
        <ButtonView label="Open a file…" size="sm" variant="secondary"
                    accentColor={ACCENT} color={ACCENT}
                    iconLeft={<PlusIcon size={11} />}
                    onClick={importFile}
                    style={{
                      background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                      borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`,
                    }} />
      </div>

      {/*
        Hidden, not unmounted.

        Each analyzer holds its parsed dump in its own state, so rendering only
        the selected one threw the analysis away every time you looked at
        another tab — you came back to the empty state and had to re-open a
        file you had already opened. Kept mounted, so switching is free and
        nothing is lost.

        Mounted lazily and then kept: an analyzer you have never opened costs
        nothing, and one you have opened stays as you left it.
      */}
      {ANALYZERS.map(a => seen.has(a.id) && (
        <div key={a.id} className="flex-1 min-h-0 overflow-hidden"
             style={{ display: a.id === analyzer ? 'flex' : 'none', flexDirection: 'column' }}>
          {a.id === 'heap' ? <HeapAnalyzerView />
            : a.id === 'threads' ? <ThreadAnalyzerView />
              : <LogAnalyzerView />}
        </div>
      ))}
    </div>
  );
}
