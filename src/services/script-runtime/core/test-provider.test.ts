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

/*
  Schemas from the spec the collection was imported from.

  The validator was always deterministic; the gap was upstream — an imported
  OpenAPI document became requests and was discarded, so a schema could only
  reach a test by being pasted into it by hand. These check the resolution,
  not the validation: that a `$ref` finds the schema, that a name that finds
  nothing fails as a broken test rather than as a mismatched body.
*/
describe('toMatchSchema against an imported spec', () => {
  const USER = {
    type: 'object',
    properties: { id: { type: 'integer' }, name: { type: 'string' } },
    required: ['id', 'name'],
  };

  const run = (script: string, schemas?: Record<string, unknown>) => {
    const results: { name: string; passed: boolean; error?: string }[] = [];
    const api = testProvider.activate({
      addTestResult: (r: { name: string; passed: boolean; error?: string }) => results.push(r),
      scriptContext: schemas ? { schemas } : {},
    } as never) as { dk: Record<string, unknown> };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('dk', script)(api.dk);
    return results;
  };

  const CHECK = `dk.test('shape', () => dk.expect({ id: 1, name: 'Ada' }).toMatchSchema(REF));`;

  it.each([
    ['#/components/schemas/User'],
    ['#/definitions/User'],
    ['User'],
  ])('resolves %s', (ref) => {
    const [v] = run(CHECK.replace('REF', JSON.stringify(ref)), { User: USER });
    expect(v).toEqual({ name: 'shape', passed: true });
  });

  it('still takes a schema object, as it always did', () => {
    const [v] = run(CHECK.replace('REF', JSON.stringify(USER)));
    expect(v!.passed).toBe(true);
  });

  it('fails a body that does not match the referenced schema', () => {
    const script = `dk.test('shape', () => dk.expect({ id: 'not-a-number' }).toMatchSchema('User'));`;
    const [v] = run(script, { User: USER });
    expect(v!.passed).toBe(false);
    expect(v!.error).toContain('Schema validation failed');
  });

  /* A missing schema is a broken test, not a mismatched body — saying "does
     not match" would send whoever reads the run to the wrong place. */
  it('names the missing schema rather than blaming the body', () => {
    const [v] = run(CHECK.replace('REF', JSON.stringify('Ghost')), { User: USER });
    expect(v!.passed).toBe(false);
    expect(v!.error).toContain('No schema named Ghost');
    expect(v!.error).not.toContain('Schema validation failed');
  });

  it('says so when the collection has no schemas at all', () => {
    const [v] = run(CHECK.replace('REF', JSON.stringify('User')));
    expect(v!.error).toContain('No schema named User');
  });
});

/*
  `integer` is a JSON Schema type and JavaScript has no such thing, so the
  validator compared it against `typeof` and rejected every spec that types an
  id as an integer — which is every spec. It surfaced when inferred schemas
  started emitting `integer` and a body failed against a schema derived from
  itself.
*/
describe('the integer type', () => {
  const check = (value: unknown, schema: Record<string, unknown>) => {
    const results: { passed: boolean; error?: string }[] = [];
    const api = testProvider.activate({
      addTestResult: (r: { passed: boolean; error?: string }) => results.push(r),
      scriptContext: {},
    } as never) as { dk: Record<string, unknown> };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('dk', 'v', 's', `dk.test('t', () => dk.expect(v).toMatchSchema(s));`)(api.dk, value, schema);
    return results[0]!;
  };

  it('accepts a whole number', () => {
    expect(check(7, { type: 'integer' }).passed).toBe(true);
  });

  it('rejects a fractional one', () => {
    expect(check(7.5, { type: 'integer' }).passed).toBe(false);
  });

  it('still accepts either under `number`', () => {
    expect(check(7, { type: 'number' }).passed).toBe(true);
    expect(check(7.5, { type: 'number' }).passed).toBe(true);
  });

  it('does not let a string through', () => {
    expect(check('7', { type: 'integer' }).passed).toBe(false);
  });
});
