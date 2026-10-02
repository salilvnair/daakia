/**
 * Every Prompt Library entry is whole: a system prompt (the instruction to the
 * agent), a user prompt (the values of one call), and a line saying where in
 * Daakia it is used. An entry missing any of the three is an entry somebody
 * cannot edit with confidence — which is how "Ask the logs — system" came to
 * show an empty System tab.
 */
import { describe, it, expect } from 'vitest';
import {
  AI_TEMPLATE_CATEGORIES, AI_PROMPT_TEMPLATE_DEFAULTS, systemKeyFor, whereUsed,
  ALL_AGENT_SCENARIOS, getDefaultSystemPrompt, getDefaultUserPrompt, SCENARIO_GATES,
  type AiPromptTemplateKey,
} from './prompt-template';
import { TEMPLATE_TO_FEATURE_KEY } from './ai-feature-map';
import { AI_FEATURE_LABELS } from './ai-features-store';

const entries = AI_TEMPLATE_CATEGORIES.flatMap(c => c.keys.map(k => ({ cat: c.id, key: k as AiPromptTemplateKey })));

describe('every template in the library', () => {
  it.each(entries)('$key has a system prompt, a user prompt and a where-used line', ({ key }) => {
    const sk = systemKeyFor(key);
    expect(sk, 'system key').toBeDefined();
    expect((AI_PROMPT_TEMPLATE_DEFAULTS[sk!] ?? '').trim(), 'system prompt').not.toBe('');
    expect((AI_PROMPT_TEMPLATE_DEFAULTS[key] ?? '').trim(), 'user prompt').not.toBe('');
    const flag = TEMPLATE_TO_FEATURE_KEY[key];
    expect(whereUsed(key, flag ? AI_FEATURE_LABELS[flag]?.gates : undefined), 'where used').toBeTruthy();
  });

  it('never lists a system prompt as an entry of its own', () => {
    expect(entries.filter(e => e.key.endsWith('.system')).map(e => e.key)).toEqual([]);
  });
});

describe('every agent prompt', () => {
  it.each(ALL_AGENT_SCENARIOS)('%s has an instruction, the call\'s values, and a where-used line', (s) => {
    expect(getDefaultSystemPrompt(s).trim()).not.toBe('');
    expect(getDefaultUserPrompt(s).trim()).not.toBe('');
    expect(SCENARIO_GATES[s]).toBeTruthy();
  });
});
