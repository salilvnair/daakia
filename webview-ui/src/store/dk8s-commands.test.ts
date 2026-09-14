/**
 * What the panel knows about the commands it is waiting on.
 *
 * Two things have to hold for a loading state to be able to name its command,
 * and both are easy to break from a distance: the store has to take the
 * message, and a context switch has to clear what belongs to the old cluster
 * without throwing away the command log that explains what just happened.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../vscode', () => ({ postMsg: vi.fn() }));

import { useK8sStore, type KubectlCommand } from './k8s-store';

const CMD = (over: Partial<KubectlCommand> = {}): KubectlCommand => ({
  command: 'kubectl --context prod -n payments get pods -o json',
  what: 'get pods',
  context: 'prod',
  namespace: 'payments',
  kind: 'run',
  ms: 412,
  ok: true,
  code: 0,
  at: Date.now(),
  ...over,
});

describe('the command feed', () => {
  beforeEach(() => useK8sStore.setState({ commands: [] }));

  it('takes one as it happens', () => {
    useK8sStore.getState().apply({ type: 'dk8s:command', event: CMD() });
    const [only] = useK8sStore.getState().commands;
    expect(only.command).toContain('get pods');
    expect(only.ms).toBe(412);
  });

  it('takes the backlog for a panel that opened late', () => {
    useK8sStore.getState().apply({
      type: 'dk8s:commands',
      events: [CMD({ what: 'config view' }), CMD()],
    });
    expect(useK8sStore.getState().commands).toHaveLength(2);
  });

  it('keeps a window, not a second audit log', () => {
    // The audit table is the record; this is what is on screen.
    for (let i = 0; i < 60; i++) {
      useK8sStore.getState().apply({ type: 'dk8s:command', event: CMD({ ms: i }) });
    }
    const kept = useK8sStore.getState().commands;
    expect(kept.length).toBeLessThanOrEqual(40);
    expect(kept[kept.length - 1].ms).toBe(59);
  });
});

describe('switching cluster', () => {
  beforeEach(() => useK8sStore.setState({
    commands: [],
    namespace: 'payments',
    pods: [{ name: 'p', namespace: 'payments' } as never],
    targets: [{ context: 'prod', namespace: 'payments' } as never],
    offers: [{ context: 'prod', namespaces: ['payments'] } as never],
    offersLoaded: true,
    access: { logs: false, exec: false, get: false, events: false,
              portForward: false, delete: false, patch: false, probed: true },
  }));

  it('lets go of the namespace and everything under it', () => {
    /*
      The bug this is for: the namespace stayed, so the next cluster was asked
      about a namespace belonging to the last one — "can I read logs in
      payments?" of a cluster where payments is somebody else's. The answer is
      no, and dk8s reported it as your account being short a role.
    */
    useK8sStore.getState().useContext('staging-eu');
    const s = useK8sStore.getState();
    expect(s.context).toBe('staging-eu');
    expect(s.namespace).toBeUndefined();
    expect(s.pods).toEqual([]);
    expect(s.targets).toEqual([]);
    expect(s.offers).toEqual([]);
    expect(s.offersLoaded).toBe(false);
  });

  it('stops claiming the last cluster’s permissions', () => {
    useK8sStore.getState().useContext('staging-eu');
    // Not "denied" and not "allowed" — unknown, which restricts nothing until
    // the new cluster has answered.
    expect(useK8sStore.getState().access.probed).toBe(false);
    expect(useK8sStore.getState().access.logs).toBe(true);
  });

  it('does the same for a multi-cluster switch', () => {
    useK8sStore.getState().useContexts(['staging-eu', 'prod-us']);
    const s = useK8sStore.getState();
    expect(s.selectedContexts).toEqual(['staging-eu', 'prod-us']);
    expect(s.namespace).toBeUndefined();
    expect(s.pods).toEqual([]);
  });

  it('keeps the commands, which are what explains the switch', () => {
    useK8sStore.setState({ commands: [CMD()] });
    useK8sStore.getState().useContext('staging-eu');
    expect(useK8sStore.getState().commands).toHaveLength(1);
  });
});
