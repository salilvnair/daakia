/**
 * Everything one line names, and where each of it came from.
 *
 * A reader who has found their line asks the same question every time: what
 * else was going on with this request, this thread, this order. Answering it
 * means knowing what the line actually names — and a log line names things in
 * four different ways at once:
 *
 *   - the LAYOUT the format parsed: thread, logger, app;
 *   - the MDC the application put on it: requestDataId, tenant, downstream;
 *   - a PATTERN from the catalogue, whose holes are named after the arguments
 *     that fill them — which is how a value buried in the message becomes a
 *     field at all;
 *   - the PAYLOAD it carries, whose leaves are named by their own keys.
 *
 * Only the first two are the pod's own words. The third is something somebody
 * pasted, and the fourth is a body that happened to parse — so every field says
 * which it is, and a reader can tell "the format says this thread" from "a
 * pattern I added last week says this is an order id".
 *
 * Nothing is guessed. A line with no format, no pattern and no payload yields
 * nothing at all, which is the honest answer and the same one `log-facets`
 * gives for the buffer.
 */
import type { LogLine } from '../../store/k8s-store';
import { isSecretKey, type LogPayload } from './log-payload';
import type { MarkHit } from './logger-marks';

export type FieldOrigin = 'format' | 'mdc' | 'pattern' | 'custom' | 'payload';

export interface LineField {
  key: string;
  value: string;
  origin: FieldOrigin;
  /** A secret-looking key, so the value is not shown until it is asked for. */
  secret?: boolean;
}

export const ORIGIN_LABEL: Record<FieldOrigin, string> = {
  format: 'the layout pattern',
  mdc: 'the MDC',
  pattern: 'a catalogued pattern',
  custom: 'a field you named',
  payload: 'the payload',
};

/** Deepest a payload is walked for leaves, and the most fields it may yield. */
const MAX_DEPTH = 4;
const MAX_PAYLOAD_FIELDS = 40;

/**
 * The fields of one line, best source first.
 *
 * Order is priority: the format's own slots, then the MDC, then a pattern's
 * holes, then the payload's leaves. A key claimed by an earlier source is not
 * claimed again — a `thread` the format parsed is the thread, whatever a
 * pattern thinks it found.
 */
export function fieldsOf(
  line: LogLine,
  extra: {
    payload?: LogPayload;
    mark?: MarkHit;
    /** What the field readers found — every catalogued pattern's holes, and the fields named in Settings. */
    read?: { key: string; value: string; origin: 'pattern' | 'custom' }[];
  } = {},
): LineField[] {
  const out: LineField[] = [];
  const taken = new Set<string>();

  const push = (key: string, value: string, origin: FieldOrigin) => {
    const clean = key.trim();
    if (!clean || taken.has(clean)) return;
    if (value === undefined || value === null || value === '') return;
    taken.add(clean);
    out.push({ key: clean, value, origin, secret: isSecretKey(clean) || undefined });
  };

  push('thread', line.thread ?? '', 'format');
  push('logger', line.logger ?? '', 'format');
  push('app', line.app ?? '', 'format');

  for (const [key, value] of Object.entries(line.fields ?? {})) push(key, String(value), 'mdc');

  for (const f of extra.read ?? []) if (f.origin === 'custom') push(f.key, f.value, 'custom');
  for (const [key, value] of Object.entries(extra.mark?.fields ?? {})) push(key, value, 'pattern');
  for (const f of extra.read ?? []) if (f.origin === 'pattern') push(f.key, f.value, 'pattern');

  if (extra.payload?.value !== undefined) {
    for (const [key, value] of leaves(extra.payload.value)) push(key, value, 'payload');
  }

  return out;
}

/**
 * A payload's leaves, by their dotted path.
 *
 * Leaves only: `card` is not a value anybody follows, `card.last4` is. Arrays
 * keep their index — `items[0].sku` is a different thing from `items[1].sku`,
 * and collapsing them would offer a field that matches whichever one came
 * first.
 */
function leaves(value: unknown, prefix = '', depth = 0): [string, string][] {
  if (depth > MAX_DEPTH || value === null || value === undefined) return [];

  if (typeof value !== 'object') {
    return prefix ? [[prefix, String(value)]] : [];
  }

  const out: [string, string][] = [];
  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [`${prefix}[${i}]`, v])
    : Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [prefix ? `${prefix}.${k}` : k, v]);

  for (const [key, child] of entries) {
    if (out.length >= MAX_PAYLOAD_FIELDS) break;
    out.push(...leaves(child, key, depth + 1));
  }
  return out.slice(0, MAX_PAYLOAD_FIELDS);
}

/**
 * How many lines in the buffer carry the same value for that field.
 *
 * What the rail shows beside Follow, so the reader knows whether they are
 * about to narrow to nine lines or to nine thousand. Counted over the buffer,
 * which is what this window holds — never presented as a count of the pod's
 * whole history.
 */
export function countHere(lines: LogLine[], field: LineField): number {
  let n = 0;
  for (const line of lines) {
    if (matchesField(line, field)) n++;
  }
  return n;
}

function matchesField(line: LogLine, field: LineField): boolean {
  if (field.key === 'thread') return line.thread === field.value;
  if (field.key === 'logger') return line.logger === field.value;
  if (field.key === 'app') return line.app === field.value;

  const mdc = line.fields?.[field.key];
  if (mdc !== undefined) return String(mdc) === field.value;

  /*
    A pattern's hole and a payload's leaf are not on the line as fields, so the
    only honest test left is whether the text carries the value. It over-counts
    a value that appears for another reason — which is why the rail says "lines
    that mention it" for those, rather than claiming they are the same field.
  */
  return line.text.includes(field.value);
}

/** Whether a field can be filtered on exactly, or only searched for as text. */
export function isExact(field: LineField): boolean {
  return field.origin === 'format' || field.origin === 'mdc';
}
