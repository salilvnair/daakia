/**
 * ThreadAnalyzerView — deadlocks, contention and where the threads actually are.
 *
 * Opens on the diagnosis, like the heap Verdict does. A raw thread dump is a
 * wall of 2,000 stacks; the only reason to open one is to answer "what is stuck
 * and why", so that answer goes first and the stacks come after.
 *
 * Deadlocks are shown as a cycle rather than a list, because the shape is the
 * point — A waits on B waits on A is instantly readable in a way two rows of
 * text are not.
 */
import { useEffect, useMemo, useState } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { SparkleIcon } from '../../icons';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';
import { parseFrame, summariseStack, type FrameOrigin } from './thread-frame';
import { postMsg } from '../../vscode';
import { LayersIcon, CloseCircleIcon, StethoscopeIcon } from '../../icons';

const ACCENT = 'var(--color-doctor)';

type State = 'NEW' | 'RUNNABLE' | 'BLOCKED' | 'WAITING' | 'TIMED_WAITING' | 'TERMINATED' | 'UNKNOWN';

interface Frame { raw: string; jdk: boolean }
interface Thread {
  name: string; state: State; daemon: boolean; cpuMs?: number;
  status: string; stateDetail?: string; frames: Frame[];
  waitingToLock?: { id: string; className?: string };
  locked?: { id: string; className?: string }[];
}
interface Verdict {
  totalThreads: number; daemonThreads: number;
  byState: Record<State, number>;
  deadlocks: { threads: string[]; source: 'jvm' | 'computed' }[];
  deadlockDisagreement?: string;
  contention: { lockId: string; className?: string; ownerThread?: string; blockedThreads: string[]; blockedAt?: string }[];
  hotFrames: { method: string; file?: string; line?: number; threads: number; jdk: boolean }[];
  pools: { name: string; count: number; byState: Partial<Record<State, number>> }[];
  topCpu: { name: string; cpuMs: number; state: State; topFrame?: string }[];
  /** Optional: an older host bundle will not send these. */
  suspects?: {
    markerId: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    why: string;
    threads: { name: string; state: State; frame: string; cpuMs?: number }[];
  }[];
  headline?: string;
}
interface Loaded {
  name: string;
  dump: { timestamp?: string; jvm?: string; unparsedLines: number };
  verdict: Verdict;
  threads: Thread[];
}

/** State colours: red for stuck, green for working, muted for idle-by-design. */
const STATE_COLOR: Record<State, string> = {
  BLOCKED: 'var(--color-error)',
  RUNNABLE: 'var(--color-success)',
  WAITING: 'var(--color-text-muted)',
  TIMED_WAITING: 'var(--color-text-muted)',
  NEW: 'var(--color-text-muted)',
  TERMINATED: 'var(--color-text-muted)',
  UNKNOWN: 'var(--color-warning)',
};


const AI_ACCENT = 'var(--color-protocol-ai)';

/**
 * Colour by where a frame comes from.
 *
 * Your own code is the only thing rendered at full strength. The JDK and the
 * frameworks are how the thread got there — necessary to the story, and not
 * what anyone is scanning for. Printed in one colour, finding your class in
 * forty frames means reading every line.
 */
const ORIGIN_STYLE: Record<FrameOrigin, { color: string; opacity: number }> = {
  app:       { color: 'var(--color-dk8s)', opacity: 1 },
  framework: { color: 'var(--color-text-secondary)', opacity: 0.78 },
  jdk:       { color: 'var(--color-text-muted)', opacity: 0.62 },
  native:    { color: 'var(--color-warning)', opacity: 0.75 },
};

