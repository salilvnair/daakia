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

  it('colours each entry by what it produces, not by the one category they share', () => {
    /*
      A hundred entries under one accent dot is a wall of grey — nothing to
      steer by while scanning. The colour comes from the helper's own category
      (dates green, JSON yellow), using the same map the wiki page reads, so
      the two surfaces agree about what `{{now}}` looks like.
    */
    const byLabel = (label: string) => generated.find(s => s.label === label)!;
    const date = byLabel("{{now format='yyyy-MM-dd HH:mm:ss'}}").tint;
    const json = byLabel("{{toJson 'a'}}").tint;
    expect(date).toBeTruthy();
    expect(json).toBeTruthy();
    expect(date).not.toBe(json);
  });

  it('marks the generated ones as tokens, and the worked examples as prose', () => {
    // A template is one thing to read, not a sentence — it is drawn as the
    // token it inserts. "Sign the request body" is a sentence.
    expect(generated.every(s => s.token)).toBe(true);
    expect(DYNAMIC_EXAMPLES.every(s => !s.token)).toBe(true);
  });

  it('gives a dynamic value a colour even for a category this build has never seen', () => {
    // The registry list arrives from the host at runtime; a provider added
    // there should not render colourless until the webview is edited to match.
    const [only] = generatedDynamicSnippets([
      { name: 'somethingNew', description: 'x', category: 'not-a-known-category' },
    ]);
    expect(only.tint).toBeTruthy();
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
