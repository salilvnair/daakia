/**
 * A date phrase, and the window it means right now.
 *
 * ── Why this is its own file ──
 *
 * `14d`, `today`, `>30d`, `<2026-09-15` were written for the dkgh board and
 * then wanted, unchanged, by the history filter. Two copies of a date parser is
 * two answers to "is this from last week" — the kind of drift that is invisible
 * until one panel says three and the other says four, and then nobody trusts
 * either. So the parser lives here, `dkgh/filter-model` re-exports it under the
 * names it already published, and both filters ask the same function.
 *
 * ── The one rule that matters ──
 *
 * **A relative phrase stays relative.** What is saved is `14d`, not the two
 * timestamps it happened to mean on the Monday it was saved — so a saved view
 * still means "the last fortnight" next Monday. Absolute forms are stored
 * absolute, because somebody who typed a date meant that date.
 */

export const DAY = 86_400_000;

export interface DateRange {
  /** Inclusive lower bound, ms. Absent means unbounded. */
  from?: number;
  /** Inclusive upper bound, ms. Absent means unbounded. */
  to?: number;
}

/**
 * Turn a phrase into a window, against a clock passed in.
 *
 * `now` is a parameter rather than a call to `Date.now()` so the arithmetic is
 * testable without freezing time globally — and so a caller filtering a long
 * list resolves the phrase once instead of once per row.
 */
export function resolveRange(phrase: string, now: number): DateRange | undefined {
  const p = phrase.trim().toLowerCase();
  if (!p) return undefined;

  if (p === 'today') return { from: startOfDay(now) };
  if (p === 'week') return { from: now - 7 * DAY };
  if (p === 'sprint') return { from: now - 14 * DAY };
  if (p === 'month') return { from: now - 30 * DAY };

  /* `>30d` — older than thirty days. The comparison is on age, so the sign
     points the way a reader says it out loud rather than the way the timestamp
     compares. */
  let m = p.match(/^([<>]=?)?(\d+)d$/);
  if (m) {
    const n = Number(m[2]) * DAY;
    if (m[1]?.startsWith('>')) return { to: now - n };
    return { from: now - n };
  }

  m = p.match(/^([<>]=?)(\d{4}-\d{2}-\d{2})$/);
  if (m) {
    const at = Date.parse(m[2]);
    if (Number.isNaN(at)) return undefined;
    return m[1].startsWith('>') ? { from: at } : { to: at + DAY - 1 };
  }

  const exact = Date.parse(p);
  if (!Number.isNaN(exact)) return { from: startOfDay(exact), to: startOfDay(exact) + DAY - 1 };
  return undefined;
}

export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Is a timestamp inside the phrase's window? */
export function withinRange(at: number | undefined, phrase: string, now: number): boolean {
  if (at === undefined || !Number.isFinite(at)) return phrase === 'none';
  const range = resolveRange(phrase, now);
  if (!range) return false;
  if (range.from !== undefined && at < range.from) return false;
  if (range.to !== undefined && at > range.to) return false;
  return true;
}

/** How a phrase is said on a chip: `last 14 days`, `before 2026-09-15`. */
export function prettyPhrase(p: string): string {
  if (p === 'today') return 'today';
  if (p === 'week') return 'this week';
  if (p === 'sprint') return 'this sprint';
  if (p === 'month') return 'this month';
  const m = p.match(/^([<>]=?)?(\d+)d$/);
  if (m) return m[1]?.startsWith('>') ? `older than ${m[2]} days` : `last ${m[2]} days`;
  const abs = p.match(/^([<>]=?)(\d{4}-\d{2}-\d{2})$/);
  if (abs) return `${abs[1].startsWith('>') ? 'after' : 'before'} ${abs[2]}`;
  return p;
}
