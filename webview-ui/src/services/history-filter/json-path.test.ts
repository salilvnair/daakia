import { describe, it, expect } from 'vitest';
import { parsePath, queryPath, asText } from './json-path';

function run(path: string, root: unknown): unknown[] {
  const parsed = parsePath(path);
  expect(parsed, `"${path}" should parse`).toBeDefined();
  return queryPath(root, parsed!);
}

const ORDER = {
  orderId: 'A-17',
  total: 9900,
  customer: { id: 4, name: 'Nadia' },
  items: [
    { sku: 'PEN-1', qty: 2 },
    { sku: 'PAD-3', qty: 1 },
  ],
};

describe('the half of JSONPath people type', () => {
  it('walks plain keys', () => {
    expect(run('$.orderId', ORDER)).toEqual(['A-17']);
    expect(run('$.customer.name', ORDER)).toEqual(['Nadia']);
  });

  it('does not insist on the dollar', () => {
    // Somebody who typed `customer.name` meant the same path.
    expect(run('customer.name', ORDER)).toEqual(['Nadia']);
  });

  it('indexes and wildcards arrays', () => {
    expect(run('$.items[0].sku', ORDER)).toEqual(['PEN-1']);
    expect(run('$.items[*].sku', ORDER)).toEqual(['PEN-1', 'PAD-3']);
  });

  it('counts back from the end', () => {
    expect(run('$.items[-1].sku', ORDER)).toEqual(['PAD-3']);
  });

  it('treats a key on an array as that key on every element', () => {
    // `items.sku` is the short form, and it is what people write.
    expect(run('$.items.sku', ORDER)).toEqual(['PEN-1', 'PAD-3']);
  });

  it('finds a key at any depth', () => {
    expect(run('$..sku', ORDER)).toEqual(['PEN-1', 'PAD-3']);
    expect(run('$..name', { a: { b: { name: 'deep' } } })).toEqual(['deep']);
  });

  it('accepts bracketed and quoted keys, which is the only way to say content-type', () => {
    expect(run("$['content-type']", { 'content-type': 'json' })).toEqual(['json']);
  });

  it('returns nothing for a path that goes nowhere, rather than undefined', () => {
    expect(run('$.missing.deeper', ORDER)).toEqual([]);
  });

  it('refuses a path it cannot run instead of matching nothing quietly', () => {
    // The difference matters: the panel says "not a path" rather than "0 rows".
    expect(parsePath('$.items[?(@.qty>1)]')).toBeUndefined();
    expect(parsePath('$.[')).toBeUndefined();
    expect(parsePath('   ')).toBeUndefined();
  });

  it('keeps a real null apart from a missing key', () => {
    expect(run('$.a', { a: null })).toEqual([null]);
    expect(asText(null)).toBe('null');
    expect(asText(undefined)).toBe('');
  });

  it('serialises an object so contains can still look inside it', () => {
    expect(asText({ a: 1 })).toBe('{"a":1}');
    expect(asText(200)).toBe('200');
  });
});
