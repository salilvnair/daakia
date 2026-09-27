/**
 * How much of a scope Ask the log sends — at most 2,000 lines, unless the
 * reader has said more in Settings.
 *
 * A question over "since yesterday" on a busy pod is tens of thousands of
 * lines, and every one sent is AI tokens paid for. So a long scope is first
 * grepped for what the question names — an id, a quoted phrase, the words
 * that are not about time ("timeout", "payment", "refund") — and what is left
 * is cut to the newest 2,000 lines. The Ask the log tab says it did this,
 * above the answer, and where to turn it off.
 *
 * The override (`ASK_SEND_MORE_PREF`) raises the cap to what one fetch can
 * hold; turning it on asks first, because it is the reader's AI credits.
 */
import { questionTokens } from './ask-log';

export const ASK_LINE_CAP = 2000;
export const ASK_SEND_MORE_PREF = 'dk8s.askLog.sendMore';

/** Words that say when or how much, or are the question's grammar — never worth grepping for. */
const NOT_TERMS = new Set([
  'what', 'whats', 'went', 'wrong', 'happened', 'happen', 'happening', 'last', 'first', 'lines', 'line',
  'minutes', 'minute', 'hours', 'hour', 'days', 'seconds', 'since', 'today', 'yesterday', 'morning',
  'which', 'when', 'where', 'there', 'about', 'from', 'with', 'have', 'that', 'this', 'these', 'those',
  'show', 'tell', 'logs', 'anything', 'something', 'summarise', 'summarize', 'summary', 'explain', 'between',
  'after', 'before', 'during', 'within', 'past', 'recent', 'latest', 'newest', 'please', 'there', 'were',
  'does', 'did', 'doing', 'into', 'over', 'every', 'some', 'many', 'much', 'more', 'less', 'than', 'them',
  'they', 'their', 'your', 'mine', 'pod', 'pods', 'container', 'window', 'whole', 'entire', 'give', 'find',
  'look', 'check', 'went', 'quiet', 'loggers', 'logger', 'new', 'again',
]);

/** What the question names that a line could contain. Ids first; words only when there are none. */
export function grepTerms(question: string): string[] {
  const ids = questionTokens(question);
  if (ids.length) return ids;
  const words = question.toLowerCase().match(/[a-z][a-z0-9_.-]{3,}/g) ?? [];
  return [...new Set(words.filter(w => !NOT_TERMS.has(w)))];
}

interface Liney { text: string; message?: string; continuation?: boolean }

export interface Capped<T> {
  lines: T[];
  /** Lines in the scope before the cap. */
  total: number;
  /** What was kept, when not everything was. */
  how?: 'grep' | 'newest' | 'grep-newest';
  terms: string[];
}

/**
 * The scope cut to `cap` lines: grepped for the question's terms when it is
 * longer, then the newest. A line's continuation lines (a stack trace) stay
 * with it and count toward the cap.
 */
export function capLines<T extends Liney>(lines: T[], question: string, cap: number): Capped<T> {
  const terms = grepTerms(question);
  if (lines.length <= cap) return { lines, total: lines.length, terms };

  /* Events: a line and the continuation lines under it. */
  const events: T[][] = [];
  for (const l of lines) {
    if (l.continuation && events.length) events[events.length - 1].push(l);
    else events.push([l]);
  }

  const matching = terms.length
    ? events.filter(e => { const t = (e[0].message ?? e[0].text).toLowerCase(); return terms.some(w => t.includes(w)); })
    : [];
  const pool = matching.length ? matching : events;

  /* Newest first, until the cap. */
  const kept: T[][] = [];
  let n = 0;
  for (let i = pool.length - 1; i >= 0 && n < cap; i--) {
    kept.push(pool[i]);
    n += pool[i].length;
  }
  kept.reverse();
  const out = kept.flat().slice(-cap);
  const grepped = matching.length > 0;
  const allMatches = grepped && matching.reduce((k, e) => k + e.length, 0) <= cap;
  return {
    lines: out,
    total: lines.length,
    how: grepped ? (allMatches ? 'grep' : 'grep-newest') : 'newest',
    terms,
  };
}
