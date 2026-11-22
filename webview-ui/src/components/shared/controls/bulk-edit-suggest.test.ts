import { describe, it, expect } from 'vitest';
import { applySuggestion, buildUsedHeaders, suggestFor } from './bulk-edit-suggest';

const none = buildUsedHeaders([]);

describe('bulk edit suggestions', () => {
  it('offers whole Key: value lines for a header being typed', () => {
    const text = 'cont';
    const got = suggestFor(text, text.length, none);
    expect(got[0]).toMatchObject({ key: 'Content-Type', value: 'application/json' });
    expect(got.every(s => s.key.toLowerCase().includes('cont'))).toBe(true);
  });

  it('puts the user\'s own headers and values first', () => {
    const used = buildUsedHeaders([{ key: 'X-Tenant-Id', value: 'acme' }, { key: 'Content-Type', value: 'text/csv' }]);
    expect(suggestFor('x-ten', 5, used)[0]).toMatchObject({ key: 'X-Tenant-Id', value: 'acme', used: true });
    expect(suggestFor('Content-Type', 12, used)[0]).toMatchObject({ value: 'text/csv', used: true });
  });

  it('after the colon offers only values for that key', () => {
    const text = 'Accept: app';
    const got = suggestFor(text, text.length, none);
    expect(got.length).toBeGreaterThan(0);
    expect(got.every(s => s.key === 'Accept' && s.valueOnly && s.value!.includes('app'))).toBe(true);
  });

  it('does not offer a key already written on another line', () => {
    const text = 'Content-Type: application/json\ncontent-t';
    expect(suggestFor(text, text.length, none).some(s => s.key === 'Content-Type')).toBe(false);
  });

  it('replaces the whole line and keeps a disabled mark', () => {
    const text = 'Accept: */*\n# auth\nX-A: 1';
    const caret = 'Accept: */*\n# auth'.length;
    const out = applySuggestion(text, caret, { key: 'Authorization', value: 'Bearer ' });
    expect(out.text).toBe('Accept: */*\n# Authorization: Bearer \nX-A: 1');
    expect(out.caret).toBe('Accept: */*\n# Authorization: Bearer '.length);
  });

  it('offers nothing on an empty line', () => {
    expect(suggestFor('Accept: */*\n', 12, none)).toEqual([]);
  });
});
