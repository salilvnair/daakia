/**
 * Following one value across every pod a search covered.
 *
 * A search finds a line. The next question is never about that line — it is
 * "what else happened to this request, on this thread, in these pods". Follow
 * answers it by turning the value into a condition and reading the pods again,
 * pinned to a window around the line you came from, and keeping only the lines
 * whose field EQUALS the value. Not "mentions it": a thread name is a substring
 * of its neighbours (`exec-7` is in `exec-71`), and an order id turns up in
 * other orders' messages. Equality on a parsed field is the only answer that
 * can be read as "these lines are the same request".
 *
 * Conditions stack with AND, each can be switched off without being dropped,
 * and nothing here consults a model: every line on screen is there because a
 * slot on it holds the value.
 *
 * Pure, so the page and its tests share one definition of "this line follows".
 */
import type { LogLine } from '../../store/k8s-store';
import type { ResultLine } from './search-results';
import { valueOf, type FieldReader } from './field-readers';

export interface Condition {
  field: string;
  value: string;
  /** Off keeps the chip and stops it narrowing — to see what it was hiding. */
  on: boolean;
}

/** The window around the line you came from, in seconds either side — and what Widen steps through. */
export const WIDEN_STEPS = [90, 300, 900, 3600] as const;

export function nextWidth(seconds: number): number | undefined {
  return WIDEN_STEPS.find(s => s > seconds);
}

export function widthLabel(seconds: number): string {
  if (seconds < 120) return `± ${seconds}s`;
  if (seconds < 3600) return `± ${Math.round(seconds / 60)}m`;
  return `± ${Math.round(seconds / 3600)}h`;
}

/** Whether every condition that is on holds for this line. */
export function follows(line: Parameters<typeof valueOf>[0], conds: Condition[], readers: FieldReader[] = []): boolean {
  const active = conds.filter(c => c.on);
  if (!active.length) return false;
  return active.every(c => valueOf(line, c.field, readers) === c.value);
}

/**
 * What the pods are asked for.
 *
 * The host searches text; exactness is applied here afterwards. So the query
 * is the value of one condition that is on — the longest, because a longer
 * literal lets through fewer lines to throw away — and it is literal, never a
 * regex, because values are full of dots and brackets.
 */
export function followQuery(conds: Condition[]): string | undefined {
  const active = conds.filter(c => c.on && c.value);
  if (!active.length) return undefined;
  return [...active].sort((a, b) => b.value.length - a.value.length)[0].value;
}

/** Lines per pod, every pod searched included — a pod with none is an answer too. */
export function podCounts(lines: { pod: string }[], pods: string[]): { pod: string; n: number }[] {
  const n = new Map<string, number>(pods.map(p => [p, 0]));
  for (const l of lines) n.set(l.pod, (n.get(l.pod) ?? 0) + 1);
  return [...n.entries()].map(([pod, count]) => ({ pod, n: count })).sort((a, b) => b.n - a.n);
}

/** Keys that correlate nothing: every line of a service shares them. */
const NOT_CORRELATING = new Set(['logger', 'app', 'level', 'pod']);

/**
 * What else these lines carried — "what else this thread touched".
 *
 * The request id, the order, the trace the followed lines share: each a
 * candidate for the next condition. Counted over the followed lines, most
 * frequent first, and never a field already being followed.
 */
export function touched(
  lines: (Parameters<typeof valueOf>[0])[],
  conds: Condition[],
  /** The readers' fields for a line — pattern holes and custom fields. */
  readFields?: (line: Parameters<typeof valueOf>[0]) => { key: string; value: string }[],
  limit = 8,
): { field: string; value: string; n: number }[] {
  const skip = new Set(conds.map(c => c.field));
  const counts = new Map<string, { field: string; value: string; n: number }>();
  const bump = (field: string, value: string) => {
    if (skip.has(field) || NOT_CORRELATING.has(field) || !value) return;
    const k = `${field}\u0000${value}`;
    const cur = counts.get(k);
    if (cur) cur.n++;
    else counts.set(k, { field, value, n: 1 });
  };
  for (const line of lines) {
    if (line.thread) bump('thread', line.thread);
    for (const [k, v] of Object.entries(line.fields ?? {})) bump(k, String(v));
    for (const f of readFields?.(line) ?? []) bump(f.key, f.value);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.field.localeCompare(b.field)).slice(0, limit);
}

/**
 * How widely a value is spread through lines on hand: "312 lines · 3 pods".
 *
 * What a field card says before Follow is pressed, so the reader knows whether
 * they are about to narrow to nine lines or to nine thousand.
 */
export function spread(
  lines: (Parameters<typeof valueOf>[0] & { pod?: string })[],
  field: string,
  value: string,
  readers: FieldReader[] = [],
): { lines: number; pods: number } {
  let n = 0;
  const pods = new Set<string>();
  for (const l of lines) {
    if (valueOf(l, field, readers) !== value) continue;
    n++;
    if (l.pod) pods.add(l.pod);
  }
  return { lines: n, pods: pods.size };
}

