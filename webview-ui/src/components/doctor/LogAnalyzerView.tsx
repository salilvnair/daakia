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
import { useDk8sAnalyzeStore } from '../../store/dk8s-analyze-store';

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


/**
 * A template, with its placeholders picked out.
 *
 * `Connection refused to <ip>:<num>` is a shape, and the whole point of the
 * view is that it IS a shape — the angle-bracket slots are where a million
 * distinct lines collapsed into one. Rendered in the same colour as the words
 * around them they read as literal text, which is exactly backwards.
 */
function Shape({ template }: { template: string }) {
  const parts = template.split(/(<[a-z0-9_]+>)/gi);
  return (
    <span className="break-all">
      {parts.map((part, i) =>
        /^<[a-z0-9_]+>$/i.test(part) ? (
          <span
            key={i}
            style={{
              color: 'var(--color-dk8s)',
              background: 'color-mix(in srgb, var(--color-dk8s) 12%, transparent)',
              borderRadius: 3,
              padding: '0 3px',
              fontWeight: 600,
            }}
          >
            {part}
          </span>
        ) : (
          <span key={i} style={{ color: 'var(--color-text-secondary)' }}>{part}</span>
        ))}
    </span>
  );
}

/**
 * One level, its count, and whether the list is narrowed to it.
 *
 * Disabled at zero rather than hidden: "0 err" is an answer, and a button that
 * vanishes when the news is good makes the toolbar shift under the cursor.
 */
function LevelToggle({ on, onClick, color, count, label }: {
  on: boolean; onClick: () => void; color: string; count: number; label: string;
}) {
  const none = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={none}
      title={on ? `Showing only ${label}` : `Show only ${label}`}
      className="h-[22px] px-2.5 rounded-md text-[11px] cursor-pointer flex items-center gap-1.5"
      style={{
        color: on ? color : 'var(--color-text-secondary)',
        background: on ? `color-mix(in srgb, ${color} 12%, transparent)` : 'transparent',
        border: `1px solid ${on
          ? `color-mix(in srgb, ${color} 34%, transparent)`
          : 'var(--color-surface-border)'}`,
        opacity: none ? 0.4 : 1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 6, background: color, flexShrink: 0 }} />
      <span style={{ fontWeight: 600 }}>{count.toLocaleString()}</span>
      <span style={{ opacity: 0.75 }}>{label}</span>
    </button>
  );
}

/** ERROR / WARN / INFO as a readable pill rather than an 8px square. */
function LevelPill({ level }: { level: Level }) {
  /*
    An unlevelled shape reserves the width without drawing anything, so the
    counts beside it stay in a column. The column itself only exists when
    something in the file has a level — see `anyLevel`.
  */
  if (level === 'UNKNOWN') return <span className="shrink-0" style={{ width: 52 }} />;

  const color = LEVEL_COLOR[level];
  return (
    <span
      className="shrink-0 text-center uppercase"
      style={{
        width: 52, fontSize: 9.5, letterSpacing: '.06em', fontWeight: 700,
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
        borderRadius: 4, padding: '2px 0', lineHeight: 1.3,
      }}
    >
      {level}
    </span>
  );
}

