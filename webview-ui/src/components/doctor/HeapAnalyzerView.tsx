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
import { useEffect, useMemo, useState } from 'react';
import { postMsg } from '../../vscode';
import { MemoryIcon, StethoscopeIcon, CloseCircleIcon } from '../../icons';
import { ButtonView, DonutView, SegmentedControlView, FindingCardView } from '@salilvnair/dui';
import { ClassNameView } from './ClassNameView';
import { LeakChain } from './LeakChain';
import { AskChip } from './AskChip';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';
import { decodeClassName, fullClassName } from './class-name';
import { HeapHistogramView } from './HeapHistogramView';
import { HeapTreemapView } from './HeapTreemapView';
import { HeapGraphView } from './HeapGraphView';
import { HeapExplainView } from './HeapExplainView';
import { HeapGrowthView } from './HeapGrowthView';

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
  /*
    `topClasses`, which is what the engine actually sends.

    This was declared as `topRetainedClasses` and read as such, and nothing
    ever mapped between the two — so the field was undefined and the section
    below threw on `.length`, taking the whole webview down with it. It
    survived because it only fires once a verdict exists, and that needs a
    heap dump to have been loaded.
  */
  topClasses?: {
    className: string;
    instances: number;
    shallowBytes: number;
    retainedSumBytes: number;
  }[];
}

interface RuleFinding {
  ruleId: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  detail: string;
  remediation: string;
}

interface Summary {
  objects: number;
  classes: number;
  gcRoots: number;
  totalBytes: number;
  references: number;
  histogram: { name: string; instances: number; shallowBytes: number }[];
  verdict?: Verdict;
  rules?: { version: string; findings: RuleFinding[] };
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

type SubView = 'verdict' | 'histogram' | 'treemap' | 'graph' | 'growth' | 'explain';

/**
 * Which views a package filter means anything for.
 *
 * The aggregate views — a class list, a treemap, a comparison — are lists of
 * classes, and filtering them is just showing fewer. Retention is a chain from
 * a GC root and dropping interior links breaks it; Verdict and Explain are
 * conclusions about the whole heap, and a filtered conclusion is a wrong one.
 * So the box only appears where it does something.
 */
const FILTERABLE: SubView[] = ['histogram', 'treemap', 'growth'];

const SUB_VIEWS: { id: SubView; label: string }[] = [
  { id: 'verdict', label: 'Verdict' },
  { id: 'histogram', label: 'Histogram' },
  { id: 'treemap', label: 'Treemap' },
  { id: 'graph', label: 'Retention' },
  { id: 'growth', label: 'Growth' },
  { id: 'explain', label: 'Explain' },
];

export function HeapAnalyzerView() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [view, setView] = useState<SubView>('verdict');
  /** Shared by every filterable sub-view — see FILTERABLE. */
  const [packageFilter, setPackageFilter] = useState('');
  // Baseline survives loading another dump — comparing is the whole point.
  const [baseline, setBaseline] = useState<{ name: string | null } | null>(null);

  const ask = useDk8sAiStore(st => st.ask);

  /*
    One suspect, as its own question.

    The same gesture the thread list has: the overview asks what is wrong with
    the heap, this asks what THIS thing is. The evidence carries the numbers the
    engine already computed — retained share, what accumulates inside it, the
    path from a GC root — because a model asked about a class name alone can
    only tell you what the class does in general.
  */
  const askSuspect = (sp: Suspect) => {
    ask({
      promptKey: 'dk8s.heap.explainOne',
      title: `Why is ${decodeClassName(sp.className).simpleName} holding the heap`,
      evidence: [
        `class: ${fullClassName(sp.className)}`,
        `retains: ${bytes(sp.retainedBytes)} (${sp.retainedPercent.toFixed(1)}% of live heap)`,
        `keeps alive: ${sp.retainedObjects.toLocaleString()} objects`,
        sp.heldIn ? `held in: ${fullClassName(sp.heldIn.className)} (${bytes(sp.heldIn.retainedBytes)})` : '',
        sp.accumulates
          ? `accumulating: ${sp.accumulates.count.toLocaleString()} x ${fullClassName(sp.accumulates.className)}`
          : '',
        sp.pathToRoot.length
          ? `path from GC root: ${sp.pathToRoot.map(pr => fullClassName(pr.className)).join(' -> ')}`
          : '',
      ].filter(Boolean).join('\n'),
      evidenceLabel: 'LEAK SUSPECT',
      podContext: {},
    });
  };

