/**
 * One ceiling, and the rule that keeps the old bug dead: a screen's backstop
 * must never fire before the call it is timing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampTimeoutSeconds, setClusterTimeoutSeconds, clusterTimeoutMs, clusterTimeoutSeconds,
  reachRequestTimeoutSeconds, silenceBackstopMs, DEFAULT_CLUSTER_TIMEOUT_SECONDS,
} from './k8s-timeouts';

describe('the ceiling', () => {
  beforeEach(() => setClusterTimeoutSeconds(undefined));

  it('defaults to something a slow cluster can meet', () => {
    expect(clusterTimeoutSeconds()).toBe(DEFAULT_CLUSTER_TIMEOUT_SECONDS);
    expect(clusterTimeoutMs()).toBe(DEFAULT_CLUSTER_TIMEOUT_SECONDS * 1000);
  });

  it('takes a stored value', () => {
    setClusterTimeoutSeconds(60);
    expect(clusterTimeoutMs()).toBe(60_000);
  });

  it('refuses a value no call could finish inside, and one nobody waits for', () => {
    expect(clampTimeoutSeconds(0)).toBe(5);
    expect(clampTimeoutSeconds(-10)).toBe(5);
    expect(clampTimeoutSeconds(10_000)).toBe(300);
    expect(clampTimeoutSeconds(undefined)).toBe(DEFAULT_CLUSTER_TIMEOUT_SECONDS);
    expect(clampTimeoutSeconds(Number.NaN)).toBe(DEFAULT_CLUSTER_TIMEOUT_SECONDS);
  });
});

describe('the backstop', () => {
  it('is always longer than the call it is waiting on', () => {
    /*
      The whole bug: a 25-second stopwatch over a call bounded at 30, so the
      screen announced "no answer from the cluster" five seconds before the
      answer was due. Whatever the ceiling is set to, this must hold.
    */
    for (const seconds of [5, 15, 30, 45, 120, 300]) {
      setClusterTimeoutSeconds(seconds);
      expect(silenceBackstopMs(), `at ${seconds}s`).toBeGreaterThan(clusterTimeoutMs());
    }
  });
});

describe('the reachability check', () => {
  it('fails faster than the ceiling, because the usual answer is a VPN that is down', () => {
    setClusterTimeoutSeconds(30);
    expect(reachRequestTimeoutSeconds()).toBeLessThan(30);
  });

  it('still scales with it — somebody who raised it meant this call too', () => {
    setClusterTimeoutSeconds(5);
    const quick = reachRequestTimeoutSeconds();
    setClusterTimeoutSeconds(300);
    expect(reachRequestTimeoutSeconds()).toBeGreaterThanOrEqual(quick);
  });

  it('stays inside bounds a person can wait through', () => {
    for (const seconds of [5, 30, 300]) {
      setClusterTimeoutSeconds(seconds);
      expect(reachRequestTimeoutSeconds()).toBeGreaterThanOrEqual(5);
      expect(reachRequestTimeoutSeconds()).toBeLessThanOrEqual(15);
    }
  });
});
