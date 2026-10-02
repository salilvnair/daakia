/**
 * The minutes around a hit, and what ran in them.
 *
 * A tester lands on an error at 11:00 and the next question is never about
 * that line: it is "what was this service doing". The Window tab reads every
 * line from 10:50 to 11:30 on the pods involved and answers with the
 * determinants that are switched on — every API called with its status mix and
 * its slowest, every downstream, every retry — counted from the lines, not
 * asked of a model. Narrowing to a thread or a request id re-counts against
 * what is left, so "which APIs did this one request touch" is the same screen
 * with one chip on.
 *
 * Pure: the tab and its tests share these.
 */
import type { LogLine } from '../../store/k8s-store';
import { determinantName, type Summary, type SummaryRow } from './determinants';
import { valueOf, type FieldReader } from './field-readers';

/** The half-widths the header offers: ±5m and ±15m. */
export const WINDOW_HALVES = [300, 900] as const;

/**
 * How many lines fell in each slice of the window — the density strip.
 *
 * A fixed number of buckets across the window, not per minute: forty minutes
 * and four hours both fill the strip, and the burst is where the bars are
 * tall whichever it is.
 */
export function density(lines: { ts?: number; level?: string }[], from: number, to: number, buckets = 60):
{ n: number; errors: number; warns: number }[] {
  const out = Array.from({ length: buckets }, () => ({ n: 0, errors: 0, warns: 0 }));
  const span = Math.max(1, to - from);
  for (const l of lines) {
    if (l.ts === undefined || l.ts < from || l.ts > to) continue;
    const i = Math.min(buckets - 1, Math.floor(((l.ts - from) / span) * buckets));
    out[i].n++;
    if (l.level === 'error') out[i].errors++;
    else if (l.level === 'warn') out[i].warns++;
  }
  return out;
}

/** What a stretch of the window was, by the worst line in it. */
export type RunTone = 'none' | 'calm' | 'warn' | 'error';

/**
 * The density strip as the board draws it: runs, not bars.
 *
 * Neighbouring slices that were the same — quiet, warning, error — are one
 * segment whose width is how many slices it spans, so forty minutes reads as
 * a handful of blocks: a long calm stretch, a sliver of amber, the red one the
 * hit is in. Height does not carry a count; an error run is drawn taller so
 * it is found first.
 */
export function densityRuns(buckets: { n: number; errors: number; warns: number }[]):
{ tone: RunTone; span: number; lines: number; from: number }[] {
  const out: { tone: RunTone; span: number; lines: number; from: number }[] = [];
  buckets.forEach((b, i) => {
    const tone: RunTone = !b.n ? 'none' : b.errors ? 'error' : b.warns ? 'warn' : 'calm';
    const last = out[out.length - 1];
    if (last && last.tone === tone) { last.span++; last.lines += b.n; return; }
    out.push({ tone, span: 1, lines: b.n, from: i });
  });
  return out;
}

/**
 * Whether a row went wrong, by what its mix says.
 *
 * A status of 400 and up, or an outcome that names a failure. Only what the
 * logger wrote — a row with no mix is never called failing, because nothing
 * on it says so.
 */
const FAILING_WORD = /fail|error|exception|timed?\s*out|timeout|refused|reset|denied|rejected|unavailable/i;

export function isFailingValue(v: string): boolean {
  const n = Number(v);
  if (Number.isFinite(n) && Number.isInteger(n) && n >= 400 && n < 600) return true;
  return FAILING_WORD.test(v);
}

export function failing(row: SummaryRow): number {
  return (row.mix ?? []).filter(([v]) => isFailingValue(v)).reduce((a, [, n]) => a + n, 0);
}

/** "28×201 3×504" — the mix, as it reads in a table cell. */
export function mixLabel(row: SummaryRow): string {
  return (row.mix ?? []).map(([v, n]) => `${n}×${v}`).join(' ');
}

/**
 * How one value of a mix is coloured: a 5xx or a word that says it failed is
 * `bad`, a 4xx is `warn` — the caller's mistake, not the service's — and
 * everything else is `ok`. The board draws `28×201` green, `5×409` amber and
 * `3×504` red, in one cell.
 */
export function mixTone(value: string): 'ok' | 'warn' | 'bad' {
  if (!isFailingValue(value)) return 'ok';
  const n = Number(value);
  return Number.isInteger(n) && n >= 400 && n < 500 ? 'warn' : 'bad';
}

/** Whether a row had a failure the service owns — the row the board tints red. */
export function brokeHere(row: SummaryRow): boolean {
  return (row.mix ?? []).some(([v]) => mixTone(v) === 'bad');
}

/**
 * A measure's worst, the way a person says it: `30.0s`, `340ms`.
 *
 * Only when the measure's name says it is a duration in milliseconds — `took`,
 * `ms`, `elapsed`, `duration`, `latency`. Any other number is shown as it was
 * logged: a pool reading of 10 is not ten milliseconds.
 */
