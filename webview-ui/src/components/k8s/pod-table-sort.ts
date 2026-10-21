/**
 * Sorting the pod table by a column.
 *
 * A click on a heading sorts by it ascending, a second click descending, a
 * third puts back the grid's own order — failing first, starred on top —
 * which is the order most people want most of the time and should not be
 * lost for good by one click.
 *
 * Each column sorts by what it shows: Ready by how many are ready, ↻ by the
 * count, Age by the age (youngest first when ascending), Memory and CPU by the
 * numbers. A pod with no value — no node yet, no metrics — goes last in both
 * directions, because "unknown" is not small or large, just unknown.
 */
import type { PodSummary, PodUsage } from '../../store/k8s-store';

export type PodSortDir = 'asc' | 'desc';
export interface PodSort { col: string; dir: PodSortDir }

/** Stored as `col:dir`, so it fits a string pref. Empty is the grid's order. */
export function parsePodSort(v: string): PodSort | undefined {
  const cut = v.lastIndexOf(':');
  if (cut <= 0) return undefined;
  const dir = v.slice(cut + 1);
  return dir === 'asc' || dir === 'desc' ? { col: v.slice(0, cut), dir } : undefined;
}

/** Ascending, then descending, then the grid's own order again. */
export function nextPodSort(current: PodSort | undefined, col: string): string {
  if (!current || current.col !== col) return `${col}:asc`;
  return current.dir === 'asc' ? `${col}:desc` : '';
}

function valueOf(p: PodSummary, col: string, usage: Record<string, PodUsage | undefined>): string | number | undefined {
  switch (col) {
    case 'Name': return p.name;
    case 'Type': return p.workload?.kind;
    case 'Ready': return p.ready.total ? p.ready.current / p.ready.total : 0;
    case 'Status': return p.reason || p.phase;
    case '↻': return p.restarts;
    case 'Node': return p.node;
    // Age ascending is youngest first, so it sorts on the start time reversed.
    case 'Age': { const t = p.startedAt ? Date.parse(p.startedAt) : NaN; return Number.isNaN(t) ? undefined : -t; }
    case 'Memory': return usage[p.name]?.memBytes;
    case 'CPU': return usage[p.name]?.cpuMilli;
    default: return undefined;
  }
}

export function sortPodRows(
  pods: PodSummary[], sort: PodSort | undefined, usage: Record<string, PodUsage | undefined>,
): PodSummary[] {
  if (!sort) return pods;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return pods
    .map((p, i) => ({ p, i, v: valueOf(p, sort.col, usage) }))
    .sort((a, b) => {
      if (a.v === undefined || b.v === undefined) {
        if (a.v === b.v) return a.i - b.i;
        return a.v === undefined ? 1 : -1;
      }
      const c = typeof a.v === 'number' && typeof b.v === 'number'
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), undefined, { numeric: true, sensitivity: 'base' });
      // Ties keep the grid's order, so equal rows do not shuffle on every sort.
      return c ? c * sign : a.i - b.i;
    })
    .map(x => x.p);
}
