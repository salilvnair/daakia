import { beforeEach, describe, expect, it } from 'vitest';
import { useDk8sAiSteps } from './dk8s-ai-steps-store';

const T = 'tab-1';
const apply = (m: Record<string, unknown>) => useDk8sAiSteps.getState().apply({ tabId: T, ...m });
const steps = () => useDk8sAiSteps.getState().byTab[T]?.steps ?? [];

describe('dk8s AI steps', () => {
  beforeEach(() => useDk8sAiSteps.setState({ byTab: {} }));

  it('lists every step an answer takes, in order, each finished by its own result', () => {
    apply({ type: 'ai:resolved' });
    apply({ type: 'ai:docsLookup', toolCallId: 'd1', query: 'Follow' });
    apply({ type: 'ai:dk8sSearchStarted', toolCallId: 's1', query: 'read timed out', pods: 1 });
    apply({ type: 'ai:dk8sSearchResult', toolCallId: 's1', result: { groups: [{ failures: 2 }, { failures: 0 }] } });
    apply({ type: 'ai:kubectlRunStarted', toolCallId: 'k1', command: 'kubectl logs zp-backend-6f5zb --tail=500', why: 'The last 500 lines, to summarise them' });

    expect(steps().map(s => [s.kind, s.state])).toEqual([['docs', 'done'], ['search', 'done'], ['kubectl', 'running']]);
    expect(steps()[1].outcome).toBe('2 threads, 2 failures');
    expect(steps()[2]).toMatchObject({ command: 'kubectl logs zp-backend-6f5zb --tail=500', why: 'The last 500 lines, to summarise them' });

    apply({ type: 'ai:kubectlRunResult', toolCallId: 'k1', result: { ok: true, code: 0, output: 'a\nb\nc\n' } });
    expect(steps()[2]).toMatchObject({ state: 'done', outcome: '3 lines back' });
  });

  it('marks a command that failed, and closes everything when the answer is done', () => {
    apply({ type: 'ai:resolved' });
    apply({ type: 'ai:kubectlRunStarted', toolCallId: 'k1', command: 'kubectl get pods' });
    apply({ type: 'ai:kubectlRunResult', toolCallId: 'k1', result: { ok: false, code: 1, output: '' } });
    apply({ type: 'ai:docsLookup', toolCallId: 'd1', query: 'x' });
    apply({ type: 'ai:complete' });
    expect(steps().map(s => s.state)).toEqual(['failed', 'done']);
    expect(useDk8sAiSteps.getState().byTab[T].done).toBe(true);
  });

  it('starts fresh for the next request', () => {
    apply({ type: 'ai:resolved' });
    apply({ type: 'ai:docsLookup', toolCallId: 'd1', query: 'x' });
    apply({ type: 'ai:complete' });
    apply({ type: 'ai:resolved' });
    expect(steps()).toEqual([]);
  });
});