export function LogAnalyzerView() {
  const [loaded, setLoaded] = useState<{ name: string; verdict: Verdict } | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  /*
    Errors and warnings as separate switches.

    One "errors & warnings only" button could not answer the question people
    actually arrive with — "how many errors are there" — and could not narrow
    to just errors when a noisy warning drowns them. Two toggles carry their
    own counts, so the answer is on the button before it is pressed.
  */
  const [onlyError, setOnlyError] = useState(false);
  const [onlyWarn, setOnlyWarn] = useState(false);

  /* See the note in ThreadAnalyzerView — the shell owns the header. */
  const setHeader = useDk8sAnalyzeStore(st => st.setHeader);
  useEffect(() => {
    if (!loaded) { setHeader(undefined); return; }
    const v = loaded.verdict;
    const r = v.distinctTemplates ? Math.round(v.entries / v.distinctTemplates) : 0;
    setHeader({
      name: loaded.name,
      meta: `${v.entries.toLocaleString()} entries · ${v.distinctTemplates} shapes · ${r}:1`,
    });
  }, [loaded, setHeader]);

  /** Back to the empty state — see the note on the button. */
  const reset = () => {
    setLoaded(null); setError(''); setFilter('');
    setOnlyError(false); setOnlyWarn(false);
  };

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'logs:done') { setLoaded({ name: msg.name, verdict: msg.verdict }); setError(''); }
      else if (msg?.type === 'logs:error') { setError(msg.message); setLoaded(null); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  /** The biggest shape, so every bar is drawn against the same scale. */
  const topCount = useMemo(
    () => loaded?.verdict.templates.reduce((m, t) => Math.max(m, t.count), 0) ?? 0,
    [loaded],
  );

  const templates = useMemo(() => {
    if (!loaded) return [];
    const q = filter.trim().toLowerCase();
    // Neither toggle pressed means no level filter at all; both pressed means
    // errors or warnings, which is the old button's behaviour reachable by
    // pressing both rather than being the only option.
    const wanted = new Set<string>();
    if (onlyError) { wanted.add('ERROR'); wanted.add('FATAL'); }
    if (onlyWarn) wanted.add('WARN');

    return loaded.verdict.templates.filter(t =>
      (!q || t.template.toLowerCase().includes(q)) &&
      (wanted.size === 0 || wanted.has(topLevel(t))));
  }, [loaded, filter, onlyError, onlyWarn]);

  /*
    Does anything here have a level at all?

    A connection snapshot or a plain text file has none — every row would
    reserve 52px for a pill that is never drawn, indenting the whole list away
    from its own left edge for no reason. The column earns its place only when
    it carries something.
  */
  const anyLevel = useMemo(
    () => (loaded?.verdict.templates ?? []).some(t => topLevel(t) !== 'UNKNOWN'),
    [loaded],
  );

  /** Lines, not shapes: "123 err" means 123 lines, which is what people mean. */
  const levelCounts = useMemo(() => {
    let err = 0; let wrn = 0;
    for (const t of loaded?.verdict.templates ?? []) {
      const lvl = topLevel(t);
      if (lvl === 'ERROR' || lvl === 'FATAL') err += t.count;
      else if (lvl === 'WARN') wrn += t.count;
    }
    return { err, wrn };
  }, [loaded]);

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
          variant="secondary" size="sm"
          accentColor={ACCENT} color={ACCENT}
          style={{
            marginTop: 4,
            background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
            borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`,
            fontWeight: 600,
          }}
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

        {/* Templates.
             `flex-1` so the list reaches the bottom of the panel. A file with
             three shapes otherwise left a bordered box hanging in the middle
             of an empty page, which reads as content that failed to load. */}
        <div className="flex flex-col gap-2 flex-1 min-h-0">
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
            {/* Same rule as the column: in a file with no levels at all — a
                connection snapshot, a plain text dump — "0 err" and "0 wrn"
                are not answers, they are two dead controls. */}
            {anyLevel && (
              <>
                <LevelToggle
                  on={onlyError} onClick={() => setOnlyError(v => !v)}
                  color="var(--color-error)" count={levelCounts.err} label="err"
                />
                <LevelToggle
                  on={onlyWarn} onClick={() => setOnlyWarn(v => !v)}
                  color="var(--color-warning)" count={levelCounts.wrn} label="wrn"
                />
              </>
            )}
            <span className="text-[11px] text-[var(--color-text-muted)] font-mono tabular-nums">
              {templates.length} of {v.distinctTemplates}
            </span>
          </div>
          <div className="rounded-lg overflow-y-auto flex-1 min-h-0"
               style={{ border: '1px solid var(--color-surface-border)' }}>
            {templates.map((t, i) => {
              const lvl = topLevel(t);
              const share = topCount > 0 ? t.count / topCount : 0;
              const pct = v.entries > 0 ? (t.count / v.entries) * 100 : 0;
              return (
                <div key={t.template}
                     className="flex items-center gap-3 px-3 py-2 text-[11.5px] font-mono"
                     style={{ background: 'var(--color-surface)',
                              borderTop: i === 0 ? 'none' : '1px solid var(--color-surface-border)' }}>
                  {anyLevel && <LevelPill level={lvl} />}

                  <span className="tabular-nums text-right shrink-0"
                        style={{ width: 62, color: 'var(--color-text-primary)', fontWeight: 600 }}>
                    {t.count.toLocaleString()}
                  </span>

                  {/* How much of the file this one shape accounts for. A count
                      on its own does not say whether 4,000 is most of the log
                      or a rounding error, and that is the question being asked
                      of a view whose whole job is collapsing volume. */}
                  <span className="shrink-0 rounded-full overflow-hidden"
                        style={{ width: 78, height: 5, background: 'var(--color-surface-hover)' }}>
                    <span style={{
                      display: 'block', height: '100%',
                      width: `${Math.max(2, share * 100)}%`,
                      background: LEVEL_COLOR[lvl],
                      opacity: 0.75,
                      borderRadius: 999,
                    }} />
                  </span>
                  <span className="tabular-nums text-right shrink-0 text-[10px]"
                        style={{ width: 34, color: 'var(--color-text-muted)' }}>
                    {pct >= 0.1 ? `${pct.toFixed(1)}%` : '<0.1%'}
                  </span>

                  <Shape template={t.template} />
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
