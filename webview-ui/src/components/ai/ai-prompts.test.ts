import { describe, it, expect } from 'vitest';
import { fuzzy, withPlaceholders, logPrompts, BUILD_PROMPTS } from './ai-prompts';

describe('finding a prompt by what you type after /', () => {
  it('ranks a match in one piece above one spread across the label', () => {
    const trace = fuzzy('Trace a failed request', 'tr')!;
    const thread = fuzzy('Follow a thread', 'tr')!;
    expect(trace.score).toBeGreaterThan(thread.score);
    expect(trace.marks).toEqual([0, 1]);
  });

  it('says no when the letters are not there in order', () => {
    expect(fuzzy('Find timeouts', 'zq')).toBeUndefined();
  });

  it('matches everything on an empty query', () => {
    expect(fuzzy('anything', '')).toEqual({ score: 0, marks: [] });
  });
});

describe('placeholders', () => {
  it('splits a template into text and the parts to fill', () => {
    expect(withPlaceholders('{requestId} failed calling {api}.')).toEqual([
      { text: 'requestId', ph: true }, { text: ' failed calling ', ph: false }, { text: 'api', ph: true }, { text: '.', ph: false },
    ]);
  });
});

describe('the prompts on offer', () => {
  it('uses an edited template over the default', () => {
    const edited = logPrompts({ 'dk8s.chat.trace': 'my own words for {requestId}' });
    expect(edited.find(p => p.id === 'trace')!.text).toBe('my own words for {requestId}');
  });

  it('keeps Build prompts free of placeholders, so a click can send them', () => {
    for (const p of BUILD_PROMPTS) expect(p.text, p.id).not.toMatch(/\{\w+\}/);
  });
});
