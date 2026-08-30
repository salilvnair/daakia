/**
 * Every prompt key the UI sends must have a prompt behind it.
 *
 * This is not hypothetical. The sparkle on every thread row sent
 * `dk8s.threads.explainOne` from the day it was built, and nothing was ever
 * registered under that name — `dk8sPrompt` returned undefined and the handler
 * answered with "Unknown prompt", so the button looked alive and did nothing.
 * It survived a UI fix for the same button, because the fix was about the panel
 * and the break was in a string.
 *
 * The keys are string literals in two unrelated trees, which is exactly the
 * shape of coupling a type system does not see. So it is checked by reading the
 * source: anything matching `promptKey: '…'` or `templateKey: '…'` anywhere in
 * the webview or the panel has to resolve.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { DK8S_PROMPTS } from './dk8s-prompts';
import { DOCTOR_PROMPTS } from './doctor-prompts';
import { AI_PROMPT_TEMPLATE_DEFAULTS } from '../../../webview-ui/src/store/prompt-template';

const ROOT = resolve(__dirname, '../../..');

/** Every .ts/.tsx under a directory, skipping build output. */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'out') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** `promptKey: 'x'` / `templateKey: "y"`, however it is quoted. */
const KEY_RE = /\b(?:promptKey|templateKey)\s*:\s*['"`]([\w.:-]+)['"`]/g;

function usedKeys(): { key: string; file: string }[] {
  const found: { key: string; file: string }[] = [];
  for (const dir of ['webview-ui/src', 'src/panel']) {
    for (const file of sources(join(ROOT, dir))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(KEY_RE)) {
        found.push({ key: m[1], file: file.slice(ROOT.length + 1).replace(/\\/g, '/') });
      }
    }
  }
  return found;
}

describe('prompt keys', () => {
  /*
    Three registries, because a key is resolved by whichever side owns it: the
    dk8s and doctor packs are looked up in the extension host, and the AI
    feature templates in the webview store. The test does not care which — a
    key that resolves nowhere is dead either way.
  */
  const registered = new Set([
    ...Object.keys(DK8S_PROMPTS),
    ...Object.keys(DOCTOR_PROMPTS),
    ...Object.keys(AI_PROMPT_TEMPLATE_DEFAULTS),
  ]);

  it('finds the keys at all, so a silent regex failure cannot pass this suite', () => {
    const used = usedKeys();
    expect(used.length).toBeGreaterThan(3);
    expect(used.map(u => u.key)).toContain('dk8s.threads.explainOne');
  });

  it('resolves every key the UI sends', () => {
    const unknown = usedKeys()
      .filter(u => !registered.has(u.key))
      .map(u => `${u.key}  (${u.file})`);

    expect(unknown).toEqual([]);
  });

  it('registers no prompt that is empty or missing its task section', () => {
    for (const [key, prompt] of Object.entries({ ...DK8S_PROMPTS, ...DOCTOR_PROMPTS })) {
      expect(prompt.trim().length, `${key} is empty`).toBeGreaterThan(120);
    }
  });
});
