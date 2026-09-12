import { describe, it, expect } from 'vitest';
import { favoriteKey, favoritesFirst } from './dk8s-favorites-store';
import type { PodSummary } from './k8s-store';

const pod = (over: Partial<PodSummary>): PodSummary => ({
  name: 'p', namespace: 'default', uid: over.name ?? 'u', phase: 'Running',
  ready: { current: 1, total: 1 }, restarts: 0, containers: [],
  healthy: true, deleting: false,
  ...over,
} as PodSummary);

describe('favoriteKey', () => {
  it('keys a pod by its workload, not by its own name', () => {
    expect(favoriteKey({
      name: 'zp-backend-oom-7bb88bcc45-27sqb', namespace: 'dk8s-test',
      context: 'docker-desktop', workload: { kind: 'Deployment', name: 'zp-backend-oom' },
    })).toBe('docker-desktop/dk8s-test/Deployment/zp-backend-oom');
  });

  /*
    The reason the whole module exists: a rollout replaces every pod name, and
    a favourite keyed on one would quietly stop matching anything.
  */
  it('survives a rollout that replaces the pod name', () => {
    const before = favoriteKey({
      name: 'api-7bb88bcc45-27sqb', namespace: 'prod', context: 'eu',
      workload: { kind: 'Deployment', name: 'api' },
    });
    const after = favoriteKey({
      name: 'api-9ffd1220ab-x4k2z', namespace: 'prod', context: 'eu',
      workload: { kind: 'Deployment', name: 'api' },
    });
    expect(after).toBe(before);
  });

  it('falls back to the pod name when nothing owns it', () => {
    expect(favoriteKey({ name: 'debug-shell', namespace: 'default', context: 'kind' }))
      .toBe('kind/default/Pod/debug-shell');
  });

  it('keeps the same workload name in two clusters apart', () => {
    const a = favoriteKey({ name: 'x', namespace: 'prod', context: 'eu', workload: { kind: 'Deployment', name: 'api' } });
    const b = favoriteKey({ name: 'x', namespace: 'prod', context: 'us', workload: { kind: 'Deployment', name: 'api' } });
    expect(a).not.toBe(b);
  });

  it('keeps the same workload name in two namespaces apart', () => {
    const a = favoriteKey({ name: 'x', namespace: 'staging', workload: { kind: 'Deployment', name: 'api' } });
    const b = favoriteKey({ name: 'x', namespace: 'prod', workload: { kind: 'Deployment', name: 'api' } });
    expect(a).not.toBe(b);
  });

  it('does not confuse a Deployment with a StatefulSet of the same name', () => {
    const a = favoriteKey({ name: 'x', namespace: 'p', workload: { kind: 'Deployment', name: 'api' } });
    const b = favoriteKey({ name: 'x', namespace: 'p', workload: { kind: 'StatefulSet', name: 'api' } });
    expect(a).not.toBe(b);
  });
});

describe('favoritesFirst', () => {
  const a = pod({ name: 'a', workload: { kind: 'Deployment', name: 'a' } });
  const b = pod({ name: 'b', workload: { kind: 'Deployment', name: 'b' } });
  const c = pod({ name: 'c', workload: { kind: 'Deployment', name: 'c' } });

  it('lifts starred pods to the top', () => {
    const out = favoritesFirst([a, b, c], ['/default/Deployment/c']);
    expect(out.map(p => p.name)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the order alone when nothing is starred', () => {
    expect(favoritesFirst([a, b, c], []).map(p => p.name)).toEqual(['a', 'b', 'c']);
  });

  /*
    Stability matters because the caller has already sorted by severity — a
    star should raise a pod, not scramble the ranking it was raised out of.
  */
  it('preserves relative order inside each group', () => {
    const out = favoritesFirst([a, b, c], ['/default/Deployment/c', '/default/Deployment/a']);
    expect(out.map(p => p.name)).toEqual(['a', 'c', 'b']);
  });

  it('ignores stars for pods that are not here', () => {
    expect(favoritesFirst([a, b], ['/default/Deployment/gone']).map(p => p.name))
      .toEqual(['a', 'b']);
  });

  it('stars every replica of a starred workload', () => {
    const r1 = pod({ name: 'api-1', uid: '1', workload: { kind: 'Deployment', name: 'api' } });
    const r2 = pod({ name: 'api-2', uid: '2', workload: { kind: 'Deployment', name: 'api' } });
    const out = favoritesFirst([a, r1, b, r2], ['/default/Deployment/api']);
    expect(out.map(p => p.name)).toEqual(['api-1', 'api-2', 'a', 'b']);
  });
});
