/**
 * Probing permissions on a cluster that answers slowly, or not at first.
 *
 * The bug behind these: on a cluster reached through an exec credential plugin
 * — EKS, AKS, a corporate SSO helper — kubectl runs that helper once per call,
 * and seven `auth can-i` fired at once contend on the one token cache it
 * keeps. They time out together, seven timeouts read as seven unknowns, and a
 * user with full access is shown "0 allowed, 7 not established". Intermittent,
 * because it depends on whether the token happened to be warm.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: string[][] = [];
/** Answers, in the order `run` is called. */
let script: { ok: boolean; stderr?: string }[] = [];
/** How many calls were in flight at once — the whole point of the fix. */
let inFlight = 0;
let peak = 0;
/** The peak concurrency seen before the very first call came back. */
let peakBeforeFirstReturned = 0;
let firstReturned = false;

vi.mock('./kubectl', () => ({
  run: vi.fn(async (args: string[]) => {
    calls.push(args);
    inFlight++;
    peak = Math.max(peak, inFlight);
    if (!firstReturned) peakBeforeFirstReturned = Math.max(peakBeforeFirstReturned, inFlight);
    /* A real call is not synchronous, and the overlap only exists across an
       await — so yield before answering. */
    await new Promise(r => setTimeout(r, 1));
    inFlight--;
    firstReturned = true;
    const next = script.shift() ?? { ok: true };
    return { ok: next.ok, code: next.ok ? 0 : 1, stdout: '', stderr: next.stderr ?? '' };
  }),
}));

import { probeAccess, clearAccessCache } from './k8s-access';
import { ACCESS_CHECKS } from './access-checks';

const TIMED_OUT = { ok: false, stderr: 'error: exec plugin: invalid apiVersion; timed out' };

beforeEach(() => {
  calls.length = 0;
  script = [];
  inFlight = 0;
  peak = 0;
  peakBeforeFirstReturned = 0;
  firstReturned = false;
  clearAccessCache();
});

describe('a cluster that answers', () => {
  it('reports what it said', async () => {
    script = ACCESS_CHECKS.map(() => ({ ok: true }));
    const access = await probeAccess('ctx', 'ns');
    expect(access.probed).toBe(true);
    expect(access.logs).toBe(true);
    expect(calls).toHaveLength(ACCESS_CHECKS.length);
  });

  it('takes a silent refusal as a refusal', async () => {
    script = ACCESS_CHECKS.map(c => ({ ok: c.key !== 'exec' }));
    const access = await probeAccess('ctx', 'ns');
    expect(access.probed).toBe(true);
    expect(access.exec).toBe(false);
    expect(access.logs).toBe(true);
  });
});

describe('a credential plugin that chokes when asked seven times at once', () => {
  it('warms the token with one call before firing the rest', async () => {
    /* The first has to come back before the others start, or the helper is
       invoked seven times at once and that is the whole problem. */
    script = ACCESS_CHECKS.map(() => ({ ok: true }));
    await probeAccess('ctx', 'ns');
    expect(peakBeforeFirstReturned).toBe(1);
    // The remaining six still go together; serialising all seven would put a
    // visible pause in front of the first pod you open.
    expect(peak).toBe(ACCESS_CHECKS.length - 1);
  });

  it('asks again one at a time when the whole batch timed out', async () => {
    // Seven timeouts, then seven real answers for the serial retry.
    script = [
      ...ACCESS_CHECKS.map(() => TIMED_OUT),
      ...ACCESS_CHECKS.map(() => ({ ok: true })),
    ];
    const access = await probeAccess('ctx', 'ns');
    expect(calls).toHaveLength(ACCESS_CHECKS.length * 2);
    expect(access.probed).toBe(true);
    expect(access.logs).toBe(true);
  });

  it('does not ask twice when even one check answered', async () => {
    /* One definite answer means the probe worked. Re-running it would double
       every permission check on a cluster that is merely partly slow. */
    script = [
      { ok: true },
      ...ACCESS_CHECKS.slice(1).map(() => TIMED_OUT),
    ];
    await probeAccess('ctx', 'ns');
    expect(calls).toHaveLength(ACCESS_CHECKS.length);
  });
});

describe('a cluster that will not answer at all', () => {
  it('leaves every action enabled and says so', async () => {
    script = [...ACCESS_CHECKS, ...ACCESS_CHECKS].map(() => TIMED_OUT);
    const access = await probeAccess('ctx', 'ns');
    expect(access.probed).toBe(false);
    for (const c of ACCESS_CHECKS) expect(access[c.key]).toBe(true);
  });

  it('carries what kubectl actually said', async () => {
    /* "The cluster did not answer" is true and useless — a timed-out
       credential helper and an expired token need different things done. */
    script = [...ACCESS_CHECKS, ...ACCESS_CHECKS].map(() => TIMED_OUT);
    const access = await probeAccess('ctx', 'ns');
    expect(access.detail).toContain('exec plugin');
  });

  it('is not cached, so the next pod tries again', async () => {
    script = [...ACCESS_CHECKS, ...ACCESS_CHECKS].map(() => TIMED_OUT);
    await probeAccess('ctx', 'ns');
    const before = calls.length;
    script = ACCESS_CHECKS.map(() => ({ ok: true }));
    const second = await probeAccess('ctx', 'ns');
    expect(calls.length).toBeGreaterThan(before);
    expect(second.probed).toBe(true);
  });
});

describe('a cluster that answered', () => {
  it('is cached, so opening ten pods costs one probe', async () => {
    script = ACCESS_CHECKS.map(() => ({ ok: true }));
    await probeAccess('ctx', 'ns');
    const after = calls.length;
    await probeAccess('ctx', 'ns');
    expect(calls).toHaveLength(after);
  });
});
