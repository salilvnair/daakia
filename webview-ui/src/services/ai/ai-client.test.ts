/**
 * The one door stays the only door.
 *
 * Every AI feature used to build its own `ai:send` message. That is how four
 * modals shipped posting `reqId`, `systemPrompt` and `messages` — none of
 * which the host reads — so their buttons spun forever and answered nothing,
 * and how the audit trail came to have no AI in it at all.
 *
 * The behavioural tests below pin the contract. The source scans are the part
 * that keeps it true a year from now: a new feature that posts `ai:send` by
 * hand, or names a stage the audit has never heard of, fails here rather than
 * in front of a user.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { sendAiRequest, AiClient } from './ai-client';
import { buildAiAuditEvents } from '../../store/ai-audit-events';
import * as vscode from '../../vscode';

/* Vitest runs with the webview package as its root, so the tree is right here.
   `import.meta.url` is not a file URL under the transform, hence cwd. */
const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = sourceFiles(SRC).map(f => ({ path: relative(SRC, f), text: readFileSync(f, 'utf8') }));

beforeEach(() => vi.restoreAllMocks());

describe('nothing builds an ai:send by hand', () => {
  /* `vscode.ts` matches on the type to audit the call as it passes; that is a
     read, not a send, so only an object literal with the type counts here. */
  it('has exactly one file that puts the type on a message', () => {
    const builders = FILES
      .filter(f => /type:\s*['"]ai:send['"]/.test(f.text))
      .map(f => f.path.replace(/\\/g, '/'));
    expect(builders).toEqual(['services/ai/ai-client.ts']);
  });
});

describe('every call site names a feature the audit knows', () => {
  const known = new Set(buildAiAuditEvents().map(e => e.id.slice('ai.'.length)));

  /** The `stage: '…'` of each sendAiRequest call, where it is a literal. */
  const callSites = FILES.flatMap(f =>
    [...f.text.matchAll(/sendAiRequest\(\{[\s\S]{0,600}?stage:\s*'([^']+)'/g)]
      .map(m => ({ file: f.path.replace(/\\/g, '/'), stage: m[1] })),
  );

  it('finds the call sites at all', () => {
    expect(callSites.length).toBeGreaterThan(30);
  });

  /* A stage the taxonomy has never heard of is not a hard failure at runtime —
     the call is still recorded, under the generic "unnamed feature" row. That
     row is exactly what the user asked us to get rid of. */
  it.each(callSites)('$file sends a stage the audit can name: $stage', ({ stage }) => {
    expect(known.has(stage)).toBe(true);
  });

  it('gives every call site a screen', () => {
    const missing = FILES.flatMap(f =>
      [...f.text.matchAll(/sendAiRequest\(\{([\s\S]{0,700}?)\n\s*\}\)/g)]
        .filter(m => !/\bscreen:/.test(m[1]))
        .map(() => f.path.replace(/\\/g, '/')),
    );
    expect(missing).toEqual([]);
  });
});

describe('the message it posts', () => {
  it('carries the type, the stage and the screen', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    sendAiRequest({ stage: 'rest.docs.generate', screen: 'REST · Docs', userPrompt: 'hi' });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ai:send',
      stage: 'rest.docs.generate',
      screen: 'REST · Docs',
      userPrompt: 'hi',
    }));
  });

  /* The host reads `tabId`, and answers under it. A call whose id went out
     under any other name is a button that never hears back — the bug this
     file exists to make unrepeatable. */
  it('returns the id it sent, under the name the host answers with', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    const id = sendAiRequest({ stage: 'rest.body.generate', screen: 'REST · Request', userPrompt: 'x' });
    expect(post.mock.calls[0][0]).toMatchObject({ tabId: id });
    expect(id).toContain('rest.body.generate');
  });

  it('honours an id the caller needs to know in advance', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    const id = sendAiRequest({ requestId: 'mine-1', stage: 'rest.body.generate', screen: 'REST · Request', userPrompt: 'x' });
    expect(id).toBe('mine-1');
    expect(post.mock.calls[0][0]).toMatchObject({ tabId: 'mine-1' });
  });

  it('leaves provider, model and baseUrl empty so the host resolves them', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    sendAiRequest({ stage: 'rest.body.generate', screen: 'REST · Request', userPrompt: 'x' });
    expect(post.mock.calls[0][0]).toMatchObject({ provider: '', model: '', baseUrl: '' });
  });

  it('lets a feature that lets the user pick a model say so', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    sendAiRequest({ stage: 'ai.chat', screen: 'Daakia AI', provider: 'anthropic', model: 'claude', userPrompt: 'x' });
    expect(post.mock.calls[0][0]).toMatchObject({ provider: 'anthropic', model: 'claude' });
  });

  it('merges settings over the defaults rather than replacing them', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    sendAiRequest({ stage: 'rest.body.generate', screen: 'REST · Request', userPrompt: 'x', settings: { temperature: 0.1 } });
    const settings = (post.mock.calls[0][0] as { settings: Record<string, unknown> }).settings;
    expect(settings.temperature).toBe(0.1);
    expect(settings.stream).toBe(true);
    expect(settings.maxTokens).toBe(1024);
  });

  it('fills the collection fields the host destructures', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    sendAiRequest({ stage: 'rest.body.generate', screen: 'REST · Request', userPrompt: 'x' });
    expect(post.mock.calls[0][0]).toMatchObject({
      systemPrompts: [], conversation: [], tools: [], mcpServerConfigs: [],
    });
  });

  /* A tab that follows the active environment rather than pinning one has a
     null envId; the host reads it either way. */
  it('flattens the tab context the host expects at the top level', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    sendAiRequest({
      stage: 'rest.body.generate', screen: 'REST · Request', userPrompt: 'x',
      context: { authType: 'bearer', authData: { token: 't' }, envId: null },
    });
    expect(post.mock.calls[0][0]).toMatchObject({ authType: 'bearer', envId: null });
    expect(post.mock.calls[0][0]).not.toHaveProperty('context');
  });
});

describe('AiClient', () => {
  it('stamps its screen on every call so a panel cannot get one of them wrong', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    const client = new AiClient('dk8s · Logs', { envId: 'env-1' });
    client.send({ stage: 'dk8s.log.summarise', userPrompt: 'a' });
    client.send({ stage: 'dk8s.log.explainShape', userPrompt: 'b' });
    expect(post.mock.calls.map(c => (c[0] as { screen: string }).screen))
      .toEqual(['dk8s · Logs', 'dk8s · Logs']);
    expect(post.mock.calls[1][0]).toMatchObject({ envId: 'env-1' });
  });
});
