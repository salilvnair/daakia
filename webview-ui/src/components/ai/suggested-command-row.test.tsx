import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const posted: Record<string, unknown>[] = [];
vi.mock('../../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => { posted.push(m); },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
import { AnswerMd } from './SuggestedCommand';

const reply = (data: unknown) => act(() => { window.dispatchEvent(new MessageEvent('message', { data })); });

describe('a suggested kubectl command in an answer', () => {
  beforeEach(() => { posted.length = 0; });

  it('asks for a plan, draws it with Run, and runs only when Run is pressed', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<AnswerMd text={'Worth checking:\n\n```bash\nkubectl get pods -n ns p -o wide\n```'} />));

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: 'ai:kubectlSuggest', mode: 'plan', command: 'kubectl get pods -n ns p -o wide' });
    const id = posted[0].id;

    reply({ type: 'ai:kubectlSuggested', id, plan: {
      runnable: true, command: 'kubectl --context c -n ns get pods p -o wide', context: 'c', namespace: 'ns',
    } });
    expect(host.textContent).toContain('READ');
    expect(host.textContent).toContain('kubectl --context c -n ns get pods p -o wide');
    const run = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Run');
    expect(run).toBeTruthy();
    expect(posted).toHaveLength(1);

    act(() => { run!.click(); });
    expect(posted[1]).toMatchObject({ type: 'ai:kubectlSuggest', mode: 'run', id });

    reply({ type: 'ai:kubectlSuggested', id, result: {
      kind: 'kubectl', command: 'kubectl --context c -n ns get pods p -o wide', verb: 'get', ok: true, code: 0,
      output: 'NAME READY\np 1/1', truncated: false, elapsedMs: 12, context: 'c', namespace: 'ns', links: [],
    } });
    expect(host.textContent).toContain('p 1/1');
    expect([...host.querySelectorAll('button')].some(b => b.textContent?.includes('Run again'))).toBe(true);
    act(() => root.unmount());
  });

  it('shows a command that changes the cluster with no Run', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<AnswerMd text={'```bash\nkubectl rollout restart deploy/x\n```'} />));
    reply({ type: 'ai:kubectlSuggested', id: posted[0].id, plan: {
      runnable: false, proposal: true, command: 'kubectl --context c -n ns rollout restart deploy/x',
      refused: '"rollout restart" changes the cluster', context: 'c', namespace: 'ns',
    } });
    expect(host.textContent).toContain('CHANGES');
    expect([...host.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Run')).toBe(false);
    act(() => root.unmount());
  });
});
