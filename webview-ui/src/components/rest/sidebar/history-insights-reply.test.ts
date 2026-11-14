/**
 * History's "Name it" and "Why?" read an AI reply the way the host sends it.
 * They read `content` off a chunk and ignored `ai:complete`; the namer asks
 * for no streaming, so it only ever gets a `complete` — "Naming…", then nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../vscode', () => ({ postMsg: () => {} }));
const toasts = vi.hoisted(() => [] as { type: string; message: string }[]);
vi.mock('../../../store/toast-store', () => ({
  useToastStore: { getState: () => ({ addToast: (t: { type: string; message: string }) => toasts.push(t) }) },
}));

import { followReply, type Asking } from './HistoryInsights';

function track(id: string) {
  let state: Asking | null = { id, text: '', done: false };
  const stop = followReply(id, fn => { state = fn(state); }, 'Could not name it');
  const send = (data: Record<string, unknown>) => window.dispatchEvent(new MessageEvent('message', { data }));
  return { get: () => state, send, stop };
}

beforeEach(() => { toasts.length = 0; });

describe('following one AI reply', () => {
  it('takes the answer from ai:complete, which is all a non-streamed request gets', () => {
    const t = track('r1');
    t.send({ type: 'ai:complete', tabId: 'r1', message: { role: 'assistant', content: 'Create post' } });
    expect(t.get()).toEqual({ id: 'r1', text: 'Create post', done: true });
    t.stop();
  });

  it('builds the answer from delta (or text) on a stream, and finishes on complete', () => {
    const t = track('r2');
    t.send({ type: 'ai:chunk', tabId: 'r2', delta: 'Create ' });
    t.send({ type: 'ai:chunk', tabId: 'r2', text: 'post' });
    expect(t.get()).toMatchObject({ text: 'Create post', done: false });
    t.send({ type: 'ai:complete', tabId: 'r2', message: { content: '' } });
    expect(t.get()).toMatchObject({ text: 'Create post', done: true });
    t.stop();
  });

  it('ignores replies to other requests', () => {
    const t = track('r3');
    t.send({ type: 'ai:complete', tabId: 'someone-else', message: { content: 'nope' } });
    expect(t.get()).toMatchObject({ text: '', done: false });
    t.stop();
  });

  it('says why it failed instead of quietly resetting', () => {
    const t = track('r4');
    t.send({ type: 'ai:error', tabId: 'r4', message: 'No GitHub Copilot model available.' });
    expect(t.get()).toBeNull();
    expect(toasts).toEqual([{ type: 'error', message: 'Could not name it: No GitHub Copilot model available.' }]);
    t.stop();
  });
});
