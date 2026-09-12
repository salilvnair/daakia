/**
 * Log analysis — templates, bursts, and what happened around a moment in time.
 *
 * Template extraction is the reduction that makes everything else possible: two
 * million lines collapse to a few hundred shapes, which is small enough to read,
 * to compare against yesterday, and to hand to a model.
 *
 * It is also, usefully, redaction. Replacing the variable parts of a line is
 * exactly what removes the order ids, user names, IP addresses and tokens from
 * it — so a template is safe to send in a way a log line never is. The same
 * property the heap analyzer had to engineer deliberately falls out of the shape
 * of this problem for free.
 */
import type { LogEntry, LogLevel } from './log-parser';

export interface LogTemplate {
  /** The message with its variable parts replaced, e.g. "Processed order <n> in <n>ms". */
  template: string;
  count: number;
  byLevel: Partial<Record<LogLevel, number>>;
  /** First and last time this shape was seen. */
  firstSeen?: number;
  lastSeen?: number;
  /** A line number where it occurs, so the user can go and look. */
  exampleLine: number;
}

export interface TimeBucket {
  start: number;
  total: number;
  errors: number;
}

export interface Burst {
  start: number;
  end: number;
  errors: number;
  /** How many times the error rate exceeded the baseline. */
  timesBaseline: number;
  /** The template that dominates the burst. */
  dominantTemplate?: string;
}

export interface LogVerdict {
  entries: number;
  lines: number;
  withoutTimestamp: number;
  timeRange?: { start: number; end: number };
  byLevel: Record<LogLevel, number>;
  templates: LogTemplate[];
  /** Distinct shapes found, before the top-N cut. */
  distinctTemplates: number;
  buckets: TimeBucket[];
  bursts: Burst[];
  exceptions: { type: string; count: number; cause?: string }[];
  /** Templates seen only once or twice — often the interesting ones. */
  rareTemplates: LogTemplate[];
}

// ── Template extraction ──────────────────────────────────────────────────────

/**
 * Replace the parts of a message that vary between occurrences.
 *
 * Order matters: the most specific patterns run first, or a UUID gets eaten
 * piecemeal by the hex and number rules and two identical lines end up with
 * different templates.
 */
const SUBSTITUTIONS: [RegExp, string][] = [
  [/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '<uuid>'],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<time>'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '<ip>'],
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '<email>'],
  [/\bhttps?:\/\/\S+/g, '<url>'],
  // Two or more slash-separated segments. A leading \b cannot match before a
  // "/" (space→slash is not a word boundary), so anchoring that way silently
  // matched from the *second* slash and left "/var" behind. Requiring two
  // segments also keeps it off "40/40", which is a ratio, not a path.
  [/(?:[A-Za-z]:)?(?:[\\/][\w.\-]+){2,}\/?/g, '<path>'],
  [/\b0x[0-9a-fA-F]+\b/g, '<hex>'],
  [/\b[0-9a-fA-F]{16,}\b/g, '<hash>'],
  [/"[^"]*"/g, '"<str>"'],
  [/'[^']*'/g, "'<str>'"],
  // Identifier-with-number, e.g. cust-888, job-1042, exec-15 — the number is the variable.
  [/\b([A-Za-z][\w]*[-_])\d+\b/g, '$1<n>'],
  // No trailing \b on purpose: a unit suffix leaves no word boundary after the
  // digits, so "212ms" and "1800s" would never collapse and every duration in
  // the log would become its own template.
  [/\b\d+(?:\.\d+)?/g, '<n>'],
];

export function templateOf(message: string): string {
  let out = message;
  for (const [re, to] of SUBSTITUTIONS) out = out.replace(re, to);
  // Collapse whitespace so wrapping differences do not split a shape in two.
  return out.replace(/\s+/g, ' ').trim();
}

const EMPTY_LEVELS = (): Record<LogLevel, number> => ({
  TRACE: 0, DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0, UNKNOWN: 0,
});

const isError = (level: LogLevel) => level === 'ERROR' || level === 'FATAL';

/**
 * Accumulates entries without keeping them.
 *
 * A log analyzer that holds every entry cannot open the logs worth opening, so
 * this keeps only counters and per-template aggregates — bounded by the number
 * of distinct shapes, not by the number of lines.
 */
export class LogAccumulator {
  private templates = new Map<string, LogTemplate>();
  private exceptions = new Map<string, { count: number; cause?: string }>();
  private levels = EMPTY_LEVELS();
  private minTs?: number;
  private maxTs?: number;
  private timestamped: { ts: number; error: boolean; template: string }[] = [];
  private entries = 0;

  /** Cap on distinct shapes retained, so a log of pure noise cannot exhaust memory. */
  constructor(private maxTemplates = 5000) {}

  add(entry: LogEntry): void {
    this.entries++;
    this.levels[entry.level]++;

    const template = templateOf(entry.message);
    let t = this.templates.get(template);
    if (!t && this.templates.size < this.maxTemplates) {
      t = { template, count: 0, byLevel: {}, exampleLine: entry.line };
      this.templates.set(template, t);
    }
    if (t) {
      t.count++;
      t.byLevel[entry.level] = (t.byLevel[entry.level] ?? 0) + 1;
      if (entry.timestamp !== undefined) {
        if (t.firstSeen === undefined || entry.timestamp < t.firstSeen) t.firstSeen = entry.timestamp;
        if (t.lastSeen === undefined || entry.timestamp > t.lastSeen) t.lastSeen = entry.timestamp;
      }
    }

    if (entry.exceptionType) {
      const e = this.exceptions.get(entry.exceptionType) ?? { count: 0 };
      e.count++;
      if (entry.causeType) e.cause = entry.causeType;
      this.exceptions.set(entry.exceptionType, e);
    }

    if (entry.timestamp !== undefined) {
      if (this.minTs === undefined || entry.timestamp < this.minTs) this.minTs = entry.timestamp;
      if (this.maxTs === undefined || entry.timestamp > this.maxTs) this.maxTs = entry.timestamp;
      this.timestamped.push({ ts: entry.timestamp, error: isError(entry.level), template });
    }
  }

