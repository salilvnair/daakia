/**
 * Core Provider: Test & Assertions
 *
 * Contributes: dk.test(), dk.expect()
 *
 * - dk.test(name, fn): Run a named test assertion block
 * - dk.expect(value): Chainable assertion API (toBe, toEqual, toContain, etc.)
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

    const expect = (actual: unknown) => ({
      toBe: (expected: unknown) => {
        if (actual !== expected) {
          throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
        }
      },
      toEqual: (expected: unknown) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
        }
      },
      toBeTruthy: () => {
        if (!actual) throw new Error(`Expected ${JSON.stringify(actual)} to be truthy`);
      },
      toBeFalsy: () => {
        if (actual) throw new Error(`Expected ${JSON.stringify(actual)} to be falsy`);
      },
      toContain: (expected: unknown) => {
        if (typeof actual === 'string' && typeof expected === 'string') {
          if (!actual.includes(expected)) throw new Error(`Expected "${actual}" to contain "${expected}"`);
        } else if (Array.isArray(actual)) {
          if (!actual.includes(expected)) throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
        } else {
          throw new Error(`toContain requires a string or array`);
        }
      },
      toBeGreaterThan: (expected: number) => {
        if (typeof actual !== 'number' || actual <= expected) {
          throw new Error(`Expected ${actual} to be greater than ${expected}`);
        }
      },
      toBeLessThan: (expected: number) => {
        if (typeof actual !== 'number' || actual >= expected) {
          throw new Error(`Expected ${actual} to be less than ${expected}`);
        }
      },
      toHaveLength: (expected: number) => {
        const val = actual as { length?: number };
        if (val == null || typeof val.length !== 'number') {
          throw new Error(`Expected value to have a .length property, but got ${JSON.stringify(actual)}`);
        }
        if (val.length !== expected) {
          throw new Error(`Expected length ${expected} but got ${val.length}`);
        }
      },
      toMatch: (pattern: string | RegExp) => {
        if (typeof actual !== 'string') {
          throw new Error(`toMatch requires a string value, got ${typeof actual}`);
        }
        const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
        if (!re.test(actual)) {
          throw new Error(`Expected "${actual}" to match ${re}`);
        }
      },
      toHaveProperty: (key: string) => {
        if (actual == null || typeof actual !== 'object' || !(key in (actual as Record<string, unknown>))) {
          throw new Error(`Expected object to have property "${key}"`);
        }
      },
      toHaveStatus: (status: number) => {
        const s = (actual as { status?: number })?.status;
        if (s !== status) throw new Error(`Expected status ${status} but got ${s}`);
      },
      toMatchSchema: (schema: Record<string, unknown>) => {
        const errors = validateJsonSchema(actual, schema, '');
        if (errors.length > 0) {
          throw new Error(`Schema validation failed:\n  - ${errors.slice(0, 10).join('\n  - ')}${errors.length > 10 ? `\n  ... and ${errors.length - 10} more` : ''}`);
        }
      },
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
