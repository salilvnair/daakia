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
import { useDk8sAiStore } from '../../store/dk8s-ai-store';

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

/** The pod header's stat column, to the pixel. */
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[11.5px]"
            style={{ color: color ?? 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

export function ArtifactDetail() {
  const { open, analyzer, header, close, setAnalyzer } = useDk8sAnalyzeStore();
  const importFile = useDk8sArtifactStore(s => s.importFile);

  /*
    The panel's own open flag, not a second one.

    This kept `aiOpen` in the analyze store and rendered the panel behind it —
    but AiAnswerPanel already hides itself on `useDk8sAiStore.open`, which is
    what `ask()` sets. So asking a question opened the AI store while this
    wrapper kept the panel unmounted, and every sparkle on every thread row
    did nothing visible. One flag, owned by the panel, exactly as the pod
    detail does it.
  */
  const aiOpen = useDk8sAiStore(s => s.open);
  const openAi = useDk8sAiStore(s => s.openPanel);
  const closeAi = useDk8sAiStore(s => s.closePanel);
  const answers = useDk8sAiStore(s => s.answers);

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

      {/* ── Header ──
          Built to the pod detail's measurements, not to its own: same gap,
          same px-4 py-3, the same two-line name block, and the metadata as
          stat columns rather than a run-on line. Two screens that do the same
          job at two different heights read as two different products. */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0"
           style={{
             borderBottom: '1px solid var(--color-surface-border)',
             background: `linear-gradient(to right, color-mix(in srgb, ${active.color} 8%, transparent), transparent 60%)`,
           }}>
        <button type="button" onClick={close} title="Back to artifacts"
                className="p-1 rounded cursor-pointer border-none bg-transparent">
          <ChevronLeftIcon size={16} color="var(--color-text-secondary)" />
        </button>

        {/* Where the pod header carries a status dot, this carries the kind —
            it is the one thing about an artifact you cannot infer from the
            file name at a glance. */}
        <span style={{ color: active.color, display: 'flex' }}>{active.icon}</span>

        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[13.5px] font-mono truncate"
                style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {header?.name ?? active.label}
          </span>
          <span className="text-[10.5px] text-[var(--color-text-muted)] truncate">
            {active.label}
          </span>
        </div>

        {/* Published by whichever analyzer is loaded — see AnalysisHeader.
            Split on the separator the analyzers already use, so each fact gets
            its own column like the pod's status, ready, restarts and age. */}
        {header?.meta && (
          <div className="flex items-center gap-5 ml-4 flex-wrap">
            {header.meta.split('·').map((part, i) => {
              const [value, ...rest] = part.trim().split(' ');
              return (
                <Stat key={i} label={rest.join(' ') || 'detail'} value={value} />
              );
            })}
          </div>
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
          label={`AI${answers.length > 0 ? ` · ${answers.length}` : ''}`}
          size="sm" variant="secondary"
          accentColor={AI_ACCENT} color={aiOpen ? AI_ACCENT : 'var(--color-text-secondary)'}
          onClick={aiOpen ? closeAi : openAi}
          title={aiOpen ? 'Hide AI analysis' : 'Show AI analysis'}
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
      <div className="flex items-center gap-1 px-4 pt-1 shrink-0"
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

        {/* Rendered always; it hides itself when there is nothing to show,
            which is what keeps the toggle and the panel from disagreeing. */}
        <AiAnswerPanel />
      </div>
    </div>
  );
}