  /**
   * Bucket the timeline into roughly `targetBuckets` slots.
   *
   * A fixed bucket width would be wrong for both a 30-second log and a
   * three-month one, so the width comes from the span.
   */
  private buildBuckets(targetBuckets: number): { buckets: TimeBucket[]; widthMs: number } {
    if (this.minTs === undefined || this.maxTs === undefined || this.timestamped.length === 0) {
      return { buckets: [], widthMs: 0 };
    }
    const span = Math.max(1, this.maxTs - this.minTs);
    const widthMs = Math.max(1000, Math.ceil(span / targetBuckets));
    const count = Math.ceil(span / widthMs) + 1;
    const buckets: TimeBucket[] = Array.from({ length: count }, (_, i) => ({
      start: this.minTs! + i * widthMs, total: 0, errors: 0,
    }));
    for (const e of this.timestamped) {
      const idx = Math.min(count - 1, Math.floor((e.ts - this.minTs!) / widthMs));
      buckets[idx].total++;
      if (e.error) buckets[idx].errors++;
    }
    return { buckets, widthMs };
  }

  /**
   * Find windows where errors spike well above the baseline.
   *
   * The baseline is the median bucket rather than the mean, because one large
   * burst drags a mean up far enough to hide itself.
   */
  private findBursts(buckets: TimeBucket[], widthMs: number): Burst[] {
    if (!buckets.length) return [];
    // The median over ALL buckets, quiet ones included. Filtering to buckets
    // that already contain errors makes a lone burst its own baseline — it can
    // never be three times itself — which is exactly the case that matters.
    const totalErrors = buckets.reduce((t, b) => t + b.errors, 0);
    if (totalErrors === 0) return [];
    const errorCounts = buckets.map(b => b.errors).sort((a, b) => a - b);
    const median = errorCounts[Math.floor(errorCounts.length / 2)];
    const baseline = Math.max(median, 1);
    const threshold = Math.max(baseline * 3, 5);

    const bursts: Burst[] = [];
    let run: TimeBucket[] = [];
    const close = () => {
      if (!run.length) return;
      const errors = run.reduce((t, b) => t + b.errors, 0);
      // Which shape dominates the window — the actual finding, not just "errors".
      const inWindow = this.timestamped.filter(
        e => e.error && e.ts >= run[0].start && e.ts < run[run.length - 1].start + widthMs);
      const tally = new Map<string, number>();
      for (const e of inWindow) tally.set(e.template, (tally.get(e.template) ?? 0) + 1);
      let dominant: string | undefined;
      let best = 0;
      for (const [tpl, n] of tally) if (n > best) { best = n; dominant = tpl; }

      bursts.push({
        start: run[0].start,
        end: run[run.length - 1].start + widthMs,
        errors,
        timesBaseline: Math.round((errors / run.length) / baseline),
        dominantTemplate: dominant,
      });
      run = [];
    };

    for (const b of buckets) {
      if (b.errors >= threshold) run.push(b);
      else close();
    }
    close();
    return bursts.sort((a, b) => b.errors - a.errors);
  }

  build(linesSeen: number, withoutTimestamp: number, topTemplates = 60): LogVerdict {
    const { buckets, widthMs } = this.buildBuckets(120);
    const all = [...this.templates.values()].sort((a, b) => b.count - a.count);

    return {
      entries: this.entries,
      lines: linesSeen,
      withoutTimestamp,
      timeRange: this.minTs !== undefined && this.maxTs !== undefined
        ? { start: this.minTs, end: this.maxTs } : undefined,
      byLevel: this.levels,
      templates: all.slice(0, topTemplates),
      distinctTemplates: this.templates.size,
      buckets,
      bursts: this.findBursts(buckets, widthMs),
      exceptions: [...this.exceptions.entries()]
        .map(([type, e]) => ({ type, count: e.count, cause: e.cause }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      rareTemplates: all.filter(t => t.count <= 2).slice(0, 20),
    };
  }

  /**
   * What was happening around a moment — the hook that ties the three analyzers
   * together. Given the timestamp of a heap or thread dump, this is the slice of
   * log either side of it.
   */
  around(timestampMs: number, windowMs: number): { before: number; after: number; errors: number; templates: { template: string; count: number }[] } {
    const from = timestampMs - windowMs;
    const to = timestampMs + windowMs;
    const tally = new Map<string, number>();
    let before = 0, after = 0, errors = 0;
    for (const e of this.timestamped) {
      if (e.ts < from || e.ts > to) continue;
      if (e.ts <= timestampMs) before++; else after++;
      if (e.error) errors++;
      tally.set(e.template, (tally.get(e.template) ?? 0) + 1);
    }
    return {
      before, after, errors,
      templates: [...tally.entries()]
        .map(([template, count]) => ({ template, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }
}
