/**
 * The matchers `dk.expect` actually answers to.
 *
 * These exist because two things had drifted apart from this file and nobody
 * could tell: the Postman converter emitted matchers with no counterpart here,
 * and the AI prompt advertised `toBeNull` and `toBeDefined`, which did not
 * exist. Both produced scripts that looked converted and threw on first run.
 *
 * So the set is asserted as a set, not only case by case — a matcher removed
 * from the provider should fail here rather than in someone's collection.
 */
import { describe, it, expect } from 'vitest';
import { testProvider } from './test-provider';

interface Result { name: string; passed: boolean; error?: string }

/** The provider, wired to a context that just records what it is told. */
function harness() {
  const results: Result[] = [];
  const api = testProvider.activate({
    addTestResult: (r: Result) => results.push(r),
  } as never) as { dk: { test: (n: string, f: () => void) => void; expect: (v: unknown) => never } };
  return { results, dk: api.dk };
}

/** Runs one assertion and says whether it passed, the way a script would. */
function check(fn: (e: (v: unknown) => never) => void): Result {
  const { results, dk } = harness();
  dk.test('t', () => fn(dk.expect));
  return results[0]!;
}

const passes = (fn: (e: (v: unknown) => never) => void) => check(fn).passed;

describe('the matcher set', () => {
  /*
    The converter and the prompt both name matchers in strings, which the
    compiler cannot check. This is the one place the real list is written
    down, so removing one breaks a test rather than a user's import.
  */
  it('is exactly what the converter and the prompt promise', () => {
    const { dk } = harness();
    const names = Object.keys(dk.expect(1) as unknown as Record<string, unknown>)
      .filter(k => k !== 'not')
      .sort();
    expect(names).toEqual([
      'toBe', 'toBeDefined', 'toBeFalsy', 'toBeGreaterThan',
      'toBeGreaterThanOrEqual', 'toBeLessThan', 'toBeLessThanOrEqual',
      'toBeNull', 'toBeOneOf', 'toBeTruthy', 'toBeType', 'toBeUndefined',
      'toBeWithin', 'toContain', 'toEqual', 'toHaveLength', 'toHaveProperty',
      'toHaveStatus', 'toMatch', 'toMatchSchema',
    ]);
  });

  it('offers every matcher under .not as well', () => {
    const { dk } = harness();
    const e = dk.expect(1) as unknown as Record<string, unknown>;
    const plain = Object.keys(e).filter(k => k !== 'not').sort();
    expect(Object.keys(e.not as Record<string, unknown>).sort()).toEqual(plain);
  });
});

describe('toBeWithin', () => {
  // The assertion the whole conversion fix was about.
  it('is inclusive at both ends, like Chai', () => {
    expect(passes(e => (e(200) as never as { toBeWithin(a: number, b: number): void }).toBeWithin(200, 299))).toBe(true);
    expect(passes(e => (e(299) as never as { toBeWithin(a: number, b: number): void }).toBeWithin(200, 299))).toBe(true);
  });

  it('fails outside the range', () => {
    expect(passes(e => (e(404) as never as { toBeWithin(a: number, b: number): void }).toBeWithin(200, 299))).toBe(false);
  });

  it('says what it wanted when it fails', () => {
    const r = check(e => (e(404) as never as { toBeWithin(a: number, b: number): void }).toBeWithin(200, 299));
    expect(r.error).toContain('404');
    expect(r.error).toContain('200');
    expect(r.error).toContain('299');
  });
});

describe('negation', () => {
  /*
    The reason `.not` exists. Before it, the converter had nothing to target
    and emitted an assertion that passed exactly when it should have failed.
  */
  it('passes when the plain form would fail', () => {
    expect(passes(e => (e(1) as never as { not: { toBe(v: number): void } }).not.toBe(2))).toBe(true);
  });

  it('fails when the plain form would pass', () => {
    expect(passes(e => (e(1) as never as { not: { toBe(v: number): void } }).not.toBe(1))).toBe(false);
  });

  it('reports the negated message, not the plain one', () => {
    const r = check(e => (e(1) as never as { not: { toBe(v: number): void } }).not.toBe(1));
    expect(r.error).toMatch(/not to be/);
  });
});

describe('the matchers the prompt promised but did not have', () => {
  it('toBeNull', () => {
    expect(passes(e => (e(null) as never as { toBeNull(): void }).toBeNull())).toBe(true);
    expect(passes(e => (e(0) as never as { toBeNull(): void }).toBeNull())).toBe(false);
  });

  it('toBeDefined, which is not the same as truthy', () => {
    // Chai's `.to.exist` is what this converts from, and 0 exists.
    expect(passes(e => (e(0) as never as { toBeDefined(): void }).toBeDefined())).toBe(true);
    expect(passes(e => (e(undefined) as never as { toBeDefined(): void }).toBeDefined())).toBe(false);
  });

  it('toBeOneOf', () => {
    expect(passes(e => (e(2) as never as { toBeOneOf(l: number[]): void }).toBeOneOf([1, 2, 3]))).toBe(true);
    expect(passes(e => (e(9) as never as { toBeOneOf(l: number[]): void }).toBeOneOf([1, 2, 3]))).toBe(false);
  });

  it('toBeType, with array distinct from object', () => {
    type T = { toBeType(t: string): void };
    expect(passes(e => (e([1]) as never as T).toBeType('array'))).toBe(true);
    expect(passes(e => (e([1]) as never as T).toBeType('object'))).toBe(false);
    expect(passes(e => (e(null) as never as T).toBeType('null'))).toBe(true);
  });
});

describe('a failure is a failed test, not a crashed script', () => {
  it('records the failure and keeps going', () => {
    const { results, dk } = harness();
    dk.test('first', () => (dk.expect(1) as never as { toBe(v: number): void }).toBe(2));
    dk.test('second', () => (dk.expect(1) as never as { toBe(v: number): void }).toBe(1));
    expect(results.map(r => r.passed)).toEqual([false, true]);
  });
});
