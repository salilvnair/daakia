/**
 * Remembering that somebody said "this one is Java".
 *
 * The rule that matters is which key a mark lands on. A pod name carries a
 * generated suffix that changes on every rollout, so a mark stored against it
 * is gone at the next deploy — that is the right behaviour for a mark somebody
 * put on one pod, and the wrong behaviour for a mark they put on the service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let store: Record<string, unknown> = {};
vi.mock('../../storage/db', () => ({
  getSetting: (k: string) => store[k],
  setSetting: (k: string, v: unknown) => { store[k] = v; },
}));

import {
  allMarks, markFor, setMark, podMarkKey, workloadMarkKey, targetFromSpec,
} from './runtime-marks';

const target = {
  context: 'kind-dk8s', namespace: 'prod', pod: 'api-7bb88bcc45-27sqb',
  workload: { kind: 'Deployment', name: 'api' },
};

beforeEach(() => { store = {}; });

describe('nothing stored', () => {
  it('is no marks, not a crash', () => {
    expect(allMarks()).toEqual({});
    expect(markFor(target)).toBeUndefined();
  });

  it('survives someone else having written under the key', () => {
    store['dk8s.runtimeMarks'] = ['not', 'an', 'object'];
    expect(allMarks()).toEqual({});
  });
});

describe('marking the workload', () => {
  it('is remembered for the pod that is there now', () => {
    setMark(target, 'workload', 'java');
    expect(markFor(target)?.runtime).toBe('java');
  });

  it('still applies after the pod is replaced', () => {
    /* The whole point. A rollout changes the pod name and nothing else. */
    setMark(target, 'workload', 'java');
    const afterDeploy = { ...target, pod: 'api-9dd11aa22-x4ktp' };
    expect(markFor(afterDeploy)?.runtime).toBe('java');
  });

  it('does not reach a different namespace or cluster', () => {
    setMark(target, 'workload', 'java');
    expect(markFor({ ...target, namespace: 'staging' })).toBeUndefined();
    expect(markFor({ ...target, context: 'kind-dk8s-lab' })).toBeUndefined();
  });
});

describe('marking one pod', () => {
  it('applies to that pod', () => {
    setMark(target, 'pod', 'python');
    expect(markFor(target)?.runtime).toBe('python');
  });

  it('stops applying when the pod is replaced, which is the point', () => {
    setMark(target, 'pod', 'python');
    expect(markFor({ ...target, pod: 'api-9dd11aa22-x4ktp' })).toBeUndefined();
  });

  it('beats a mark on the workload', () => {
    /* The more specific statement wins: somebody marked this one on purpose
       after marking the service. */
    setMark(target, 'workload', 'java');
    setMark(target, 'pod', 'python');
    expect(markFor(target)?.runtime).toBe('python');
  });
});

describe('a pod with no owner', () => {
  const bare = { context: 'kind-dk8s', namespace: 'prod', pod: 'debug-shell' };

  it('can only be marked as itself', () => {
    expect(workloadMarkKey(bare)).toBeUndefined();
    expect(podMarkKey(bare)).toBe('kind-dk8s/prod/Pod/debug-shell');
  });

  it('ignores an attempt to mark a workload it does not have', () => {
    setMark(bare, 'workload', 'go');
    expect(markFor(bare)).toBeUndefined();
  });
});

describe('taking a mark off', () => {
  it('clears it rather than storing unknown', () => {
    /* A stored "unknown" would suppress the guess too, leaving a pod dk8s
       could have classified reporting nothing at all. */
    setMark(target, 'workload', 'java');
    setMark(target, 'workload', undefined);
    expect(markFor(target)).toBeUndefined();
    expect(allMarks()).toEqual({});
  });

  it('treats an explicit unknown the same way', () => {
    setMark(target, 'workload', 'java');
    setMark(target, 'workload', 'unknown');
    expect(markFor(target)).toBeUndefined();
  });

  it('leaves the other scope alone', () => {
    setMark(target, 'workload', 'java');
    setMark(target, 'pod', 'python');
    setMark(target, 'pod', undefined);
    expect(markFor(target)?.runtime).toBe('java');
  });
});

describe('reading a target off a pod spec', () => {
  it('names the workload the way a person would', () => {
    const t = targetFromSpec('kind-dk8s', 'prod', {
      metadata: {
        name: 'billing-28912345-h7x2k',
        ownerReferences: [{ kind: 'Job', name: 'billing-28912345' }],
      },
    });
    // Not `Job/billing-28912345`, which is one run and stars nothing useful.
    expect(t.workload).toEqual({ kind: 'CronJob', name: 'billing' });
  });

  it('has no workload for a pod that has no owner', () => {
    const t = targetFromSpec('kind-dk8s', 'prod', { metadata: { name: 'debug' } });
    expect(t.workload).toBeUndefined();
    expect(t.pod).toBe('debug');
  });
});
