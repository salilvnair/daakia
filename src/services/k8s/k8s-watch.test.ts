/**
 * What the pod watch is allowed to ask the cluster for.
 *
 * These read the source rather than run kubectl, because the thing worth
 * holding to is the shape of the command line — and the cost of getting it
 * wrong is invisible on a fast link and brutal on a slow one. A regression
 * here does not fail; it just moves several megabytes nobody needed, and shows
 * up as "dk8s is slow" on somebody's VPN weeks later.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import * as path from 'path';
import { toPodSummary, watchAgrees } from './k8s-watch';

const source = readFileSync(path.join(__dirname, 'k8s-watch.ts'), 'utf8');

describe('the watch command', () => {
  it('does not ask for the list it has already fetched', () => {
    /*
      `kubectl get --watch` replays the whole current state as ADDED events
      before it starts watching, and `watchPods` has just fetched exactly that
      with its own `get pods -o json`. Measured on a four-pod namespace:
      23,372 bytes replayed by `--watch`, 0 by `--watch-only`. Every pod list
      was being paid for twice, on every start and every reconnect.
    */
    expect(source).toContain("'--watch-only'");
  });

  it('never opens a plain --watch', () => {
    // The flag that would quietly bring the duplicate back.
    expect(source).not.toMatch(/'--watch'/);
  });

  it('still asks for watch events, which carry the deletions', () => {
    /* Without this kubectl emits bare objects and a DELETED is
       indistinguishable from an update — pods would never leave the grid. */
    expect(source).toContain("'--output-watch-events'");
  });

  it('lists once, before the stream', () => {
    expect(source).toContain("'get', 'pods', '-o', 'json'");
  });
});

describe('reading a pod into the grid', () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    metadata: { name: 'prodapp-bc8f7bf84-mhz5f', namespace: 'pvfix', uid: 'u1' },
    spec: { nodeName: 'node-1', containers: [{ image: 'prodapp:1.2.3' }] },
    status: {
      phase: 'Running',
      startTime: '2026-09-16T00:00:00Z',
      containerStatuses: [{ name: 'app', ready: true, restartCount: 0, image: 'prodapp:1.2.3' }],
    },
    ...over,
  });

  it('takes the fields the grid draws', () => {
    const p = toPodSummary(raw() as never);
    expect(p).toMatchObject({
      name: 'prodapp-bc8f7bf84-mhz5f',
      namespace: 'pvfix',
      phase: 'Running',
      node: 'node-1',
      image: 'prodapp:1.2.3',
      healthy: true,
    });
    expect(p.ready).toEqual({ current: 1, total: 1 });
  });

  it('calls a pod being deleted Terminating, whatever its phase still says', () => {
    /* The API reports a deleting pod as Running until the kubelet is done, so
       the deletion timestamp is the only thing that knows. */
    const p = toPodSummary(raw({
      metadata: { name: 'x', namespace: 'pvfix', uid: 'u1', deletionTimestamp: '2026-09-16T01:00:00Z' },
    }) as never);
    expect(p.phase).toBe('Terminating');
    expect(p.deleting).toBe(true);
    expect(p.healthy).toBe(false);
  });

  it('counts restarts across every container', () => {
    const p = toPodSummary(raw({
      status: {
        phase: 'Running',
        containerStatuses: [
          { name: 'app', ready: true, restartCount: 2 },
          { name: 'sidecar', ready: false, restartCount: 3 },
        ],
      },
    }) as never);
    expect(p.restarts).toBe(5);
    expect(p.ready).toEqual({ current: 1, total: 2 });
    expect(p.healthy).toBe(false);
  });

  it('prefers a live reason over the one the last run ended with', () => {
    const p = toPodSummary(raw({
      status: {
        phase: 'Pending',
        containerStatuses: [{
          name: 'app', ready: false, restartCount: 1,
          state: { waiting: { reason: 'ImagePullBackOff' } },
          lastState: { terminated: { reason: 'Error', finishedAt: '2026-09-16T00:30:00Z' } },
        }],
      },
    }) as never);
    expect(p.reason).toBe('ImagePullBackOff');
    expect(p.lastRestartAt).toBe('2026-09-16T00:30:00Z');
  });

  it('does not wear a last-death reason that says nothing', () => {
    /*
      A kubelet reports `Unknown` for a container it lost track of across a
      node or runtime restart, and the card shows `reason || phase` — so every
      pod on a rebooted machine read `Unknown` while running perfectly well,
      which looks like dk8s failing to work out the state rather than the
      cluster declining to say why something died three hours ago.
    */
    const p = toPodSummary({
      metadata: { name: 'checkout-api-6bfdf7b7b4-2l2z6', namespace: 'checkout' },
      spec: { containers: [{ image: 'x' }] },
      status: {
        phase: 'Running',
        containerStatuses: [{
          name: 'app', ready: true, restartCount: 1,
          lastState: { terminated: { reason: 'Unknown', finishedAt: '2026-09-16T00:00:00Z' } },
        }],
      },
    } as never);
    expect(p.reason).toBeUndefined();
    expect(p.phase).toBe('Running');
    /* Still counted and still timed — the restart is real even when the
       reason for it is not recorded. */
    expect(p.restarts).toBe(1);
    expect(p.lastRestartAt).toBe('2026-09-16T00:00:00Z');
  });

  it('keeps a last-death reason that does say something', () => {
    const p = toPodSummary({
      metadata: { name: 'x', namespace: 'checkout' },
      spec: { containers: [{ image: 'x' }] },
      status: {
        phase: 'Running',
        containerStatuses: [{
          name: 'app', ready: true, restartCount: 1,
          lastState: { terminated: { reason: 'OOMKilled' } },
        }],
      },
    } as never);
    expect(p.reason).toBe('OOMKilled');
  });

  it('survives a pod with no container statuses yet', () => {
    // Between scheduling and the kubelet reporting, this is every pod.
    const p = toPodSummary({
      metadata: { name: 'new', namespace: 'pvfix' },
      spec: { containers: [{ image: 'x' }] },
      status: { phase: 'Pending' },
    } as never);
    expect(p.ready).toEqual({ current: 0, total: 1 });
    expect(p.restarts).toBe(0);
  });
});

describe('whether a watch still describes reality', () => {
  it('agrees when the same pods are there', () => {
    expect(watchAgrees(new Set(['a', 'b']), ['b', 'a'])).toBe(true);
  });

  it('disagrees when a pod appeared without an event', () => {
    /*
      The failure this whole check exists for. A `kubectl get --watch` can be
      alive and deaf — it reconnects internally when the API server closes a
      watch normally, so the process being up proves nothing, and a connection
      broken in a way TCP does not notice leaves it receiving silence forever.
      Found exactly that: a five-hour-old watch, parented to the running
      server, that had missed every pod created in its namespace.
    */
    expect(watchAgrees(new Set(['a']), ['a', 'b'])).toBe(false);
  });

  it('disagrees when a pod went without an event', () => {
    expect(watchAgrees(new Set(['a', 'b']), ['a'])).toBe(false);
  });

  it('agrees on an empty namespace, which is a real answer', () => {
    // Not "we heard nothing" — the cluster said there is nothing.
    expect(watchAgrees(new Set(), [])).toBe(true);
  });

  it('disagrees on a swap that keeps the count', () => {
    /* A pod replaced by another between two checks. Comparing only the size
       would call this healthy and leave a dead pod on screen beside a missing
       live one. */
    expect(watchAgrees(new Set(['a', 'b']), ['a', 'c'])).toBe(false);
  });
});
