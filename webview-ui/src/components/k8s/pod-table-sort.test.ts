import { describe, it, expect } from 'vitest';
import { sortPodRows, parsePodSort, nextPodSort } from './pod-table-sort';
import type { PodSummary } from '../../store/k8s-store';

const pod = (name: string, o: Partial<PodSummary> = {}): PodSummary => ({
  name, namespace: 'n', uid: name, phase: 'Running', ready: { current: 1, total: 1 },
  restarts: 0, containers: [], healthy: true, deleting: false, ...o,
});

const names = (ps: PodSummary[]) => ps.map(p => p.name);

describe('sorting the pod table', () => {
  const pods = [
    pod('web-10', { restarts: 3, startedAt: '2026-10-01T00:00:00Z', node: 'b' }),
    pod('web-2', { restarts: 12, startedAt: '2026-10-19T00:00:00Z' }),
    pod('api-1', { restarts: 0, startedAt: '2026-09-01T00:00:00Z', node: 'a' }),
  ];

  it('keeps the grid order with no sort', () => {
    expect(sortPodRows(pods, undefined, {})).toBe(pods);
  });

  it('sorts names as people count, web-2 before web-10', () => {
    expect(names(sortPodRows(pods, { col: 'Name', dir: 'asc' }, {}))).toEqual(['api-1', 'web-2', 'web-10']);
    expect(names(sortPodRows(pods, { col: 'Name', dir: 'desc' }, {}))).toEqual(['web-10', 'web-2', 'api-1']);
  });

  it('sorts restarts by the number', () => {
    expect(names(sortPodRows(pods, { col: '↻', dir: 'desc' }, {}))).toEqual(['web-2', 'web-10', 'api-1']);
  });

  it('puts the youngest first when age is ascending', () => {
    expect(names(sortPodRows(pods, { col: 'Age', dir: 'asc' }, {}))).toEqual(['web-2', 'web-10', 'api-1']);
  });

  it('puts a pod with no value last in both directions', () => {
    expect(names(sortPodRows(pods, { col: 'Node', dir: 'asc' }, {})).at(-1)).toBe('web-2');
    expect(names(sortPodRows(pods, { col: 'Node', dir: 'desc' }, {})).at(-1)).toBe('web-2');
  });

  it('sorts memory from the usage numbers', () => {
    const usage = { 'web-10': { cpuMilli: 5, memBytes: 900 }, 'api-1': { cpuMilli: 9, memBytes: 100 } };
    expect(names(sortPodRows(pods, { col: 'Memory', dir: 'desc' }, usage))).toEqual(['web-10', 'api-1', 'web-2']);
  });

  it('cycles ascending, descending, then back to the grid order', () => {
    expect(nextPodSort(undefined, 'Age')).toBe('Age:asc');
    expect(nextPodSort(parsePodSort('Age:asc'), 'Age')).toBe('Age:desc');
    expect(nextPodSort(parsePodSort('Age:desc'), 'Age')).toBe('');
    expect(nextPodSort(parsePodSort('Age:desc'), 'Name')).toBe('Name:asc');
    expect(parsePodSort('↻:desc')).toEqual({ col: '↻', dir: 'desc' });
    expect(parsePodSort('')).toBeUndefined();
  });
});
