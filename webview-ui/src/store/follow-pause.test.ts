import { describe, it, expect, vi, beforeEach } from 'vitest';

const posted: Record<string, unknown>[] = [];
vi.mock('../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => { posted.push(m); },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('./ui-audit-store', () => ({ logUiEvent: () => {} }));

import { useK8sStore, type LogLine, type PodSummary } from './k8s-store';

const pod = { name: 'api-0', namespace: 'com-zp-dev', context: 'kind-dk8s-lab' } as unknown as PodSummary;
const line = (seq: number) => ({ seq, text: `line ${seq}` } as unknown as LogLine);
const arrive = (...seqs: number[]) => useK8sStore.getState().apply({
  type: 'dk8s:logLines', pod: 'api-0', namespace: 'com-zp-dev', context: 'kind-dk8s-lab', lines: seqs.map(line),
});
const shown = () => useK8sStore.getState().logs.map(l => l.seq);

beforeEach(() => {
  useK8sStore.getState().clearLogs();
  useK8sStore.setState({ detail: pod, logLive: true, logStatus: 'streaming', logFollow: true, logPaused: false, logTail: 200, logDirection: 'last', logRequestedAt: 1 });
});

describe('Following, paused', () => {
  it('holds still while paused, counts what arrives, and lets it in on Resume', () => {
    arrive(1, 2);
    expect(shown()).toEqual([1, 2]);

    useK8sStore.getState().setLogPaused(true);
    expect(useK8sStore.getState()).toMatchObject({ logPaused: true, logFollow: false });
    arrive(3, 4, 5);
    expect(shown()).toEqual([1, 2]);
    expect(useK8sStore.getState().logReceived).toBe(3);

    useK8sStore.getState().setLogPaused(false);
    expect(shown()).toEqual([1, 2, 3, 4, 5]);
    expect(useK8sStore.getState()).toMatchObject({ logPaused: false, logFollow: true, logReceived: 0 });

    arrive(6);
    expect(shown()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('Clear while paused drops what was held as well', () => {
    useK8sStore.getState().setLogPaused(true);
    arrive(1, 2);
    useK8sStore.getState().clearLogs();
    useK8sStore.getState().setLogPaused(false);
    expect(shown()).toEqual([]);
  });

  it('stopping Following reads the tail again, and keeps the screen until that read lands', () => {
    arrive(1, 2);
    useK8sStore.getState().setLogPaused(true);
    arrive(3);
    posted.length = 0;
    useK8sStore.getState().setLogLive(false);
    expect(posted.find(m => m.type === 'dk8s:openLogs')).toMatchObject({ follow: false, tailLines: 200 });
    /* No blank while it reads. */
    expect(shown()).toEqual([1, 2]);
    expect(useK8sStore.getState()).toMatchObject({ logStatus: 'loading', logLive: false, logPaused: false });

    arrive(10, 11, 12);
    expect(shown()).toEqual([1, 2]);
    useK8sStore.getState().apply({ type: 'dk8s:logStatus', pod: 'api-0', status: 'ended' });
    /* The read replaces what Following showed — it is the ordinary last-N view now. */
    expect(shown()).toEqual([10, 11, 12]);
  });

  it('drops lines a stopped stream sent on its way out, into the read that replaced it', () => {
    const following = useK8sStore.getState().logRequestedAt;
    useK8sStore.getState().setLogLive(false);
    const at = { type: 'dk8s:logLines', pod: 'api-0', namespace: 'com-zp-dev', context: 'kind-dk8s-lab' };
    useK8sStore.getState().apply({ ...at, readId: following, lines: [line(90), line(91)] });
    useK8sStore.getState().apply({ ...at, readId: useK8sStore.getState().logRequestedAt, lines: [line(1), line(2)] });
    useK8sStore.getState().apply({ type: 'dk8s:logStatus', pod: 'api-0', status: 'ended', readId: following });
    expect(useK8sStore.getState().logStatus).toBe('loading');
    useK8sStore.getState().apply({ type: 'dk8s:logStatus', pod: 'api-0', status: 'ended', readId: useK8sStore.getState().logRequestedAt });
    expect(shown()).toEqual([1, 2]);
  });

  it('stopping Following is not left paused', () => {
    useK8sStore.getState().setLogPaused(true);
    useK8sStore.getState().setLogLive(false);
    expect(useK8sStore.getState().logPaused).toBe(false);
  });
});
