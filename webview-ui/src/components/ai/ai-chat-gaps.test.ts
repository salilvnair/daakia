/**
 * Two promises the revamp makes: ✕ on the dk8s pill turns search off in THIS
 * conversation and no other, and an answer that was stopped or lost comes back
 * as a notice that can ask the same question again — reopened or not.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { dk8sChatOn, setDk8sForChat, DK8S_CHAT_PREF, DK8S_OFF_CHATS_PREF, dk8sScoped, dk8sScopeKey } from './dk8s-chat-prompts';
import { noticeEnvelope, toUiMessages } from './ai-display';
import { isAiNoticePayload } from './AiNoticeCard';
import { useUiStateStore } from '../../store/ui-state-store';

describe('dk8s, one conversation at a time', () => {
  beforeEach(() => {
    useUiStateStore.setState(s => ({ prefs: { ...s.prefs, [DK8S_CHAT_PREF]: 'on', [DK8S_OFF_CHATS_PREF]: '[]' } }));
  });

  it('turns off in the conversation whose pill was dismissed, and stays on in the others', () => {
    setDk8sForChat('chat-a', false);
    expect(dk8sChatOn('chat-a')).toBe(false);
    expect(dk8sChatOn('chat-b')).toBe(true);
  });

  it('comes back on in that conversation when asked', () => {
    setDk8sForChat('chat-a', false);
    setDk8sForChat('chat-a', true);
    expect(dk8sChatOn('chat-a')).toBe(true);
  });

  it('is off everywhere when the tab turns it off', () => {
    useUiStateStore.setState(s => ({ prefs: { ...s.prefs, [DK8S_CHAT_PREF]: 'off' } }));
    expect(dk8sChatOn('chat-b')).toBe(false);
  });

  it('reads a damaged list as empty rather than turning dk8s off', () => {
    useUiStateStore.setState(s => ({ prefs: { ...s.prefs, [DK8S_OFF_CHATS_PREF]: '{not json' } }));
    expect(dk8sChatOn('chat-a')).toBe(true);
  });
});

describe('an answer that did not come', () => {
  it('carries the question to ask again', () => {
    const env = JSON.parse(noticeEnvelope('Stopped before it answered.', 'stopped', 'why did 4242 fail?'));
    expect(isAiNoticePayload(env)).toBe(true);
    expect(env).toMatchObject({ tone: 'stopped', retry: 'why did 4242 fail?' });
  });

  it('is drawn as a notice again when the conversation is reopened', () => {
    const display = noticeEnvelope('No reply from Daakia for three minutes.', 'error', 'why?');
    const [, shown] = toUiMessages([
      { id: 'u', role: 'user', content: 'why?', timestamp: 0 },
      { id: 'a', role: 'assistant', content: 'Error: No reply', timestamp: 1, display },
    ]);
    expect(isAiNoticePayload(JSON.parse(shown.text))).toBe(true);
  });
});

describe('which pods a question searches', () => {
  const pod = (name: string, workload?: string) => ({ name, ...(workload ? { workload: { name: workload } } : {}) });
  const pods = [pod('zp-backend-1', 'zp-backend'), pod('zp-backend-2', 'zp-backend'), pod('postgres-0', 'postgres'), pod('debug-shell')];

  it('picks by workload, so a rollout that renames the pods keeps the choice', () => {
    expect(dk8sScopeKey(pod('zp-backend-69fdd86674-7gpgz', 'zp-backend'))).toBe('zp-backend');
    expect(dk8sScopeKey(pod('debug-shell'))).toBe('debug-shell');
  });

  it('leaves out what was left out, and searches anything new', () => {
    const kept = dk8sScoped([...pods, pod('billing-1', 'billing')], JSON.stringify(['postgres', 'debug-shell']));
    expect(kept.map(p => p.name)).toEqual(['zp-backend-1', 'zp-backend-2', 'billing-1']);
  });

  it('searches nothing when everything is left out — it does not quietly search everything', () => {
    expect(dk8sScoped(pods, JSON.stringify(['zp-backend', 'postgres', 'debug-shell']))).toHaveLength(0);
  });
});
