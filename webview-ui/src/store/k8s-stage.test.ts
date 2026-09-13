/**
 * A reply that arrives late must not undo a choice already made.
 *
 * The host allows 15 seconds per context to answer, so a selection containing
 * a cluster that is not there keeps that round trip alive long after the
 * reader has finished with the picker. `dk8s:contextsSet` set the stage
 * unconditionally, so the pod grid somebody was already reading was replaced
 * by the namespace picker — fifteen seconds after they had pressed Watch, for
 * no reason visible on screen.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useK8sStore } from './k8s-store';

const CONTEXTS = ['kind-dk8s-prod', 'gone-lab'];
const RESULTS = [
  { context: 'kind-dk8s-prod', reachable: { reachable: true } },
  { context: 'gone-lab', reachable: { reachable: false, error: 'connection refused' } },
] as never;

const contextsSet = () => useK8sStore.getState().apply({
  type: 'dk8s:contextsSet', contexts: CONTEXTS, results: RESULTS,
});

beforeEach(() => {
  useK8sStore.setState({
    stage: 'pick-context', selectedContexts: [], contextResults: [],
    offers: [], offersLoaded: false, busy: true,
  });
});

describe('picking clusters', () => {
  it('moves on to the namespaces once they answer', () => {
    contextsSet();
    const s = useK8sStore.getState();
    expect(s.stage).toBe('pick-namespace');
    expect(s.selectedContexts).toEqual(CONTEXTS);
    expect(s.busy).toBe(false);
  });

  it('clears the previous cluster’s namespaces rather than showing them under a new name', () => {
    useK8sStore.setState({
      offers: [{ context: 'old', namespaces: ['a'], pinned: [] }] as never,
      offersLoaded: true,
    });
    contextsSet();
    expect(useK8sStore.getState().offers).toEqual([]);
    expect(useK8sStore.getState().offersLoaded).toBe(false);
  });
});

describe('once the reader has committed', () => {
  it('leaves them on the pods when the answer finally lands', () => {
    useK8sStore.setState({ stage: 'ready' });
    contextsSet();
    expect(useK8sStore.getState().stage).toBe('ready');
  });

  it('still takes the results, which the picker will want next time', () => {
    useK8sStore.setState({ stage: 'ready' });
    contextsSet();
    const s = useK8sStore.getState();
    expect(s.selectedContexts).toEqual(CONTEXTS);
    expect(s.contextResults).toHaveLength(2);
    expect(s.busy).toBe(false);
  });
});
