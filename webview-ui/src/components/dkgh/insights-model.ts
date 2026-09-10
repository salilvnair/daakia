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