/**
 * A value that is a number, and the number.
 *
 * `30000`, `1.9s`, `340ms`, `10 / 10` — the first number is the measure. What
 * it will not call a number: an id that happens to be digits and a word
 * (`A-4470`), a version (`1.2.3`), a hex string.
 */
export function numberOf(value: string): number | undefined {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(?:ms|s|m|h|kb|mb|gb|%|\/\s*\d+(?:\.\d+)?)?\s*$/i.exec(value);
  return m ? Number(m[1]) : undefined;
}

/**
 * Whether a field is a measure — charted and floored — or an id, followed.
 *
 * Digits alone decide nothing: `requestDataId=8842` is an id and
 * `hikari.active=10` is a measure, and the value cannot tell them apart. The
 * name can. A name that ends in `id` is an id whatever it holds; otherwise a
 * value with a unit or a fraction (`340ms`, `1.9`, `10 / 10`), or a name that
 * says it measures something, is a measure.
 */
const MEASURE_NAME = /(ms|millis|time|took|dur|duration|latency|elapsed|count|size|bytes|active|idle|pending|waiting|queue|max|min|total|len|length|pct|percent|ratio|rate|retries|attempt)$/i;

export function isMeasure(key: string, value: string): boolean {
  if (numberOf(value) === undefined) return false;
  const leaf = key.split('.').pop() ?? key;
  if (/(^|[^a-z])id$|Id$|ID$|_id$/.test(leaf)) return false;
  if (/[a-z%]\s*$/i.test(value.trim()) || /\./.test(value) || /\//.test(value)) return true;
  return MEASURE_NAME.test(leaf);
}

/** Keep the lines whose field is at least `min` — "Only when ≥ 10". */
export function atLeast<T extends Parameters<typeof valueOf>[0]>(
  lines: T[], field: string, min: number, readers: FieldReader[] = [],
): T[] {
  return lines.filter(l => {
    const v = valueOf(l, field, readers);
    const n = v === undefined ? undefined : numberOf(v);
    return n !== undefined && n >= min;
  });
}

/** The points of a numeric field over time, for "Chart it". */
export function series(
  lines: (Parameters<typeof valueOf>[0] & { ts?: number })[],
  field: string,
  readers: FieldReader[] = [],
): { ts: number; v: number }[] {
  const out: { ts: number; v: number }[] = [];
  for (const l of lines) {
    if (l.ts === undefined) continue;
    const raw = valueOf(l, field, readers);
    const v = raw === undefined ? undefined : numberOf(raw);
    if (v !== undefined) out.push({ ts: l.ts, v });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/**
 * "Where these came from", said once for the card list.
 *
 * `thread from the layout pattern, requestDataId and downstream from the MDC,
 * hikari.active from a catalogued pattern.` Grouped by source, in the order the
 * readers run, so the sentence reads the way the fields were found.
 */
export function whereFrom(fields: { key: string; origin: string }[]): string {
  const NAMES: Record<string, string> = {
    format: 'the layout pattern', mdc: 'the MDC', pattern: 'a catalogued pattern',
    custom: 'a field you named', payload: 'the payload',
  };
  const order = ['format', 'mdc', 'pattern', 'custom', 'payload'];
  const parts: string[] = [];
  for (const origin of order) {
    const keys = fields.filter(f => f.origin === origin).map(f => f.key);
    if (!keys.length) continue;
    const list = keys.length === 1 ? keys[0]
      : `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`;
    parts.push(`${list} from ${NAMES[origin]}`);
  }
  return parts.length ? `${parts.join(', ')}.` : '';
}

/**
 * The followed lines, as one timeline or pod by pod.
 *
 * One timeline is the default: a request that went through three pods is one
 * story in time order, and the pod column says where each line was. Pod by pod
 * keeps each pod's own order — what a reader wants when two pods' clocks
 * disagree by a second and the interleaving is a lie.
 */
export function arrange<T extends { ts?: number; pod: string; seq: number }>(lines: T[], oneTimeline: boolean): T[] {
  const byTime = (a: T, b: T) => (a.ts ?? 0) - (b.ts ?? 0) || a.seq - b.seq;
  if (oneTimeline) return [...lines].sort(byTime);
  return [...lines].sort((a, b) => a.pod.localeCompare(b.pod) || byTime(a, b));
}

/** Where the line you came from sits among the followed ones. */
export function cameFrom<T extends { pod: string; ts?: number; text: string }>(
  lines: T[], origin: { pod: string; ts?: number; text: string } | undefined,
): number {
  if (!origin) return -1;
  return lines.findIndex(l => l.pod === origin.pod && l.text === origin.text
    && (origin.ts === undefined || l.ts === origin.ts));
}

/** A result line's worth of `LogLine`, for the checks that only need the fields. */
export type FollowLine = ResultLine & Pick<LogLine, 'thread' | 'logger' | 'app' | 'fields' | 'message'>;
