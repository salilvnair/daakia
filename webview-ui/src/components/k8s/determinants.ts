/**
 * What ran in this window, counted from the lines themselves.
 *
 * A tester lands on an error at 11:00 and the next question is never about
 * that line: it is "what else was this service doing". Which APIs were called,
 * which of them failed, what the pool was up to. The log holds all of it and
 * answers none of it, because the answer is spread over four hundred lines
 * that each say one thing.
 *
 * A determinant is that question, written down once: a pattern from the
 * catalogue, plus what to group its matches by and what to measure. Every
 * window then answers it without being asked again.
 *
 * ── Why it is not its own kind of thing ──
 *
 * A determinant is a catalogued pattern with a summary attached, not a second
 * object with a second matcher and a second place to be stored. `{}` means the
 * same thing here as it does in the Loggers tab, a pattern that is wrong is
 * wrong in one place, and "summarise this one" is a property of a pattern
 * somebody already wrote down — which is exactly how it is used: you notice a
 * logger worth watching, then you notice you want it counted.
 *
 * ── What it will not do ──
 *
 * It does not infer. Nothing here decides that a number is a duration or that
 * a three-digit value is a status code: the person who wrote the pattern says
 * which hole is the measure, because they are the only one who knows. A
 * summary built on a guess is a summary nobody can act on.
 */
import type { LogLine } from '../../store/k8s-store';
import type { CataloguePattern } from '../../store/dk8s-logger-store';
import { compilePattern, matchPattern } from './logger-pattern';

export interface SummarySpec {
  /** Holes whose values make the row: `method` + `path` is one endpoint. */
  groupBy: string[];
  /** A hole holding a number — the largest is reported. `took`, `ms`. */
  measure?: string;
  /** A hole with few values — each is counted. `status`, `outcome`. */
  mix?: string;
}

export interface SummaryRow {
  /** The group's values, in `groupBy` order. */
  key: string[];
  count: number;
  /** Largest value seen for `measure`, when there is one. */
  worst?: number;
  /** How many of each `mix` value, most common first. */
  mix?: [string, number][];
  firstTs?: number;
  lastTs?: number;
}

export interface Summary {
  pattern: CataloguePattern;
  rows: SummaryRow[];
  /** Matches that fell outside every group — a hole that did not fill. */
  ungrouped: number;
}

/** Patterns that have been told how to summarise themselves. */
export function determinantsIn(patterns: CataloguePattern[]): CataloguePattern[] {
  return patterns.filter(p => p.summary && p.summary.groupBy.length > 0);
}

/**
 * Run every determinant over a window of lines.
 *
 * One pass per determinant rather than one pass with every matcher: a line
 * belongs to one logger, and the first-match-wins rule that makes marking
 * cheap would make a summary wrong — two determinants may legitimately want
 * the same line, one counting it as an API call and the other as a slow one.
 */
export function summarise(lines: LogLine[], patterns: CataloguePattern[]): Summary[] {
  return determinantsIn(patterns).map(pattern => {
    const spec = pattern.summary!;
    const compiled = compilePattern(pattern);
    const groups = new Map<string, SummaryRow>();
    const mixes = new Map<string, Map<string, number>>();
    let ungrouped = 0;

    for (const line of lines) {
      const hit = matchPattern(compiled, line.message ?? line.text);
      if (!hit) continue;

      const key = spec.groupBy.map(hole => hit.fields[hole]);
      if (key.some(v => v === undefined)) { ungrouped++; continue; }

      const id = key.join('\u0000');
      const row = groups.get(id) ?? { key: key as string[], count: 0 };
      row.count++;

      if (spec.measure) {
        const value = asNumber(hit.fields[spec.measure]);
        if (value !== undefined) row.worst = Math.max(row.worst ?? value, value);
      }

      if (spec.mix) {
        const value = hit.fields[spec.mix];
        if (value !== undefined) {
          const counts = mixes.get(id) ?? new Map<string, number>();
          counts.set(value, (counts.get(value) ?? 0) + 1);
          mixes.set(id, counts);
        }
      }

      if (line.ts !== undefined) {
        row.firstTs = row.firstTs === undefined ? line.ts : Math.min(row.firstTs, line.ts);
        row.lastTs = row.lastTs === undefined ? line.ts : Math.max(row.lastTs, line.ts);
      }

      groups.set(id, row);
    }

    for (const [id, counts] of mixes) {
      const row = groups.get(id);
      if (row) row.mix = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }

    return {
      pattern,
      /* Busiest first: the summary is read top-down and stopped at, so the
         row somebody would have scrolled to has to be the first one. */
      rows: [...groups.values()].sort((a, b) => b.count - a.count),
      ungrouped,
    };
  });
}

/**
 * A number out of a captured value.
 *
 * `30000`, `30000ms`, `1.9s`, `248.40` — a hole holds whatever the logger put
 * in it, and the unit is part of the text far more often than not. The unit is
 * NOT converted: `1.9s` is 1.9 and `30000ms` is 30000, because a summary that
 * silently mixes seconds and milliseconds into one "worst" is worse than one
 * that reports the numbers as written. A determinant covers one logger, whose
 * unit does not change between lines.
 */
export function asNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const m = /^-?\d+(?:\.\d+)?/.exec(raw.trim().replace(/,/g, ''));
  if (!m) return undefined;
  const value = Number(m[0]);
  return Number.isFinite(value) ? value : undefined;
}

/** Which holes can be a measure: the ones that held a number every time. */
export function numericHoles(lines: LogLine[], pattern: CataloguePattern): string[] {
  const compiled = compilePattern(pattern);
  const seen = new Map<string, { total: number; numeric: number }>();

  for (const line of lines) {
    const hit = matchPattern(compiled, line.message ?? line.text);
    if (!hit) continue;
    for (const [hole, value] of Object.entries(hit.fields)) {
      const tally = seen.get(hole) ?? { total: 0, numeric: 0 };
      tally.total++;
      if (asNumber(value) !== undefined) tally.numeric++;
      seen.set(hole, tally);
    }
  }

  return [...seen.entries()]
    .filter(([, t]) => t.total > 0 && t.numeric === t.total)
    .map(([hole]) => hole);
}

/**
 * How many distinct values each hole took.
 *
 * What the builder uses to warn about a bad grouping: a hole that is different
 * on every line makes one group per line, which is a list rather than a
 * summary — and that is the single mistake that makes this feature useless.
 */
export function holeSpread(lines: LogLine[], pattern: CataloguePattern): Record<string, number> {
  const compiled = compilePattern(pattern);
  const values: Record<string, Set<string>> = {};

  for (const line of lines) {
    const hit = matchPattern(compiled, line.message ?? line.text);
    if (!hit) continue;
    for (const [hole, value] of Object.entries(hit.fields)) {
      (values[hole] ??= new Set()).add(value);
    }
  }

  const out: Record<string, number> = {};
  for (const [hole, set] of Object.entries(values)) out[hole] = set.size;
  return out;
}
