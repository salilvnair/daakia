/**
 * Every AI call carries a system prompt.
 *
 * The workspace documentation generator did not. Its template and the
 * template's `.system` half had been registered in the library the whole
 * time — the component simply ignored both, building its own user prompt in a
 * local function and sending no system prompt at all. So the audit read
 * "System Prompt — empty", and editing the template in settings changed
 * nothing that reached the model.
 *
 * A reviewer cannot catch that by reading one file, because it is an absence.
 * This reads every call site instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { sources(p, out); continue; }
    if (!/\.tsx?$/.test(name) || /\.test\./.test(name)) continue;
    out.push(p);
  }
  return out;
}

/** Block and line comments out, so a documented example is not a call site. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\r\n]*/g, '$1');
}

/** The object literal passed to one `sendAiRequest({ … })`, brace-balanced. */
function callObjects(text: string): string[] {
  const out: string[] = [];
  const re = /sendAiRequest\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    /* `RegExpExecArray` has no `end`; the brace is the last character of the
       match. Getting that wrong made every call site look empty, and the test
       failed on all 56 — which is at least the right way round for a mistake
       in a test to fail. */
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let i = open;
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) break;
    }
    out.push(text.slice(open, i + 1));
  }
  return out;
}

describe('sendAiRequest call sites', () => {
  /*
    Comments stripped first. `DaakiaVsCodeBridge` documents the protocol with
    a literal `sendAiRequest({ stage, screen, tabId, ... })` in its header, and
    a prose example is not a call site.
  */
  const calls = sources(SRC)
    .flatMap(file => callObjects(stripComments(readFileSync(file, 'utf8')))
      .map(block => ({ file, block })))
    /* `ai-client` re-dispatches with `...options`, which is where the caller's
       own `systemPrompts` already is. Forwarding is not a second call. */
    .filter(c => !c.block.includes('...options'));

  it('finds the call sites at all, so a passing run means something', () => {
    expect(calls.length).toBeGreaterThan(40);
  });

  it('every one of them sends a system prompt', () => {
    const missing = calls
      .filter(c => !c.block.includes('systemPrompts'))
      .map(c => {
        const stage = /stage:\s*'([^']+)'/.exec(c.block)?.[1] ?? '(no stage)';
        return `${stage} — ${c.file.split(/[\\/]/).pop()}`;
      });
    expect(missing).toEqual([]);
  });

});
