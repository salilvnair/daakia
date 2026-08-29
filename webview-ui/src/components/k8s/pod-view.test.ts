/**
 * The grid's ordering and severity rules.
 *
 * Worth testing on their own because they encode a judgement, not a mapping:
 * "which of these forty pods should I look at" is the question the grid exists
 * to answer, and getting it wrong is invisible — the screen still looks fine.
 */
import { describe, it, expect } from 'vitest';
import {
  severityOf, sortPods, matchesFilter, restartLabel, isRecentRestart,
  shortAge, formatBytes, formatCpu, pulse, groupPods, groupHue,
} from './pod-view';
import type { PodSummary } from '../../store/k8s-store';

const NOW = Date.parse('2026-08-29T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function pod(over: Partial<PodSummary> = {}): PodSummary {
  return {
    name: 'app-7d9f8b6c4-x2ktp',
    namespace: 'ns',
    uid: over.name ?? 'uid-' + Math.random(),
    phase: 'Running',
    ready: { current: 1, total: 1 },
    restarts: 0,
    containers: [],
    healthy: true,
    deleting: false,
    startedAt: ago(4 * 24 * 3600_000),
    ...over,
  };
}

describe('severity', () => {
  it('treats a healthy pod as quiet so it recedes', () => {
    expect(severityOf(pod(), NOW)).toBe('quiet');
  });

  it('flags CrashLoopBackOff as critical', () => {
    expect(severityOf(pod({ reason: 'CrashLoopBackOff', healthy: false, ready: { current: 0, total: 1 } }), NOW))
      .toBe('critical');
  });

  it('flags OOMKilled as critical even when the pod is back up', () => {
    // The container is Running again but it was killed for memory minutes ago.
    // That is the pod you came to look at, not a healthy one.
    expect(severityOf(pod({ reason: 'OOMKilled' }), NOW)).toBe('critical');
  });

  it('flags a partially-ready pod as warning', () => {
    expect(severityOf(pod({ ready: { current: 1, total: 2 }, healthy: false }), NOW)).toBe('warning');
  });

  it('flags Pending as warning', () => {
    expect(severityOf(pod({ phase: 'Pending', healthy: false }), NOW)).toBe('warning');
  });

  it('treats a RECENT restart as warning', () => {
    expect(severityOf(pod({ restarts: 3, lastRestartAt: ago(60_000) }), NOW)).toBe('warning');
  });

  it('does NOT flag an old restart, however many there were', () => {
    // 312 restarts, none for six days. A grid that ranks on count alone puts
    // this at the top forever and trains people to ignore the top.
    expect(severityOf(pod({ restarts: 312, lastRestartAt: ago(6 * 24 * 3600_000) }), NOW)).toBe('quiet');
  });

  it('treats a terminating pod as quiet, not failing', () => {
    expect(severityOf(pod({ deleting: true, healthy: false }), NOW)).toBe('quiet');
  });
});

describe('ordering', () => {
  it('puts what needs attention first, healthy last', () => {
    const pods = [
      pod({ name: 'healthy' }),
      pod({ name: 'crash', reason: 'CrashLoopBackOff', healthy: false }),
      pod({ name: 'degraded', ready: { current: 1, total: 2 }, healthy: false }),
    ];
    expect(sortPods(pods, NOW).map(p => p.name)).toEqual(['crash', 'degraded', 'healthy']);
  });

  it('breaks ties on restart recency, not restart count', () => {
    const many = pod({ name: 'many-old', reason: 'CrashLoopBackOff', healthy: false, restarts: 99, lastRestartAt: ago(3600_000) });
    const few = pod({ name: 'few-recent', reason: 'CrashLoopBackOff', healthy: false, restarts: 2, lastRestartAt: ago(30_000) });
    expect(sortPods([many, few], NOW).map(p => p.name)).toEqual(['few-recent', 'many-old']);
  });

  it('is stable and alphabetical within an otherwise equal band', () => {
    const pods = [pod({ name: 'c' }), pod({ name: 'a' }), pod({ name: 'b' })];
    expect(sortPods(pods, NOW).map(p => p.name)).toEqual(['a', 'b', 'c']);
    // Sorting twice must not reorder — the grid re-renders on every watch event.
    expect(sortPods(sortPods(pods, NOW), NOW).map(p => p.name)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the array it was given', () => {
    const pods = [pod({ name: 'z' }), pod({ name: 'a' })];
    sortPods(pods, NOW);
    expect(pods.map(p => p.name)).toEqual(['z', 'a']);
  });
});

describe('filtering', () => {
  const p = pod({ name: 'orders-api-7d9f8b6c4-x2ktp', workload: { kind: 'Deployment', name: 'orders-api' }, node: 'desktop-worker2', image: 'zp/backend:local' });

  it('matches on pod name, workload, node and image', () => {
    expect(matchesFilter(p, 'orders')).toBe(true);
    expect(matchesFilter(p, 'worker2')).toBe(true);
    expect(matchesFilter(p, 'zp/backend')).toBe(true);
  });

  it('requires every term, so two words narrow rather than widen', () => {
    expect(matchesFilter(p, 'orders worker2')).toBe(true);
    expect(matchesFilter(p, 'orders worker9')).toBe(false);
  });

  it('an empty filter matches everything', () => {
    expect(matchesFilter(p, '   ')).toBe(true);
  });
});

describe('formatting', () => {
  it('says when a restart happened, not just how many', () => {
    expect(restartLabel(pod({ restarts: 7, lastRestartAt: ago(40_000) }), NOW)).toBe('7 restarts · 40s ago');
    expect(restartLabel(pod({ restarts: 1, lastRestartAt: ago(40_000) }), NOW)).toBe('1 restart · 40s ago');
    expect(restartLabel(pod(), NOW)).toBe('0 restarts');
  });

  it('handles a restart with no recorded time rather than showing NaN', () => {
    expect(restartLabel(pod({ restarts: 2 }), NOW)).toBe('2 restarts · time unknown');
  });

  it('shortens ages the way kubectl does', () => {
    expect(shortAge(ago(45_000), NOW)).toBe('45s');
    expect(shortAge(ago(5 * 60_000), NOW)).toBe('5m');
    expect(shortAge(ago(3 * 3600_000), NOW)).toBe('3h');
    expect(shortAge(ago(4 * 24 * 3600_000), NOW)).toBe('4d');
    expect(shortAge(undefined, NOW)).toBe('—');
  });

  it('formats memory in binary units, as kubectl reports it', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(200 * 1024 * 1024)).toBe('200 MiB');
    expect(formatBytes(3.7 * 1024 ** 3)).toBe('3.70 GiB');
    expect(formatBytes(undefined)).toBe('—');
  });

  it('formats cpu as millicores below a core', () => {
    expect(formatCpu(340)).toBe('340m');
    expect(formatCpu(1500)).toBe('1.50');
  });

  it('does not report a recent restart for a pod that never restarted', () => {
    expect(isRecentRestart(pod(), NOW)).toBe(false);
  });
});

