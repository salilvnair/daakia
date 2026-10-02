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
  /**
   * What the question is called — "API calls", "Cache hits and misses".
   *
   * Optional because a summary made from the Loggers tab never asked for one,
   * and the template is a perfectly good name until somebody gives it a
   * better one. See `determinantName`.
   */
  name?: string;
  /**
   * Saved, but not asked. Settings keeps the question; no window answers it
   * until it is switched back on. Absent is on, so every summary that existed
   * before the switch did keeps answering.
   */
  off?: boolean;
  /** Which columns the answer has. Absent is the columns it always had. */
  show?: SummaryShow;
}

/**
 * "Summarise as" — the parts of an answer somebody can leave out.
 *
 * Each is a column, or a strip, that is either worth its room for this
 * question or is not: a pool reading wants its worst and nothing else, an
 * access log wants the count and the status mix, and neither wants a
 * first-seen column that says 10:50:00 on every row.
 */
export interface SummaryShow {
  /** How many lines each row stands for. */
  count: boolean;
  /** The largest `measure`. Only meaningful with a measure chosen. */
  worst: boolean;
  /** When a row was first and last seen in the window. */
  seen: boolean;
  /** Where in the window the matches fell, drawn as a strip. */
  draw: boolean;
}

/**
 * The columns a spec asks for, with the old behaviour as the default.
 *
 * A summary saved before `show` existed had a count, a worst when it had a
 * measure, and a first-seen column — so that is what absent means, and
 * nothing anybody set up changes under them.
 */
export function showOf(spec: SummarySpec): SummaryShow {
  const s = spec.show;
  return {
    count: s?.count ?? true,
    worst: !!spec.measure && (s?.worst ?? true),
    seen: s?.seen ?? true,
    draw: s?.draw ?? false,
  };
}

