/**
 * SD-6 — the comparison as a Markdown document.
 *
 * The report is what leaves the app: it goes into a ticket, a PR description or
 * a change record, and it is read by someone who was not looking at the screen.
 * So it repeats the things the screen shows implicitly — which database was
 * which, when the comparison ran, what the severities mean — rather than
 * assuming the reader has the modal open beside them.
 *
 * The DDL bodies are included only for objects that actually differ. A report
 * that pastes every in-sync table's definition is a schema dump wearing a
 * report's title, and nobody reads the second page.
 */
import { diffLines } from '@salilvnair/dui';
import type { SchemaAnomaly, SchemaComparison, Severity } from './schema-diff';

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

const STATUS_LABEL: Record<SchemaAnomaly['status'], string> = {
  'missing': 'Missing from target',
  'target-only': 'Only in target',
  'drift': 'Definitions differ',
  'in-sync': 'In sync',
};

function fence(body: string, lang = 'sql'): string[] {
  return ['```' + lang, body.trim(), '```'];
}

/** A unified diff body, so the report reads the way a diff is expected to. */
function unified(a: SchemaAnomaly): string[] {
  const lines = diffLines(a.sourceDdl, a.targetDdl).map(l => {
    const mark = l.op === 'add' ? '+' : l.op === 'remove' ? '-' : ' ';
    return mark + l.text;
  });
  return ['```diff', ...lines, '```'];
}

export interface ReportOptions {
  sourceLabel: string;
  targetLabel: string;
  /** The model's overall write-up, if the analysis has run. */
  analysis?: string;
  /** SD-5's output, if it has been generated. */
  migration?: { deploy: string; verify: string; revert: string };
  /** Injectable so the test does not depend on the clock. */
  now?: Date;
}

export function buildMarkdownReport(c: SchemaComparison, opts: ReportOptions): string {
  const when = (opts.now ?? new Date()).toISOString();
  const drifted = c.anomalies.filter(a => a.status !== 'in-sync');

  const out: string[] = [
    '# Schema comparison',
    '',
    `**Source** \`${opts.sourceLabel}\`  `,
    `**Target** \`${opts.targetLabel}\`  `,
    `**Generated** ${when}`,
    '',
    '## Summary',
    '',
    '| Severity | Count | What it means |',
    '| --- | --- | --- |',
    `| Critical | ${c.counts.critical} | An object the target does not have, or one that lost part of its definition — a consumer is broken now. |`,
    `| Warning | ${c.counts.warning} | An object only the target has, or one that gained a definition — unexpected, but nothing on the source side calls it. |`,
    `| Info | ${c.counts.info} | A difference with nothing removed and nothing added. |`,
    '',
    `${c.inSync} of ${c.total} object(s) are identical on both sides.`,
    '',
  ];

  if (opts.analysis?.trim()) {
    out.push('## Analysis', '', opts.analysis.trim(), '');
  }

  if (drifted.length === 0) {
    out.push('## Differences', '', 'None — the two schemas match.', '');
  } else {
    out.push('## Differences', '');
    out.push('| Object | Type | Status | Severity | Lines |');
    out.push('| --- | --- | --- | --- | --- |');
    for (const a of drifted) {
      const lines = a.status === 'drift' ? `+${a.linesAdded} / -${a.linesRemoved}` : '—';
      out.push(`| \`${a.name}\` | ${a.type} | ${STATUS_LABEL[a.status]} | ${SEVERITY_LABEL[a.severity]} | ${lines} |`);
    }
    out.push('');

    for (const a of drifted) {
      out.push(`### ${a.type} \`${a.name}\``, '');
      out.push(`${STATUS_LABEL[a.status]} · ${SEVERITY_LABEL[a.severity]}`, '');
      if (a.description?.trim()) out.push(a.description.trim(), '');
      if (a.suggestedFix?.trim()) out.push('**Suggested fix** — ' + a.suggestedFix.trim(), '');

      if (a.status === 'drift') {
        out.push(...unified(a), '');
      } else if (a.status === 'missing') {
        out.push('Present on the source, absent on the target:', '', ...fence(a.sourceDdl), '');
      } else {
        out.push('Present on the target, absent on the source:', '', ...fence(a.targetDdl), '');
      }
    }
  }

  if (opts.migration) {
    out.push('## Migration', '');
    out.push('### deploy.sql', '', ...fence(opts.migration.deploy), '');
    out.push('### verify.sql', '', ...fence(opts.migration.verify), '');
    out.push('### revert.sql', '', ...fence(opts.migration.revert), '');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/**
 * The three migration scripts as one file.
 *
 * One `.sql` rather than three downloads: they are read together, and a review
 * that has the rollback in front of it is a better review. The headers are the
 * separators a human needs; anything running these splits on them.
 */
export function buildMigrationSql(
  m: { deploy: string; verify: string; revert: string },
  opts: { sourceLabel: string; targetLabel: string; now?: Date },
): string {
  const when = (opts.now ?? new Date()).toISOString();
  return [
    '-- Schema migration generated by Daakia',
    `-- Source: ${opts.sourceLabel}`,
    `-- Target: ${opts.targetLabel}`,
    `-- Generated: ${when}`,
    '--',
    '-- Review before running. This was written by a language model from a',
    '-- schema diff, and it has not been executed against either database.',
    '',
    '-- ─── deploy ────────────────────────────────────────────────────────────',
    m.deploy.trim(),
    '',
    '-- ─── verify ────────────────────────────────────────────────────────────',
    m.verify.trim(),
    '',
    '-- ─── revert ────────────────────────────────────────────────────────────',
    m.revert.trim(),
    '',
  ].join('\n');
}
