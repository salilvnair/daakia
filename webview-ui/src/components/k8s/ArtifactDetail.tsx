/**
 * One artifact, open.
 *
 * Built to the shape of the pod detail rather than as a tab, because it is the
 * same gesture: you picked a thing out of a list and you are now looking at
 * it. Back returns to the list, the thing you opened is named in the header,
 * and the AI panel toggles beside the analysis instead of replacing it.
 *
 * The three analyzers stay mounted once shown — each holds its parsed dump in
 * its own state, and unmounting one to show another would throw the analysis
 * away.
 */
import { useEffect, useRef } from 'react';
import { ButtonView } from '@salilvnair/dui';
import {
  ChevronLeftIcon, SparkleIcon, MemoryIcon, LayersIcon, DocumentIcon, PlusIcon,
} from '../../icons';
import { useDk8sAnalyzeStore, type AnalyzerId } from '../../store/dk8s-analyze-store';
import { useDk8sArtifactStore } from '../../store/dk8s-artifact-store';
import { HeapAnalyzerView } from '../doctor/HeapAnalyzerView';
import { ThreadAnalyzerView } from '../doctor/ThreadAnalyzerView';
import { LogAnalyzerView } from '../doctor/LogAnalyzerView';
import { AiAnswerPanel } from './AiAnswerPanel';

const AI_ACCENT = 'var(--color-protocol-ai)';

/** A colour per analyzer, kept even when its tab is not the active one. */
const TABS: { id: AnalyzerId; label: string; icon: React.ReactNode; color: string; tagline: string }[] = [
  {
    id: 'heap', label: 'Heap Dump', icon: <MemoryIcon size={13} />,
    color: 'var(--color-protocol-graphql, #e535ab)',
    tagline: 'Retained sizes, dominators and leak suspects from a .hprof',
  },
  {
    id: 'threads', label: 'Thread Dump', icon: <LayersIcon size={13} />,
    color: 'var(--color-dk8s)',
    tagline: 'Deadlocks, lock contention and thread-state distribution',
  },
  {
    id: 'logs', label: 'Logs', icon: <DocumentIcon size={13} />,
    color: 'var(--color-warning)',
    tagline: 'Pattern extraction, bursts and anomaly detection',
  },
];

export function ArtifactDetail() {
  const { open, analyzer, header, aiOpen, close, setAnalyzer, toggleAi } = useDk8sAnalyzeStore();
  const importFile = useDk8sArtifactStore(s => s.importFile);

  // Which analyzers have been shown, and so must stay mounted. One that has
  // never been opened costs nothing; one that has stays as you left it.
  const seen = useRef(new Set<AnalyzerId>()).current;
  if (open) seen.add(analyzer);

  // Escape leaves, the same as the pod detail — but not while something is
  // selected, so the first Escape after highlighting a stack trace does not
  // throw the whole view away too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const active = TABS.find(t => t.id === analyzer) ?? TABS[0];

  return (
    <div className="absolute inset-0 z-20 flex flex-col"
         style={{ background: 'var(--color-bg, var(--color-surface))' }}>

      {/* ── What you are looking at ── */}
      <div className="flex items-center gap-2.5 px-3 py-2 flex-shrink-0"
           style={{
             borderBottom: '1px solid var(--color-surface-border)',
             background: `linear-gradient(to right, color-mix(in srgb, ${active.color} 8%, transparent), transparent 60%)`,
           }}>
        <button type="button" onClick={close} title="Back to artifacts"
                className="p-1 rounded cursor-pointer border-none bg-transparent">
          <ChevronLeftIcon size={16} color="var(--color-text-secondary)" />
        </button>

        <span style={{ color: active.color, display: 'flex' }}>{active.icon}</span>

        {/* The file, and what the parse found in it. Published by whichever
            analyzer is loaded — see AnalysisHeader. */}
        <span className="text-[13px] font-semibold truncate"
              style={{ color: 'var(--color-text-primary)', maxWidth: '46%' }}>
          {header?.name ?? active.label}
        </span>
        {header?.meta && (
          <span className="text-[11px] font-mono truncate"
                style={{ color: 'var(--color-text-muted)' }}>
            {header.meta}
          </span>
        )}

        <div className="flex-1" />

        <ButtonView
          label="Open a file…" size="sm" variant="secondary"
          iconLeft={<PlusIcon size={11} />}
          onClick={importFile}
          style={{ background: 'transparent' }}
        />

        {/* A toggle, not a launcher: the same control shows and hides the
            panel, which is how the pod log view does it. */}
        <ButtonView
          label="AI" size="sm" variant="secondary"
          accentColor={AI_ACCENT} color={aiOpen ? AI_ACCENT : 'var(--color-text-secondary)'}
          onClick={toggleAi}
          title={aiOpen ? 'Hide the AI panel' : 'Show the AI panel'}
          iconLeft={<SparkleIcon size={11} color={aiOpen ? AI_ACCENT : 'var(--color-text-muted)'} />}
          style={{
            background: aiOpen
              ? `color-mix(in srgb, ${AI_ACCENT} 16%, transparent)`
              : 'transparent',
            borderColor: aiOpen
              ? `color-mix(in srgb, ${AI_ACCENT} 45%, transparent)`
              : 'var(--color-surface-border)',
            fontWeight: aiOpen ? 600 : 400,
          }}
        />
      </div>

      {/* ── Which analyzer ── */}
      <div className="flex items-center gap-1 px-3 pt-1.5 flex-shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        {TABS.map(t => {
          const on = t.id === analyzer;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setAnalyzer(t.id)}
              title={t.tagline}
              className="flex items-center gap-1.5 px-3 py-2 text-[11.5px] cursor-pointer border-none bg-transparent transition-colors"
              style={{
                color: on ? t.color : 'var(--color-text-secondary)',
                fontWeight: on ? 600 : 400,
                borderBottom: `2px solid ${on ? t.color : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              <span style={{ color: t.color, opacity: on ? 1 : 0.65, display: 'flex' }}>
                {t.icon}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── The analysis, and the answers beside it ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {TABS.map(t => seen.has(t.id) && (
            <div key={t.id} className="flex-1 min-h-0 overflow-hidden"
                 style={{ display: t.id === analyzer ? 'flex' : 'none', flexDirection: 'column' }}>
              {t.id === 'heap' ? <HeapAnalyzerView />
                : t.id === 'threads' ? <ThreadAnalyzerView />
                  : <LogAnalyzerView />}
            </div>
          ))}
        </div>

        {aiOpen && <AiAnswerPanel />}
      </div>
    </div>
  );
}
