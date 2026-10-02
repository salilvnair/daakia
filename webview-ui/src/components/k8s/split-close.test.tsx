import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

/* jsdom lays nothing out; the split panels only need it to exist. */
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const posted: Record<string, unknown>[] = [];
vi.mock('../../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => { posted.push(m); },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));

import { useSplitStore } from '../../store/dk8s-split-store';
import { useK8sStore, type PodSummary, type LogLine } from '../../store/k8s-store';
import { SplitLogs } from './SplitLogs';

const pod = (name: string): PodSummary => ({
  name, namespace: 'com-zp-dev', context: 'kind-dk8s-lab', uid: name, phase: 'Running',
  ready: { current: 1, total: 1 }, restarts: 0, containers: [{ name: 'app', ready: true, restarts: 0, image: '' }],
  healthy: true, deleting: false,
} as unknown as PodSummary);

const lines = (n: number, tag: string): LogLine[] =>
  Array.from({ length: n }, (_, i) => ({ seq: i + 1, level: i === 2 ? 'error' : 'info', text: `${tag} line ${i + 1}` }) as LogLine);

beforeEach(() => {
  posted.length = 0;
  document.body.innerHTML = '';
  useK8sStore.setState({ detail: undefined, logs: [], pods: [pod('api-0'), pod('api-1'), pod('api-2')] });
  useSplitStore.setState({ panes: [] });
});

describe('closing split panes', () => {
  it('hands the last pane to the pod view as it stands — no new read', () => {
    useSplitStore.getState().open([pod('api-0'), pod('api-1')], 'vertical', 500);
    const [a, b] = useSplitStore.getState().panes;
    useSplitStore.getState().patch(b.id, { logs: lines(5, 'b'), status: 'streaming', live: true, filter: 'timeout', levels: ['error'] });
    posted.length = 0;

    useSplitStore.getState().closePane(a.id);

    expect(useSplitStore.getState().panes).toEqual([]);
    const s = useK8sStore.getState();
    expect(s.detail?.name).toBe('api-1');
    expect(s.detailTab).toBe('logs');
    expect(s.logs.map(l => l.text)).toEqual(lines(5, 'b').map(l => l.text));
    expect(s).toMatchObject({ logStatus: 'streaming', logLive: true, logFilter: 'timeout', logLevels: ['error'], logTail: 500 });
    /* The closed pane's stream stops; the kept one is not read again. */
    expect(posted.filter(m => m.type === 'dk8s:openLogs')).toEqual([]);
    expect(posted.filter(m => m.type === 'dk8s:closeLogs').map(m => m.pod)).toEqual(['api-0']);
  });

  it('keeps the other panes mounted when one closes', async () => {
    useSplitStore.getState().open([pod('api-0'), pod('api-1'), pod('api-2')], 'vertical', 200);
    const panes = useSplitStore.getState().panes;
    panes.forEach((p, i) => useSplitStore.getState().patch(p.id, { logs: lines(3, `p${i}`), status: 'ended' }));

    const host = document.createElement('div');
    host.style.height = '600px';
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<SplitLogs />));

    /* The element holding api-2's lines, before and after api-0 closes. */
    const holder = () => [...document.querySelectorAll('[data-log-text]')].find(e => e.getAttribute('data-log-text') === 'p2 line 1');
    const before = holder();
    expect(before).toBeTruthy();

    act(() => useSplitStore.getState().closePane(panes[0].id));
    expect(useSplitStore.getState().panes).toHaveLength(2);
    const after = holder();
    expect(after).toBe(before);
    expect(document.body.contains(before!)).toBe(true);
    act(() => root.unmount());
  });
});

describe('Following', () => {
  it('starts the pod view from an empty window — what arrives from now on', () => {
    useK8sStore.setState({ detail: pod('api-0'), logs: lines(4, 'old'), logTail: 500, logSince: '1h', logLive: false });
    posted.length = 0;
    useK8sStore.getState().setLogLive(true);
    expect(useK8sStore.getState().logs).toEqual([]);
    const open = posted.find(m => m.type === 'dk8s:openLogs')!;
    expect(open).toMatchObject({ follow: true, tailLines: 0, direction: 'last' });
    expect(open.sinceSeconds).toBeUndefined();

    /* Off, and a Fetch reads the tail again as before. */
    useK8sStore.setState({ logLive: false });
    posted.length = 0;
    useK8sStore.getState().fetchLogs();
    expect(posted.find(m => m.type === 'dk8s:openLogs')).toMatchObject({ follow: false, tailLines: 500, sinceSeconds: 3600 });
  });

  it('starts a split pane empty too', () => {
    useSplitStore.getState().open([pod('api-0'), pod('api-1')], 'vertical', 300);
    const [a] = useSplitStore.getState().panes;
    useSplitStore.getState().patch(a.id, { logs: lines(3, 'a'), live: true, direction: 'first' });
    posted.length = 0;
    useSplitStore.getState().refetch(a.id);
    expect(useSplitStore.getState().panes[0].logs).toEqual([]);
    expect(posted.find(m => m.type === 'dk8s:openLogs')).toMatchObject({ follow: true, tailLines: 0, direction: 'last', alongside: true });
  });
});