  /*
    A rule finding, as its own question.

    The evidence leads with what the rule already concluded, so the model
    builds on it rather than re-deriving a different answer from the same
    numbers and leaving the reader with two.
  */
  const askFinding = (fnd: RuleFinding) => {
    const sp = v?.suspects[0];
    ask({
      promptKey: 'dk8s.heap.explainOne',
      title: fnd.title,
      evidence: [
        `finding: ${fnd.title} (${fnd.severity})`,
        `rule: ${fnd.ruleId}`,
        `detail: ${fnd.detail}`,
        `suggested fix: ${fnd.remediation}`,
        sp ? '' : undefined,
        sp ? `top suspect: ${fullClassName(sp.className)}` : undefined,
        sp ? `retains: ${bytes(sp.retainedBytes)} (${sp.retainedPercent.toFixed(1)}%)` : undefined,
        sp?.accumulates
          ? `accumulating: ${sp.accumulates.count.toLocaleString()} x ${fullClassName(sp.accumulates.className)}`
          : undefined,
      ].filter(x => x !== undefined).join('\n'),
      evidenceLabel: 'HEAP FINDING',
      podContext: {},
    });
  };

  /** One class out of the retained list — same idea, less to go on. */
  const askClass = (c: { className: string; instances: number; retainedSumBytes: number }) => {
    ask({
      promptKey: 'dk8s.heap.explainOne',
      title: `What is holding ${decodeClassName(c.className).simpleName}`,
      evidence: [
        `class: ${fullClassName(c.className)}`,
        `instances: ${c.instances.toLocaleString()}`,
        `retained (summed over instances): ${bytes(c.retainedSumBytes)}`,
        v ? `live heap: ${bytes(v.liveBytes)} across ${v.liveObjects.toLocaleString()} objects` : '',
      ].filter(Boolean).join('\n'),
      evidenceLabel: 'CLASS',
      podContext: {},
    });
  };

