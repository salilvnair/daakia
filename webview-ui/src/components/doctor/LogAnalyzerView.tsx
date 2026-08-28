/**
 * LogAnalyzerView — templates, bursts and the timeline.
 *
 * A log viewer that shows you lines is a worse `less`. The only reason to point
 * a tool at two million lines is to collapse them into the handful of shapes
 * they actually are, and then to show where the shape of the traffic changed.
 * So this opens on the timeline and the templates, and never renders raw lines
 * at all — the extension host reduces before anything crosses into the webview.
 *
 * That reduction is also redaction: a template has had its ids, addresses and
 * tokens replaced, so what is on screen is safe to screenshot into a ticket in
 * a way a log line is not.
 */
import { useEffect, useMemo, useState } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { DocumentIcon, CloseCircleIcon, StethoscopeIcon } from '../../icons';

const ACCENT = 'var(--color-doctor)';

type Level = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'UNKNOWN';

interface Template {
  template: string; count: number;
  byLevel: Partial<Record<Level, number>>;
  firstSeen?: number; lastSeen?: number; exampleLine: number;
}
interface Verdict {
  entries: number; lines: number; withoutTimestamp: number;
  timeRange?: { start: number; end: number };
  byLevel: Record<Level, number>;
  templates: Template[];
  distinctTemplates: number;
  buckets: { start: number; total: number; errors: number }[];
  bursts: { start: number; end: number; errors: number; timesBaseline: number; dominantTemplate?: string }[];
  exceptions: { type: string; count: number; cause?: string }[];
  rareTemplates: Template[];
}

const LEVEL_COLOR: Record<Level, string> = {
  FATAL: 'var(--color-error)',
  ERROR: 'var(--color-error)',
  WARN: 'var(--color-warning)',
  INFO: ACCENT,
  DEBUG: 'var(--color-text-muted)',
  TRACE: 'var(--color-text-muted)',
  UNKNOWN: 'var(--color-text-muted)',
};

const time = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

/** Dominant level of a template, so a shape is coloured by what it usually is. */
function topLevel(t: Template): Level {
  let best: Level = 'UNKNOWN';
  let n = -1;
  for (const [lvl, count] of Object.entries(t.byLevel)) {
    if ((count ?? 0) > n) { n = count ?? 0; best = lvl as Level; }
  }
  return best;
}

