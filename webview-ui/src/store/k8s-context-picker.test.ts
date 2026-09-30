import { describe, it, expect, vi } from 'vitest';

const posted: Record<string, unknown>[] = [];
vi.mock('../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => { posted.push(m); },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('./ui-audit-store', () => ({ logUiEvent: () => {} }));
import { useK8sStore, type KubeContext } from './k8s-store';

describe('Change clusters', () => {
  it('with no clusters in hand, starts the wizard again instead of an empty picker', () => {
    posted.length = 0;
    useK8sStore.setState({ contexts: [], stage: 'ready', busy: false });
    useK8sStore.getState().openContextPicker();
    expect(useK8sStore.getState().stage).toBe('probing');
    expect(posted.some(m => m.type === 'dk8s:probe')).toBe(true);
  });

  it('with clusters, opens the picker and is not left "Connecting…"', () => {
    useK8sStore.setState({ contexts: [{ name: 'kind-dk8s-lab' } as KubeContext], stage: 'ready', busy: true });
    useK8sStore.getState().openContextPicker();
    expect(useK8sStore.getState()).toMatchObject({ stage: 'pick-context', busy: false });
  });
});
