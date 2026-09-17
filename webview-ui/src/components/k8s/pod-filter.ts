/**
 * What the pod grid is narrowed to.
 *
 * ── Why a set of facets and not a search box ──
 *
 * The text box already answers "which pod was called something like this". The
 * questions it cannot answer are the ones with no substring behind them: show
 * me prod only; show me orders and reporting but not the rest; show me this one
 * Deployment across both clusters. Typing `prod` matched a pod named
 * `prod-checkout` in the lab as readily as anything actually in production,
 * which is the wrong answer given confidently.
 *
 * So each facet names a field and holds the values chosen for it. Empty means
 * "no opinion", which is not the same as "none" — a filter nobody has touched
 * must not hide anything.
 *
 * ── Why OR inside a facet and AND between them ──
 *
 * Picking `orders` and `reporting` under Namespace means both, because that is
 * what picking two of the same kind of thing means everywhere else. Picking
 * `prod` under Cluster and `orders` under Namespace means the intersection,
 * because they describe different things about one pod and a pod can only be
 * in one cluster. Any other combination would need explaining, and a filter
 * that needs explaining gets used wrong.
 */
import type { PodSummary } from '../../store/k8s-store';
import { isScheduled } from '@daakia/k8s-workload';

/** Whether a row is a long-running pod or a finished CronJob run. */
export type PodKind = 'all' | 'pods' | 'runs';

/** The facets that hold a list of chosen values. */
export type PodFacet = 'contexts' | 'namespaces' | 'workloads';

export interface PodFilter {
  kind: PodKind;
  /** Cluster names. Empty means every cluster on screen. */
  contexts: string[];
  /** Namespaces. Empty means every one watched. */
  namespaces: string[];
  /** Workload names — the Deployment, StatefulSet or CronJob behind a pod. */
  workloads: string[];
}

export const NO_POD_FILTER: PodFilter = {
  kind: 'all', contexts: [], namespaces: [], workloads: [],
};

/** The name of the thing that owns this pod, as the facets list it. */
export function workloadOf(pod: PodSummary): string {
  return pod.workload?.name ?? pod.name;
}

/** Nothing chosen anywhere — the grid shows everything it has. */
export function isEmptyFilter(f: PodFilter): boolean {
  return f.kind === 'all'
    && !f.contexts.length && !f.namespaces.length && !f.workloads.length;
}

/**
 * Does this pod survive the filter?
 *
 * A facet with nothing chosen does not narrow anything. That is the whole of
 * why this cannot be written as a plain `includes` chain: an empty list would
 * match nothing and a freshly-opened filter would empty the grid.
 */
export function matchesPodFilter(pod: PodSummary, f: PodFilter): boolean {
  if (f.kind !== 'all' && isScheduled(pod.workload) !== (f.kind === 'runs')) return false;
  if (f.contexts.length && !f.contexts.includes(pod.context ?? '')) return false;
  if (f.namespaces.length && !f.namespaces.includes(pod.namespace)) return false;
  if (f.workloads.length && !f.workloads.includes(workloadOf(pod))) return false;
  return true;
}

/** Add a value to a facet, or take it out if it is already there. */
export function toggleFacet(f: PodFilter, facet: PodFacet, value: string): PodFilter {
  const have = f[facet];
  return {
    ...f,
    [facet]: have.includes(value) ? have.filter(v => v !== value) : [...have, value],
  };
}

export interface FacetOption {
  value: string;
  /** How many pods carry this value, before this facet narrows anything. */
  count: number;
}

/**
 * The values each facet can offer, and how many pods each covers.
 *
 * Counted against the pods the OTHER facets already allow, so the numbers say
 * what choosing this would actually give you. Counting against everything
 * would offer `orders — 6` next to a cluster choice that leaves three of them
 * out, and a count that does not survive being clicked is worse than none.
 *
 * Built from the pods on screen rather than from the cluster: a facet can only
 * honestly offer what it can filter, and offering a namespace nobody is
 * watching would produce an empty grid and no explanation.
 */
export function facetOptions(pods: PodSummary[], f: PodFilter, facet: PodFacet): FacetOption[] {
  /* Everything except this facet, so its own choices do not hide its
     alternatives — picking `orders` must not make `reporting` disappear from
     the list it was picked from. */
  const others: PodFilter = { ...f, [facet]: [] };
  const counts = new Map<string, number>();
  for (const pod of pods) {
    if (!matchesPodFilter(pod, others)) continue;
    const value = facet === 'contexts' ? (pod.context ?? '')
      : facet === 'namespaces' ? pod.namespace
        : workloadOf(pod);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

/** How many pods each `kind` would leave, under the other facets. */
export function kindCounts(pods: PodSummary[], f: PodFilter): Record<PodKind, number> {
  const others: PodFilter = { ...f, kind: 'all' };
  let pod = 0, run = 0;
  for (const p of pods) {
    if (!matchesPodFilter(p, others)) continue;
    if (isScheduled(p.workload)) run++; else pod++;
  }
  return { all: pod + run, pods: pod, runs: run };
}

export interface FilterChip {
  /** Which facet to take this back out of; `kind` resets to `all`. */
  facet: PodFacet | 'kind';
  value: string;
  label: string;
}

const KIND_LABEL: Record<PodKind, string> = {
  all: 'All pods', pods: 'Pods', runs: 'CronJob runs',
};

/**
 * One chip per narrowing in force.
 *
 * A filter with nothing on screen to show for it is the failure this exists
 * for: pods vanish, the grid says `3 pods` where it said twelve, and nothing
 * anywhere says why — least of all a menu the reader has to reopen to find
 * out what they told it three minutes ago. Each chip names its own facet
 * because "prod" and "orders" are not self-describing out of context, and
 * removes only itself.
 */
export function filterChips(f: PodFilter): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.kind !== 'all') {
    chips.push({ facet: 'kind', value: f.kind, label: KIND_LABEL[f.kind] });
  }
  for (const value of f.contexts) chips.push({ facet: 'contexts', value, label: `cluster: ${value}` });
  for (const value of f.namespaces) chips.push({ facet: 'namespaces', value, label: `namespace: ${value}` });
  for (const value of f.workloads) chips.push({ facet: 'workloads', value, label: `app: ${value}` });
  return chips;
}

/** Take one chip back out. */
export function withoutChip(f: PodFilter, chip: FilterChip): PodFilter {
  if (chip.facet === 'kind') return { ...f, kind: 'all' };
  return toggleFacet(f, chip.facet, chip.value);
}
