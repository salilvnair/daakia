import { describe, it, expect } from 'vitest';
import {
  favoriteKey, favoritesFirst, favoriteChoices, starredKeyOf, starredHere, starredView,
} from './dk8s-favorites-store';
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

describe('what a star can be attached to', () => {
  const pod = {
    name: 'api-7bb88bcc45-27sqb', namespace: 'prod', context: 'kind-dk8s',
    workload: { kind: 'Deployment', name: 'api' },
  };

  it('offers the workload first, because that is nearly always the answer', () => {
    const [first] = favoriteChoices(pod);
    expect(first.mode).toBe('workload');
    expect(first.key).toBe('kind-dk8s/prod/Deployment/api');
  });

  it('offers the pod itself, for the one replica that keeps falling over', () => {
    const pick = favoriteChoices(pod).find(c => c.mode === 'pod');
    expect(pick?.key).toBe('kind-dk8s/prod/Pod/api-7bb88bcc45-27sqb');
  });

  it('has only one answer for a pod with no owner', () => {
    const bare = { name: 'debug', namespace: 'prod', context: 'kind-dk8s' };
    expect(favoriteChoices(bare)).toHaveLength(1);
    expect(favoriteChoices(bare)[0].mode).toBe('pod');
  });

  it('finds whichever one is actually starred', () => {
    expect(starredKeyOf(pod, ['kind-dk8s/prod/Pod/api-7bb88bcc45-27sqb']))
      .toBe('kind-dk8s/prod/Pod/api-7bb88bcc45-27sqb');
    expect(starredKeyOf(pod, ['kind-dk8s/prod/Deployment/api']))
      .toBe('kind-dk8s/prod/Deployment/api');
    expect(starredKeyOf(pod, [])).toBeUndefined();
  });

  it('lifts a pod starred either way', () => {
    /* Somebody who starred one replica by name means that row, and it has to
       rise the same way the workload star lifts its pods. */
    const other = { ...pod, name: 'api-7bb88bcc45-zzzzz' };
    const sorted = favoritesFirst(
      [other, pod] as never[],
      ['kind-dk8s/prod/Pod/api-7bb88bcc45-27sqb'],
    );
    expect((sorted[0] as typeof pod).name).toBe('api-7bb88bcc45-27sqb');
  });
});

/*
  The chip beside the star counted the SAVED list, which spans every cluster and
  namespace: fourteen stars across a fleet read "14" over a namespace holding
  two of them, and over one holding none it still offered a scope that shows
  nothing at all.
*/
describe('starredHere', () => {
  const here = (name: string, workload?: string) => pod({
    name, namespace: 'payments', context: 'prod', uid: name,
    ...(workload ? { workload: { kind: 'Deployment', name: workload } } : {}),
  } as Partial<PodSummary>);

  const keys = [
    'prod/payments/Deployment/ledger',
    'prod/billing/Deployment/invoices',
    'dev/payments/Deployment/ledger',
  ];

  it('counts only the stars that belong to these pods', () => {
    expect(starredHere([here('ledger-1', 'ledger'), here('cart-1', 'cart')], keys)).toBe(1);
  });

  it('counts a starred workload once, not once per replica', () => {
    const replicas = [here('ledger-1', 'ledger'), here('ledger-2', 'ledger'), here('ledger-3', 'ledger')];
    expect(starredHere(replicas, keys)).toBe(1);
  });

  it('is zero in a namespace whose pods are none of them', () => {
    // What made the scope a dead end: the control offered a filter that hid
    // everything, because the count it was drawn from was about elsewhere.
    expect(starredHere([here('cart-1', 'cart')], keys)).toBe(0);
  });

  it('sees a pod-scoped star too, for a pod nothing owns', () => {
    expect(starredHere([here('debug-shell')], ['prod/payments/Pod/debug-shell'])).toBe(1);
  });

  it('is zero for an empty list either way', () => {
    expect(starredHere([], keys)).toBe(0);
    expect(starredHere([here('ledger-1', 'ledger')], [])).toBe(0);
  });
});

describe('starredView', () => {
  const xx = (name: string) => pod({ name, namespace: 'com-zp-xx', context: 'c', workload: { kind: 'Deployment', name } });
  const yy = (name: string) => pod({ name, namespace: 'com-zp-yy', context: 'c', workload: { kind: 'Deployment', name } });

  it('keeps stars to the namespace they were made in', () => {
    const pods = [xx('api'), xx('web'), xx('db'), yy('api'), yy('web')];
    const keys = [favoriteKey(xx('api')), favoriteKey(xx('web'))];
    /* com-zp-xx: its two stars. com-zp-yy has none, so all of it — not nothing. */
    expect(starredView(pods, keys).map(p => `${p.namespace}/${p.name}`))
      .toEqual(['com-zp-xx/api', 'com-zp-xx/web', 'com-zp-yy/api', 'com-zp-yy/web']);
  });

  it('counts a legacy star made on one pod, and leaves everything when nothing is starred', () => {
    const one = pod({ name: 'api-0', namespace: 'n', context: 'c' });
    const pods = [one, pod({ name: 'api-1', namespace: 'n', context: 'c' })];
    expect(starredView(pods, [favoriteKey(one, 'pod')])).toEqual([one]);
    expect(starredView(pods, [])).toEqual(pods);
  });
});
