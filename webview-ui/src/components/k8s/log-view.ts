/**
 * Turning a log into something you can look at.
 *
 * The density ribbon is the point of this file. Scrolling a 20,000-line buffer
 * hunting for the moment things broke is the slowest part of reading logs, so
 * the ribbon compresses the whole buffer into one strip: each column is a slice
 * of the buffer, its height is how much was logged, its colour is the worst
 * thing in it. The burst of red is visible without scrolling, and clicking it
 * jumps there.
 */
import type { LogLine, LogLevel } from '../../store/k8s-store';

export const LEVEL_ORDER: LogLevel[] = ['error', 'warn', 'info', 'debug', 'other'];

/** Rank for "worst level in this bucket" — lower is worse. */
const SEVERITY: Record<LogLevel, number> = {
  error: 0, warn: 1, info: 2, debug: 3, other: 4,
};

export function levelColor(level: LogLevel): string {
  switch (level) {
    case 'error': return 'var(--color-error)';
    case 'warn': return 'var(--color-warning)';
    case 'info': return 'var(--color-info, #6aa9ff)';
    case 'debug': return 'var(--color-text-muted)';
    default: return 'var(--color-text-secondary)';
  }
}

export function levelLabel(level: LogLevel): string {
  return level === 'other' ? 'plain' : level;
}

export interface LogFilterSpec {
  /** Free text; case-insensitive substring, or /regex/ when it parses as one. */
  query: string;
  /** Empty means every level — a filter that hides everything by default is a trap. */
  levels: LogLevel[];
}

export interface MatchedLine extends LogLine {
  /** Character ranges of the query hit, for highlighting. */
  hits?: [number, number][];
}

/**
 * Build a matcher from the query box.
 *
 * `/foo.*bar/` is treated as a regex because anyone reading logs at 3am
 * reaches for one, and requiring a separate toggle for it is friction at
 * exactly the wrong moment. An unparseable regex falls back to substring
 * rather than erroring — half-typed input should narrow, not explode.
 */
export function buildMatcher(query: string): ((text: string) => [number, number][] | null) | null {
  const q = query.trim();
  if (!q) return null;

  const asRegex = /^\/(.+)\/([gimsu]*)$/.exec(q);
  if (asRegex) {
    try {
      const re = new RegExp(asRegex[1], asRegex[2].replace('g', '') + 'g');
      return (text: string) => {
        re.lastIndex = 0;
        const hits: [number, number][] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          hits.push([m.index, m.index + m[0].length]);
          // A zero-width match would spin here forever.
          if (m.index === re.lastIndex) re.lastIndex++;
          if (hits.length > 200) break;
        }
        return hits.length ? hits : null;
      };
    } catch {
      // Fall through to substring: a partially typed regex is still a search.
    }
  }

  const needle = q.toLowerCase();
  return (text: string) => {
    const hay = text.toLowerCase();
    const hits: [number, number][] = [];
    let at = hay.indexOf(needle);
    while (at !== -1 && hits.length < 200) {
      hits.push([at, at + needle.length]);
      at = hay.indexOf(needle, at + needle.length);
    }
    return hits.length ? hits : null;
  };
}

export function filterLines(lines: LogLine[], spec: LogFilterSpec): MatchedLine[] {
  const match = buildMatcher(spec.query);
  const levelSet = spec.levels.length ? new Set(spec.levels) : null;

  const out: MatchedLine[] = [];
  for (const line of lines) {
    if (levelSet && !levelSet.has(line.level)) continue;
    if (!match) { out.push(line); continue; }
    const hits = match(line.text);
    if (hits) out.push({ ...line, hits });
  }
  return out;
}

// ── Density ribbon ──────────────────────────────────────────────────────────

export interface DensityBucket {
  /** Index of the first line in this bucket, for scroll-to. */
  startIndex: number;
  count: number;
  /** 0..1 against the busiest bucket. */
  height: number;
  worst: LogLevel;
  errors: number;
  warns: number;
  /** Wall-clock span, when the lines carried timestamps. */
  fromTs?: number;
  toTs?: number;
}

/**
 * Slice the buffer into `columns` even chunks.
 *
 * Even chunks by line index, not by time: a pod that logged nothing for an
 * hour and then screamed for two seconds is exactly the case you are looking
 * for, and bucketing by time would squeeze the interesting part into a sliver
 * one pixel wide while a flat hour took the whole width.
 */
export function densityBuckets(lines: LogLine[], columns: number): DensityBucket[] {
  if (!lines.length || columns < 1) return [];
  const size = Math.max(1, Math.ceil(lines.length / columns));
  // `size` is already floored at 1, so a column count above the line count
  // silently produces fewer buckets than asked for. That is the intent.

  const buckets: DensityBucket[] = [];

  for (let start = 0; start < lines.length; start += size) {
    const slice = lines.slice(start, start + size);
    let worst: LogLevel = 'other';
    let errors = 0;
    let warns = 0;
    let fromTs: number | undefined;
    let toTs: number | undefined;

    for (const l of slice) {
      if (l.level === 'error') errors++;
      else if (l.level === 'warn') warns++;
      if (SEVERITY[l.level] < SEVERITY[worst]) worst = l.level;
      if (l.ts !== undefined) {
        if (fromTs === undefined) fromTs = l.ts;
        toTs = l.ts;
      }
    }

    buckets.push({ startIndex: start, count: slice.length, height: 0, worst, errors, warns, fromTs, toTs });
  }

  const busiest = Math.max(...buckets.map(b => b.count));
  const quietest = Math.min(...buckets.map(b => b.count));

  // When every bucket holds the same number of lines — which is what happens
  // whenever the buffer is smaller than the ribbon is wide — height carries no
  // information at all. Drawing them all at full height then reads as "maximum
  // density everywhere", which is a solid wall of colour that says nothing.
  // Half height instead, so it reads as what it actually is: a severity strip.
  const uniform = busiest === quietest;

  for (const b of buckets) {
    b.height = uniform ? 0.45 : Math.max(0.12, b.count / busiest);
  }
  return buckets;
}

/** Tooltip for a ribbon column. */
export function describeBucket(b: DensityBucket): string {
  const parts = [`${b.count} line${b.count === 1 ? '' : 's'}`];
  if (b.errors) parts.push(`${b.errors} error${b.errors === 1 ? '' : 's'}`);
  if (b.warns) parts.push(`${b.warns} warning${b.warns === 1 ? '' : 's'}`);
  if (b.fromTs !== undefined) parts.push(new Date(b.fromTs).toLocaleTimeString());
  return parts.join(' · ');
}

/** Per-level totals for the filter chips, so counts are visible before filtering. */
export function levelCounts(lines: LogLine[]): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0, other: 0 };
  for (const l of lines) counts[l.level]++;
  return counts;
}

/** `14:32:07.412` — date omitted, since a log view is always about "recently". */
export function formatLogTime(ts?: number): string {
  if (ts === undefined) return '';
  const d = new Date(ts);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/**
 * Assemble the text for a selection so it reads like a log, not like a blob.
 *
 * The AI gets timestamps back, because "these three lines are 400ms apart" is
 * often the whole answer and a naive innerText copy loses it.
 */
export function selectionText(lines: LogLine[], firstSeq: number, lastSeq: number): string {
  return lines
    .filter(l => l.seq >= firstSeq && l.seq <= lastSeq)
    .map(l => (l.ts !== undefined ? `${new Date(l.ts).toISOString()} ${l.text}` : l.text))
    .join('\n');
}
