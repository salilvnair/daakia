/**
 * The shared permission table.
 *
 * It exists to stop three lists drifting — the verbs the host probes, the rule
 * strings it reports, and the words the webview shows on a padlocked tab. The
 * value of one list is only real while nothing quietly grows a second, so the
 * properties that made it worth sharing are asserted here.
 */
import { describe, it, expect } from 'vitest';
import { ACCESS_CHECKS, ACCESS_RULE, canIArgs, canILine } from './access-checks';

/*
  Written out rather than derived, on purpose.

  `Access` in the webview is a Record over these keys and its fields are typed
  one by one; a key added on one side and not the other is a row that never
  renders or a field never filled in. Types cannot check that across the two
  builds, so this list is the contract — adding a permission means changing it
  here too, deliberately.
*/
const EXPECTED_KEYS = [
  'logs', 'exec', 'get', 'events', 'portForward', 'delete', 'patch',
];

describe('the table', () => {
  it('covers exactly the permissions the Access type has fields for', () => {
    expect([...ACCESS_CHECKS.map(c => c.key)].sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('gives every permission a rule, a title and what it gates', () => {
    for (const c of ACCESS_CHECKS) {
      expect(c.rule, c.key).toBe(`${c.verb} on ${c.resource}`);
      expect(c.title.trim(), c.key).not.toBe('');
      expect(c.gates.trim(), c.key).not.toBe('');
    }
  });

  it('has no duplicate keys or checks', () => {
    const keys = ACCESS_CHECKS.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    const pairs = ACCESS_CHECKS.map(c => `${c.verb} ${c.resource}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('derives the rule map from the table rather than repeating it', () => {
    for (const c of ACCESS_CHECKS) expect(ACCESS_RULE[c.key]).toBe(c.rule);
  });
});

describe('the command', () => {
  it('names the context and namespace, and keeps --quiet', () => {
    const exec = ACCESS_CHECKS.find(c => c.key === 'exec')!;
    expect(canIArgs(exec, 'prod-eu', 'payments')).toEqual([
      '--context', 'prod-eu', '-n', 'payments',
      'auth', 'can-i', 'create', 'pods/exec', '--quiet',
    ]);
  });

  it('spells out as the line a person would paste', () => {
    const exec = ACCESS_CHECKS.find(c => c.key === 'exec')!;
    expect(canILine(exec, 'prod-eu', 'payments'))
      .toBe('kubectl --context prod-eu -n payments auth can-i create pods/exec --quiet');
  });

  it('keeps --quiet on every one of them', () => {
    /*
      Without it kubectl prints "no" and exits 0, which reads as allowed. It is
      the single flag the whole permission model rests on.
    */
    for (const c of ACCESS_CHECKS) {
      expect(canIArgs(c, 'c', 'n'), c.key).toContain('--quiet');
    }
  });
});