/** What a determinant is called: its name, or failing that its logger and template. */
export function determinantName(pattern: CataloguePattern): string {
  const name = pattern.summary?.name?.trim();
  if (name) return name;
  return pattern.template;
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
 * The determinants a window should answer: saved, and not switched off.
 *
 * Kept apart from `determinantsIn` on purpose. Settings lists every one, off
 * or on, because an off switch you cannot see is one you cannot turn back on;
 * a window's own list may tick an off one on for itself. Only the default —
 * what a window answers before anybody touches it — is the switched-on set.
 */
export function enabledDeterminants(patterns: CataloguePattern[]): CataloguePattern[] {
  return determinantsIn(patterns).filter(p => !p.summary!.off);
}

// ── Where a determinant applies ─────────────────────────────────────────────

/**
 * The two scopes an open pod answers to, besides `*`.
 *
 * `workload` is the catalogue's usual scope — `context/namespace/Kind/name`,
 * the same string the Loggers tab files a pattern under (its `scopeOf`).
 * `pod` is one pod by name, for the question that only makes sense on the
 * replica somebody is looking at today.
 */
export interface ScopeTarget {
  workload: string;
  pod: string;
}

/**
 * One pod's own scope: `context/namespace/Pod/name`.
 *
 * Four segments with `Pod` as the kind, so it can never be mistaken for a
 * workload scope — a Deployment is never called `Pod` — and never for the
 * three-segment scope the Loggers tab gives a pod that has no owner.
 */
export function podScope(pod: { name: string; namespace: string; context?: string }): string {
  return `${pod.context ?? ''}/${pod.namespace}/Pod/${pod.name}`;
}

/**
 * Does a determinant saved under `scope` apply to this pod?
 *
 * `*` everywhere, a workload scope on every pod the workload runs, a pod scope
 * on that pod only. Nothing fuzzier: a determinant that applies to a workload
 * whose name merely starts the same would be answering a question nobody
 * asked of this pod.
 */
export function scopeApplies(scope: string, target: ScopeTarget | undefined): boolean {
  if (scope === '*') return true;
  if (!target) return false;
  return scope === target.workload || scope === target.pod;
}

/** Determinants that apply to a pod, busiest-question-first order kept as given. */
export function determinantsFor(
  patterns: CataloguePattern[], target: ScopeTarget | undefined,
): CataloguePattern[] {
  return determinantsIn(patterns).filter(p => scopeApplies(p.scope, target));
}

/**
 * A scope, read out: "every workload", "payments only", "pod payments-7d9f2".
 *
 * The list in Settings shows where each question applies in the same words
 * the scope picker used to set it, so nobody has to decode a path.
 */
export function scopeLabel(scope: string): string {
  if (scope === '*') return 'every workload';
  const parts = scope.split('/');
  if (parts.length === 4 && parts[2] === 'Pod') return `pod ${parts[3]}`;
  if (parts.length === 4) return `${parts[3]} only`;
  if (parts.length === 3 && parts[2] === 'Pod') return `unowned pods in ${parts[1]}`;
  return scope;
}

// ── Describing one ──────────────────────────────────────────────────────────

/**
 * The grouping and the answer, in words, for the list in Settings.
 *
 * "grouped by method + path" over "calls, status mix, slowest". Said the way
 * the Window reads it, so the list is a promise the summary keeps.
 */
export function describeSpec(spec: SummarySpec): { grouping: string; answer: string } {
  const show = showOf(spec);
  const answer: string[] = [];
  if (show.count) answer.push('how many');
  if (spec.mix) answer.push(`${spec.mix} mix`);
  if (show.worst) answer.push(`worst ${spec.measure}`);
  if (show.seen) answer.push('first and last seen');
  if (show.draw) answer.push('drawn over the window');
  return {
    grouping: spec.groupBy.join(' + '),
    answer: answer.length ? answer.join(', ') : 'nothing — every part is switched off',
  };
}

// ── The window a preview reads ──────────────────────────────────────────────

export interface PreviewWindow {
  lines: LogLine[];
  from?: number;
  to?: number;
  /** Lines with no timestamp, which cannot be placed in a window of minutes. */
  untimed: number;
  /** True when no line had a time, and the window is the whole buffer. */
  wholeBuffer: boolean;
}

/**
 * The last `minutes` of what a buffer holds.
 *
 * Measured back from the NEWEST line, not from now. A pod whose log was
 * fetched an hour ago still has a last forty minutes worth previewing, and
 * measuring from the clock would say "nothing" about a buffer full of lines.
 *
 * Lines without a timestamp cannot be placed and are left out — and counted,
 * so the page can say so. If NO line has one, there is no window to take and
 * the whole buffer is used, flagged, rather than an empty preview that reads
 * like "this never matches".
 */
export function previewWindow(lines: LogLine[], minutes: number): PreviewWindow {
  let newest: number | undefined;
  let untimed = 0;
  for (const l of lines) {
    if (l.ts === undefined) { untimed++; continue; }
    if (newest === undefined || l.ts > newest) newest = l.ts;
  }
  if (newest === undefined) {
    return { lines, untimed, wholeBuffer: true };
  }
  const from = newest - minutes * 60_000;
  const kept = lines.filter(l => l.ts !== undefined && l.ts >= from);
  let earliest = newest;
  for (const l of kept) if (l.ts! < earliest) earliest = l.ts!;
  return { lines: kept, from: earliest, to: newest, untimed, wholeBuffer: false };
}

/**
 * Where a determinant's matches fell, as `columns` counts across a span.
 *
 * "Draw it over the window": a strip under the summary whose tall slots are
 * when this question had the most to answer. By time, not by line index —
 * the strip sits under a window of minutes and has to agree with it. Lines
 * with no timestamp are not drawn, the same rule the ribbon's clock keeps.
 */
export function matchStrip(
  lines: LogLine[], pattern: CataloguePattern, columns: number,
): { counts: number[]; from?: number; to?: number } {
  const compiled = compilePattern(pattern);
  const times: number[] = [];
  for (const line of lines) {
    if (line.ts === undefined) continue;
    if (matchPattern(compiled, line.message ?? line.text)) times.push(line.ts);
  }
  const counts = new Array<number>(Math.max(0, columns)).fill(0);
  if (!times.length || columns < 1) return { counts };

  let from = Infinity;
  let to = -Infinity;
  for (const l of lines) {
    if (l.ts === undefined) continue;
    if (l.ts < from) from = l.ts;
    if (l.ts > to) to = l.ts;
  }
  const span = Math.max(1, to - from);
  for (const t of times) {
    counts[Math.min(columns - 1, Math.floor(((t - from) / span) * columns))]++;
  }
  return { counts, from, to };
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
