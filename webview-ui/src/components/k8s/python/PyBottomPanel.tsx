/**
 * Under the editor: Output, Problems, Runs — and, while pdb is up, its console.
 *
 * The command is echoed first, as the terminal would show it, because "what
 * exactly ran in that pod" is the first question after any surprise and the
 * answer should be copyable rather than reconstructed.
 */
import { useEffect, useRef, useState } from 'react';
import {
  UnderlineTabsView, IconButtonView, TextInputView, BadgeChipView, IconSize,
} from '@salilvnair/dui';
import { TrashIcon, CheckIcon, CloseIcon } from '../../../icons';
import { usePyStore, type PyRun } from '../../../store/dk8s-python-store';
import { formatDuration, podShort } from './py-view';
import { OK, BAD, MUTED, WARN, ACCENT } from '../tone';

export type BottomTab = 'output' | 'problems' | 'runs' | 'console';

export function PyBottomPanel({ runs, run, showDebug, onJump, onPickRun, tab, onTab }: {
  /** Every run this panel is about, oldest first. */
  runs: PyRun[];
  /** The one Output shows. */
  run?: PyRun;
  showDebug: boolean;
  onJump: (line: number) => void;
  onPickRun: (runId: string) => void;
  tab: BottomTab;
  onTab: (t: BottomTab) => void;
}) {
  const clearRuns = usePyStore(s => s.clearRuns);
  const debug = usePyStore(s => s.debug);
  const problems = run?.problems ?? [];

  const tabs = [
    { id: 'output', label: 'Output' },
    ...(showDebug ? [{ id: 'console', label: 'Debug console' }] : []),
    { id: 'problems', label: 'Problems', count: problems.length || undefined },
    { id: 'runs', label: 'Runs', count: runs.length || undefined },
  ];

  return (
    <div className="flex flex-col h-full min-h-0" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
      <div className="flex items-center gap-2 px-2.5 flex-shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <UnderlineTabsView tabs={tabs} activeId={tab} onChange={id => onTab(id as BottomTab)}
                           accentColor={ACCENT} rule={false} />
        <span className="flex-1" />
        {tab === 'console' && debug && (
          <span className="text-[10.5px] font-mono" style={{ color: MUTED }}>
            pdb &middot; {debug.target.container ?? podShort(debug.target.pod)}
          </span>
        )}
        {tab !== 'console' && run && <RunVerdict run={run} />}
        <IconButtonView
          size="xs" icon={<TrashIcon size={IconSize.inline} />} tooltip="Clear finished runs"
          aria-label="Clear output"
          onClick={() => { const ids = new Set(runs.map(r => r.runId)); clearRuns(r => ids.has(r.runId)); }}
        />
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'output' && <OutputPane run={run} debugOutput={showDebug ? debug?.output : undefined} />}
        {tab === 'console' && <ConsolePane />}
        {tab === 'problems' && <ProblemsPane run={run} onJump={onJump} />}
        {tab === 'runs' && <RunsPane runs={runs} current={run?.runId} onPick={(id) => { onPickRun(id); onTab('output'); }} />}
      </div>
    </div>
  );
}

function RunVerdict({ run }: { run: PyRun }) {
  if (run.status === 'running') return <BadgeChipView tone={ACCENT} size="xs">running</BadgeChipView>;
  if (run.status === 'refused') return <BadgeChipView tone={WARN} size="xs">not run</BadgeChipView>;
  const tone = run.status === 'ok' ? OK : BAD;
  return (
    <span className="flex items-center gap-1.5 text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: tone, fontWeight: 600 }}>
        {run.status === 'stopped' ? 'stopped' : `exit ${run.code ?? '?'}`}
      </span>
      {run.durationMs !== undefined && <span style={{ color: MUTED }}>&middot; {formatDuration(run.durationMs)}</span>}
    </span>
  );
}

/** Follows the bottom while you are at the bottom, and stays put once you scroll up to read. */
function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [dep]);
  const onScroll = () => {
    const el = ref.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };
  return { ref, onScroll };
}

