import { describe, it, expect } from 'vitest';
import {
  NO_POD_FILTER, matchesPodFilter, toggleFacet, facetOptions, kindCounts,
  filterChips, withoutChip, isEmptyFilter, workloadOf, type PodFilter,
} from './pod-filter';
import type { PodSummary } from '../../store/k8s-store';

function pod(over: Partial<PodSummary> & { name: string }): PodSummary {
  return {
    namespace: 'orders',
    context: 'lab',
    uid: over.name,
    phase: 'Running',
    ready: { current: 1, total: 1 },
    restarts: 0,
    containers: [],
    healthy: true,
    deleting: false,
    workload: { kind: 'Deployment', name: 'orders-api' },
    ...over,
  } as PodSummary;
}

const FLEET: PodSummary[] = [
  pod({ name: 'a', context: 'lab', namespace: 'orders', workload: { kind: 'Deployment', name: 'orders-api' } }),
  pod({ name: 'b', context: 'lab', namespace: 'orders', workload: { kind: 'Deployment', name: 'orders-worker' } }),
  pod({ name: 'c', context: 'lab', namespace: 'reporting', workload: { kind: 'Deployment', name: 'reporting-api' } }),
  pod({ name: 'd', context: 'prod', namespace: 'orders', workload: { kind: 'Deployment', name: 'orders-api' } }),
  pod({ name: 'e', context: 'prod', namespace: 'reporting', workload: { kind: 'CronJob', name: 'nightly' } }),
];

const show = (f: PodFilter) => FLEET.filter(p => matchesPodFilter(p, f)).map(p => p.name);

describe('pod filter', () => {
  it('hides nothing until something is chosen', () => {
    expect(isEmptyFilter(NO_POD_FILTER)).toBe(true);
    expect(show(NO_POD_FILTER)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('is an OR within one facet', () => {
    // Two namespaces means both, the way picking two of anything else does.
    const f = toggleFacet(toggleFacet(NO_POD_FILTER, 'namespaces', 'orders'), 'namespaces', 'reporting');
    expect(show(f)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('is an AND between facets', () => {
    const f = toggleFacet(toggleFacet(NO_POD_FILTER, 'contexts', 'prod'), 'namespaces', 'orders');
    expect(show(f)).toEqual(['d']);
  });

  it('filters by the workload behind the pod', () => {
    expect(show(toggleFacet(NO_POD_FILTER, 'workloads', 'orders-api'))).toEqual(['a', 'd']);
  });

  it('still separates pods from CronJob runs', () => {
    expect(show({ ...NO_POD_FILTER, kind: 'runs' })).toEqual(['e']);
    expect(show({ ...NO_POD_FILTER, kind: 'pods' })).toEqual(['a', 'b', 'c', 'd']);
  });

  it('falls back to the pod name when nothing owns it', () => {
    expect(workloadOf(pod({ name: 'loose', workload: undefined }))).toBe('loose');
  });

  describe('the options a facet offers', () => {
    it('counts against what the other facets already allow', () => {
      // Cluster pinned to lab: `orders` covers two pods there, not the three
      // it covers overall. A count that does not survive being clicked is
      // worse than no count.
      const f = toggleFacet(NO_POD_FILTER, 'contexts', 'lab');
      expect(facetOptions(FLEET, f, 'namespaces')).toEqual([
        { value: 'orders', count: 2 },
        { value: 'reporting', count: 1 },
      ]);
    });

    it('does not let a facet hide its own alternatives', () => {
      // Picking `orders` must not remove `reporting` from the list it was
      // picked from, or the choice cannot be widened without clearing it.
      const f = toggleFacet(NO_POD_FILTER, 'namespaces', 'orders');
      expect(facetOptions(FLEET, f, 'namespaces').map(o => o.value))
        .toEqual(['orders', 'reporting']);
    });

    it('counts kinds under the other facets too', () => {
      expect(kindCounts(FLEET, NO_POD_FILTER)).toEqual({ all: 5, pods: 4, runs: 1 });
      const lab = toggleFacet(NO_POD_FILTER, 'contexts', 'lab');
      expect(kindCounts(FLEET, lab)).toEqual({ all: 3, pods: 3, runs: 0 });
    });
  });

  describe('what is showing for it', () => {
    it('names the facet on every chip', () => {
      // "prod" and "orders" are not self-describing on their own.
      const f = toggleFacet(toggleFacet(NO_POD_FILTER, 'contexts', 'prod'), 'namespaces', 'orders');
      expect(filterChips(f).map(c => c.label)).toEqual(['cluster: prod', 'namespace: orders']);
    });

    it('has nothing to show when nothing is chosen', () => {
      expect(filterChips(NO_POD_FILTER)).toEqual([]);
    });

    it('removes only itself', () => {
      let f = toggleFacet(toggleFacet(NO_POD_FILTER, 'contexts', 'prod'), 'namespaces', 'orders');
      f = { ...f, kind: 'pods' };
      const chips = filterChips(f);
      const afterCluster = withoutChip(f, chips.find(c => c.facet === 'contexts')!);
      expect(afterCluster.contexts).toEqual([]);
      expect(afterCluster.namespaces).toEqual(['orders']);
      expect(afterCluster.kind).toBe('pods');
    });

    it('puts kind back to all', () => {
      const f: PodFilter = { ...NO_POD_FILTER, kind: 'runs' };
      expect(withoutChip(f, filterChips(f)[0]).kind).toBe('all');
      expect(isEmptyFilter(withoutChip(f, filterChips(f)[0]))).toBe(true);
    });
  });
});
