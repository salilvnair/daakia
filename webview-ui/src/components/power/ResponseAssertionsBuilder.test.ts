/**
 * The assertion a clicked field turns into.
 *
 * This panel spent a release written and unreachable, so nothing it produced
 * had ever been read by a runtime. The first time it ran end to end it wrote
 * `dk.expect(data.[0].name)` into a user's script — valid-looking, and a
 * syntax error. What it generates is code, so it is checked here the way code
 * is: parsed, and run against the same matchers the request runtime defines.
 */
import { describe, it, expect } from 'vitest';
import { generateAssertion } from './ResponseAssertionsBuilder';

/** Parse-check: the generated line has to be JavaScript before anything else. */
const parses = (src: string) => {
  try { new Function('data', 'dk', src); return true; } catch { return false; }
};

describe('the accessor', () => {
  it('reaches a field on an object', () => {
    expect(generateAssertion('name', 'Ada')).toBe('dk.expect(data.name).toBe("Ada");');
  });

  it('reaches a field under a nested path', () => {
    expect(generateAssertion('data.users[0].id', 7))
      .toBe('dk.expect(data.data.users[0].id).toBe(7);');
  });

  /* A response whose root is an array — every list endpoint. The path starts
     with an index, and joining it to `data` with a dot is a syntax error. */
  it('reaches into a root-level array without an orphan dot', () => {
    const out = generateAssertion('[0].name', 'Ada');
    expect(out).toBe('dk.expect(data[0].name).toBe("Ada");');
    expect(out).not.toContain('data.[');
    expect(parses(out)).toBe(true);
  });

  it('asserts the whole body when nothing was drilled into', () => {
    expect(generateAssertion('', true)).toBe('dk.expect(data).toBe(true);');
  });
});

describe('the value', () => {
  it.each([
    [null, 'dk.expect(data.x).toBeNull();'],
    [false, 'dk.expect(data.x).toBe(false);'],
    [0, 'dk.expect(data.x).toBe(0);'],
    [42, 'dk.expect(data.x).toBe(42);'],
  ])('%s', (value, expected) => {
    expect(generateAssertion('x', value)).toBe(expected);
  });

  /* An email is asserted by shape, not by value: the address in a test
     fixture changes and the assertion should not. */
  it('matches an email by shape', () => {
    expect(generateAssertion('x', 'a@b.io')).toContain('.toMatch(/^[^@]+@[^@]+\\.[^@]+$/)');
  });

  it('quotes a value that would close the string early', () => {
    const out = generateAssertion('x', 'she said "no"\\ and left\nline two');
    expect(parses(out)).toBe(true);
    expect(out).toContain('\\"no\\"');
  });

  it('falls back to a truthiness check for a value with no literal', () => {
    expect(generateAssertion('x', { a: 1 })).toBe('dk.expect(data.x).toBeTruthy();');
  });
});

describe('what the runtime does with it', () => {
  /** The matcher surface the generated line calls into. */
  const dk = {
    expect: (actual: unknown) => ({
      toBe: (e: unknown) => { if (actual !== e) throw new Error(`${String(actual)} !== ${String(e)}`); },
      toBeNull: () => { if (actual !== null) throw new Error('not null'); },
      toBeTruthy: () => { if (!actual) throw new Error('not truthy'); },
      toMatch: (re: RegExp) => { if (!re.test(String(actual))) throw new Error('no match'); },
    }),
  };

  const run = (path: string, value: unknown, data: unknown) =>
    new Function('data', 'dk', generateAssertion(path, value))(data, dk);

  it('passes against the body it was generated from', () => {
    const body = [{ id: 1, name: 'Ada', email: 'ada@x.io' }];
    expect(() => run('[0].name', 'Ada', body)).not.toThrow();
    expect(() => run('[0].id', 1, body)).not.toThrow();
    expect(() => run('[0].email', 'ada@x.io', body)).not.toThrow();
  });

  it('fails when the value it pinned has changed', () => {
    expect(() => run('[0].name', 'Ada', [{ name: 'Linus' }])).toThrow();
  });
});
