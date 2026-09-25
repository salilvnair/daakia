/**
 * The catalogue, as a tab on the pod.
 *
 * A tester can read what the application has said; this is where they write
 * down what it CAN say. One paste of a logger call — the thing a developer can
 * send in a chat message — gives three answers at once: every line that logger
 * has written, a name for the value inside it, and a mark the Logs tab can
 * highlight.
 *
 * The count beside each pattern is what makes it worth keeping. A pattern with
 * a zero is the most informative row on the screen: either the path it watches
 * was not taken on this pod, or the pattern is wrong — and the reader can tell
 * which by looking at the template beside it.
 */
import { useMemo, useState } from 'react';
import { useK8sStore } from '../../store/k8s-store';
import {
  usePatternsFor, addPattern, removePattern, toggleMark, clearMarks,
  MARK_COLORS, type CataloguePattern,
} from '../../store/dk8s-logger-store';
import { fromLoggerCall, fromLogLine, templateParts } from './logger-pattern';
import { compileMarks, countMarks, markOf } from './logger-marks';
import { compilePattern, matchPattern } from './logger-pattern';
import { PlusIcon, TrashIcon, CloseIcon, SearchIcon } from '../../icons';
import { ACCENT } from './tone';
import { LoggerScanModal } from './LoggerScanModal';
import { SummaryBuilder } from './SummaryBuilder';

/** The workload a pattern belongs to — never the pod, which a rollout renames. */
export function scopeOf(pod: {
  namespace: string; context?: string; workload?: { kind: string; name: string };
} | undefined): string {
  if (!pod) return '*';
  const where = `${pod.context ?? ''}/${pod.namespace}`;
  return pod.workload ? `${where}/${pod.workload.kind}/${pod.workload.name}` : `${where}/Pod`;
}

