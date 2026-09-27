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
 *
 * Which questions it answers is `useDeterminantsFor`: yours and your team's
 * that apply to this pod and are switched on. Settings → DK8S → Determinants
 * is where they are written, switched and scoped.
 */
import { useMemo } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { useLogSource } from './log-source';
import { summarise, showOf, matchStrip, determinantName, type Summary } from './determinants';
import { useDeterminantsFor } from './use-determinants';
import { templateParts } from './logger-pattern';
import { formatLogTime } from './log-view';
import { CloseIcon } from '../../icons';
import { ACCENT } from './tone';
import { openDeterminantSettings } from '../settings/determinant-nav';
import type { LogLine } from '../../store/k8s-store';

export function SummaryPanel({ onClose }: { onClose: () => void }) {
  const { logs, detail } = useLogSource();
  const { enabled, team } = useDeterminantsFor(detail);
  const summaries = useMemo(() => summarise(logs, enabled), [logs, enabled]);
  /* Whose each teammate's question is, for the line under its name. */
  const owners = useMemo(
    () => new Map(team.map(d => [d.pattern.id, d.source.ownerName])),
    [team],
  );

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
          from the determinants that are on, not from a model
        </span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} aria-label="Close the summary" title="Close the summary"
                className="dk-close-btn p-0.5 rounded cursor-pointer border-none bg-transparent flex">
          <CloseIcon size={12} color="currentColor" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-3 py-2 flex flex-col gap-3">
        {summaries.length === 0 ? (
          <div className="flex flex-col items-start gap-2">
            <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Nothing is summarising itself on this pod yet. Paste the call that writes the line you care
              about — an access log, a downstream call, a pool reading — and say what to group it by. It
              then answers here, and in every window you open.
            </span>
            <ButtonView variant="secondary" size="sm" accentColor={ACCENT} onClick={() => openDeterminantSettings()}>
              Write one in Settings
            </ButtonView>
          </div>
        ) : summaries.map(summary => (
          <One key={summary.pattern.id} summary={summary} lines={logs} owner={owners.get(summary.pattern.id)} />
        ))}
      </div>
    </div>
  );
}

function One({ summary, lines, owner }: { summary: Summary; lines: LogLine[]; owner?: string }) {
  const spec = summary.pattern.summary!;
  const show = showOf(spec);
  const total = summary.rows.reduce((n, r) => n + r.count, 0);
  const named = !!spec.name?.trim();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2 flex-wrap">
        {named && (
          <span className="text-[11.5px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {determinantName(summary.pattern)}
          </span>
        )}
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
          {owner && ` · from ${owner}`}
        </span>
      </div>

      {show.draw && summary.rows.length > 0 && <Strip lines={lines} summary={summary} />}

      {summary.rows.length === 0 ? (
        <span className="text-[11px] pl-1" style={{ color: 'var(--color-warning)' }}>
          Nothing in this window matched it — the path it watches was not taken here.
        </span>
      ) : (
        <SummaryTable summary={summary} />
      )}
    </div>
  );
}

/**
 * The answer as a table — the one Settings previews and the panel shows.
 *
 * Exported so the preview in Settings is this table and not a lookalike of it:
 * what somebody saw before they saved is exactly what a window will say.
 */
export function SummaryTable({ summary }: { summary: Summary }) {
  const spec = summary.pattern.summary!;
  const show = showOf(spec);

  return (
    <div className="rounded overflow-hidden"
         style={{ border: '1px solid var(--color-surface-border)' }}>
      <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--color-panel)' }}>
            {spec.groupBy.map(hole => (
              <th key={hole} className="text-left px-2 py-1 font-mono"
                  style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{hole}</th>
            ))}
            {show.count && (
              <th className="text-right px-2 py-1" style={{ color: 'var(--color-text-muted)', width: 64 }}>lines</th>
            )}
            {spec.mix && (
              <th className="text-left px-2 py-1 font-mono"
                  style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{spec.mix}</th>
            )}
            {show.worst && (
              <th className="text-right px-2 py-1 font-mono"
                  style={{ color: 'var(--color-text-muted)', fontWeight: 600, width: 88 }}>
                worst {spec.measure}
              </th>
            )}
            {show.seen && (
              <>
                <th className="text-right px-2 py-1" style={{ color: 'var(--color-text-muted)', width: 96 }}>first seen</th>
                <th className="text-right px-2 py-1" style={{ color: 'var(--color-text-muted)', width: 96 }}>last seen</th>
              </>
            )}
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
              {show.count && (
                <td className="px-2 py-1 text-right"
                    style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.count.toLocaleString()}
                </td>
              )}
              {spec.mix && (
                <td className="px-2 py-1">
                  {(row.mix ?? []).map(([value, n]) => (
                    <span key={value} className="mr-1.5 font-mono"
                          style={{ color: toneOf(value) }}>{n}&times;{value}</span>
                  ))}
                </td>
              )}
              {show.worst && (
                <td className="px-2 py-1 text-right font-mono"
                    style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.worst ?? '—'}
                </td>
              )}
              {show.seen && (
                <>
                  <td className="px-2 py-1 text-right"
                      style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {row.firstTs !== undefined ? formatLogTime(row.firstTs) : '—'}
                  </td>
                  <td className="px-2 py-1 text-right"
                      style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {row.lastTs !== undefined ? formatLogTime(row.lastTs) : '—'}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Slots in the "drawn over the window" strip. */
const STRIP_SLOTS = 48;

/**
 * Where in the window this question had something to answer.
 *
 * Height is the share of the busiest slot, with a floor so a single match is
 * still a mark: the strip exists to show WHEN, and a slot that held one call
 * at 11:00:14 is the one somebody came looking for.
 */
export function Strip({ lines, summary }: { lines: LogLine[]; summary: Summary }) {
  const { counts, from, to } = useMemo(
    () => matchStrip(lines, summary.pattern, STRIP_SLOTS),
    [lines, summary.pattern],
  );
  const busiest = Math.max(1, ...counts);
  if (from === undefined || to === undefined) {
    return (
      <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
        These lines carry no timestamps, so there is no window to draw it over.
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] shrink-0" style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {formatLogTime(from).slice(0, 8)}
      </span>
      <div className="flex items-end gap-px flex-1 min-w-0" style={{ height: 16 }}
           aria-label="When it matched across the window">
        {counts.map((n, i) => (
          <span key={i}
                title={n ? `${n} match${n === 1 ? '' : 'es'}` : 'none'}
                style={{
                  flex: 1,
                  height: n ? Math.max(3, Math.round((n / busiest) * 16)) : 1,
                  borderRadius: 1,
                  background: n ? ACCENT : 'var(--color-surface-border)',
                  opacity: n ? 0.85 : 0.6,
                }} />
        ))}
      </div>
      <span className="text-[10px] shrink-0" style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {formatLogTime(to).slice(0, 8)}
      </span>
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
