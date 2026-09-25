/**
 * What ran, over the lines this view is holding.
 *
 * The window is the one already on screen — the tail, the time range, the
 * filters and the field filters that are in force. That is deliberate: a
 * summary over a different window than the log underneath it would have people
 * reading two answers to one question, and the toolbar above is already how
 * somebody says which window they mean.
 *
 * Every number here is a count of the lines IN THAT WINDOW, and the footer
 * says so. A pod holds millions and this holds a few hundred; "31 calls" is
 * true of what was fetched, not of the service's morning.
 */
import { useMemo } from 'react';
import { useLogSource } from './log-source';
import { usePatternsFor } from '../../store/dk8s-logger-store';
import { scopeOf } from './LoggersTab';
import { useK8sStore } from '../../store/k8s-store';
import { summarise, type Summary } from './determinants';
import { templateParts } from './logger-pattern';
import { formatLogTime } from './log-view';
import { CloseIcon } from '../../icons';
import { ACCENT } from './tone';

export function SummaryPanel({ onClose }: { onClose: () => void }) {
  const { logs } = useLogSource();
  const detail = useK8sStore(s => s.detail);
  const patterns = usePatternsFor(scopeOf(detail));
  const summaries = useMemo(() => summarise(logs, patterns), [logs, patterns]);

  return (
    <div className="flex flex-col min-h-0 shrink-0"
         style={{
           maxHeight: '45%',
           borderBottom: '1px solid var(--color-surface-border)',
           background: 'var(--color-surface)',
         }}>
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          What ran in these {logs.length.toLocaleString()} lines
        </span>
        <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          from the patterns you told to summarise themselves
        </span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} aria-label="Close the summary" title="Close the summary"
                className="dk-close-btn p-0.5 rounded cursor-pointer border-none bg-transparent flex">
          <CloseIcon size={12} color="currentColor" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-3 py-2 flex flex-col gap-3">
        {summaries.length === 0 ? (
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Nothing is summarising itself yet. In the Loggers tab, add the call that writes the line you
            care about — an access log, a downstream call, a pool reading — and press Summarise on it.
          </span>
        ) : summaries.map(summary => (
          <One key={summary.pattern.id} summary={summary} />
        ))}
      </div>
    </div>
  );
}

function One({ summary }: { summary: Summary }) {
  const spec = summary.pattern.summary!;
  const total = summary.rows.reduce((n, r) => n + r.count, 0);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[11px] font-mono flex flex-wrap gap-x-0.5">
          {templateParts(summary.pattern.template).map((part, i) => (
            part.hole
              ? <span key={i} style={{ color: ACCENT }}>{part.text}</span>
              : <span key={i} style={{ color: 'var(--color-text-secondary)' }}>{part.text}</span>
          ))}
        </span>
        <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {summary.rows.length} row{summary.rows.length === 1 ? '' : 's'} · {total} line{total === 1 ? '' : 's'}
          {summary.ungrouped > 0 && ` · ${summary.ungrouped} did not fill every hole`}
        </span>
      </div>

      {summary.rows.length === 0 ? (
        <span className="text-[11px] pl-1" style={{ color: 'var(--color-warning)' }}>
          Nothing in this window matched it — the path it watches was not taken here.
        </span>
      ) : (
        <div className="rounded overflow-hidden"
             style={{ border: '1px solid var(--color-surface-border)' }}>
          <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-panel)' }}>
                {spec.groupBy.map(hole => (
                  <th key={hole} className="text-left px-2 py-1 font-mono"
                      style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{hole}</th>
                ))}
                <th className="text-right px-2 py-1" style={{ color: 'var(--color-text-muted)', width: 64 }}>lines</th>
                {spec.mix && (
                  <th className="text-left px-2 py-1 font-mono"
                      style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{spec.mix}</th>
                )}
                {spec.measure && (
                  <th className="text-right px-2 py-1 font-mono"
                      style={{ color: 'var(--color-text-muted)', fontWeight: 600, width: 88 }}>
                    worst {spec.measure}
                  </th>
                )}
                <th className="text-right px-2 py-1" style={{ color: 'var(--color-text-muted)', width: 96 }}>first seen</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map(row => (
                <tr key={row.key.join('\u0000')}
                    style={{ borderTop: '1px solid var(--color-surface-border)' }}>
                  {row.key.map((value, i) => (
                    <td key={i} className="px-2 py-1 font-mono"
                        style={{ color: 'var(--color-text-primary)' }}>{value}</td>
                  ))}
                  <td className="px-2 py-1 text-right"
                      style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {row.count.toLocaleString()}
                  </td>
                  {spec.mix && (
                    <td className="px-2 py-1">
                      {(row.mix ?? []).map(([value, n]) => (
                        <span key={value} className="mr-1.5 font-mono"
                              style={{ color: toneOf(value) }}>{n}&times;{value}</span>
                      ))}
                    </td>
                  )}
                  {spec.measure && (
                    <td className="px-2 py-1 text-right font-mono"
                        style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {row.worst ?? '—'}
                    </td>
                  )}
                  <td className="px-2 py-1 text-right"
                      style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {row.firstTs !== undefined ? formatLogTime(row.firstTs) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * A value that looks like trouble reads like it.
 *
 * Only the shapes that are unambiguous: an HTTP status in the 4xx or 5xx
 * range, and the words applications actually log for a failure. Everything
 * else stays the ordinary text colour rather than being guessed at.
 */
function toneOf(value: string): string {
  if (/^5\d\d$/.test(value) || /^(error|failed|failure|timeout|denied)$/i.test(value)) {
    return 'var(--color-error)';
  }
  if (/^4\d\d$/.test(value) || /^(warn|warning|retry|miss|slow)$/i.test(value)) {
    return 'var(--color-warning)';
  }
  if (/^2\d\d$/.test(value) || /^(ok|success|hit|done)$/i.test(value)) {
    return 'var(--color-success)';
  }
  return 'var(--color-text-secondary)';
}
