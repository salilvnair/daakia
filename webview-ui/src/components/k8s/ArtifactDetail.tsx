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
  StethoscopeIcon,
} from '../../icons';
import { useDk8sAnalyzeStore, type AnalyzerId } from '../../store/dk8s-analyze-store';
import { useDk8sArtifactStore } from '../../store/dk8s-artifact-store';
import { HeapAnalyzerView } from '../doctor/HeapAnalyzerView';
import { ThreadAnalyzerView } from '../doctor/ThreadAnalyzerView';
import { LogAnalyzerView } from '../doctor/LogAnalyzerView';
import { AiSplit } from './AiAnswerPanel';
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

/**
 * Split a collected artifact's file name into a title and where it came from.
 *
 * dk8s names what it collects `<pod>__<kind>__<timestamp>.<ext>`, and the pod
 * name is the long half — `zp-backend-hung-59cc469bd7-wbgk6` is 31 characters
 * of which the last 17 are hashes. Leading with the whole string pushed the
 * part that distinguishes one dump from another off the end of the line.
 *
 * So the title is what identifies this file among that pod's dumps, and the
 * pod moves to the subtitle beside the analyzer's name — the same place the
 * pod detail puts a pod's namespace and context.
 *
 * A file opened from disk has no such structure and keeps its whole name.
 */
export function splitArtifactName(name: string): { title: string; pod?: string } {
  const parts = name.split('__');
  if (parts.length < 2) return { title: name };
  return { title: parts.slice(1).join('__'), pod: parts[0] };
}

/**
 * The tab strip under the header, and one tab in it.
 *
 * Shared because the strip has two jobs — choosing an analyzer when nothing is
 * open, showing a file's views when something is — and they have to be the
 * same object to the eye. Two strips built separately drift: one gains a pixel
 * of padding, the other keeps its underline a shade lighter, and the view
 * appears to move when a file finishes parsing.
 */
function Strip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 px-4 pt-1 shrink-0"
         style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      {children}
    </div>
  );
}

function Tab({ on, color, onClick, mark, title, children }: {
  on: boolean; color: string; onClick: () => void;
  mark: React.ReactNode; title?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button" onClick={onClick} title={title}
      className="flex items-center gap-1.5 px-3 py-2 text-[11.5px] cursor-pointer border-none bg-transparent transition-colors"
      style={{
        color: on ? color : 'var(--color-text-secondary)',
        fontWeight: on ? 600 : 400,
        // Sits on the strip's own bottom border rather than under it.
        borderBottom: `2px solid ${on ? color : 'transparent'}`,
        marginBottom: -1,
      }}
    >
      {mark}
      {children}
    </button>
  );
}

export function ArtifactDetail() {
  const { open, analyzer, header, close, subViews, activeSubView, setSubView, setAnalyzer }
    = useDk8sAnalyzeStore();
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

  /*
    Nothing loaded yet — so this is the analyzer, not an artifact.

    The difference decides both the header and the tab strip below it. Opened
    from a file, the file is the subject: it is named in the header, and the
    tabs are the views of it. Opened from the stethoscope, there is no subject
    yet, and the only real choice on screen is what kind of file you are about
    to open — which is exactly what the three tabs are for.

    Titling this state "Heap Dump / Heap Dump" and giving it a file's header
    was wrong twice over: it named a file that was not open, and it hid the
    other two analyzers behind a switch that was no longer on screen.
  */
  const empty = !header;

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
            file name at a glance. With nothing open there is no kind yet, so
            it carries the stethoscope this screen was reached by. */}
        <span style={{ color: empty ? 'var(--color-text-secondary)' : active.color, display: 'flex' }}>
          {empty ? <StethoscopeIcon size={14} /> : active.icon}
        </span>

        {/*
          The name block and the numbers beside it.

          These were two separate children of the header row with a spacer
          after them, which let the flex row put the counts wherever the name
          happened to end — hard against a short name, far away from a long
          one, and in a different place on every file. They belong to the same
          thing, so they are one group that starts at one place, and the meta
          hangs off the end of the name at a fixed distance from it.
        */}
        <div className="flex items-baseline gap-3 min-w-0 flex-1">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[13.5px] font-mono truncate"
                  style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              {empty ? 'Analyze a file' : splitArtifactName(header!.name).title}
            </span>
            <span className="text-[10.5px] text-[var(--color-text-muted)] truncate">
              {(() => {
                if (empty) return 'Open a dump or a log you already have on disk';
                const pod = splitArtifactName(header!.name).pod;
                return pod ? `${pod} · ${active.label}` : active.label;
              })()}
            </span>
          </div>

          {/*
            Published by whichever analyzer is loaded — see AnalysisHeader.

            One muted line, not a row of stat columns. Splitting it gave every
            fact a heading, which turned "112,817 objects · 358,173 refs" —
            already a sentence a person can read — into OBJECTS / REFS labels
            taking twice the height to say the same thing. It sits on the
            name's baseline so the two read as one line.
          */}
          {header?.meta && (
            <span className="text-[11.5px] font-mono truncate shrink-0"
                  style={{ color: 'var(--color-text-muted)' }}>
              {header.meta}
            </span>
          )}
        </div>

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
          // Always the AI colour. Greying it when the panel is closed made the
          // icon read as disabled — the pod header keeps it lit and lets the
          // label and fill carry the on/off state.
          iconLeft={<SparkleIcon size={11} color={AI_ACCENT} />}
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

      {/*
        ── The loaded analyzer's own views ──

        This used to be Heap Dump / Thread Dump / Logs — a switch between three
        analyzers, two of which had nothing loaded. You do not choose an
        analyzer, you open an artifact and it chooses one; offering the other
        two put two tab strips on screen, this one and the analyzer's own,
        neither of which was about the file you were looking at.

        So the analyzer publishes its views and the shell draws them. An
        analyzer with a single screen publishes none and the strip disappears
        rather than showing one lonely tab.

        With nothing loaded the strip does the other job: it picks the analyzer.
        That is the same strip in the same place meaning two different things,
        which is only defensible because they never overlap — before a file is
        open the only question is which kind you are opening, and after it is
        open that question has been answered by the file itself.
      */}
      {empty ? (
        <Strip>
          {TABS.map(t => (
            <Tab key={t.id} on={t.id === analyzer} color={t.color}
                 onClick={() => setAnalyzer(t.id)} title={t.tagline}
                 mark={<span style={{ color: t.color, display: 'flex' }}>{t.icon}</span>}>
              {t.label}
            </Tab>
          ))}
        </Strip>
      ) : subViews.length > 1 && (
        <Strip>
          {subViews.map(sv => (
            <Tab key={sv.id} on={sv.id === activeSubView} color={sv.color}
                 onClick={() => setSubView(sv.id)}
                 mark={<span style={{
                   width: 6, height: 6, borderRadius: '50%', background: sv.color,
                   opacity: sv.id === activeSubView ? 1 : 0.5, flexShrink: 0,
                 }} />}>
              {sv.label}
            </Tab>
          ))}
        </Strip>
      )}

      {/* ── The analysis, and the answers beside it ── */}
      <AiSplit>
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
      </AiSplit>
    </div>
  );
}
