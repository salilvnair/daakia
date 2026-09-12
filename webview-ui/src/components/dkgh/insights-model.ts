/**
 * The four numbers behind screen 16.
 *
 * Each chart answers a question somebody asks out loud in a status call, and
 * each one is computed from the issues the board already read — no second
 * request, no server-side aggregation nobody can check. That is also what makes
 * every bar a filter you have not applied yet: the chart and the board are
 * looking at the same list.
 *
 * **Nothing here estimates.** The weekly series needs `closedAt`, which only
 * arrives when closed issues are loaded; when they are not, `closedKnown` is
 * false and the screen says the closing line is missing rather than drawing a
 * flat line somebody would read as "nothing was closed". A chart that quietly
 * substitutes last-activity for close date is worse than a chart with one
 * series.
 */
import type { BoardIssue } from './board-types';

const DAY = 86_400_000;

export interface WeekPoint {
  /** Monday of the week, ISO. */
  week: string;
  opened: number;
  closed: number;
  /** Open at the end of that week, counting everything before it too. */
  open: number;
}

export interface Series {
  points: WeekPoint[];
  /** False when no issue carries a close date, so the closed line is absent. */
  closedKnown: boolean;
}

/**
 * Opened against closed, by week. The gap is the backlog.
 *
 * Counted forward from the first issue in the window, so the running total is
 * the real one rather than one that starts at zero and pretends the repository
 * did too.
 */
export function weekly(issues: BoardIssue[], weeks = 12, now = Date.now()): Series {
  const start = monday(now - (weeks - 1) * 7 * DAY);
  const points: WeekPoint[] = [];
  for (let i = 0; i < weeks; i += 1) {
    points.push({ week: iso(start + i * 7 * DAY), opened: 0, closed: 0, open: 0 });
  }
  const at = new Map(points.map((p, i) => [p.week, i]));

  /* Everything that happened before the window still counts towards the
     running total; it just does not get a bar. */
  let before = 0;
  let closedKnown = false;

  for (const issue of issues) {
    const opened = Date.parse(issue.createdAt);
    if (Number.isFinite(opened)) {
      const key = iso(monday(opened));
      const i = at.get(key);
      if (i === undefined) { if (opened < start) before += 1; }
      else points[i].opened += 1;
    }
    const shut = issue.closedAt ? Date.parse(issue.closedAt) : NaN;
    if (Number.isFinite(shut)) {
      closedKnown = true;
      const key = iso(monday(shut));
      const i = at.get(key);
      if (i === undefined) { if (shut < start) before -= 1; }
      else points[i].closed += 1;
    }
  }

  let running = Math.max(0, before);
  for (const p of points) {
    running += p.opened - p.closed;
    p.open = Math.max(0, running);
  }
  return { points, closedKnown };
}

/** Monday 00:00 UTC of the week a moment falls in. */
export function monday(at: number): number {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY;
}

