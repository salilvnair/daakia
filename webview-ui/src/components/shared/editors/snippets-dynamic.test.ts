import { describe, it, expect } from 'vitest';
import { TEMPLATE_HELPERS } from '@daakia/template-catalog';
import { generatedDynamicSnippets, DYNAMIC_EXAMPLES } from './SnippetsPanel';

/*
  The dynamic-value snippets are generated from the shared catalogue and the
  registry the host sends, rather than written out. About a hundred entries
  copied by hand would describe whichever set existed on the day somebody
  last updated them.
*/
const DYNAMIC_VARS = [
  { name: 'randomUUID', description: 'A random UUID v4', category: 'identity' },
  { name: 'timestamp', description: 'Unix timestamp', category: 'datetime' },
];

describe('the Dynamic values snippets', () => {
  const generated = generatedDynamicSnippets(DYNAMIC_VARS);

  it('offers one per helper and one per dynamic value', () => {
    expect(generated).toHaveLength(TEMPLATE_HELPERS.length + DYNAMIC_VARS.length);
  });

  it('shows the call and runs it through the same engine a header uses', () => {
    const randomInt = generated.find(s => s.label === '{{randomInt 1 100}}');
    expect(randomInt).toBeDefined();
    expect(randomInt!.code).toBe('dk.interpolate("{{randomInt 1 100}}")');
  });

  it('escapes a quote rather than breaking the call it writes', () => {
    // Several examples carry single quotes; a double quote in one would end
    // the string the snippet inserts.
    for (const s of generated) {
      const inner = s.code.slice('dk.interpolate("'.length, -2);
      expect(inner.replace(/\\"/g, '')).not.toContain('"');
    }
  });

  it('files everything under one category', () => {
    for (const s of [...generated, ...DYNAMIC_EXAMPLES]) {
      expect(s.category).toBe('dynamic');
    }
  });

  it('gives every snippet a unique id', () => {
    const ids = [...generated, ...DYNAMIC_EXAMPLES].map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the three worked examples, which show a pattern rather than a value', () => {
    expect(DYNAMIC_EXAMPLES.map(s => s.label)).toEqual([
      'One random value, used twice',
      'Sign the request body',
      'A date inside a window',
    ]);
  });
});
