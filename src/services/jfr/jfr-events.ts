/**
 * Every event type in the recording, and the raw rows behind any of them.
 *
 * The other views each answer one question well and, in doing so, throw most
 * of the recording away. `under-load.jfr` holds 32 distinct event types and
 * the built views read nine of them; the other 23 include the JVM's flags, its
 * safepoints, its module graph, its compiler statistics and its environment —
 * things nobody wants a dedicated screen for, and which occasionally settle an
 * argument in one line.
 *
 * So this is the fallback rather than a feature: no interpretation, no ranking,
 * no rules. What the recording says, in the order it says it. It is also the
 * honest answer to "does dk8s support event X" — if the JVM wrote it, it is in
 * here whether or not anyone has built a chart for it.
 *
 * Values are flattened to display strings HERE rather than in the view, so the
 * formatting of a constant-pool reference or a nested struct is one decision
 * with tests on it rather than a `String(value)` scattered through a table.
 */
import type { JfrChunk, JfrValue } from './jfr-chunk';
import { text as str } from './jfr-text';

export interface EventTypeSummary {
  name: string;
  count: number;
  /** Field names, in the order the recording declares them. */
  fields: string[];
}

/** Every type that actually has events, commonest first. */
export function readEventTypes(chunks: JfrChunk[]): EventTypeSummary[] {
  const counts = new Map<string, number>();
  const fields = new Map<string, string[]>();

  for (const chunk of chunks) {
    for (const [name, n] of chunk.counts()) {
      counts.set(name, (counts.get(name) ?? 0) + n);
      if (!fields.has(name)) {
        const type = chunk.meta.byName.get(name);
        if (type) fields.set(name, type.fields.map(f => f.name));
      }
    }
  }

  return [...counts]
    .map(([name, count]) => ({ name, count, fields: fields.get(name) ?? [] }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * One value, as something a person can read in a table cell.
 *
 * The shapes that actually turn up, and why each is handled:
 *
 *   bigint    ticks and byte counts. `String()` on a bigint gives `123n` in
 *             some engines and a bare number in others; forced explicitly.
 *   struct    a constant-pool reference — a thread, a class, a stack trace.
 *             `text` already knows how to find the readable field inside one.
 *   array     a stack trace's frames, mostly. Summarised by length rather than
 *             expanded, because one row must stay one row.
 *   null      a field the JVM chose not to fill in, which is different from
 *             an empty string and reads as an em dash.
 */
export function displayValue(v: JfrValue | undefined): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return `[${v.length}]`;
  // A struct: let the shared reader find the name-ish field inside it.
  const s = str(v);
  if (s) return s;

  /*
    A struct with no name to find — `GCHeapSummary.heapSpace` and its kind,
    which are plain records of numbers.

    `{…}` is honest and useless: the cell says a value exists and refuses to
    say what. One level of primitives, compactly, is the whole content of these
    records and fits in a cell. Nested structs inside are still elided, because
    expanding those is what turns a row into a paragraph.
  */
  const entries = Object.entries(v as Record<string, JfrValue>)
    .filter(([, x]) => x !== null && x !== undefined && typeof x !== 'object')
    .slice(0, 4);
  if (!entries.length) return '{…}';
  return entries.map(([k, x]) => `${k}=${displayValue(x)}`).join(' ');
}

export interface EventRowOptions {
  limit?: number;
  /** Rows to skip, so the view can page rather than decode everything. */
  offset?: number;
}

export interface EventRows {
  fields: string[];
  rows: Record<string, string>[];
  /** Events of this type in the whole recording, not just this page. */
  total: number;
}

/**
 * The rows of one event type, decoded and flattened.
 *
 * Paged on purpose. A `settings=profile` recording of thirty seconds holds
 * thousands of allocation samples, and decoding all of them to show twenty is
 * the difference between a view that opens and one that hangs.
 */
export function readEventRows(
  chunks: JfrChunk[],
  typeName: string,
  opts: EventRowOptions = {},
): EventRows {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  const fields: string[] = [];
  const rows: Record<string, string>[] = [];
  let seen = 0;

  for (const chunk of chunks) {
    if (!fields.length) {
      const type = chunk.meta.byName.get(typeName);
      if (type) fields.push(...type.fields.map(f => f.name));
    }
    for (const raw of chunk.events(typeName)) {
      seen++;
      if (seen <= offset) continue;
      if (rows.length < limit) {
        const e = chunk.resolve(raw) as Record<string, JfrValue>;
        const row: Record<string, string> = {};
        for (const f of fields) row[f] = displayValue(e[f]);
        rows.push(row);
      }
    }
  }

  return { fields, rows, total: seen };
}