  // Back to the empty state, so "Open another" is a decision you can change
  // your mind about. The baseline is kept: comparing two dumps is the reason
  // to open a second one at all.
  const reset = () => { setPhase({ kind: 'idle' }); setView('verdict'); };

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
      } else if (msg?.type === 'heap:baselineSet') {
        setBaseline(msg.hasBaseline ? { name: msg.name } : null);
        setView('growth');
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
          variant="secondary" size="sm"
          accentColor={ACCENT} color={ACCENT}
          style={{
            marginTop: 4,
            background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
            borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`,
            fontWeight: 600,
          }}
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
  /*
    Sorted here, because the section claims to be sorted.

    The engine ranks `topClasses` by SHALLOW bytes — it is the histogram's
    order — while this section is headed "Largest by retained size" and prints
    retained. Showing one order under the other heading is the kind of wrong
    that nobody catches, because every row is individually correct.

    Not a useMemo, deliberately. This sits below three early returns — idle,
    running and error — so a hook here runs on some renders and not others,
    and React tears the component down the moment a dump finishes loading.
    Twenty items sorted per render costs nothing; the memo bought nothing and
    cost the whole screen.
  */
  const topByRetained = [...(v?.topClasses ?? [])]
    .sort((a, b) => b.retainedSumBytes - a.retainedSumBytes)
    .slice(0, 10);

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
        {/*
          One control, not six buttons.

          These were six independently styled buttons that only looked like a
          group because they sat next to each other — nothing tied them
          together, so the inactive five read as five things you could press
          rather than as the other positions of one switch. dui's compact
          density recesses the track, which is what makes a switcher read as
          navigation instead of competing with the actions beside it.
        */}
        <div className="ml-2">
          <SegmentedControlView
            options={SUB_VIEWS.map(sv => ({ label: sv.label, value: sv.id }))}
            value={view}
            onChange={v => setView(v as SubView)}
            density="compact"
            accentColor={ACCENT}
          />
        </div>
        <div className="flex-1" />

        {/*
          Package filter — taken from JProfiler's MCP, which puts one on every
          heap view it exposes.

          Every Java heap is topped by byte[], char[], String and HashMap$Node,
          and none of them are yours. Being able to say "only com.zapper" is
          the difference between a class list you skim and one you read.

          One box for all three views rather than one each: it is a statement
          about whose code you care about, and that does not change when you
          switch from a table to a treemap.
        */}
        {FILTERABLE.includes(view) && (
          <input
            value={packageFilter}
            onChange={e => setPackageFilter(e.target.value)}
            placeholder="Package filter — com.zapper, org.hibernate"
            spellCheck={false}
            title="Comma-separated package prefixes. Matches sub-packages, inner classes and arrays of a filtered type."
            className="h-[24px] px-2 rounded-md text-[11px] font-mono outline-none"
            style={{
              width: 260,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: `1px solid ${packageFilter.trim()
                ? 'color-mix(in srgb, var(--color-doctor) 45%, transparent)'
                : 'var(--color-surface-border)'}`,
            }}
          />
        )}

        {/* Clears back to the empty state rather than opening a picker
            straight away: cancelling that dialog left you looking at the old
            dump with no sign that anything had happened. */}
        <ButtonView variant="secondary" size="sm" onClick={reset}>
          Open another
        </ButtonView>
      </div>

      {view === 'histogram' && <HeapHistogramView liveBytes={liveBytes} packageFilter={packageFilter} />}
      {view === 'treemap' && <HeapTreemapView packageFilter={packageFilter} />}
      {view === 'graph' && <HeapGraphView liveBytes={liveBytes} />}
      {view === 'growth' && <HeapGrowthView hasBaseline={!!baseline} baselineName={baseline?.name ?? null} packageFilter={packageFilter} />}
      {view === 'explain' && <HeapExplainView />}
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

      {/*
        Who owns the heap, as one ring.

        The suspect list below says how much each one retains; this says
        whether there IS an owner. One wedge at 62% and a grey remainder is a
        leak; eight even wedges is a heap that is simply too small for the
        workload, and those need opposite fixes. It is the first thing MAT's
        leak report shows for the same reason.
      */}
      {v && v.suspects.length > 0 && (
        <div className="rounded-lg p-3.5 flex flex-col gap-3"
             style={{ border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            What holds the heap
          </span>
          <DonutView
            items={[
              ...v.suspects.slice(0, 6).map(sp => ({
                name: decodeClassName(sp.className).simpleName,
                value: sp.retainedBytes,
              })),
              // Named, so nobody reads the ring as "six objects are the heap".
              {
                name: 'everything else',
                value: Math.max(0, v.liveBytes - v.suspects.slice(0, 6)
                  .reduce((t, sp) => t + sp.retainedBytes, 0)),
              },
            ]}
            size={148}
            accentColor={ACCENT}
            format={bytes}
            centerLabel={bytes(v.liveBytes)}
          />
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
              <div className="flex-1" />
              <AskChip onClick={() => askSuspect(s)} />
            </div>
            <ClassNameView name={s.className} size={12.5} />
            {s.heldIn && (
              <span className="text-[11.5px] text-[var(--color-text-secondary)]">
                Held in <ClassNameView name={s.heldIn.className} size={11.5} /> ({bytes(s.heldIn.retainedBytes)})
              </span>
            )}
            {s.accumulates && (
              <span className="text-[11.5px] text-[var(--color-text-secondary)]">
                Accumulating {s.accumulates.count.toLocaleString()} ×{' '}
                <ClassNameView name={s.accumulates.className} size={11.5} />
              </span>
            )}
            {s.pathToRoot.length > 0 && (
              <span className="text-[11px] text-[var(--color-text-muted)] font-mono break-all">
                {s.pathToRoot.map(p => fullClassName(p.className)).join('  →  ')}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Rule findings — deterministic, no model involved */}
      {summary.rules && summary.rules.findings.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Diagnosis · rule pack {summary.rules.version}
          </span>
          {summary.rules.findings.map(f => (
            <FindingCardView
              key={f.ruleId}
              severity={f.severity}
              title={f.title}
              meta={f.ruleId}
              detail={f.detail}
              remediation={f.remediation}
              actions={
                <AskChip onClick={() => askFinding(f)} />
              }
            >
              {/*
                The chain, when the suspect this rule fired on has one.

                A finding that says "an unbounded ArrayList holds 98%" and stops
                is a fact without a destination. The four rows below are the
                four questions in order — what accumulates, what holds it, where
                it lives in your code, and only then what to change, which the
                card already renders underneath.
              */}
              {v?.suspects[0] && <LeakChain suspect={v.suspects[0]} />}
            </FindingCardView>
          ))}
        </div>
      )}

      {/* Retained by class */}
      {topByRetained.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Largest by retained size
          </span>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-surface-border)' }}>
            {topByRetained.map((c, i) => {
              const share = v && v.liveBytes ? (c.retainedSumBytes / v.liveBytes) * 100 : 0;
              return (
                <div key={i} className="group flex items-center gap-3 px-3 py-1.5 text-[11.5px]"
                     style={{
                       background: 'var(--color-surface)',
                       borderTop: i === 0 ? 'none' : '1px solid var(--color-surface-border)',
                     }}>
                  <span className="font-mono tabular-nums text-right text-[var(--color-text-primary)]" style={{ width: 72 }}>
                    {bytes(c.retainedSumBytes)}
                  </span>
                  <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--color-surface-hover)', overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ width: `${share}%`, height: '100%', background: ACCENT }} />
                  </div>
                  <span className="font-mono tabular-nums text-[var(--color-text-muted)] text-right" style={{ width: 64 }}>
                    {c.instances.toLocaleString()}
                  </span>
                  <ClassNameView name={c.className} />
                  <div className="flex-1" />
                  {/* Shown on hover: ten rows each with a permanent button is
                      ten buttons competing with the numbers they sit beside. */}
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <AskChip label="" onClick={() => askClass(c)}
                             title={`Ask about ${c.className}`} />
                  </span>
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