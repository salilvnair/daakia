/**
 * Where the CPU went, from a flight recording.
 *
 * The table is two numbers wide on purpose. `self` is samples where a method
 * was the innermost frame — the CPU was executing that code. `total` is
 * samples where it appeared anywhere — the CPU was somewhere underneath it. A
 * row with a long total bar and no self bar is a caller, and rewriting it does
 * nothing; showing one number would make those two look identical, which is
 * how people end up optimising a function that was never the cost.
 *
 * Rows expand into the stacks that reached them, because "String.equals is 40%
 * of your CPU" is not something anyone can act on, and "…and 38% of it arrives
 * through OrderValidator.check" is.
 */
import { useEffect, useMemo, useState } from 'react';
import { ButtonView, SearchInputView, SegmentedControlView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useDk8sAnalyzeStore } from '../../store/dk8s-analyze-store';
import { CpuIcon, CloseCircleIcon, ChevronRightIcon } from '../../icons';
import { TelemetryCharts, type TelemetryGroup } from './TelemetryCharts';
import { WaitsView, AllocationView, type WaitSite, type AllocSite } from './WaitsAndAllocation';
import { GcView, ProbesView, type GcSummary } from './GcAndProbes';
import { ThreadHistory, type WaitSpan } from './ThreadHistory';

const ACCENT = 'var(--color-dk8s)';

interface HotSpot {
  method: string;
  className: string;
  methodName: string;
  line: number;
  self: number;
  total: number;
  selfPercent: number;
  totalPercent: number;
  threads: { name: string; samples: number }[];
  backtraces: { frames: string[]; samples: number }[];
}

interface Loaded {
  name: string;
  recording: {
    startMs: number; durationMs: number; chunks: number; events: number;
    topEvents: { name: string; count: number }[];
  };
  samples: {
    total: number; runnable: number; idle: number;
    states: { state: string; count: number }[];
    threads: string[];
  };
  telemetry: { fromMs: number; toMs: number; groups: TelemetryGroup[] };
  waits: {
    sites: WaitSite[]; totalMs: number; count: number; wallMs: number; truncated: number;
    /** Socket and file sites, read without the blocking floor. */
    probes: WaitSite[];
  };
  allocation: {
    sites: AllocSite[]; totalBytes: number; samples: number;
    weighted: boolean; truncated: number;
  };
  gc: GcSummary;
  timeline: { spans: WaitSpan[]; dropped: number; fromMs: number; toMs: number };
  hotSpots: HotSpot[];
  truncated: number;
}

/**
 * Telemetry first.
 *
 * It is the axis the samples sit on: it says WHEN the recording was
 * interesting, and the hot spots say what was running. Opening on the ranked
 * table would answer the second question before the reader has asked the
 * first.
 */
type SubView = 'telemetry' | 'hotspots' | 'blocking' | 'allocation' | 'threads' | 'gc' | 'probes';

/** `com.acme.order.OrderService` → `c.a.o.OrderService`, keeping the class. */
function shortClass(name: string): string {
  const parts = name.split('.');
  if (parts.length < 3) return name;
  const cls = parts.pop()!;
  return `${parts.map(p => p[0] ?? '').join('.')}.${cls}`;
}

