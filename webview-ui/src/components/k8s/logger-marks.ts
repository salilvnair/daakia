/**
 * Marked patterns, matched against the lines on screen.
 *
 * A tester marks the two or three lines that mean something to the run they are
 * watching — the retry, the fallback, the one the ticket is about — and the log
 * then says where they are without being searched. That is the difference
 * between a filter and a mark: a filter hides everything else, a mark leaves
 * the log intact and tells you where to look in it.
 *
 * Compiled once per set of marks rather than per line: a pod that has been up
 * a while holds a hundred thousand lines, and a regex built inside that loop is
 * the whole cost of the feature.
 */
import type { CataloguePattern } from '../../store/dk8s-logger-store';
import { compilePattern, matchPattern, type CompiledPattern } from './logger-pattern';

export interface CompiledMark {
  id: string;
  /** Index into `MARK_COLORS`. */
  color: number;
  template: string;
  compiled: CompiledPattern;
}

export interface MarkHit {
  id: string;
  color: number;
  template: string;
  start: number;
  end: number;
  fields: Record<string, string>;
}

export function compileMarks(patterns: CataloguePattern[]): CompiledMark[] {
  return patterns
    .filter(p => p.marked)
    .map(p => ({
      id: p.id,
      color: p.color ?? 0,
      template: p.template,
      compiled: compilePattern(p),
    }));
}

/**
 * The first mark that claims this line, if any.
 *
 * First, not all of them: a line belongs to one logger, so a second match is
 * either the same shape said twice or a pattern loose enough to be worth
 * fixing rather than drawing. Stopping at one also means the cost per line is
 * bounded by the number of marks, never by what they find.
 */
export function markOf(text: string, marks: CompiledMark[]): MarkHit | undefined {
  for (const mark of marks) {
    const hit = matchPattern(mark.compiled, text);
    if (hit) {
      return {
        id: mark.id,
        color: mark.color,
        template: mark.template,
        start: hit.start,
        end: hit.end,
        fields: hit.fields,
      };
    }
  }
  return undefined;
}

/**
 * How many lines each mark has claimed.
 *
 * What the catalogue shows beside a pattern: a mark that has never fired is
 * the most useful row on the screen — either the path it watches was not
 * taken, or the pattern is wrong — and the two are told apart by looking.
 */
export function countMarks(lines: { text: string }[], marks: CompiledMark[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const mark of marks) counts[mark.id] = 0;
  for (const line of lines) {
    const hit = markOf(line.text, marks);
    if (hit) counts[hit.id]++;
  }
  return counts;
}

// ── Over the whole buffer ───────────────────────────────────────────────────

/**
 * Every line's mark, by seq, for the Logs tab's map, rail and "Only marked".
 *
 * The screen's own marks are computed over the rows on screen, which is all
 * the highlight needs. The map down the right edge, the counts in the rail and
 * the "Only marked" filter are about the whole buffer, so they need every
 * line — and a following log adds lines many times a second.
 *
 * So the answer for a line is remembered in `cache` by its seq and never
 * worked out twice. The caller throws the cache away when the marks change,
 * which is the only thing that can change a line's answer; a new line costs
 * one `markOf` and an old one a map lookup.
 */
export function indexMarks(
  lines: { seq: number; text: string; message?: string; continuation?: boolean }[],
  marks: CompiledMark[],
  cache: Map<number, MarkHit | null>,
): Map<number, MarkHit> {
  const out = new Map<number, MarkHit>();
  if (!marks.length) return out;
  for (const line of lines) {
    let hit = cache.get(line.seq);
    if (hit === undefined) {
      hit = line.continuation ? null : (markOf(line.message ?? line.text, marks) ?? null);
      cache.set(line.seq, hit);
    }
    if (hit) out.set(line.seq, hit);
  }
  return out;
}

/** How many lines each mark claims, from an index. */
export function countIndex(index: Map<number, MarkHit>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const hit of index.values()) counts[hit.id] = (counts[hit.id] ?? 0) + 1;
  return counts;
}

export interface MarkFacet {
  /** The hole's name: `orderId`. */
  field: string;
  /** Most common value first. */
  values: [string, number][];
}

/**
 * The holes of the marked patterns, as facets — "ORDERID A-4471 6".
 *
 * A mark already knows where the value is in its line: that is what the hole
 * is. So the rail can offer the values of every marked pattern's holes without
 * a log format having named them, which is the case for most pods.
 */
export function markFacets(index: Map<number, MarkHit>, perField = 8): MarkFacet[] {
  const by = new Map<string, Map<string, number>>();
  for (const hit of index.values()) {
    for (const [field, value] of Object.entries(hit.fields)) {
      if (!value || value.length > 80) continue;
      const m = by.get(field) ?? new Map<string, number>();
      m.set(value, (m.get(value) ?? 0) + 1);
      by.set(field, m);
    }
  }
  return [...by.entries()]
    .map(([field, m]) => ({
      field,
      values: [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, perField),
    }))
    /* A hole whose every value is different — a timestamp, a latency — is
       not a facet anybody filters by; one with a few repeating values is. */
    .filter(f => f.values.length > 0)
    .sort((a, b) => a.field.localeCompare(b.field));
}

/**
 * "Only marked" — the lines a mark claims, and the frames under them.
 *
 * A stack trace's frames carry no mark of their own (a mark is about the
 * message), and hiding them would fold a marked exception into a line with
 * nothing to open. So a continuation line goes wherever the line above it
 * went. `field` narrows it to the lines whose hole holds one value — the
 * rail's "ORDERID A-4470".
 */
export function keepMarked<T extends { seq: number; continuation?: boolean }>(
  lines: T[],
  index: Map<number, MarkHit>,
  field?: { field: string; value: string },
): T[] {
  const out: T[] = [];
  let keeping = false;
  for (const line of lines) {
    if (line.continuation) {
      if (keeping) out.push(line);
      continue;
    }
    const hit = index.get(line.seq);
    keeping = !!hit && (!field || hit.fields[field.field] === field.value);
    if (keeping) out.push(line);
  }
  return out;
}

/** How many of the marked lines are at each level — the rail's LEVEL group. */
export function markedLevels(lines: { seq: number; level: string }[], index: Map<number, MarkHit>): [string, number][] {
  const counts = new Map<string, number>();
  for (const l of lines) if (index.has(l.seq)) counts.set(l.level, (counts.get(l.level) ?? 0) + 1);
  const order = ['error', 'warn', 'info', 'debug', 'other'];
  return [...counts.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
}

/**
 * The next row after `from` that a mark claims, wrapping at the end.
 * `id` narrows it to one mark — the rail's "next of this one".
 */
export function nextMarked(
  rows: { line: { seq: number } }[],
  index: Map<number, MarkHit>,
  from: number,
  id?: string,
): number | undefined {
  const n = rows.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    const hit = index.get(rows[i].line.seq);
    if (hit && (!id || hit.id === id)) return i;
  }
  return undefined;
}