export function LoggersTab() {
  const detail = useK8sStore(s => s.detail);
  const logs = useK8sStore(s => s.logs);
  const scope = scopeOf(detail);
  const patterns = usePatternsFor(scope);

  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [scanning, setScanning] = useState(false);

  /* Parsed as it is typed, so the holes appear before anything is saved. */
  const parsed = useMemo(() => (draft.trim() ? fromLoggerCall(draft) : undefined), [draft]);

  /*
    Counts over the lines this pod has in the buffer. Every pattern, not only
    the marked ones — "has this ever fired" is the question the catalogue
    exists to answer, and it is asked of patterns nobody has marked yet.
  */
  const counts = useMemo(() => {
    const all = compileMarks(patterns.map(p => ({ ...p, marked: true })));
    return countMarks(logs, all);
  }, [patterns, logs]);

  /* What the draft would match here, before it is kept. */
  const preview = useMemo(() => {
    if (!parsed) return undefined;
    const compiled = compilePattern(parsed);
    const hits: { text: string; fields: Record<string, string> }[] = [];
    for (const line of logs) {
      const hit = matchPattern(compiled, line.text);
      if (hit) hits.push({ text: line.text, fields: hit.fields });
      if (hits.length === 3) break;
    }
    return hits;
  }, [parsed, logs]);

  const marked = patterns.filter(p => p.marked);

  const keep = () => {
    const pattern = parsed ?? (draft.trim() ? fromLogLine(draft.trim()) : undefined);
    if (!pattern) { setError('That is not a logger call, and not a line either.'); return; }
    addPattern(pattern, scope);
    setDraft('');
    setError(undefined);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto px-4 py-3 gap-3">

      <div className="flex flex-col gap-1">
        <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          What this application can say
        </span>
        <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Paste the logger call. The line in the log never contains the <code>{'{}'}</code> — it contains
          the value — so the hole is named after the argument that fills it, and the line is found however
          the value changes. Kept per workload, so a rollout does not lose it.
        </span>
      </div>

      <div className="flex flex-col gap-2 px-3 py-3 rounded-lg"
           style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
        <div className="flex gap-2 items-start">
          <input
            value={draft}
            onChange={e => { setDraft(e.target.value); setError(undefined); }}
            onKeyDown={e => { if (e.key === 'Enter') keep(); }}
            placeholder={'log.info("checking bcbl api for request:{}", reqId)'}
            aria-label="Paste a logger call"
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded text-[11.5px] font-mono"
            style={{
              background: 'var(--color-input-bg, var(--color-panel))',
              color: 'var(--color-text-primary)',
              border: `1px solid ${parsed ? ACCENT : 'var(--color-surface-border)'}`,
            }}
          />
          <button
            type="button"
            onClick={keep}
            disabled={!draft.trim()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded cursor-pointer border-none text-[11.5px]"
            style={{
              background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`,
              color: ACCENT,
              opacity: draft.trim() ? 1 : 0.5,
            }}
          >
            <PlusIcon size={12} /> Add
          </button>
          {/* One paste is one pattern; a service has hundreds, and they are
              all in the source somebody already has open. */}
          <button
            type="button"
            onClick={() => setScanning(true)}
            title="Read every logger call in a project at once"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded cursor-pointer text-[11.5px]"
            style={{
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-surface-border)',
            }}
          >
            <SearchIcon size={12} /> Scan a project
          </button>
        </div>

        {parsed && (
          <div className="flex flex-col gap-1.5">
            <div className="text-[11.5px] font-mono flex flex-wrap items-center gap-x-0.5">
              {templateParts(parsed.template).map((part, i) => (
                part.hole
                  ? (
                    <span key={i} className="px-1 rounded"
                          style={{
                            background: `color-mix(in srgb, ${ACCENT} 18%, transparent)`,
                            color: ACCENT,
                          }}>{part.text}</span>
                  )
                  : <span key={i} style={{ color: 'var(--color-text-secondary)' }}>{part.text}</span>
              ))}
            </div>
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {parsed.level ? `${parsed.level.toUpperCase()} · ` : ''}
              {parsed.holes.length === 0
                ? 'no values in this one'
                : `${parsed.holes.length} field${parsed.holes.length === 1 ? '' : 's'}: ${parsed.holes.join(', ')}`}
            </span>

            {preview && preview.length > 0 && (
              <div className="flex flex-col gap-1 mt-1 px-2 py-1.5 rounded"
                   style={{ background: 'var(--color-panel)' }}>
                <span className="text-[10px] uppercase tracking-wide"
                      style={{ color: 'var(--color-text-muted)' }}>
                  matches here
                </span>
                {preview.map((hit, i) => (
                  <span key={i} className="text-[11px] font-mono truncate"
                        style={{ color: 'var(--color-text-secondary)' }}>
                    {hit.text}
                  </span>
                ))}
              </div>
            )}
            {preview && preview.length === 0 && (
              <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
                Nothing in this pod's buffer matches it yet — which is a fact about the run, not
                necessarily about the pattern.
              </span>
            )}
          </div>
        )}

        {!parsed && draft.trim() && (
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Not a logger call. Adding it will learn a pattern from it as though it were a log line,
            with every id and number turned into a hole.
          </span>
        )}
        {error && (
          <span className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>
          {patterns.length === 0
            ? 'Nothing catalogued for this workload yet.'
            : `${patterns.length} pattern${patterns.length === 1 ? '' : 's'}`}
        </span>
        {marked.length > 0 && (
          <>
            <span className="text-[11.5px]" style={{ color: ACCENT }}>
              {marked.length} marked — highlighted in Logs
            </span>
            <button type="button" onClick={() => clearMarks(scope)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer border-none bg-transparent text-[11px]"
                    style={{ color: 'var(--color-text-muted)' }}>
              <CloseIcon size={10} /> clear marks
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {patterns.map(p => (
          <Row key={p.id} pattern={p} count={counts[p.id] ?? 0} />
        ))}
      </div>

      {scanning && <LoggerScanModal scope={scope} onClose={() => setScanning(false)} />}
    </div>
  );
}

function Row({ pattern, count }: { pattern: CataloguePattern; count: number }) {
  const color = MARK_COLORS[pattern.color ?? 0];
  const [building, setBuilding] = useState(false);

  return (
    <div className="flex flex-col px-3 py-2 rounded-lg"
         style={{
           background: 'var(--color-surface)',
           border: `1px solid ${pattern.marked ? color : 'var(--color-surface-border)'}`,
           borderLeft: `3px solid ${pattern.marked ? color : 'transparent'}`,
         }}>
    <div className="flex items-start gap-2.5">
      <label className="flex items-center gap-2 cursor-pointer shrink-0 mt-0.5"
             title={pattern.marked ? 'Stop highlighting it' : 'Highlight it in the Logs tab'}>
        <input
          type="checkbox"
          checked={!!pattern.marked}
          onChange={() => toggleMark(pattern.id)}
          style={{ accentColor: color, width: 14, height: 14 }}
        />
      </label>

      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="text-[11.5px] font-mono flex flex-wrap items-center gap-x-0.5">
          {templateParts(pattern.template).map((part, i) => (
            part.hole
              ? (
                <span key={i} className="px-1 rounded"
                      style={{
                        background: `color-mix(in srgb, ${ACCENT} 18%, transparent)`,
                        color: ACCENT,
                      }}>{part.text}</span>
              )
              : <span key={i} style={{ color: 'var(--color-text-primary)' }}>{part.text}</span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {pattern.level && <span>{pattern.level.toUpperCase()}</span>}
          {pattern.logger && <span className="font-mono truncate">{pattern.logger}</span>}
          <span>{pattern.scope === '*' ? 'every workload' : 'this workload'}</span>
          <span>from a {pattern.source === 'paste' ? 'pasted call' : pattern.source === 'line' ? 'log line' : pattern.source}</span>
          {pattern.summary && pattern.summary.groupBy.length > 0 && (
            <span style={{ color: ACCENT }}>summarised by {pattern.summary.groupBy.join(' + ')}</span>
          )}
        </div>
      </div>

      {/* A pattern worth watching is often a pattern worth counting, and the
          reader notices the second thing right after the first. */}
      <button type="button" onClick={() => setBuilding(v => !v)}
              title="Group and count this pattern over a window"
              className="shrink-0 px-2 rounded cursor-pointer text-[10.5px] mt-0.5"
              style={{
                background: pattern.summary
                  ? `color-mix(in srgb, ${ACCENT} 16%, transparent)`
                  : 'transparent',
                color: pattern.summary ? ACCENT : 'var(--color-text-muted)',
                border: pattern.summary ? '1px solid transparent' : '1px solid var(--color-surface-border)',
                lineHeight: '19px',
              }}>
        Summarise
      </button>

      <span className="text-[11px] shrink-0 mt-0.5"
            title={count === 0
              ? 'Nothing in this pod’s buffer matches it — the path was not taken, or the pattern is wrong.'
              : `${count} lines in this pod’s buffer`}
            style={{
              color: count === 0 ? 'var(--color-warning)' : 'var(--color-text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}>
        {count === 0 ? 'never fired' : count.toLocaleString()}
      </span>

      <button type="button" onClick={() => removePattern(pattern.id)}
              title="Remove it from the catalogue" aria-label="Remove it from the catalogue"
              className="dk-close-btn shrink-0 p-0.5 rounded cursor-pointer border-none bg-transparent flex mt-0.5">
        <TrashIcon size={12} color="currentColor" />
      </button>
    </div>

      {building && <SummaryBuilder pattern={pattern} onClose={() => setBuilding(false)} />}
    </div>
  );
}

/** Exported for the Logs tab, which highlights what is marked here. */
export { markOf };