function Bar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-[5px] rounded-full overflow-hidden shrink-0"
         style={{ width: 84, background: 'var(--color-surface-hover)' }}>
      <div className="h-full rounded-full"
           style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%`, background: color }} />
    </div>
  );
}

export function CpuAnalyzerView() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<SubView>('telemetry');
  /** Which frames to hide. JDK internals are most of a stack and rarely the bug. */
  const [hideJdk, setHideJdk] = useState(false);

  const setHeader = useDk8sAnalyzeStore(st => st.setHeader);
  useEffect(() => {
    if (!loaded) { setHeader(undefined); return; }
    const secs = Math.round(loaded.recording.durationMs / 1000);
    setHeader({
      name: loaded.name,
      meta: `${secs}s · ${loaded.samples.total.toLocaleString()} samples`
        + ` · ${loaded.recording.events.toLocaleString()} events`,
    });
  }, [loaded, setHeader]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'jfr:done') { setLoaded(msg as Loaded); setError(''); }
      else if (msg?.type === 'jfr:error') { setError(msg.message); setLoaded(null); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const rows = useMemo(() => {
    if (!loaded) return [];
    const q = filter.trim().toLowerCase();
    return loaded.hotSpots.filter(h => {
      if (hideJdk && /^(java|javax|jdk|sun|com\.sun)\./.test(h.className)) return false;
      return !q || h.method.toLowerCase().includes(q);
    });
  }, [loaded, filter, hideJdk]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <CloseCircleIcon size={32} style={{ color: 'var(--color-error)' }} />
        <p className="text-[13px] text-[var(--color-text-primary)] m-0">Could not read that recording</p>
        <p className="text-[12px] text-[var(--color-text-muted)] m-0 max-w-[460px] leading-relaxed">{error}</p>
        <ButtonView variant="secondary" size="sm" onClick={() => postMsg({ type: 'jfr:open' })}>
          Try another file
        </ButtonView>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <CpuIcon size={40} strokeWidth={1} style={{ color: ACCENT, opacity: 0.4 }} />
        <p className="text-[13px] text-[var(--color-text-primary)] m-0">Analyze a flight recording</p>
        <p className="text-[12px] text-[var(--color-text-muted)] m-0 max-w-[460px] leading-relaxed">
          Open a <code>.jfr</code> to see which methods the CPU was actually in, and how
          it got there. dk8s records these itself — Doctor → Flight recording — or open
          one from anywhere. Parsing runs on this machine.
        </p>
        <ButtonView
          variant="secondary" size="sm" accentColor={ACCENT} color={ACCENT}
          style={{
            marginTop: 4,
            background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
            borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`,
            fontWeight: 600,
          }}
          onClick={() => postMsg({ type: 'jfr:open' })}
        >
          Open recording
        </ButtonView>
      </div>
    );
  }

  const { samples, recording } = loaded;
  const parked = samples.total - samples.runnable - (samples.idle ?? 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── What was measured ── */}
      <div className="px-4 pt-3.5 pb-3 flex flex-col gap-2.5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-[22px] font-semibold tabular-nums"
                style={{ color: 'var(--color-text-primary)' }}>
            {samples.runnable.toLocaleString()}
          </span>
          <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
            samples of running code, over {Math.round(recording.durationMs / 1000)}s
          </span>
          {/*
            Stated rather than silently dropped, both of them. A parked thread
            and a selector sitting in `EPoll.wait` are both sampled like any
            other, and counting either as CPU makes an idle server the busiest
            thing you have ever seen. Naming them is what stops the total
            looking wrong.
          */}
          {parked > 0 && (
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              · {parked.toLocaleString()} parked or waiting
            </span>
          )}
          {(samples.idle ?? 0) > 0 && (
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              · {samples.idle.toLocaleString()} sitting in a wait syscall — runnable, but not working
            </span>
          )}
        </div>

        {samples.runnable === 0 && (
          <div className="rounded-md px-3 py-2 text-[11.5px] leading-relaxed"
               style={{
                 background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
                 border: '1px solid color-mix(in srgb, var(--color-warning) 26%, transparent)',
                 color: 'var(--color-text-secondary)',
               }}>
            Nothing was running during this recording — every sample caught a thread
            parked or waiting. That is an answer: the application was idle, not slow.
            {samples.states.length > 0 && (
              <> States seen: {samples.states.map(s => `${s.state.replace('STATE_', '').toLowerCase()} (${s.count})`).join(', ')}.</>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedControlView
            value={view}
            onChange={v => setView(v as SubView)}
            /*
              Blocking sits beside hot spots, not under it. On a service that
              contends rather than computes, the CPU tab is nearly empty and
              this one holds the whole answer — burying it a level down would
              hide the finding behind the view that could not find it.
            */
            options={[
              { value: 'telemetry', label: 'Telemetry' },
              { value: 'hotspots', label: `Hot spots${loaded.hotSpots.length ? ` (${loaded.hotSpots.length})` : ''}` },
              { value: 'blocking', label: `Blocking${loaded.waits?.count ? ` (${loaded.waits.count.toLocaleString()})` : ''}` },
              { value: 'allocation', label: 'Allocation' },
              { value: 'threads', label: 'Thread history' },
              { value: 'gc', label: `GC${loaded.gc?.count ? ` (${loaded.gc.count})` : ''}` },
              { value: 'probes', label: 'Probes' },
            ]}
            size="sm" density="compact" accentColor={ACCENT}
          />
          {view === 'hotspots' && (
            <SearchInputView
              value={filter} onChange={setFilter}
              placeholder="Filter methods" size="sm" width={220}
            />
          )}
          {view === 'hotspots' && (
            <SegmentedControlView
              value={hideJdk ? 'app' : 'all'}
              onChange={v => setHideJdk(v === 'app')}
              options={[{ value: 'all', label: 'All frames' }, { value: 'app', label: 'Yours only' }]}
              size="sm" density="compact" accentColor={ACCENT}
            />
          )}
          <div className="flex-1" />
          <ButtonView variant="ghost" size="sm" onClick={() => postMsg({ type: 'jfr:open' })}>
            Open another
          </ButtonView>
        </div>
      </div>

      {view === 'threads' && (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-1">
          <ThreadHistory
            spans={loaded.timeline?.spans ?? []}
            fromMs={loaded.timeline?.fromMs ?? 0}
            toMs={loaded.timeline?.toMs ?? 0}
          />
        </div>
      )}

      {view === 'gc' && (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-1">
          <GcView gc={loaded.gc} />
        </div>
      )}

      {view === 'probes' && (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-1">
          {/*
            `probes`, not `sites`. The blocking list is filtered to waits that
            cost time; this view wants every endpoint the process touched,
            however briefly.
          */}
          <ProbesView sites={loaded.waits?.probes ?? []} hasRecording />
        </div>
      )}

      {view === 'blocking' && (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <WaitsView waits={loaded.waits} />
        </div>
      )}

      {view === 'allocation' && (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <AllocationView allocation={loaded.allocation} />
        </div>
      )}

      {view === 'telemetry' && (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <TelemetryCharts
            groups={loaded.telemetry?.groups ?? []}
            fromMs={loaded.telemetry?.fromMs ?? 0}
            toMs={loaded.telemetry?.toMs ?? 0}
          />
        </div>
      )}

      {/* ── Hot spots ── */}
      {view === 'hotspots' && (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        <div className="flex items-center gap-3 px-2 py-1.5 text-[9.5px] uppercase tracking-wider"
             style={{ color: 'var(--color-text-muted)' }}>
          <span style={{ width: 84 }}>self</span>
          <span style={{ width: 84 }}>total</span>
          <span>method</span>
        </div>

        {rows.length === 0 && (
          <div className="px-2 py-6 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            {loaded.hotSpots.length === 0
              ? 'No methods were sampled while running.'
              : 'No method matches that filter.'}
          </div>
        )}

        {rows.map(h => {
          const isOpen = open === h.method;
          return (
            <div key={h.method} className="rounded-md"
                 style={{ background: isOpen ? 'var(--color-surface)' : undefined }}>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-2 py-1.5 text-left rounded-md"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                onClick={() => setOpen(isOpen ? null : h.method)}
              >
                <span className="flex items-center gap-1.5" style={{ width: 84 }}>
                  <Bar percent={h.selfPercent} color={ACCENT} />
                </span>
                <span className="flex items-center gap-1.5" style={{ width: 84 }}>
                  <Bar percent={h.totalPercent} color="var(--color-text-muted)" />
                </span>
                <span className="text-[11.5px] tabular-nums shrink-0"
                      style={{ width: 46, color: 'var(--color-text-secondary)' }}>
                  {h.selfPercent.toFixed(1)}%
                </span>
                <span className="text-[11.5px] font-mono truncate min-w-0 flex-1"
                      style={{ color: 'var(--color-text-primary)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{shortClass(h.className)}.</span>
                  <span style={{ fontWeight: 600 }}>{h.methodName}</span>
                  {h.line >= 0 && (
                    <span style={{ color: 'var(--color-text-muted)' }}>:{h.line}</span>
                  )}
                </span>
                <ChevronRightIcon
                  size={12}
                  style={{
                    color: 'var(--color-text-muted)', flexShrink: 0,
                    transform: isOpen ? 'rotate(90deg)' : undefined,
                    transition: 'transform 120ms',
                  }}
                />
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
                  <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="font-mono">{h.className}.{h.methodName}</span>
                    {' — '}{h.self} of {samples.runnable} samples here
                    {h.total > h.self && <>, {h.total} with it on the stack</>}
                  </div>

                  {h.threads.length > 0 && (
                    <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      threads: {h.threads.map(t => `${t.name} (${t.samples})`).join(', ')}
                    </div>
                  )}

                  {/* How the CPU got here — the part that makes a hot spot actionable. */}
                  {h.backtraces.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[9.5px] uppercase tracking-wider"
                            style={{ color: 'var(--color-text-muted)' }}>
                        called from
                      </span>
                      {h.backtraces.map((b, i) => (
                        <div key={i} className="rounded-md px-2.5 py-2"
                             style={{ background: 'var(--color-panel)', border: '1px solid var(--color-surface-border)' }}>
                          <div className="text-[10.5px] mb-1" style={{ color: ACCENT }}>
                            {b.samples} sample{b.samples === 1 ? '' : 's'}
                          </div>
                          {b.frames.length === 0 && (
                            <div className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                              nothing above it — this was the outermost frame
                            </div>
                          )}
                          {b.frames.slice(0, 12).map((f, j) => (
                            <div key={j} className="text-[10.5px] font-mono truncate"
                                 style={{ color: 'var(--color-text-secondary)', paddingLeft: j * 8 }}>
                              {f}
                            </div>
                          ))}
                          {b.frames.length > 12 && (
                            <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                              +{b.frames.length - 12} more frames
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {loaded.truncated > 0 && (
          // Never a silently short list: the tail of a profile is thousands of
          // methods sampled once, and the count is what says the list ended on
          // purpose.
          <div className="px-2 py-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {loaded.truncated.toLocaleString()} more methods were sampled less often and are not shown.
          </div>
        )}
      </div>
      )}
    </div>
  );
}
