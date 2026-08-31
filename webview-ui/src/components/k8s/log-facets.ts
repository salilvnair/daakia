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

export type FacetField = 'thread' | 'logger' | 'app';

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
}

export const FACET_LABEL: Record<FacetField, string> = {
  thread: 'Thread name',
  logger: 'Logger',
  app: 'Application',
};

const FIELDS: FacetField[] = ['thread', 'logger', 'app'];

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
export function buildFacets(
  lines: Pick<LogLine, 'thread' | 'logger' | 'app'>[],
  perField = 20,
): Facet[] {
  const counts: Record<FacetField, Map<string, number>> = {
    thread: new Map(), logger: new Map(), app: new Map(),
  };

  let scanned = 0;
  for (const line of lines) {
    let sawAny = false;
    for (const field of FIELDS) {
      const v = line[field];
      if (!v) continue;
      sawAny = true;
      counts[field].set(v, (counts[field].get(v) ?? 0) + 1);
    }
    // Only lines that carried fields count toward the denominator, so the
    // reported scan size describes the events these values came from rather
    // than the whole buffer including its stack traces.
    if (sawAny) scanned++;
  }

  const facets: Facet[] = [];
  for (const field of FIELDS) {
    const values = [...counts[field].entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    /*
      One value is not a filter.

      Every line in a single pod's log carries the same application name, so
      "Application ▸ zp-backend" is a control that selects everything it could
      possibly select.
    */
    if (values.length < 2) continue;
    facets.push({ field, label: FACET_LABEL[field], values: values.slice(0, perField), scanned });
  }

  return facets;
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
