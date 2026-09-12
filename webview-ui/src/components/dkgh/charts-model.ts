/**
 * Charts somebody pinned themselves — screen 16D.
 *
 * The four built-in charts are our guess at what a team wants. The chart a
 * particular team actually looks at every day is one we did not think of.
 *
 * **A pinned chart carries its view with it.** "Excel bugs by week" is the
 * *Reporting only* view charted — so changing that view changes this chart, and
 * clicking a bar opens that view's issues. A chart is a saved question, not a
 * saved picture, and storing the rows rather than the question would produce a
 * chart that quietly stopped being true.
 *
 * **It sits among the built-in ones, marked but not segregated.** A separate
 * "my charts" tab would mean the four we guessed stay permanently more
 * prominent than the one the team reads every morning.
 */
import type { BoardIssue } from './board-types';

/** What a bar measures. */
export type Measure = 'count' | 'days';

export interface PinnedChart {
  id: string;
  title: string;
  /** The saved view it charts, by name. Empty means the whole board. */
  view: string;
  /** The field each bar is one value of. */
  groupBy: string;
  /** An optional second field, splitting each bar. */
  splitBy?: string;
  measure: Measure;
  /** Whose chart it is, for the subtitle. */
  pinnedBy?: string;
  at: number;
}

const KEY = 'dkgh.charts';

export function loadCharts(repo: string): PinnedChart[] {
  try {
    const raw = window.localStorage.getItem(`${KEY}.${repo}`);
    if (!raw) return [];
    const stored = JSON.parse(raw) as PinnedChart[];
    return Array.isArray(stored) ? stored.filter(c => c?.id && c?.groupBy) : [];
  } catch {
    return [];
  }
}

export function saveCharts(repo: string, charts: PinnedChart[]): void {
  try {
    window.localStorage.setItem(`${KEY}.${repo}`, JSON.stringify(charts));
  } catch {
    /* Storage off. The charts last as long as the tab, which is worth more
       than refusing to make one. */
  }
}

/** The fields a chart can group or split by, from what this repository has. */
export function chartFields(dimensions: { dimension: string }[]): string[] {
  return [
    ...dimensions.map(d => d.dimension),
    'assignee', 'milestone', 'state', 'label', 'week',
  ];
}

/** The value of one field on one issue, or `''` when it has none. */
export function valueOf(issue: BoardIssue, field: string): string {
  if (field === 'assignee') return issue.assignees[0] ?? '';
  if (field === 'milestone') return issue.milestone ?? '';
  if (field === 'state') return issue.state === 'OPEN' ? 'Open' : 'Closed';
  if (field === 'label') return issue.labels[0]?.name ?? '';
  if (field === 'week') return weekOf(issue.createdAt);
  return issue.dimensions[field] ?? '';
}

/** `2026-W37` — sortable, and the same string for every day of that week. */
export function weekOf(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const d = new Date(at);
  /* Thursday of the same week decides the year, which is what ISO says and
     what stops the last days of December landing in the wrong one. */
  const day = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const first = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((thursday.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7,
  );
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface ChartBar {
  label: string;
  value: number;
  parts: { key: string; value: number }[];
}

/**
 * The bars, from the rows the chart's view holds.
 *
 * `count` counts issues; `days` takes the **median** age, because one
 * two-year-old issue should not move a number a team reads every morning. An
 * empty value is a real bar — "no module" is the answer to "where are they"
 * more often than anybody would like — but it is labelled rather than blank.
 */
export function barsFor(chart: PinnedChart, rows: BoardIssue[]): ChartBar[] {
  const groups = new Map<string, BoardIssue[]>();
  for (const r of rows) {
    const key = valueOf(r, chart.groupBy) || `No ${chart.groupBy}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const measure = (of: BoardIssue[]) => (chart.measure === 'days'
    ? medianOf(of.map(i => i.ageDays))
    : of.length);

  const bars = [...groups.entries()].map(([label, of]) => ({
    label,
    value: measure(of),
    parts: chart.splitBy
      ? [...group(of, i => valueOf(i, chart.splitBy!) || 'unset').entries()]
        .map(([key, rowsIn]) => ({ key, value: measure(rowsIn) }))
        .sort((a, b) => b.value - a.value)
      : [],
  }));

  /* Weeks read left to right in time; everything else reads biggest first,
     because the question a category chart answers is "which one". */
  return chart.groupBy === 'week'
    ? bars.sort((a, b) => a.label.localeCompare(b.label))
    : bars.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function group<T>(rows: T[], by: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(by(r), [...(out.get(by(r)) ?? []), r]);
  return out;
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** The subtitle under a pinned chart's name. */
export function provenance(chart: PinnedChart): string {
  const from = chart.view ? `from the view “${chart.view}”` : 'from the whole board';
  return chart.pinnedBy ? `${from} · pinned by ${chart.pinnedBy}` : from;
}

/** A name somebody did not type, from the question they asked. */
export function suggestedTitle(groupBy: string, splitBy: string | undefined, measure: Measure)
: string {
  const what = measure === 'days' ? 'Days open' : 'Issues';
  const by = groupBy === 'week' ? 'by week' : `by ${groupBy}`;
  return splitBy ? `${what} ${by}, split by ${splitBy}` : `${what} ${by}`;
}
