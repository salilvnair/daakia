import { describe, it, expect } from 'vitest';
import { formatJsonWithTemplates, findTemplates } from './format-json';

describe('prettifying a body with templates in it', () => {
  it('formats ordinary JSON', () => {
    expect(formatJsonWithTemplates('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('keeps a template that is inside a string', () => {
    // The reported body: every template quoted, one long line.
    const out = formatJsonWithTemplates('{"env":"{{e-1}}","glob":"{{g-1}}"}');
    expect(out).toBe('{\n  "env": "{{e-1}}",\n  "glob": "{{g-1}}"\n}');
  });

  it('formats around a template standing bare in a value position', () => {
    /*
      No JSON parser will ever accept this, and formatting is exactly when
      you want the template there — you are tidying a request you are still
      writing.
    */
    expect(formatJsonWithTemplates('{"n": {{randomInt 1 9}}}'))
      .toBe('{\n  "n": {{randomInt 1 9}}\n}');
  });

  it('does not turn a bare template into a string', () => {
    // The stand-in went in quoted so the document would parse; the quotes
    // have to come back out with it.
    const out = formatJsonWithTemplates('{"n":{{x}},"s":"{{y}}"}')!;
    expect(out).toContain('"n": {{x}}');
    expect(out).toContain('"s": "{{y}}"');
  });

  it('handles several, mixed, in one body', () => {
    const out = formatJsonWithTemplates(
      '{"id":"{{$randomUUID}}","n":{{randomInt 1 9}},"u":"https://{{host}}/v1/{{id}}"}',
    )!;
    expect(out).toContain('"id": "{{$randomUUID}}"');
    expect(out).toContain('"n": {{randomInt 1 9}}');
    expect(out).toContain('"u": "https://{{host}}/v1/{{id}}"');
    expect(out.split('\n')).toHaveLength(5);
  });

  it('copes with a template that carries quotes of its own', () => {
    /*
      Reading through a template rather than stepping over it was the version
      that decided the body had an unterminated string.
    */
    const out = formatJsonWithTemplates(`{"p": {{pickRandom 'a' "b"}}}`)!;
    expect(out).toContain(`"p": {{pickRandom 'a' "b"}}`);
  });

  it('leaves a genuinely broken body alone', () => {
    // A missing comma is a real problem and the text should not be mangled
    // in the name of tidying it.
    expect(formatJsonWithTemplates('{"a":"{{x}}" "b":1}')).toBeNull();
    expect(formatJsonWithTemplates('{"a": ')).toBeNull();
    expect(formatJsonWithTemplates('')).toBeNull();
  });

  it('refuses a half-typed template rather than rewriting it', () => {
    expect(formatJsonWithTemplates('{"a": "{{x"}')).toBeNull();
    expect(findTemplates('{"a": "{{\n"}')).toBeNull();
  });

  it('refuses text that already contains the placeholder', () => {
    expect(formatJsonWithTemplates('{"a":"__DK_TPL_0__","b":"{{x}}"}')).toBeNull();
  });

  it('takes the indent it is given', () => {
    expect(formatJsonWithTemplates('{"a":1}', 4)).toBe('{\n    "a": 1\n}');
  });
});

describe('finding the templates', () => {
  it('knows which are inside a string', () => {
    const scan = findTemplates('{"a":"{{x}}","b":{{y}}}')!;
    expect(scan.found.map(f => f.inString)).toEqual([true, false]);
    expect(scan.found.map(f => f.text)).toEqual(['{{x}}', '{{y}}']);
  });

  it('is not fooled by an escaped quote', () => {
    const scan = findTemplates('{"a":"he said \\" {{x}}"}')!;
    expect(scan.found[0].inString).toBe(true);
  });

  it('produces text that parses', () => {
    const scan = findTemplates('{"n": {{randomInt 1 9}}, "s": "{{x}}"}')!;
    expect(() => JSON.parse(scan.masked)).not.toThrow();
  });
});