export function LogAnalyzerView() {
  const [loaded, setLoaded] = useState<{ name: string; verdict: Verdict } | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(false);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'logs:done') { setLoaded({ name: msg.name, verdict: msg.verdict }); setError(''); }
      else if (msg?.type === 'logs:error') { setError(msg.message); setLoaded(null); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const templates = useMemo(() => {
    if (!loaded) return [];
    const q = filter.trim().toLowerCase();
    return loaded.verdict.templates.filter(t =>
      (!q || t.template.toLowerCase().includes(q)) &&
      (!onlyProblems || ['ERROR', 'FATAL', 'WARN'].includes(topLevel(t))));
  }, [loaded, filter, onlyProblems]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <CloseCircleIcon size={32} style={{ color: 'var(--color-error)' }} />
        <p className="text-[13px] text-[var(--color-text-primary)] m-0">Could not read that log</p>
        <p className="text-[12px] text-[var(--color-text-muted)] m-0 max-w-[460px]">{error}</p>
        <ButtonView variant="secondary" size="sm" onClick={() => postMsg({ type: 'logs:open' })}>
          Try another file
        </ButtonView>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <StethoscopeIcon size={40} strokeWidth={1} style={{ color: ACCENT, opacity: 0.4 }} />
        <p className="text-[13px] text-[var(--color-text-primary)] m-0">Analyze a log file</p>
        <p className="text-[12px] text-[var(--color-text-muted)] m-0 max-w-[460px] leading-relaxed">
          Millions of lines collapse into the handful of shapes they actually are, then error bursts
          are found against the baseline. Parsing runs on this machine, and only templates — with ids,
          addresses and tokens already replaced — ever leave it.
        </p>
        <ButtonView
          variant="primary" size="sm"
          style={{ backgroundColor: ACCENT, borderColor: ACCENT, marginTop: 4 }}
          onClick={() => postMsg({ type: 'logs:open' })}
        >
          Open log file
        </ButtonView>
      </div>
    );
  }

  const v = loaded.verdict;
  const maxBucket = Math.max(1, ...v.buckets.map(b => b.total));
  const reduction = v.distinctTemplates ? Math.round(v.entries / v.distinctTemplates) : 0;
  const levels: Level[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2 flex-wrap flex-shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <DocumentIcon size={15} style={{ color: ACCENT }} />
        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{loaded.name}</span>
        <span className="text-[11.5px] text-[var(--color-text-muted)] font-mono">
          {v.entries.toLocaleString()} entries · {v.distinctTemplates} shapes · {reduction}:1
          {v.timeRange ? ` · ${time(v.timeRange.start)} → ${time(v.timeRange.end)}` : ''}
        </span>
        <div className="flex-1" />
        <ButtonView variant="secondary" size="sm" onClick={() => postMsg({ type: 'logs:open' })}>
          Open another
        </ButtonView>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3.5">
        {/* Bursts first — the reason to open the file */}
        {v.bursts.length > 0 && (
          <div className="rounded-lg p-3.5 flex flex-col gap-2"
               style={{ border: '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)',
                        background: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--color-error)' }}>
              {v.bursts.length === 1 ? 'Error burst detected' : `${v.bursts.length} error bursts detected`}
            </span>
            {v.bursts.slice(0, 4).map((b, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2 flex-wrap text-[12px]">
                  <span className="font-mono text-[var(--color-text-primary)]">{time(b.start)}</span>
                  <span className="text-[var(--color-text-muted)]">→</span>
                  <span className="font-mono text-[var(--color-text-primary)]">{time(b.end)}</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--color-error)' }}>
                    {b.errors.toLocaleString()} errors
                  </span>
                  <span className="text-[var(--color-text-muted)]">{b.timesBaseline}× baseline</span>
                </div>
                {b.dominantTemplate && (
                  <span className="text-[11.5px] font-mono text-[var(--color-text-secondary)] break-all">
                    {b.dominantTemplate}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        {v.buckets.length > 0 && (
          <div className="rounded-lg p-3.5 flex flex-col gap-2"
               style={{ border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Volume over time — errors in red
            </span>
            <div className="flex items-end gap-px" style={{ height: 56 }}>
              {v.buckets.map((b, i) => {
                const h = (b.total / maxBucket) * 100;
                const errH = b.total ? (b.errors / b.total) * h : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end"
                       style={{ height: '100%', minWidth: 1 }}
                       title={`${time(b.start)} — ${b.total} entries, ${b.errors} errors`}>
                    {errH > 0 && <div style={{ height: `${errH}%`, background: 'var(--color-error)' }} />}
                    <div style={{ height: `${h - errH}%`, background: 'color-mix(in srgb, var(--color-doctor) 55%, transparent)' }} />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 flex-wrap">
              {levels.map(l => v.byLevel[l] > 0 && (
                <span key={l} className="flex items-center gap-1.5 text-[11.5px] font-mono">
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: LEVEL_COLOR[l] }} />
                  <span className="text-[var(--color-text-secondary)]">{l.toLowerCase()}</span>
                  <span className="tabular-nums text-[var(--color-text-primary)]">{v.byLevel[l].toLocaleString()}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Exceptions */}
        {v.exceptions.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Exceptions
            </span>
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-surface-border)' }}>
              {v.exceptions.slice(0, 8).map((e, i) => (
                <div key={e.type} className="flex items-baseline gap-3 px-3 py-1.5 text-[11.5px] font-mono"
                     style={{ background: 'var(--color-surface)',
                              borderTop: i === 0 ? 'none' : '1px solid var(--color-surface-border)' }}>
                  <span className="tabular-nums text-right text-[var(--color-text-primary)]" style={{ width: 48 }}>
                    {e.count.toLocaleString()}
                  </span>
                  <span className="text-[var(--color-text-primary)] truncate">{e.type}</span>
                  {e.cause && (
                    <span className="text-[var(--color-text-muted)] truncate">caused by {e.cause}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Templates */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Message shapes
            </span>
            <input
              value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Filter shapes…"
              className="h-[22px] px-2 rounded-md text-[11px] font-mono outline-none"
              style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)',
                       border: '1px solid var(--color-surface-border)', minWidth: 200 }}
            />
            <button type="button" onClick={() => setOnlyProblems(v2 => !v2)}
                    className="h-[22px] px-2.5 rounded-md text-[11px] cursor-pointer"
                    style={{
                      color: onlyProblems ? 'var(--color-error)' : 'var(--color-text-secondary)',
                      background: onlyProblems ? 'color-mix(in srgb, var(--color-error) 12%, transparent)' : 'transparent',
                      border: `1px solid ${onlyProblems ? 'color-mix(in srgb, var(--color-error) 32%, transparent)' : 'var(--color-surface-border)'}`,
                    }}>
              errors &amp; warnings only
            </button>
            <span className="text-[11px] text-[var(--color-text-muted)] font-mono tabular-nums">
              {templates.length} of {v.distinctTemplates}
            </span>
          </div>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-surface-border)' }}>
            {templates.map((t, i) => {
              const lvl = topLevel(t);
              return (
                <div key={t.template} className="flex items-baseline gap-3 px-3 py-1.5 text-[11.5px] font-mono"
                     style={{ background: 'var(--color-surface)',
                              borderTop: i === 0 ? 'none' : '1px solid var(--color-surface-border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: LEVEL_COLOR[lvl], flexShrink: 0 }} />
                  <span className="tabular-nums text-right text-[var(--color-text-primary)]" style={{ width: 60 }}>
                    {t.count.toLocaleString()}
                  </span>
                  <span className="text-[var(--color-text-secondary)] break-all">{t.template}</span>
                </div>
              );
            })}
            {templates.length === 0 && (
              <p className="text-[12px] text-[var(--color-text-muted)] px-3 py-3 m-0">No shapes match.</p>
            )}
          </div>
        </div>

        {v.withoutTimestamp > 0 && (
          <p className="text-[11px] text-[var(--color-text-muted)] m-0">
            {v.withoutTimestamp.toLocaleString()} entries had no recognisable timestamp and are counted
            but not placed on the timeline.
          </p>
        )}
      </div>
    </div>
  );
}
