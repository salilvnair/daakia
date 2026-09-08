/**
 * SD-2 — one row of the anomaly report.
 *
 * The card carries what someone deciding whether to act needs and nothing
 * more: which object, what kind, how bad, and — once the analysis has run —
 * what the change means and what to do about it. The DDL is behind the
 * expander, because a list where every row is forty lines of SQL is not a list.
 *
 * Copy takes the whole card as Markdown rather than the DDL alone. What gets
 * pasted into a ticket is the finding, and a bare CREATE TABLE in a comment
 * makes the reader reconstruct why it is there.
 */
import { BadgeChipView, CopyButtonView, IconButtonView } from '@salilvnair/dui';
import { ChevronRightIcon, ChevronDownIcon } from '../../../icons';
import { DdlDiffPane } from './DdlDiffPane';
import { STATUS_TONE } from './SchemaGraphView';
import type { SchemaAnomaly, Severity } from '../../../services/schema-diff/schema-diff';

const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'var(--color-error)',
  warning: 'var(--color-warning)',
  info: 'var(--color-info)',
};

/** What a reader would paste into a ticket. */
function asMarkdown(a: SchemaAnomaly): string {
  const out = [
    `### ${a.type} \`${a.name}\``,
    '',
    `${STATUS_TONE[a.status].label} · ${a.severity}`,
  ];
  if (a.status === 'drift') out.push(`+${a.linesAdded} / -${a.linesRemoved} lines`);
  if (a.description) out.push('', a.description);
  if (a.suggestedFix) out.push('', `**Suggested fix** — ${a.suggestedFix}`);
  return out.join('\n');
}

export function AnomalyCard({ anomaly, open, onToggle }: {
  anomaly: SchemaAnomaly;
  open: boolean;
  onToggle: () => void;
}) {
  const tone = STATUS_TONE[anomaly.status].color;

  return (
    <div
      className="rounded"
      style={{
        border: '1px solid var(--color-surface-border)',
        borderLeft: `3px solid ${tone}`,
        background: 'color-mix(in srgb, var(--color-surface) 55%, transparent)',
      }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <IconButtonView
          icon={open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
          size="xs"
          onClick={onToggle}
          tooltip={open ? 'Hide the definitions' : 'Show the definitions'}
        />
        <span
          className="text-[12px] font-mono truncate"
          style={{ color: 'var(--color-text-primary)' }}
          title={anomaly.name}
        >
          {anomaly.name}
        </span>
        <BadgeChipView tone="var(--color-text-muted)" size="xs">{anomaly.type}</BadgeChipView>
        <BadgeChipView tone={tone} size="xs">{STATUS_TONE[anomaly.status].label}</BadgeChipView>
        <BadgeChipView tone={SEVERITY_TONE[anomaly.severity]} size="xs">{anomaly.severity}</BadgeChipView>

        {anomaly.status === 'drift' && (
          <span
            className="text-[10px] font-mono shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
            title={`${anomaly.linesAdded} line(s) added, ${anomaly.linesRemoved} removed`}
          >
            <span style={{ color: 'var(--color-success)' }}>+{anomaly.linesAdded}</span>
            {' / '}
            <span style={{ color: 'var(--color-error)' }}>−{anomaly.linesRemoved}</span>
          </span>
        )}

        <span className="flex-1" />
        <CopyButtonView text={asMarkdown(anomaly)} size="xs" title="Copy this finding as Markdown" />
      </div>

      {(anomaly.description || anomaly.suggestedFix) && (
        <div className="px-3 pb-2" style={{ paddingLeft: 34 }}>
          {anomaly.description && (
            <p className="text-[11px] m-0" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              {anomaly.description}
            </p>
          )}
          {anomaly.suggestedFix && (
            <p className="text-[11px] mt-1 mb-0" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              <span style={{ color: SEVERITY_TONE[anomaly.severity], fontWeight: 600 }}>Fix · </span>
              {anomaly.suggestedFix}
            </p>
          )}
        </div>
      )}

      {open && (
        <div className="px-2 pb-2">
          <DdlDiffPane anomaly={anomaly} height={260} />
        </div>
      )}
    </div>
  );
}
