import { beforeEach, describe, expect, it } from 'vitest';
import { useK8sStore, type PodSummary } from './k8s-store';

const pod = (name: string) => ({
  name, namespace: 'test', context: 'no-such-context', uid: name, phase: 'Running',
  ready: { current: 1, total: 1 }, restarts: 0, healthy: true, deleting: false, containers: [],
}) as unknown as PodSummary;

const here = () => {
  const s = useK8sStore.getState();
  return s.detail ? `${s.detail.name}/${s.detailTab}` : 'pods';
};

describe('Back walks the way the reader came', () => {
  beforeEach(() => useK8sStore.setState({ detail: undefined, navBack: [] }));

  it('tab to tab, pod to pod, and back to the grid', () => {
    const k = () => useK8sStore.getState();
    k().openDetail(pod('a'));
    k().setDetailTab('logs', { noHistory: true });
    k().setDetailTab('ask');
    k().setDetailTab('logs');         // a cited line, from Ask the log
    k().openDetail(pod('b'));          // Follow, into another pod
    k().setDetailTab('logs', { noHistory: true });

    expect(here()).toBe('b/logs');
    k().popNav(); expect(here()).toBe('a/logs');
    k().popNav(); expect(here()).toBe('a/ask');
    k().popNav(); expect(here()).toBe('a/logs');
    k().popNav(); expect(here()).toBe('pods');
    expect(k().popNav()).toBeUndefined();
  });

  it('remembers another Daakia tab, or the search results, when told', () => {
    const k = () => useK8sStore.getState();
    k().openDetail(pod('a'), { from: { kind: 'app', tabId: 'ai-1' } });
    expect(k().popNav()).toEqual({ kind: 'app', tabId: 'ai-1' });
    k().openDetail(pod('b'), { from: { kind: 'search' } });
    expect(k().popNav()).toEqual({ kind: 'search' });
  });
});
