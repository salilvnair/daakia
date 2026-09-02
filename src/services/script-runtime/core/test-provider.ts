/**
 * Core Provider: Test & Assertions
 *
 * Contributes: dk.test(), dk.expect()
 *
 * - dk.test(name, fn): Run a named test assertion block
 * - dk.expect(value): Chainable assertion API (toBe, toEqual, toContain, etc.)
 * - dk.expect(value).not.<matcher>(...): every matcher, inverted
 */
import type { ScriptProvider } from '../types';

export const testProvider: ScriptProvider = {
  id: 'core:test',
  name: 'Test & Assertions',
  description: 'dk.test(name, fn), dk.expect(value).toBe/toEqual/toContain/...',
  priority: 90,

  activate(ctx) {
    const { addTestResult } = ctx;

    const test = (name: string, fn: () => void): void => {
      try {
        fn();
        addTestResult({ name, passed: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addTestResult({ name, passed: false, error: msg });
      }
    };

    /*
      Matchers as predicates, so negation is real.

      They were written as a flat object of functions that threw on failure,
      which left no way to express `.not` — and the Postman converter, needing
      one, emitted `toBe` with a "NOT" comment wedged inside the argument list:
      an assertion that says the opposite of what the script asked for, and
      passes silently when it should fail. A predicate plus its two messages
      gives both directions from one definition, so they cannot drift apart.
    */
    interface Matcher {
      pass: boolean;
      /** Shown when the plain form fails. */
      msg: string;
      /** Shown when the negated form fails. */
      not: string;
    }

    const show = (v: unknown) => {
      try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
    };

    const typeOf = (v: unknown) =>
      v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

    const MATCHERS: Record<string, (actual: unknown, ...args: never[]) => Matcher> = {
      toBe: (a, e?: unknown) => ({
        pass: a === e,
        msg: `Expected ${show(a)} to be ${show(e)}`,
        not: `Expected ${show(a)} not to be ${show(e)}`,
      }),
      toEqual: (a, e?: unknown) => ({
        pass: JSON.stringify(a) === JSON.stringify(e),
        msg: `Expected ${show(a)} to equal ${show(e)}`,
        not: `Expected ${show(a)} not to equal ${show(e)}`,
      }),
      toBeTruthy: (a) => ({
        pass: !!a,
        msg: `Expected ${show(a)} to be truthy`,
        not: `Expected ${show(a)} not to be truthy`,
      }),
      toBeFalsy: (a) => ({
        pass: !a,
        msg: `Expected ${show(a)} to be falsy`,
        not: `Expected ${show(a)} not to be falsy`,
      }),
      toBeNull: (a) => ({
        pass: a === null,
        msg: `Expected ${show(a)} to be null`,
        not: `Expected value not to be null`,
      }),
      toBeUndefined: (a) => ({
        pass: a === undefined,
        msg: `Expected ${show(a)} to be undefined`,
        not: `Expected value not to be undefined`,
      }),
      toBeDefined: (a) => ({
        pass: a !== undefined,
        msg: `Expected value to be defined`,
        not: `Expected value to be undefined`,
      }),
      toContain: (a, e?: unknown) => {
        if (typeof a === 'string' && typeof e === 'string') {
          return {
            pass: a.includes(e),
            msg: `Expected "${a}" to contain "${e}"`,
            not: `Expected "${a}" not to contain "${e}"`,
          };
        }
        if (Array.isArray(a)) {
          return {
            pass: a.includes(e),
            msg: `Expected array to contain ${show(e)}`,
            not: `Expected array not to contain ${show(e)}`,
          };
        }
        // Not a failed assertion — the script asked something meaningless of
        // this value, and saying so beats reporting it as a test failure.
        throw new Error('toContain requires a string or array');
      },
      toBeGreaterThan: (a, e?: number) => ({
        pass: typeof a === 'number' && a > (e as number),
        msg: `Expected ${show(a)} to be greater than ${show(e)}`,
        not: `Expected ${show(a)} not to be greater than ${show(e)}`,
      }),
      toBeLessThan: (a, e?: number) => ({
        pass: typeof a === 'number' && a < (e as number),
        msg: `Expected ${show(a)} to be less than ${show(e)}`,
        not: `Expected ${show(a)} not to be less than ${show(e)}`,
      }),
      /*
        Inclusive, matching Chai's `within` — which is what nearly every
        imported Postman script uses it for: `status within 200, 299`.
      */
      toBeGreaterThanOrEqual: (a, e?: number) => ({
        pass: typeof a === 'number' && a >= (e as number),
        msg: `Expected ${show(a)} to be at least ${show(e)}`,
        not: `Expected ${show(a)} not to be at least ${show(e)}`,
      }),
      toBeLessThanOrEqual: (a, e?: number) => ({
        pass: typeof a === 'number' && a <= (e as number),
        msg: `Expected ${show(a)} to be at most ${show(e)}`,
        not: `Expected ${show(a)} not to be at most ${show(e)}`,
      }),
      toBeWithin: (a, min?: number, max?: number) => ({
        pass: typeof a === 'number' && a >= (min as number) && a <= (max as number),
        msg: `Expected ${show(a)} to be within ${show(min)} and ${show(max)}`,
        not: `Expected ${show(a)} not to be within ${show(min)} and ${show(max)}`,
      }),
      toBeOneOf: (a, list?: unknown[]) => ({
        pass: Array.isArray(list) && list.includes(a),
        msg: `Expected ${show(a)} to be one of ${show(list)}`,
        not: `Expected ${show(a)} not to be one of ${show(list)}`,
      }),
      toBeType: (a, t?: string) => ({
        pass: typeOf(a) === t,
        msg: `Expected ${show(a)} to be of type ${String(t)}, got ${typeOf(a)}`,
        not: `Expected value not to be of type ${String(t)}`,
      }),
      toHaveLength: (a, e?: number) => {
        const val = a as { length?: number } | null;
        if (val == null || typeof val.length !== 'number') {
          throw new Error(`Expected value to have a .length property, but got ${show(a)}`);
        }
        return {
          pass: val.length === e,
          msg: `Expected length ${show(e)} but got ${val.length}`,
          not: `Expected length not to be ${show(e)}`,
        };
      },
      toMatch: (a, pattern?: string | RegExp) => {
        if (typeof a !== 'string') {
          throw new Error(`toMatch requires a string value, got ${typeof a}`);
        }
        const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
        return {
          pass: re.test(a),
          msg: `Expected "${a}" to match ${re}`,
          not: `Expected "${a}" not to match ${re}`,
        };
      },
      toHaveProperty: (a, key?: string) => ({
        pass: a != null && typeof a === 'object' && String(key) in (a as Record<string, unknown>),
        msg: `Expected object to have property "${String(key)}"`,
        not: `Expected object not to have property "${String(key)}"`,
      }),
      toHaveStatus: (a, status?: number) => {
        const got = (a as { status?: number } | null)?.status;
        return {
          pass: got === status,
          msg: `Expected status ${show(status)} but got ${show(got)}`,
          not: `Expected status not to be ${show(status)}`,
        };
      },
      toMatchSchema: (a, schema?: Record<string, unknown>) => {
        const errors = validateJsonSchema(a, schema ?? {}, '');
        return {
          pass: errors.length === 0,
          msg: `Schema validation failed:\n  - ${errors.slice(0, 10).join('\n  - ')}`
            + `${errors.length > 10 ? `\n  ... and ${errors.length - 10} more` : ''}`,
          not: `Expected value not to match the schema`,
        };
      },
    };

    /** One matcher, bound to a value and a direction. */
    const bind = (actual: unknown, negated: boolean) => {
      const out: Record<string, (...args: never[]) => void> = {};
      for (const [name, fn] of Object.entries(MATCHERS)) {
        out[name] = (...args: never[]) => {
          const r = fn(actual, ...args);
          if (r.pass === negated) throw new Error(negated ? r.not : r.msg);
        };
      }
      return out;
    };

    const expect = (actual: unknown) => ({
      ...bind(actual, false),
      /** Every matcher above, inverted. `dk.expect(x).not.toBe(y)`. */
      not: bind(actual, true),
    });

    return {
      dk: { test, expect },
    };
  },
};

// ─── JSON Schema Validator (lightweight, no deps) ───────────────────────────

function validateJsonSchema(value: unknown, schema: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  const p = path || '$';

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!types.includes(actualType)) {
      errors.push(`${p}: expected type ${types.join('|')} but got ${actualType}`);
      return errors;
    }
  }

  if (schema.required && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const key of schema.required as string[]) {
      if (!(key in (value as Record<string, unknown>))) {
        errors.push(`${p}: missing required property "${key}"`);
      }
    }
  }

  if (schema.properties && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [key, propSchema] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) {
      if (key in (value as Record<string, unknown>)) {
        errors.push(...validateJsonSchema((value as Record<string, unknown>)[key], propSchema, `${p}.${key}`));
      }
    }
  }

  if (schema.items && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      errors.push(...validateJsonSchema(value[i], schema.items as Record<string, unknown>, `${p}[${i}]`));
    }
  }

  if (schema.minimum !== undefined && typeof value === 'number' && value < (schema.minimum as number)) {
    errors.push(`${p}: value ${value} is less than minimum ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && typeof value === 'number' && value > (schema.maximum as number)) {
    errors.push(`${p}: value ${value} is greater than maximum ${schema.maximum}`);
  }
  if (schema.minLength !== undefined && typeof value === 'string' && value.length < (schema.minLength as number)) {
    errors.push(`${p}: string length ${value.length} is less than minLength ${schema.minLength}`);
  }
  if (schema.maxLength !== undefined && typeof value === 'string' && value.length > (schema.maxLength as number)) {
    errors.push(`${p}: string length ${value.length} is greater than maxLength ${schema.maxLength}`);
  }
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) {
    errors.push(`${p}: value ${JSON.stringify(value)} not in enum [${(schema.enum as unknown[]).map(v => JSON.stringify(v)).join(', ')}]`);
  }

  return errors;
}