describe('grouping', () => {
  it('separates what needs attention from what does not', () => {
    // The grid renders these as two different things — big cards and quiet
    // rows — so the split has to be exactly the quiet/not-quiet boundary.
    const pods = [
      pod({ name: 'ok-1' }),
      pod({ name: 'ok-2' }),
      pod({ name: 'crash', reason: 'CrashLoopBackOff', healthy: false }),
      pod({ name: 'old-restarts', restarts: 312, lastRestartAt: ago(6 * 24 * 3600_000) }),
    ];
    const sorted = sortPods(pods, NOW);
    const attention = sorted.filter(p => severityOf(p, NOW) !== 'quiet');
    const quiet = sorted.filter(p => severityOf(p, NOW) === 'quiet');
    expect(attention.map(p => p.name)).toEqual(['crash']);
    expect(quiet).toHaveLength(3);
    expect(attention.length + quiet.length).toBe(pods.length);
  });
});

describe('namespace grouping', () => {
  it('keeps namespaces apart and puts the worst group first', () => {
    const pods = [
      pod({ name: 'a', namespace: 'quiet-ns', context: 'c1' }),
      pod({ name: 'b', namespace: 'quiet-ns', context: 'c1' }),
      pod({ name: 'c', namespace: 'broken-ns', context: 'c1', reason: 'CrashLoopBackOff', healthy: false }),
    ];
    const groups = groupPods(pods, NOW);
    expect(groups.map(g => g.namespace)).toEqual(['broken-ns', 'quiet-ns']);
    expect(groups[0].pods).toHaveLength(1);
    expect(groups[1].pods).toHaveLength(2);
  });

  it('separates identically-named namespaces in different clusters', () => {
    // Two clusters can both have a `payments`. Merging them would show pods
    // from one cluster under the other's heading.
    const pods = [
      pod({ name: 'x', namespace: 'payments', context: 'prod' }),
      pod({ name: 'y', namespace: 'payments', context: 'staging' }),
    ];
    const groups = groupPods(pods, NOW);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map(g => g.context))).toEqual(new Set(['prod', 'staging']));
  });

  it('spreads group tints as far apart as the count allows', () => {
    // Deriving the hue from a hash collided twice — dk8s-test and payments
    // landed on the same value, which is why every group looked green. Spacing
    // by index makes separation a property of the layout rather than luck.
    for (const total of [2, 3, 5, 8]) {
      const hues = Array.from({ length: total }, (_, i) => groupHue(i, total));
      const gaps = hues.slice(1).map((h, i) => h - hues[i]);
      const expected = 290 / total;
      for (const gap of gaps) expect(gap).toBeCloseTo(expected, 5);
    }
  });

  it('never lands a tint in the red band, where it would read as an alert', () => {
    for (const total of [1, 2, 3, 8, 20]) {
      for (let i = 0; i < total; i++) {
        const h = groupHue(i, total);
        expect(h).toBeGreaterThanOrEqual(45);
        expect(h).toBeLessThan(335);
      }
    }
  });

  it('gives every visible group a distinct tint', () => {
    const pods = ['alpha', 'beta', 'gamma', 'delta'].map(ns =>
      pod({ name: `p-${ns}`, namespace: ns, context: 'c1' }));
    const tints = groupPods(pods, NOW).map(g => g.tint.hue);
    expect(new Set(tints).size).toBe(tints.length);
  });
});

describe('cluster pulse', () => {
  it('counts by severity and restarts within the hour', () => {
    const pods = [
      pod({ name: 'a' }),
      pod({ name: 'b' }),
      pod({ name: 'c', reason: 'CrashLoopBackOff', healthy: false, lastRestartAt: ago(120_000) }),
      pod({ name: 'd', ready: { current: 0, total: 1 }, healthy: false }),
      pod({ name: 'e', restarts: 4, lastRestartAt: ago(5 * 24 * 3600_000) }),
    ];
    const p = pulse(pods, NOW);
    expect(p.total).toBe(5);
    expect(p.critical).toBe(1);
    expect(p.degraded).toBe(1);
    expect(p.ready).toBe(3);
    // The six-day-old restart must not inflate "restarted in the last hour".
    expect(p.restartsLastHour).toBe(1);
  });
});