export function OutputPane({ run, debugOutput }: { run?: PyRun; debugOutput?: string }) {
  const { ref, onScroll } = useStickToBottom(run?.chunks.length ?? debugOutput?.length);
  if (!run && !debugOutput) {
    return <Empty>Run a script and its output lands here, after the exact command that ran.</Empty>;
  }
  return (
    <div ref={ref} onScroll={onScroll} className="h-full overflow-auto px-3.5 py-2.5 font-mono"
         style={{ fontSize: 12, lineHeight: '19px', whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)' }}>
      {debugOutput !== undefined ? debugOutput : (
        <>
          {run!.chunks.map((c, i) => (
            <span key={i} style={{ color: c.stream === 'meta' ? MUTED : c.stream === 'stderr' ? BAD : undefined }}>
              {c.text}
            </span>
          ))}
          {run!.refused && <span style={{ color: WARN }}>{run!.refused}{'\n'}</span>}
          {run!.status !== 'running' && !run!.refused && <Finished run={run!} />}
        </>
      )}
    </div>
  );
}

function Finished({ run }: { run: PyRun }) {
  const ok = run.status === 'ok';
  return (
    <div className="flex items-center gap-1.5 mt-1" style={{ fontSize: 11.5 }}>
      {ok ? <CheckIcon size={IconSize.inline} color={OK} /> : <CloseIcon size={IconSize.inline} color={BAD} />}
      <span style={{ color: ok ? OK : BAD }}>
        {run.status === 'stopped' ? 'stopped' : ok ? 'finished' : `exit ${run.code ?? '?'}`}
        {run.durationMs !== undefined && ` in ${formatDuration(run.durationMs)}`}
      </span>
      {run.failedAt === 'copy' && <span style={{ color: MUTED }}>&middot; the copy into the pod failed, so nothing ran</span>}
      {run.removed && <span style={{ color: MUTED }}>&middot; removed {run.removed}</span>}
      {run.mode === 'stdin' && <span style={{ color: MUTED }}>&middot; streamed on stdin, nothing written to the pod</span>}
    </div>
  );
}

export function ConsolePane() {
  const debug = usePyStore(s => s.debug);
  const send = usePyStore(s => s.debugConsole);
  const [line, setLine] = useState('');
  const { ref, onScroll } = useStickToBottom(debug?.console.length);
  const paused = !!debug && !debug.ended && debug.state.status === 'paused';
  if (!debug) return <Empty>The pdb transcript appears here while debugging.</Empty>;
  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={ref} onScroll={onScroll} className="flex-1 min-h-0 overflow-auto px-3.5 py-2.5 font-mono"
           style={{ fontSize: 12, lineHeight: '19px', whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)' }}>
        {debug.console}
        {debug.ended && <span style={{ color: MUTED }}>{`\n-- ${debug.ended}${debug.removed ? ` · removed ${debug.removed}` : ''} --\n`}</span>}
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
           style={{ borderTop: '1px solid var(--color-surface-border)' }}>
        <span className="font-mono text-[11.5px]" style={{ color: MUTED }}>(Pdb)</span>
        <TextInputView
          size="xs" value={line} disabled={!paused}
          placeholder={paused ? 'p data, pp locals(), where, display x …' : 'pdb takes commands while paused'}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && line.trim()) { send(line); setLine(''); }
          }}
          style={{ flex: 1 }}
          aria-label="pdb command"
        />
      </div>
    </div>
  );
}

function ProblemsPane({ run, onJump }: { run?: PyRun; onJump: (line: number) => void }) {
  const problems = run?.problems ?? [];
  if (!run) return <Empty>Problems from the last run's traceback appear here.</Empty>;
  if (problems.length === 0) {
    return <Empty>{run.status === 'running' ? 'Running…' : 'No traceback pointed into the script.'}</Empty>;
  }
  return (
    <div className="h-full overflow-auto py-1">
      {problems.map((p, i) => (
        <div key={i} role="button" tabIndex={0}
             onClick={() => onJump(p.line)}
             onKeyDown={(e) => { if (e.key === 'Enter') onJump(p.line); }}
             className="flex items-center gap-2 px-3.5 py-1 text-[11.5px] cursor-pointer">
          <CloseIcon size={IconSize.inline} color={BAD} />
          <span style={{ color: 'var(--color-text-primary)' }}>{p.message}</span>
          <span className="font-mono" style={{ color: MUTED }}>
            {run.scriptName}:{p.line}{p.fn ? ` in ${p.fn}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function RunsPane({ runs, current, onPick }: { runs: PyRun[]; current?: string; onPick: (id: string) => void }) {
  if (runs.length === 0) return <Empty>Every run in this session is listed here, newest first.</Empty>;
  return (
    <div className="h-full overflow-auto py-1">
      {[...runs].reverse().map(r => {
        const tone = r.status === 'ok' ? OK : r.status === 'running' ? ACCENT : r.status === 'refused' ? WARN : BAD;
        return (
          <div key={r.runId} role="button" tabIndex={0}
               onClick={() => onPick(r.runId)}
               onKeyDown={(e) => { if (e.key === 'Enter') onPick(r.runId); }}
               className="flex items-center gap-2.5 px-3.5 py-1 text-[11.5px] cursor-pointer"
               style={{ background: r.runId === current ? 'var(--color-surface-hover)' : undefined, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ width: 6, height: 6, borderRadius: 6, background: tone, flexShrink: 0 }} />
            <span className="font-mono" style={{ color: 'var(--color-text-primary)' }}>{r.scriptName}</span>
            {r.args && <span className="font-mono truncate" style={{ color: MUTED, maxWidth: 200 }}>{r.args}</span>}
            <span style={{ color: MUTED }}>{podShort(r.target.pod)}</span>
            <span className="flex-1" />
            <span style={{ color: tone }}>
              {r.status === 'running' ? 'running' : r.status === 'refused' ? 'not run'
                : r.status === 'stopped' ? 'stopped' : `exit ${r.code ?? '?'}`}
            </span>
            <span style={{ color: MUTED, minWidth: 48, textAlign: 'right' }}>{formatDuration(r.durationMs)}</span>
            <span style={{ color: MUTED }}>{new Date(r.startedAt).toLocaleTimeString()}</span>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center px-6 text-center text-[11.5px]"
         style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </div>
  );
}
