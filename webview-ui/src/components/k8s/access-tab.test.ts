/**
 * The Access tab's one judgement: three states, not two.
 *
 * `probed: false` means the check could not be MADE. dk8s fails open there and
 * leaves every action enabled, so reporting "allowed" would be claiming an
 * answer nobody gave — and reporting "denied" is the original bug, the one
 * that put a padlock on a cluster where the account was an administrator.
 */
import { describe, it, expect } from 'vitest';
import { verdictOf, summarise } from './AccessTab';
import { ACCESS_CHECKS, canILine, ACCESS_RULE } from '@daakia/access-checks';

const ALL = (over: Partial<Record<string, boolean>> = {}) => ({
  logs: true, exec: true, get: true, events: true,
  portForward: true, delete: true, patch: true, probed: true,
  ...over,
} as Parameters<typeof summarise>[0]);

describe('what a row says', () => {
  it('reports a checked permission as allowed or denied', () => {
    expect(verdictOf(true, true)).toBe('allowed');
    expect(verdictOf(false, true)).toBe('denied');
  });

  it('reports an unmade check as neither, whatever it defaulted to', () => {
    // Failing open sets every flag true. That is a default, not an answer.
    expect(verdictOf(true, false)).toBe('unknown');
    expect(verdictOf(false, false)).toBe('unknown');
  });
});

describe('the summary', () => {
  it('counts an admin account as allowed throughout', () => {
    expect(summarise(ALL())).toEqual({ allowed: ACCESS_CHECKS.length, denied: 0, unknown: 0 });
  });

  it('counts the log-reader shape — logs and get, nothing else', () => {
    const s = summarise(ALL({ exec: false, events: false, portForward: false, delete: false, patch: false }));
    expect(s).toEqual({ allowed: 2, denied: 5, unknown: 0 });
  });

  it('counts nothing as known when the check could not be made', () => {
    expect(summarise(ALL({ probed: false })))
      .toEqual({ allowed: 0, denied: 0, unknown: ACCESS_CHECKS.length });
  });
});

describe('the line shown beside each answer', () => {
  it('is the line the host runs, --quiet included', () => {
    const logs = ACCESS_CHECKS.find(c => c.key === 'logs')!;
    expect(canILine(logs, 'prod-eu', 'payments'))
      .toBe('kubectl --context prod-eu -n payments auth can-i get pods/log --quiet');
  });

  it('exists for every permission, with a rule to ask for', () => {
    for (const c of ACCESS_CHECKS) {
      expect(canILine(c, 'c', 'n')).toContain(`can-i ${c.verb} ${c.resource}`);
      expect(ACCESS_RULE[c.key]).toBe(c.rule);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.gates.length).toBeGreaterThan(0);
    }
  });
});
