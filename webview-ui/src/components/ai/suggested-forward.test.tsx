import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const posted: Record<string, unknown>[] = [];
vi.mock('../../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => { posted.push(m); },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));

import { AnswerMd } from './SuggestedCommand';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import { usePortForwardStore } from '../../store/dk8s-port-forward-store';

const pod = { name: 'postgres-0', namespace: 'com-zp-dev', context: 'kind-dk8s-lab', phase: 'Running', deleting: false } as unknown as PodSummary;
const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(label));

describe('a port-forward Daakia AI suggests', () => {
  beforeEach(() => {
    posted.length = 0;
    document.body.innerHTML = '';
    useK8sStore.setState({ pods: [pod], context: 'kind-dk8s-lab', namespace: 'com-zp-dev' });
    usePortForwardStore.setState({ check: async ports => ports.map(port => ({ port, free: true })) });
  });

  it('is offered as Forward…, opens the dialog every time, and starts only from the dialog', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<AnswerMd text={'Reach it locally:\n\n```bash\nkubectl port-forward pod/postgres-0 15432:5432\n```'} />));

    expect(host.textContent).toContain('FORWARD');
    expect(host.textContent).toContain('localhost:15432');
    /* Not sent to the kubectl guard to be planned or run. */
    expect(posted.some(m => m.type === 'ai:kubectlSuggest')).toBe(false);

    await act(async () => { button('Forward…')!.click(); });
    /* Port free and not production — the Ports tab would start it at once; a suggestion still asks. */
    expect(document.body.textContent).toContain('Suggested by Daakia AI');
    expect(posted.some(m => m.type === 'dk8s:pf:start')).toBe(false);

    await act(async () => { button('Forward on 15432')!.click(); });
    expect(posted.find(m => m.type === 'dk8s:pf:start')).toMatchObject({
      spec: { context: 'kind-dk8s-lab', namespace: 'com-zp-dev', pod: 'postgres-0', ports: [{ local: 15432, remote: 5432, role: 'postgres' }] },
    });
    act(() => root.unmount());
  });

  it('says why, with no button, when the pod is not watched', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<AnswerMd text={'```bash\nkubectl port-forward pod/elsewhere-0 8080\n```'} />));
    expect(host.textContent).toContain('not one of the pods dk8s is watching');
    expect(button('Forward…')).toBeUndefined();
    act(() => root.unmount());
  });
});