export function worstLabel(measure: string | undefined, n: number | undefined): string {
  if (n === undefined) return '—';
  if (measure && isMillis(measure)) return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
  return String(n);
}

/** `took`, `ms`, `elapsed_ms`, `durationMs` — but not `items`, which also ends in "ms". */
function isMillis(name: string): boolean {
  const WORD = 'ms|millis|took|elapsed|duration|latency';
  return new RegExp(`^(${WORD})$`, 'i').test(name)
    || new RegExp(`[_.-](${WORD})$`, 'i').test(name)
    || /[a-z](Ms|Millis|Took|Elapsed|Duration|Latency)$/.test(name);
}

/** A downstream's line: "3 timed out" or "all fine". */
export function mixVerdict(row: SummaryRow): string {
  const bad = (row.mix ?? []).filter(([v]) => isFailingValue(v));
  if (!row.mix?.length) return '';
  if (!bad.length) return 'all fine';
  return bad.map(([v, n]) => `${n} ${v}`).join(', ');
}

/**
 * The chips "narrow this window by": what the anchor line names.
 *
 * Its thread, its ids, its pod — each a way to go from "everything in these
 * forty minutes" to "this one request's share of them".
 */
export function narrowBy(
  anchor: Parameters<typeof valueOf>[0] & { pod?: string },
  readFields: (l: Parameters<typeof valueOf>[0]) => { key: string; value: string }[],
): { field: string; value: string }[] {
  const out: { field: string; value: string }[] = [];
  const seen = new Set<string>();
  const push = (field: string, value: string | undefined) => {
    if (!value || seen.has(field)) return;
    seen.add(field);
    out.push({ field, value });
  };
  push('thread', anchor.thread);
  for (const [k, v] of Object.entries(anchor.fields ?? {})) push(k, String(v));
  for (const f of readFields(anchor)) push(f.key, f.value);
  push('pod', anchor.pod);
  return out.slice(0, 8);
}

/**
 * A narrowing chip's value, short enough to sit in a pill: a pod by the part
 * that tells replicas apart (`7d9f2`), a thread by its last two parts
 * (`exec-7` of `http-nio-8080-exec-7`), anything else cut at 18 characters.
 */
export function chipValue(field: string, value: string): string {
  const parts = value.split('-');
  if (field === 'pod') return parts.length > 1 ? parts[parts.length - 1] : value;
  if (field === 'thread' && parts.length > 2) return parts.slice(-2).join('-');
  return value.length > 18 ? `${value.slice(0, 18)}…` : value;
}

/** Lines that keep every narrowing chip that is on. */
export function narrowed<T extends Parameters<typeof valueOf>[0]>(
  lines: T[], chips: { field: string; value: string }[], readers: FieldReader[],
): T[] {
  if (!chips.length) return lines;
  return lines.filter(l => chips.every(c => valueOf(l, c.field, readers) === c.value));
}

/** The summary as text — Export summary, and what the AI tab is handed. */
export function summaryText(
  summaries: Summary[], window: { from: number; to: number; lines: number; pods: string[] },
  chips: { field: string; value: string }[],
): string {
  const t = (ms: number) => new Date(ms).toISOString();
  const out: string[] = [
    `What ran between ${t(window.from)} and ${t(window.to)}`,
    `${window.lines.toLocaleString()} lines from ${window.pods.join(', ')}`,
  ];
  if (chips.length) out.push(`narrowed to ${chips.map(c => `${c.field}=${c.value}`).join(' and ')}`);
  for (const s of summaries) {
    out.push('', `## ${determinantName(s.pattern)}`);
    const spec = s.pattern.summary;
    const head = [...(spec?.groupBy ?? []), 'count', ...(spec?.mix ? [spec.mix] : []), ...(spec?.measure ? [`max ${spec.measure}`] : []), 'first seen'];
    out.push(head.join('\t'));
    for (const r of s.rows) {
      out.push([
        ...r.key, String(r.count),
        ...(spec?.mix ? [mixLabel(r)] : []),
        ...(spec?.measure ? [r.worst === undefined ? '' : String(r.worst)] : []),
        r.firstTs === undefined ? '' : t(r.firstTs),
      ].join('\t'));
    }
    if (!s.rows.length) out.push('(nothing matched)');
  }
  return out.join('\n');
}

/** Lines a summary row was counted from. */
export function rowLines<T extends Pick<LogLine, 'text' | 'message'>>(
  lines: T[], matches: (l: T) => Record<string, string> | undefined, groupBy: string[], key: string[],
): T[] {
  return lines.filter(l => {
    const f = matches(l);
    return !!f && groupBy.every((h, i) => f[h] === key[i]);
  });
}
