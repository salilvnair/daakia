/**
 * The values a log can be filtered by.
 *
 * ── What changed, and why ──
 *
 * This file used to guess. It looked for bracketed runs and class-like tokens
 * and inferred a thread, a logger and an application from any line it was
 * handed. Against a real Spring Boot pod it offered these as thread names:
 *
 *     hibernate-core-6.6.4.Final.jar!/:6.6.4.Final   38
 *     main                                           22   ← the only real one
 *     na:na                                           7
 *     app.jar:1.0.0                                   6
 *     !/:1.0.0                                        2
 *
 * Every one of those but `main` is the jar tag Spring Boot appends to a stack
 * frame — `~[app.jar:1.0.0]`. A bracket is not a thread, and no amount of
 * tightening the guess fixes that, because the guess never had the information
 * to begin with.
 *
 * So the guessing is gone. Fields come from a configured format — parsed on
 * the host, carried on the line — or the log offers no field filters at all.
 * That is the trade `sevdokimov/log-viewer` makes too: when its detector
 * cannot identify a format it falls back to `SimpleLogFormat`, whose own
 * description is "each line is an event", with zero fields. Offering nothing
 * beats offering something wrong.
 *
 * ── What is honest to count ──
 *
 * These are counts of the LINES IN THE BUFFER — a few hundred out of a pod's
 * millions. `scanned` travels with them so the UI can say which it means. A
 * bare "22" beside a thread name reads as "there are 22 of these", and that is
 * not a claim this data can support.
 */
import type { LogLine } from '../../store/k8s-store';

/**
 * The three the format names in their own slots, plus anything else it carried.
 *
 * A string rather than a union now, because MDC keys are whatever the
 * application chose to log. The three named ones keep their labels and their
 * position at the top of the list; the rest are labelled by their own key,
 * which is the name the person who wrote the log line picked.
 */
export type FacetField = string;

/** The ones with a slot of their own, in the order they are worth reading. */
export const NAMED_FIELDS = ['thread', 'logger', 'app'] as const;

export interface FacetValue {
  value: string;
  /** Occurrences among the lines examined — not in the log. */
  count: number;
}

export interface Facet {
  field: FacetField;
  label: string;
  values: FacetValue[];
  /** How many parsed events produced these counts. */
  scanned: number;
  /** Values before `perField` truncated the list, so the UI can say so. */
  distinct: number;
  /** One of thread/logger/app rather than a field the application named. */
  named: boolean;
}

export const FACET_LABEL: Record<string, string> = {
  thread: 'Thread name',
  logger: 'Logger',
  app: 'Application',
};

/** A field's label: the friendly one where there is one, its own key otherwise. */
export function facetLabel(field: string): string {
  return FACET_LABEL[field] ?? field;
}

/**
 * How well a field divides the buffer, from 0 to 1.
 *
 * A field where every line shares one value tells you nothing, and one with a
 * distinct value per line — a trace id — is a list rather than a filter. The
 * useful ones sit between: a handful of values splitting the events unevenly.
 *
 * Used to ORDER the extra fields, so the most informative surface first and a
 * cap drops the least. The three named fields skip this and keep their places;
 * they are the ones a reader goes looking for by name.
 */
export function usefulness(values: { count: number }[], scanned: number): number {
  if (scanned <= 0 || values.length < 2) return 0;
  // Distinct values as a share of events: 1 means every line is unique.
  const spread = values.length / scanned;
  if (spread > 0.6) return 0;
  // Normalised entropy — highest when the events are split evenly, lowest
  // when one value dominates. Both extremes are less useful than the middle.
  let h = 0;
  for (const v of values) {
    const pr = v.count / scanned;
    if (pr > 0) h -= pr * Math.log2(pr);
  }
  return h / Math.log2(values.length);
}

/**
 * Group the buffered lines by each field a format actually named.
 *
 * A line with no fields contributes nothing. That is every line when no format
 * is configured, and every continuation when one is — which is exactly right:
 * a stack frame has no thread of its own, it belongs to the event above it.
 *
 * `perField` caps a submenu rather than the data. A Netty application has
 * hundreds of threads and a menu cannot show hundreds of anything; the cap
 * applies after sorting, so what is dropped is always the quietest.
 */
/**
 * A ceiling on how many fields reach the UI.
 *
 * The rail is scanned, not read, and past a dozen headings it stops being
 * scannable. What is dropped is decided by `usefulness`, so the ones that
 * survive are the ones that actually divide the buffer.
 */
const MAX_FACETS = 12;

/**
 * A field with a distinct value on nearly every line is a list, not a filter.
 *
 * `traceId` is the case this exists for: 400 values of count 1 is not
 * something anyone browses. Such fields are still on the line and still
 * filterable from a row's own menu, where you have picked one value rather
 * than being offered all of them.
 */
const MAX_DISTINCT = 50;

export function buildFacets(
  lines: Pick<LogLine, 'thread' | 'logger' | 'app' | 'fields'>[],
  perField = 20,
): Facet[] {
  const counts = new Map<string, Map<string, number>>();
  const bump = (field: string, value: string) => {
    let m = counts.get(field);
    if (!m) { m = new Map(); counts.set(field, m); }
    m.set(value, (m.get(value) ?? 0) + 1);
  };

  let scanned = 0;
  for (const line of lines) {
    let sawAny = false;
    for (const field of NAMED_FIELDS) {
      const v = line[field];
      if (!v) continue;
      sawAny = true;
      bump(field, v);
    }
    // Whatever else the format carried. Bounded on the host, so this is a
    // handful of short strings rather than an open door.
    if (line.fields) {
      for (const [k, v] of Object.entries(line.fields)) {
        if (!v) continue;
        sawAny = true;
        bump(k, v);
      }
    }
    // Only lines that carried fields count toward the denominator, so the
    // reported scan size describes the events these values came from rather
    // than the whole buffer including its stack traces.
    if (sawAny) scanned++;
  }

  const named: Facet[] = [];
  const extra: { facet: Facet; score: number }[] = [];

  for (const [field, m] of counts) {
    const values = [...m.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    /*
      One value is not a filter.

      Every line in a single pod's log carries the same application name, so
      "Application ▸ zp-backend" is a control that selects everything it could
      possibly select.
    */
    if (values.length < 2) continue;

    const facet: Facet = {
      field, label: facetLabel(field),
      values: values.slice(0, perField), scanned,
      /* The full count, so the UI can say what the cap hid rather than
         silently showing twenty of two hundred. */
      distinct: values.length,
      named: (NAMED_FIELDS as readonly string[]).includes(field),
    };

    if (facet.named) { named.push(facet); continue; }
    if (values.length > MAX_DISTINCT) continue;
    extra.push({ facet, score: usefulness(values, scanned) });
  }

  // Named fields keep their own order — a reader looks for "Thread name"
  // where it has always been — and the rest are ranked by what they divide.
  named.sort((a, b) =>
    NAMED_FIELDS.indexOf(a.field as typeof NAMED_FIELDS[number])
    - NAMED_FIELDS.indexOf(b.field as typeof NAMED_FIELDS[number]));
  extra.sort((a, b) => b.score - a.score || a.facet.field.localeCompare(b.facet.field));

  return [...named, ...extra.map(e => e.facet)].slice(0, MAX_FACETS);
}

/**
 * The filter-box term for a field value.
 *
 * Bracketing a thread is not decoration: a thread called `main` appears inside
 * `domain` and `remaining` and any message containing the word, and the
 * brackets are already in the line the format parsed it out of.
 */
export function filterTermFor(field: FacetField, value: string): string {
  return field === 'thread' ? `[${value}]` : value;
}