function iso(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export interface StackedRow {
  label: string;
  total: number;
  /** In the order the split's own options declare, so colours stay put. */
  parts: { key: string; count: number }[];
}

/**
 * One row per value of `by`, each split by `split`.
 *
 * Sorted by size, because the question is "where are they" and the answer is
 * the top of the list. A value nobody has is not a row: an empty bar for a
 * module with no open issues is a line of nothing to read past.
 */
export function stacked(
  issues: BoardIssue[],
  by: (i: BoardIssue) => string,
  split?: (i: BoardIssue) => string,
): StackedRow[] {
  const rows = new Map<string, Map<string, number>>();
  for (const issue of issues) {
    const key = by(issue);
    const inner = rows.get(key) ?? new Map<string, number>();
    const s = split ? split(issue) : '';
    inner.set(s, (inner.get(s) ?? 0) + 1);
    rows.set(key, inner);
  }
  return [...rows.entries()]
    .map(([label, inner]) => ({
      label,
      total: [...inner.values()].reduce((a, b) => a + b, 0),
      parts: [...inner.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/**
 * Per assignee, and **unassigned is a person, deliberately at the top**.
 *
 * Three urgent issues with nobody's name on them is the single most useful
 * thing this tab can say to a lead, and sorting it in among the real names by
 * count would be the polite way to hide it.
 */
export function byAssignee(issues: BoardIssue[], split?: (i: BoardIssue) => string): StackedRow[] {
  const rows = stacked(issues, i => i.assignees[0] ?? 'unassigned', split);
  const nobody = rows.filter(r => r.label === 'unassigned');
  return [...nobody, ...rows.filter(r => r.label !== 'unassigned')];
}

export interface AgeBucket {
  label: string;
  from: number;
  to: number;
  count: number;
  /** Green under a week, amber to three, red past that. */
  tone: 'good' | 'warn' | 'bad';
}

const BUCKETS: Omit<AgeBucket, 'count'>[] = [
  { label: '0–3d', from: 0, to: 3, tone: 'good' },
  { label: '4–7d', from: 4, to: 7, tone: 'good' },
  { label: '8–14d', from: 8, to: 14, tone: 'warn' },
  { label: '15–21d', from: 15, to: 21, tone: 'warn' },
  { label: '22–30d', from: 22, to: 30, tone: 'bad' },
  { label: '30d+', from: 31, to: Infinity, tone: 'bad' },
];

/** How long they sit. The bands are the point, not the exact bar heights. */
export function ages(issues: BoardIssue[]): AgeBucket[] {
  return BUCKETS.map(b => ({
    ...b,
    count: issues.filter(i => i.ageDays >= b.from && i.ageDays <= b.to).length,
  }));
}

/**
 * The one sentence a status call actually wants.
 *
 * Built from the same numbers as the charts, so it cannot contradict them —
 * which is the failure mode of a summary line written by hand.
 */
export function headline(issues: BoardIssue[], quietDays = 14): string {
  if (issues.length === 0) return 'Nothing is open.';
  const nobody = issues.filter(i => i.assignees.length === 0).length;
  const old = issues.filter(i => i.ageDays > quietDays).length;
  const parts = [`${issues.length} open`];
  if (nobody) parts.push(`${nobody} with nobody on ${nobody === 1 ? 'it' : 'them'}`);
  if (old) parts.push(`${old} older than ${quietDays} days`);
  return `${parts.join(' · ')}.`;
}

/*
  ── 16B, against the period before ──

  A number on its own is not a finding. "Twelve open" is neither good nor bad
  until you know it was nine.
*/

/**
 * Which way a number moved, and **whether that is good**.
 *
 * These are not the same question, and conflating them is how dashboards start
 * lying cheerfully. Closed rising is good; opened rising is not; median age
 * rising is not. So a metric declares its own `betterWhen` and the colour comes
 * from that, never from the sign of the delta.
 */
export type Better = 'up' | 'down';

export interface Metric {
  label: string;
  /** This period. */
  now: number;
  /** The one before it. */
  was: number;
  betterWhen: Better;
  /** `d` on the age metric, nothing on a count. */
  unit?: string;
  /** Set when the metric's own value deserves colour, not just its delta. */
  tone?: 'red' | 'amber';
}

/** `+5`, `-3`, or nothing at all when it did not move. */
export function delta(m: Metric): number {
  return m.now - m.was;
}

/**
 * The colour a delta wears.
 *
 * Grey when nothing moved — a period identical to the last one is not a
 * finding either, and painting a zero green or red invents one.
 */
export function deltaTone(m: Metric): 'green' | 'red' | 'flat' {
  const d = delta(m);
  if (d === 0) return 'flat';
  const rose = d > 0;
  return rose === (m.betterWhen === 'up') ? 'green' : 'red';
}

/** Issues opened inside a window. */
function openedIn(issues: BoardIssue[], from: number, to: number): BoardIssue[] {
  return issues.filter(i => {
    const at = Date.parse(i.createdAt);
    return Number.isFinite(at) && at >= from && at < to;
  });
}

/** Issues closed inside a window. Only those the board actually loaded. */
function closedIn(issues: BoardIssue[], from: number, to: number): BoardIssue[] {
  return issues.filter(i => {
    if (!i.closedAt) return false;
    const at = Date.parse(i.closedAt);
    return Number.isFinite(at) && at >= from && at < to;
  });
}

/** The middle value, or 0 for nothing. Median rather than mean: one
    two-year-old issue should not move the number a team reads weekly. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export interface Comparison {
  /** "Last 12 weeks", "The 12 before" — what the two pills say. */
  thisLabel: string;
  lastLabel: string;
  metrics: Metric[];
  /** By module, both periods, for the overlaid bars. */
  bars: { label: string; now: number; was: number }[];
  /** Whether close dates are loaded at all. Two of the four depend on them. */
  closedKnown: boolean;
}

const WEEK = 7 * 86_400_000;

/**
 * This window against the one before it — 16B.
 *
 * Two equal windows, back to back, so the comparison is like for like. The
 * previous window ends exactly where this one begins: an overlap would count
 * the same issue in both and make every number look better than it is.
 */
export function compare(
  issues: BoardIssue[],
  weeks: number,
  by: (i: BoardIssue) => string,
  now = Date.now(),
): Comparison {
  const span = weeks * WEEK;
  const thisFrom = now - span;
  const lastFrom = thisFrom - span;

  const openedNow = openedIn(issues, thisFrom, now);
  const openedWas = openedIn(issues, lastFrom, thisFrom);
  const closedNow = closedIn(issues, thisFrom, now);
  const closedWas = closedIn(issues, lastFrom, thisFrom);
  const closedKnown = issues.some(i => !!i.closedAt);

  /* Open at the end of each window: filed by then, and not closed by then. */
  const stillNow = issues.filter(i => Date.parse(i.createdAt) < now
    && (!i.closedAt || Date.parse(i.closedAt) >= now)).length;
  const stillWas = issues.filter(i => Date.parse(i.createdAt) < thisFrom
    && (!i.closedAt || Date.parse(i.closedAt) >= thisFrom)).length;

  const ageAtClose = (rows: BoardIssue[]) => median(rows
    .map(i => (Date.parse(i.closedAt!) - Date.parse(i.createdAt)) / 86_400_000)
    .filter(d => Number.isFinite(d) && d >= 0)
    .map(d => Math.round(d)));

  const metrics: Metric[] = [
    { label: 'Opened', now: openedNow.length, was: openedWas.length, betterWhen: 'down' },
    { label: 'Closed', now: closedNow.length, was: closedWas.length, betterWhen: 'up' },
    { label: 'Still open', now: stillNow, was: stillWas, betterWhen: 'down', tone: 'red' },
    {
      label: 'Median age at close',
      now: ageAtClose(closedNow), was: ageAtClose(closedWas),
      betterWhen: 'down', unit: 'd', tone: 'amber',
    },
  ];

  /* The bars count what was *opened* in each window, which is the question
     "where did the work come from" — the one a module split can answer. */
  const tally = (rows: BoardIssue[]) => {
    const out = new Map<string, number>();
    for (const r of rows) out.set(by(r), (out.get(by(r)) ?? 0) + 1);
    return out;
  };
  const a = tally(openedNow);
  const b = tally(openedWas);
  const bars = [...new Set([...a.keys(), ...b.keys()])]
    .map(label => ({ label, now: a.get(label) ?? 0, was: b.get(label) ?? 0 }))
    .sort((x, y) => (y.now + y.was) - (x.now + x.was) || x.label.localeCompare(y.label));

  return {
    thisLabel: `Last ${weeks} weeks`,
    lastLabel: `The ${weeks} before`,
    metrics,
    bars,
    closedKnown,
  };
}

/**
 * The one sentence worth taking out of the screen, or nothing.
 *
 * "Reporting tripled and everything else is flat" is invisible on a
 * single-period chart where all four modules read as an unremarkable three. It
 * is only said when one row moved and the others did not — an observation that
 * holds, rather than a caption on every screen.
 */
export function standout(bars: Comparison['bars']): string {
  const moved = bars.filter(b => b.was > 0 && b.now >= b.was * 2 && b.now - b.was >= 2);
  if (moved.length !== 1) return '';
  const [only] = moved;
  const rest = bars.filter(b => b !== only);
  const flat = rest.every(b => Math.abs(b.now - b.was) <= 1);
  if (!flat || rest.length === 0) return '';
  const times = only.now / only.was;
  const word = times >= 3 ? 'tripled' : times >= 2 ? 'doubled' : 'rose';
  return `${only.label} ${word} and everything else is flat.`;
}
