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
