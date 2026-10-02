import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const posted: Record<string, unknown>[] = [];
vi.mock('../../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => { posted.push(m); },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));

import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import { useSplitStore } from '../../store/dk8s-split-store';
import { ErrorsDialog, useErrorsDialog } from './ErrorsDialog';

const pod = (name: string): PodSummary => ({
  name, namespace: 'com-zp-dev', context: 'kind-dk8s-lab', uid: name, phase: 'Running',
  ready: { current: 1, total: 1 }, restarts: 0, containers: [{ name: 'app', ready: true, restarts: 0, image: '' }],
  healthy: true, deleting: false,
} as unknown as PodSummary);

const button = (label: string) => ([...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
  ?? [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(label))) as HTMLButtonElement;

function mountDialog(pods: PodSummary[]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<ErrorsDialog />));
  act(() => useErrorsDialog.getState().open(pods));
  return root;
}

beforeEach(() => {
  posted.length = 0;
  document.body.innerHTML = '';
  useErrorsDialog.setState({ pods: [] });
  useSplitStore.setState({ panes: [] });
  useK8sStore.setState({ detail: undefined, pods: [pod('api-0'), pod('api-1')] });
});

describe('Errors…', () => {
  it('opens one pod in its own Logs tab, read for the window and for errors only', () => {
    const root = mountDialog([pod('api-0')]);
    act(() => { button('Last 10 min').click(); });
    const before = Date.now();
    act(() => { button('Show errors').click(); });

    const s = useK8sStore.getState();
    expect(s.detail?.name).toBe('api-0');
    expect(s).toMatchObject({ detailTab: 'logs', logDirection: 'between', logLevels: ['error'], logOnlyErrors: true });
    const reads = posted.filter(m => m.type === 'dk8s:openLogs');
    /* One read: the window, not the newest lines first and then the window. */
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ pod: 'api-0', levels: ['error'], direction: 'last' });
    const from = Date.parse(reads[0].fromIso as string);
    expect(before - from).toBeGreaterThanOrEqual(10 * 60_000 - 2_000);
    expect(before - from).toBeLessThan(10 * 60_000 + 2_000);
    expect(useErrorsDialog.getState().pods).toEqual([]);
    act(() => root.unmount());
  });

  it('reads the window again, whole, when ERROR is let go', () => {
    const root = mountDialog([pod('api-0')]);
    act(() => { button('Show errors').click(); });
    posted.length = 0;
    act(() => useK8sStore.getState().toggleLogLevel('error'));
    expect(useK8sStore.getState().logOnlyErrors).toBe(false);
    const read = posted.find(m => m.type === 'dk8s:openLogs')!;
    expect(read.levels).toBeUndefined();
    expect(read.fromIso).toBeTruthy();
    act(() => root.unmount());
  });

  it('opens several pods as a split, each pane read the same way', () => {
    const root = mountDialog([pod('api-0'), pod('api-1')]);
    act(() => { button('Side by side').click(); });
    act(() => { button('Show errors in 2 panes').click(); });

    const { panes, mode } = useSplitStore.getState();
    expect(mode).toBe('vertical');
    expect(panes.map(p => [p.pod, p.direction, p.levels, p.onlyErrors])).toEqual([
      ['api-0', 'between', ['error'], true], ['api-1', 'between', ['error'], true],
    ]);
    const reads = posted.filter(m => m.type === 'dk8s:openLogs');
    expect(reads.map(r => [r.pod, r.levels, !!r.fromIso, r.alongside])).toEqual([
      ['api-0', ['error'], true, false], ['api-1', ['error'], true, true],
    ]);
    act(() => root.unmount());
  });

  it('starts a custom range on the last hour, ready to show', () => {
    const root = mountDialog([pod('api-0')]);
    act(() => { button('Custom').click(); });
    expect(document.body.textContent).not.toContain('The start has to be before the end.');
    expect(button('Show errors').disabled).toBe(false);
    act(() => root.unmount());
  });
});
