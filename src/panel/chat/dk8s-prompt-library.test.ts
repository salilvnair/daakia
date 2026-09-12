/**
 * The Prompt Library has to show what is actually sent.
 *
 * It did not. The dk8s prompts were registered as user prompts, but the text
 * in them is what the handler passes as the SYSTEM prompt — so the library
 * showed the instruction block under "User" and an empty "System" tab, and the
 * user template that actually carries the evidence was not in the library at
 * all because it was being concatenated inline in the handler.
 *
 * The failure mode is nasty because both halves look fine on their own: the
 * feature works, the library renders, and the only symptom is that the page
 * describing the prompt describes a different prompt. So it is pinned here —
 * both halves, registered under the keys the library derives, holding the same
 * text the host resolves.
 */
import { describe, it, expect } from 'vitest';
import {
  DK8S_PROMPTS, DK8S_USER_PROMPTS, DK8S_USER_VARIABLES, renderDk8sUserPrompt,
} from './dk8s-prompts';
import {
  AI_PROMPT_TEMPLATE_DEFAULTS, AI_PROMPT_TEMPLATE_LABELS,
  AI_PROMPT_TEMPLATE_VARIABLES, AI_TEMPLATE_CATEGORIES, AI_TEMPLATE_COLORS,
} from '../../../webview-ui/src/store/prompt-template';

const KEYS = Object.keys(DK8S_PROMPTS);

/** The library derives the system key this way — see toSystemKey. */
const systemKey = (k: string) => `${k}.system`;

describe('dk8s prompts in the Prompt Library', () => {
  it('registers every prompt the host can resolve', () => {
    for (const key of KEYS) {
      expect(AI_PROMPT_TEMPLATE_DEFAULTS, key).toHaveProperty(key);
      expect(AI_PROMPT_TEMPLATE_DEFAULTS, systemKey(key)).toHaveProperty(systemKey(key));
    }
  });

  /*
    The one that was wrong. `DK8S_PROMPTS[key]` is passed to the model as the
    system prompt, so it has to be what the library's System tab reads.
  */
  it('puts the instruction block in the system slot, not the user slot', () => {
    for (const key of KEYS) {
      expect(AI_PROMPT_TEMPLATE_DEFAULTS[systemKey(key) as never], key)
        .toBe(DK8S_PROMPTS[key]);
      expect(AI_PROMPT_TEMPLATE_DEFAULTS[key as never], key)
        .toBe(DK8S_USER_PROMPTS[key]);
    }
  });

  it('does not leave a system prompt empty', () => {
    for (const key of KEYS) {
      expect(String(AI_PROMPT_TEMPLATE_DEFAULTS[systemKey(key) as never]).trim(), key)
        .not.toBe('');
    }
  });

  it('writes variables with braces, the way every other entry does', () => {
    // The library pastes these at the cursor verbatim; a bare name would
    // insert a word the renderer never substitutes.
    for (const v of DK8S_USER_VARIABLES) expect(v).toMatch(/^\{\w+\}$/);
  });

  it('offers the variables the user template actually interpolates', () => {
    for (const key of KEYS) {
      expect(AI_PROMPT_TEMPLATE_VARIABLES[key as never], key)
        .toEqual(DK8S_USER_VARIABLES);
      // Instructions take no variables, matching every other `.system` entry.
      expect(AI_PROMPT_TEMPLATE_VARIABLES[systemKey(key) as never], key).toEqual([]);
    }
  });

  it('names and colours both halves', () => {
    for (const key of KEYS) {
      for (const k of [key, systemKey(key)]) {
        expect(AI_PROMPT_TEMPLATE_LABELS[k as never], k).toBeTruthy();
        expect(AI_TEMPLATE_COLORS[k as never], k).toBeTruthy();
      }
    }
  });

  it('lists exactly the host registry under the dk8s category', () => {
    const cat = AI_TEMPLATE_CATEGORIES.find(c => c.id === 'dk8s');
    expect(cat).toBeDefined();
    expect([...cat!.keys].sort()).toEqual([...KEYS].sort());
  });

  /*
    Every variable the template names must be one the handler supplies.
    A `{podName}` that nothing fills renders as the literal text `{podName}`
    and goes to the model exactly like that.
  */
  it('uses only variables the handler passes', () => {
    for (const key of KEYS) {
      const named = [...DK8S_USER_PROMPTS[key]!.matchAll(/\{\w+\}/g)].map(m => m[0]);
      for (const v of named) expect(DK8S_USER_VARIABLES, `${key} → ${v}`).toContain(v);
    }
  });
});

describe('renderDk8sUserPrompt', () => {
  const full = {
    podContext: 'pod: api-1\nrestarts: 14',
    label: 'SELECTED LOG (3 lines)',
    evidence: 'line one\nline two',
    question: 'why does it restart?',
  };

  it('produces the block layout the handler used to build by hand', () => {
    expect(renderDk8sUserPrompt(DK8S_USER_PROMPTS['dk8s.log.askWhy']!, full)).toBe(
      '━━━ POD ━━━\npod: api-1\nrestarts: 14\n\n'
      + '━━━ SELECTED LOG (3 lines) ━━━\nline one\nline two\n\n'
      + '━━━ THE DEVELOPER ASKS ━━━\nwhy does it restart?',
    );
  });

  /*
    The old code dropped these blocks with `&&` in an array. A template cannot,
    so the renderer has to — otherwise a pod with no context and no typed
    question sends two headers with nothing under them.
  */
  it('drops a block whose body came out empty', () => {
    const out = renderDk8sUserPrompt(DK8S_USER_PROMPTS['dk8s.log.askWhy']!,
      { ...full, podContext: '', question: '' });
    expect(out).toBe('━━━ SELECTED LOG (3 lines) ━━━\nline one\nline two');
    expect(out).not.toContain('POD');
    expect(out).not.toContain('DEVELOPER ASKS');
  });

  it('keeps a block whose body is only whitespace out of the result', () => {
    expect(renderDk8sUserPrompt('━━━ A ━━━\n{x}', { x: '   \n  ' })).toBe('');
  });

  it('leaves an unknown placeholder alone rather than blanking it', () => {
    // Blanking would silently delete text someone typed into the library.
    expect(renderDk8sUserPrompt('hello {nope}', { x: '1' })).toBe('hello {nope}');
  });

  it('substitutes the individual pod fields when a template uses them', () => {
    expect(renderDk8sUserPrompt('{pod} in {namespace}', { pod: 'api-1', namespace: 'prod' }))
      .toBe('api-1 in prod');
  });
});