function Stack({ frames }: { frames: { raw: string }[] }) {
  if (!frames.length) {
    return (
      <span className="text-[10.5px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
        no stack recorded
      </span>
    );
  }
  return (
    <div className="font-mono text-[10.5px] leading-[1.55] overflow-x-auto"
         style={{ paddingLeft: 2 }}>
      {frames.map((f, i) => {
        const p = parseFrame(f.raw);
        const st = ORIGIN_STYLE[p.origin];
        return (
          <div key={i} className="whitespace-pre" style={{ opacity: st.opacity }}>
            <span style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>at </span>
            {p.packageName && (
              <span style={{ color: 'var(--color-text-muted)', opacity: 0.55 }}>
                {p.packageName}.
              </span>
            )}
            <span style={{ color: st.color, fontWeight: p.origin === 'app' ? 600 : 400 }}>
              {p.className}
            </span>
            <span style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>.</span>
            <span style={{ color: st.color }}>{p.method}</span>
            {p.location && (
              <span style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}> ({p.location})</span>
            )}
            {p.origin === 'native' && (
              <span style={{ color: 'var(--color-warning)', opacity: 0.6 }}> native</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ThreadAnalyzerView() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<State | 'ALL'>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  const ask = useDk8sAiStore(s => s.ask);

  /**
   * One thread, with its stack, as its own question.
   *
   * The state and the name are carried separately because the model should
   * not have to infer "this is a Tomcat request thread parked in a socket
   * read" from forty frames when we already know it.
   */
  const askThread = (t: Thread) => {
    ask({
      promptKey: 'dk8s.threads.explainOne',
      title: `Explain ${t.name}`,
      evidence: [
        `thread: ${t.name}`,
        `state: ${t.state}${t.daemon ? ' (daemon)' : ''}`,
        t.waitingToLock ? `waiting to lock: ${t.waitingToLock.className ?? t.waitingToLock.id}` : '',
        (t.locked ?? []).length
          ? `holds: ${(t.locked ?? []).map(l => l.className ?? l.id).join(', ')}`
          : '',
        '',
        ...t.frames.map(f => `  at ${f.raw}`),
      ].filter(Boolean).join('\n'),
      evidenceLabel: 'THREAD',
      podContext: {},
    });
  };

  /** The grouped picture, rather than one thread out of it. */
  const askOverview = () => {
    if (!loaded) return;
    const v = loaded.verdict;
    ask({
      promptKey: 'dk8s.threads.explain',
      title: 'What these threads are doing',
      evidence: [
        `${v.totalThreads} threads, ${v.daemonThreads} daemon`,
        `states: ${Object.entries(v.byState).map(([k, c]) => `${k}=${c}`).join(', ')}`,
        v.deadlocks.length ? `deadlocks: ${v.deadlocks.length}` : 'no deadlock reported',
        '',
        ...loaded.threads.slice(0, 60).map((t: Thread) =>
          `${t.name} [${t.state}] ${summariseStack(t.frames)}`),
      ].join('\n'),
      evidenceLabel: 'THREAD DUMP',
      podContext: {},
    });
  };

  /** Back to the empty state — see the note on the button. */
  const reset = () => {
    setLoaded(null); setError(''); setFilter('');
    setStateFilter('ALL'); setExpanded(null);
  };

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'threads:done') { setLoaded(msg as Loaded); setError(''); }
      else if (msg?.type === 'threads:error') { setError(msg.message); setLoaded(null); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const visible = useMemo(() => {
    if (!loaded) return [];
    const q = filter.trim().toLowerCase();
    return loaded.threads.filter(t =>
      (stateFilter === 'ALL' || t.state === stateFilter) &&
      (!q || t.name.toLowerCase().includes(q) || t.frames.some(f => f.raw.toLowerCase().includes(q))));
  }, [loaded, filter, stateFilter]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <CloseCircleIcon size={32} style={{ color: 'var(--color-error)' }} />
        <p className="text-[13px] text-[var(--color-text-primary)] m-0">Could not read that thread dump</p>
        <p className="text-[12px] text-[var(--color-text-muted)] m-0 max-w-[460px] leading-relaxed">{error}</p>
        <ButtonView variant="secondary" size="sm" onClick={() => postMsg({ type: 'threads:open' })}>
          Try another file
        </ButtonView>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <StethoscopeIcon size={40} strokeWidth={1} style={{ color: ACCENT, opacity: 0.4 }} />
        <p className="text-[13px] text-[var(--color-text-primary)] m-0">Analyze a thread dump</p>
        <p className="text-[12px] text-[var(--color-text-muted)] m-0 max-w-[440px] leading-relaxed">
          Open the output of <code>jstack &lt;pid&gt;</code> or <code>jcmd &lt;pid&gt; Thread.print</code> to get
          deadlock cycles, lock contention and where every thread is stuck. Parsing runs on this machine.
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
          onClick={() => postMsg({ type: 'threads:open' })}
        >
          Open thread dump
        </ButtonView>
      </div>
    );
  }

  const { verdict: v, dump } = loaded;
  // Default rather than assume. The host bundle can be a version behind this
  // view, and a missing field must not take the whole analyzer down with it.
  const suspects = v.suspects ?? [];
  const states: State[] = ['RUNNABLE', 'BLOCKED', 'WAITING', 'TIMED_WAITING'];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2 flex-wrap flex-shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <LayersIcon size={15} style={{ color: ACCENT }} />
        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{loaded.name}</span>
        <span className="text-[11.5px] text-[var(--color-text-muted)] font-mono">
          {v.totalThreads} threads · {v.daemonThreads} daemon
          {dump.timestamp ? ` · ${dump.timestamp}` : ''}
        </span>
        <div className="flex-1" />
        <ButtonView variant="secondary" size="sm" onClick={reset}>
          Open another
        </ButtonView>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3.5">
        {/* Deadlocks — the reason to open a dump at all */}
        {v.deadlocks.length > 0 && (
          <div className="rounded-lg p-3.5 flex flex-col gap-2.5"
               style={{ border: '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)',
                        background: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--color-error)' }}>
              {v.deadlocks.length === 1 ? 'Deadlock detected' : `${v.deadlocks.length} deadlocks detected`}
            </span>
            {v.deadlocks.map((d, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11.5px]">
                  {d.threads.map((t, j) => (
                    <span key={j} className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded"
                            style={{ background: 'color-mix(in srgb, var(--color-error) 16%, transparent)',
                                     color: 'var(--color-error)' }}>{t}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>waits on</span>
                    </span>
                  ))}
                  {/* Close the cycle back to the first thread, which is the point. */}
                  <span className="px-1.5 py-0.5 rounded"
                        style={{ background: 'color-mix(in srgb, var(--color-error) 16%, transparent)',
                                 color: 'var(--color-error)' }}>{d.threads[0]}</span>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {d.source === 'computed'
                    ? 'Derived from the wait-for graph, and confirmed by the JVM’s own report.'
                    : 'Reported by the JVM.'}
                </span>
              </div>
            ))}
            {v.deadlockDisagreement && (
              <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
                {v.deadlockDisagreement}
              </span>
            )}
          </div>
        )}

        {/* The headline. One line saying what this dump shows — including
            "nothing, look elsewhere", which is a genuinely useful answer and
            the one people most often fail to reach on their own. */}
        {v.headline && (
          <div className="rounded-lg px-3.5 py-2.5 flex items-center gap-2.5"
               style={{
                 border: `1px solid ${suspects.some(x => x.severity === 'critical')
                   ? 'color-mix(in srgb, var(--color-error) 32%, transparent)'
                   : 'var(--color-surface-border)'}`,
                 background: suspects.some(x => x.severity === 'critical')
                   ? 'color-mix(in srgb, var(--color-error) 7%, transparent)'
                   : 'var(--color-surface)',
               }}>
            <span className="text-[12.5px]"
                  style={{
                    color: suspects.some(x => x.severity === 'critical')
                      ? 'var(--color-error)' : 'var(--color-text-secondary)',
                  }}>
              {v.headline}
            </span>
          </div>
        )}

        {/* Suspicious frames */}
        {suspects.length > 0 && (
          <div className="rounded-lg p-3.5 flex flex-col gap-3"
               style={{ border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                What the threads are doing
              </span>
              <div className="flex-1" />
            <ButtonView
              label="Ask AI"
              size="sm" variant="secondary"
              accentColor={AI_ACCENT} color={AI_ACCENT}
              onClick={askOverview}
              title="Ask AI what this dump shows overall"
              iconLeft={<SparkleIcon size={11} color={AI_ACCENT} />}
              style={{
                background: `color-mix(in srgb, ${AI_ACCENT} 14%, transparent)`,
                borderColor: `color-mix(in srgb, ${AI_ACCENT} 40%, transparent)`,
                fontWeight: 600,
              }}
            />
            </div>
            {suspects.map(sus => {
              const color = sus.severity === 'critical' ? 'var(--color-error)'
                : sus.severity === 'warning' ? 'var(--color-warning)'
                : 'var(--color-text-muted)';
              return (
                <div key={sus.markerId} className="flex flex-col gap-1.5 pl-2.5"
                     style={{ borderLeft: `2px solid ${color}` }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12.5px] font-medium" style={{ color }}>
                      {sus.title}
                    </span>
                    <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      {sus.threads.length} thread{sus.threads.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {/* The reason, always. A finding that says "suspicious" and
                      nothing else costs the reader time to dismiss. */}
                  <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {sus.why}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {sus.threads.slice(0, 6).map(t => (
                      <div key={t.name} className="flex items-baseline gap-2 font-mono text-[11px]">
                        <span style={{ color: 'var(--color-text-primary)' }}>{t.name}</span>
                        <span style={{ color: STATE_COLOR[t.state] }}>{t.state}</span>
                        <span className="truncate" style={{ color: 'var(--color-text-muted)' }}>{t.frame}</span>
                        {t.cpuMs !== undefined && t.cpuMs > 0 && (
                          <span style={{ color: 'var(--color-text-muted)' }}>{t.cpuMs.toFixed(0)}ms cpu</span>
                        )}
                      </div>
                    ))}
                    {sus.threads.length > 6 && (
                      <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                        and {sus.threads.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* State distribution */}
        <div className="rounded-lg p-3.5 flex flex-col gap-2"
             style={{ border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Thread states
          </span>
          <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
            {states.map(s => v.byState[s] > 0 && (
              <div key={s} title={`${s}: ${v.byState[s]}`}
                   style={{ width: `${(v.byState[s] / v.totalThreads) * 100}%`, background: STATE_COLOR[s] }} />
            ))}
          </div>
          <div className="flex gap-3 flex-wrap">
            {states.map(s => v.byState[s] > 0 && (
              <button key={s} type="button"
                      onClick={() => setStateFilter(stateFilter === s ? 'ALL' : s)}
                      className="flex items-center gap-1.5 text-[11.5px] font-mono cursor-pointer"
                      style={{ background: 'none', border: 'none', padding: 0,
                               opacity: stateFilter === 'ALL' || stateFilter === s ? 1 : 0.4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: STATE_COLOR[s] }} />
                <span className="text-[var(--color-text-secondary)]">{s.toLowerCase().replace('_', ' ')}</span>
                <span className="tabular-nums text-[var(--color-text-primary)]">{v.byState[s]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Contention */}
        {v.contention.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Lock contention
            </span>
            {v.contention.slice(0, 5).map(c => (
              <div key={c.lockId} className="rounded-lg p-3 flex flex-col gap-1.5"
                   style={{ border: '1px solid var(--color-surface-border)',
                            borderLeft: '3px solid var(--color-warning)', background: 'var(--color-surface)' }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold tabular-nums" style={{ color: 'var(--color-warning)' }}>
                    {c.blockedThreads.length}
                  </span>
                  <span className="text-[12px] text-[var(--color-text-secondary)]">threads blocked on</span>
                  <span className="text-[12px] font-mono text-[var(--color-text-primary)]">
                    {c.className ?? c.lockId}
                  </span>
                  {c.ownerThread && (
                    <>
                      <span className="text-[12px] text-[var(--color-text-secondary)]">held by</span>
                      <span className="text-[12px] font-mono text-[var(--color-text-primary)]">{c.ownerThread}</span>
                    </>
                  )}
                </div>
                {c.blockedAt && (
                  <span className="text-[11px] font-mono text-[var(--color-text-muted)] break-all">
                    all stuck at {c.blockedAt}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pools */}
        {v.pools.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Thread pools
            </span>
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-surface-border)' }}>
              {v.pools.slice(0, 10).map((p, i) => (
                <div key={p.name} className="flex items-center gap-3 px-3 py-1.5 text-[11.5px] font-mono"
                     style={{ background: 'var(--color-surface)',
                              borderTop: i === 0 ? 'none' : '1px solid var(--color-surface-border)' }}>
                  <span className="tabular-nums text-right text-[var(--color-text-primary)]" style={{ width: 34 }}>
                    {p.count}
                  </span>
                  <div className="flex gap-0.5 flex-shrink-0" style={{ width: 70 }}>
                    {states.map(s => (p.byState[s] ?? 0) > 0 && (
                      <div key={s} title={`${s}: ${p.byState[s]}`}
                           style={{ width: `${((p.byState[s] ?? 0) / p.count) * 70}px`, height: 6,
                                    borderRadius: 1, background: STATE_COLOR[s] }} />
                    ))}
                  </div>
                  <span className="truncate text-[var(--color-text-secondary)]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Threads */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Threads
            </span>
            <ButtonView
              label="Ask AI"
              size="sm" variant="secondary"
              accentColor={AI_ACCENT} color={AI_ACCENT}
              onClick={askOverview}
              title="Ask AI what this dump shows overall"
              iconLeft={<SparkleIcon size={11} color={AI_ACCENT} />}
              style={{
                background: `color-mix(in srgb, ${AI_ACCENT} 14%, transparent)`,
                borderColor: `color-mix(in srgb, ${AI_ACCENT} 40%, transparent)`,
                fontWeight: 600,
              }}
            />
            <input
              value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Filter by name or frame…"
              className="h-[22px] px-2 rounded-md text-[11px] font-mono outline-none"
              style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)',
                       border: '1px solid var(--color-surface-border)', minWidth: 200 }}
            />
            <span className="text-[11px] text-[var(--color-text-muted)] font-mono tabular-nums">
              {visible.length} shown{stateFilter !== 'ALL' ? ` · ${stateFilter}` : ''}
            </span>
          </div>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-surface-border)' }}>
            {visible.slice(0, 300).map((t, i) => (
              <div key={`${t.name}-${i}`}
                   style={{ background: 'var(--color-surface)',
                            borderTop: i === 0 ? 'none' : '1px solid var(--color-surface-border)' }}>
                <div className="flex items-center">
                <button type="button"
                        onClick={() => setExpanded(expanded === `${t.name}-${i}` ? null : `${t.name}-${i}`)}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11.5px] font-mono cursor-pointer text-left"
                        style={{ background: 'none', border: 'none' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: STATE_COLOR[t.state], flexShrink: 0 }} />
                  <span className="truncate text-[var(--color-text-primary)]" style={{ minWidth: 0, flex: 1 }}>
                    {t.name}
                  </span>
                  {/* Where the thread actually is, without expanding it.
                      A list of forty names all reading "runnable" says
                      nothing; the topmost frame in your own code is the
                      thing being looked for. */}
                  <span className="text-[10.5px] truncate shrink-0 hidden md:inline"
                        style={{ color: 'var(--color-text-muted)', maxWidth: 280 }}>
                    {summariseStack(t.frames)}
                  </span>
                  {t.frames.length > 0 && (
                    <span className="text-[10px] shrink-0 tabular-nums"
                          style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}>
                      {t.frames.length}f
                    </span>
                  )}
                  {t.daemon && <span className="text-[10px] text-[var(--color-text-muted)]">daemon</span>}
                  <span className="text-[10.5px] flex-shrink-0" style={{ color: STATE_COLOR[t.state] }}>
                    {t.state.toLowerCase().replace('_', ' ')}
                  </span>
                </button>

                {/* One thread is a question on its own — "why is this one
                    here" — and asking it should not mean selecting forty
                    lines of stack by hand first. */}
                {/* Nothing to explain without a stack — some threads are
                    reported by name and state alone, and asking about one
                    would send the model a question it cannot answer. */}
                <button
                  type="button"
                  disabled={t.frames.length === 0}
                  onClick={e => { e.stopPropagation(); askThread(t); }}
                  title={t.frames.length === 0
                    ? 'No stack was recorded for this thread'
                    : `Ask AI why ${t.name} is where it is`}
                  className="flex items-center justify-center shrink-0 mr-2"
                  style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: 'transparent', border: '1px solid transparent',
                    cursor: t.frames.length === 0 ? 'default' : 'pointer',
                    opacity: t.frames.length === 0 ? 0.25 : 1,
                  }}
                >
                  <SparkleIcon
                    size={12}
                    color={t.frames.length === 0 ? 'var(--color-text-muted)' : AI_ACCENT}
                  />
                </button>
                </div>
                {expanded === `${t.name}-${i}` && (
                  <div className="px-3 pb-2.5 flex flex-col gap-1.5">
                    {(t.waitingToLock || (t.locked ?? []).length > 0) && (
                      <div className="flex flex-col gap-0.5 text-[10.5px] font-mono">
                        {t.waitingToLock && (
                          <span style={{ color: 'var(--color-warning)' }}>
                            waiting to lock {t.waitingToLock.className ?? t.waitingToLock.id}
                          </span>
                        )}
                        {(t.locked ?? []).map((l, li) => (
                          <span key={li} style={{ color: 'var(--color-text-muted)' }}>
                            holds {l.className ?? l.id}
                          </span>
                        ))}
                      </div>
                    )}
                    <Stack frames={t.frames} />
                  </div>
                )}
              </div>
            ))}
            {visible.length > 300 && (
              <p className="text-[11px] text-[var(--color-text-muted)] px-3 py-2 m-0">
                {(visible.length - 300).toLocaleString()} more not shown — narrow the filter.
              </p>
            )}
          </div>
        </div>

        {dump.unparsedLines > 0 && (
          <p className="text-[11px] text-[var(--color-text-muted)] m-0">
            {dump.unparsedLines} line{dump.unparsedLines === 1 ? '' : 's'} in this dump were not recognised and
            were skipped. Thread dump formats vary between vendors; the threads above parsed cleanly.
          </p>
        )}
      </div>
    </div>
  );
}
