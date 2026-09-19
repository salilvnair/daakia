import { describe, it, expect } from 'vitest';
import { sanitiseTemplates, parsesWithoutTemplates } from './monaco-var-markers';

describe('deciding whether a template is why the JSON is broken', () => {
  it('accepts a template bare in a value position', () => {
    // The reported case. `"n": {{randomInt 1 9}}` produced two markers, one
    // of them under a closing brace with nothing wrong with it.
    expect(parsesWithoutTemplates('{\n  "n": {{randomInt 1 9}}\n}')).toBe(true);
  });

  it('accepts one inside a string, whole or part', () => {
    expect(parsesWithoutTemplates('{"who": "{{base-url}}"}')).toBe(true);
    expect(parsesWithoutTemplates('{"u": "https://{{host}}/v1/{{id}}"}')).toBe(true);
  });

  it('accepts several, of different lengths, on one line', () => {
    expect(parsesWithoutTemplates('{"a": {{$randomUUID}}, "b": {{randomInt 1 9}}}')).toBe(true);
  });

  it('still says no when the JSON is genuinely broken', () => {
    /*
      The whole point of asking rather than filtering: a missing comma has to
      keep its marker, and the marker Monaco reported is the accurate one.
    */
    expect(parsesWithoutTemplates('{\n  "a": "{{x}}"\n  "b": 1\n}')).toBe(false);
    expect(parsesWithoutTemplates('{"a": {{x}}')).toBe(false);
    expect(parsesWithoutTemplates('{"a": "{{x}}",}')).toBe(false);
  });

  it('leaves text with no template to the language service', () => {
    expect(parsesWithoutTemplates('{"a": 1}')).toBe(true);
    expect(parsesWithoutTemplates('{"a": }')).toBe(false);
  });
});

describe('the stand-in', () => {
  it('is exactly as long as what it replaces', () => {
    // Same length means nothing after it moves, so a marker the service
    // reports on the real text still points where it pointed.
    for (const t of ['{{x}}', '{{$randomUUID}}', "{{randomDate '-30d' 'now'}}"]) {
      expect(sanitiseTemplates(t)).toHaveLength(t.length);
    }
  });

  it('is digits, so it works quoted and bare', () => {
    /*
      A quoted stand-in would close a string it was standing inside:
      `"{{host}}"` would become `""xxxx""`, which is two strings side by side.
      A number is valid in a value position and invisible inside a string.
    */
    expect(sanitiseTemplates('{{ab}}')).toBe('111111');
    expect(sanitiseTemplates('"{{ab}}"')).toBe('"111111"');
  });

  it('leaves everything else alone', () => {
    expect(sanitiseTemplates('{"a": 1}')).toBe('{"a": 1}');
    // A lone brace pair is not a template and must not be rewritten.
    expect(sanitiseTemplates('{}')).toBe('{}');
  });

  it('does not run across a line break', () => {
    // An unclosed `{{` should stay unclosed rather than swallowing the file.
    const text = '{\n  "a": "{{\n  "b": 1\n}';
    expect(sanitiseTemplates(text)).toBe(text);
  });
});
