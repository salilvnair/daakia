import { describe, it, expect } from 'vitest';
import {
  openBraces, closesAlready, suggestionsFor, applySuggestion, type VarSources,
} from './var-suggest';

const SOURCES: VarSources = {
  env: [
    { key: 'base-url', value: 'https://api.example.com' },
    { key: 'bearer-token', value: 'tok-123', isSecret: true },
  ],
  collection: [{ key: 'tenant', value: 'acme' }],
  dynamic: [
    { name: 'randomUUID', description: 'A random UUID v4', category: 'identity' },
    { name: 'timestamp', description: 'Unix timestamp in seconds', category: 'datetime' },
  ],
  helpers: [
    { name: 'randomInt', signature: 'randomInt min max', summary: 'A whole number in a range.', category: 'random' },
    { name: 'now', signature: 'now', summary: 'The current time.', category: 'date' },
  ],
};

describe('knowing the caret is inside a {{', () => {
  it('finds the braces and what has been typed since', () => {
    expect(openBraces('Bearer {{bea')).toEqual({ start: 7, query: 'bea' });
    expect(openBraces('{{')).toEqual({ start: 0, query: '' });
  });

  it('is not fooled by a pair that is already finished', () => {
    expect(openBraces('{{base-url}}/orders')).toBeNull();
    expect(openBraces('{{a}} {{b')).toEqual({ start: 6, query: 'b' });
  });

  it('gives up at a newline', () => {
    // Otherwise a stray `{{` near the top of a JSON body would leave the list
    // open for the rest of the document, filtering on everything typed after.
    expect(openBraces('{\n  "a": "{{x')).toEqual({ start: 10, query: 'x' });
    expect(openBraces('{{\n  "a": 1')).toBeNull();
  });

  it('knows when the closing braces are already there', () => {
    expect(closesAlready('}}')).toBe(true);
    expect(closesAlready('}}/orders')).toBe(true);
    expect(closesAlready('/orders')).toBe(false);
  });
});

describe('what {{ offers', () => {
  it('offers everything when nothing has been typed', () => {
    const all = suggestionsFor('', SOURCES);
    expect(all.map(s => s.label)).toEqual([
      'tenant', 'base-url', 'bearer-token', '$randomUUID', '$timestamp', 'randomInt', 'now',
    ]);
  });

  it('puts your own variables ahead of the built-in ones', () => {
    /*
      A list that opens with sixty dynamic values above the environment's own
      `base-url` is a list nobody looks at twice.
    */
    const first = suggestionsFor('', SOURCES)[0];
    expect(first.group).toBe('Collection');
    expect(suggestionsFor('', SOURCES)[1].group).toBe('Environment');
  });

  it('matches a prefix before a substring before scattered letters', () => {
    expect(suggestionsFor('random', SOURCES).map(s => s.label))
      .toEqual(['randomInt', '$randomUUID']);
    // rIn → randomInt, the way an editor's fuzzy match works.
    expect(suggestionsFor('rin', SOURCES).map(s => s.label)).toContain('randomInt');
  });

  it('finds a hyphenated name by its second word', () => {
    expect(suggestionsFor('token', SOURCES).map(s => s.label)).toEqual(['bearer-token']);
  });

  it('never shows a secret value, only that it is one', () => {
    const secret = suggestionsFor('bearer', SOURCES)[0];
    expect(secret.kind).toBe('secret');
    expect(secret.detail).toBe('secret');
    expect(secret.detail).not.toContain('tok-123');
  });

  it('shows a plain variable its value, shortened', () => {
    expect(suggestionsFor('base', SOURCES)[0].detail).toBe('https://api.example.com');
    const long = suggestionsFor('x', {
      ...SOURCES, env: [{ key: 'x', value: 'y'.repeat(100) }], collection: [], dynamic: [], helpers: [],
    })[0];
    expect(long.detail.length).toBeLessThanOrEqual(46);
    expect(long.detail.endsWith('…')).toBe(true);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(suggestionsFor('zzzz', SOURCES)).toEqual([]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ key: `v${i}`, value: '1' }));
    expect(suggestionsFor('', { ...SOURCES, env: many }, 10)).toHaveLength(10);
  });
});

describe('putting one into the field', () => {
  const pick = (label: string) => suggestionsFor(label, SOURCES).find(s => s.label === label)!;

  it('replaces what was typed after the braces and closes them', () => {
    expect(applySuggestion('Bearer {{bea', 12, pick('bearer-token')))
      .toEqual({ value: 'Bearer {{bearer-token}}', caret: 21 });
  });

  it('does not add a second pair when they are already closed', () => {
    // Typing inside an existing {{}} is the common case — editing a variable
    // you already wrote — and `{{name}}}}` is the obvious way to get it wrong.
    expect(applySuggestion('{{bea}}/orders', 5, pick('bearer-token')))
      .toEqual({ value: '{{bearer-token}}/orders', caret: 14 });
  });

  it('keeps the rest of the line and leaves the caret in the middle of it', () => {
    const out = applySuggestion('https://{{ho/orders', 12, {
      label: 'base-url', insert: 'base-url', detail: '', kind: 'variable', group: 'Environment',
    });
    expect(out.value).toBe('https://{{base-url}}/orders');
    expect(out.value.slice(0, out.caret)).toBe('https://{{base-url');
  });

  it('leaves the caret inside a helper that still needs its arguments', () => {
    /*
      `{{randomInt }}` with the caret after the closing brace means deleting
      your way back in to type the bounds.
    */
    const out = applySuggestion('{{rand', 6, pick('randomInt'));
    expect(out.value).toBe('{{randomInt }}');
    expect(out.caret).toBe('{{randomInt '.length);
  });

  it('puts the caret after a helper that takes none', () => {
    const out = applySuggestion('{{no', 4, pick('now'));
    expect(out.value).toBe('{{now}}');
    expect(out.caret).toBe('{{now'.length);
  });

  it('does nothing when the caret is not inside braces at all', () => {
    const before = { value: 'plain text', caret: 4 };
    expect(applySuggestion(before.value, before.caret, pick('now'))).toEqual(before);
  });
});
