/**
 * Naming what a pod belongs to.
 *
 * Every test here is about a suffix Kubernetes generated. Get one wrong and a
 * star, a filter or a badge attaches to something that stops existing on the
 * next rollout — or, for a CronJob, on the next minute.
 */
import { describe, it, expect } from 'vitest';
import { resolveWorkload, isScheduled } from './workload';

describe('a Deployment', () => {
  it('is named without its ReplicaSet hash', () => {
    expect(resolveWorkload({ kind: 'ReplicaSet', name: 'api-7bb88bcc45' }))
      .toEqual({ kind: 'Deployment', name: 'api' });
  });

  it('keeps a version that is part of the name', () => {
    /* `api-v2` is a deployment somebody named, not a hash. */
    expect(resolveWorkload({ kind: 'ReplicaSet', name: 'api-v2' })?.name).toBe('api-v2');
  });
});

describe('a CronJob', () => {
  it('is named without the run it happens to be', () => {
    /* The Job is `billing-28912345`, and starring that stars one minute of
       one day. The thing somebody means is `billing`. */
    expect(resolveWorkload({ kind: 'Job', name: 'billing-28912345' }))
      .toEqual({ kind: 'CronJob', name: 'billing' });
  });

  it('gives every run of one schedule the same name', () => {
    const a = resolveWorkload({ kind: 'Job', name: 'nightly-reindex-28912345' });
    const b = resolveWorkload({ kind: 'Job', name: 'nightly-reindex-28913785' });
    expect(a).toEqual(b);
  });

  it('leaves a Job somebody created themselves alone', () => {
    expect(resolveWorkload({ kind: 'Job', name: 'migrate-users' }))
      .toEqual({ kind: 'Job', name: 'migrate-users' });
  });

  it('does not take a short number for a schedule time', () => {
    // `import-2024` is a year in a name, not minutes since the epoch.
    expect(resolveWorkload({ kind: 'Job', name: 'import-2024' }))
      .toEqual({ kind: 'Job', name: 'import-2024' });
  });
});

describe('everything else', () => {
  it('is reported as it comes', () => {
    expect(resolveWorkload({ kind: 'StatefulSet', name: 'kafka' }))
      .toEqual({ kind: 'StatefulSet', name: 'kafka' });
    expect(resolveWorkload({ kind: 'DaemonSet', name: 'fluentd' }))
      .toEqual({ kind: 'DaemonSet', name: 'fluentd' });
  });

  it('is nothing at all for a pod with no owner', () => {
    /* A debug shell has nothing more stable to be named by than itself, and
       the caller has to say so rather than invent a workload. */
    expect(resolveWorkload(undefined)).toBeUndefined();
    expect(resolveWorkload({ kind: 'Job' })).toBeUndefined();
    expect(resolveWorkload({ name: 'orphan' })).toBeUndefined();
  });
});

describe('what runs on a schedule', () => {
  it('is a CronJob or a Job, and nothing that stays up', () => {
    expect(isScheduled({ kind: 'CronJob', name: 'x' })).toBe(true);
    expect(isScheduled({ kind: 'Job', name: 'x' })).toBe(true);
    expect(isScheduled({ kind: 'Deployment', name: 'x' })).toBe(false);
    expect(isScheduled({ kind: 'StatefulSet', name: 'x' })).toBe(false);
    expect(isScheduled(undefined)).toBe(false);
  });
});
