import { describe, it, expect } from 'vitest';
import { parseListedPod, POD_LIST_TEMPLATE } from './pods-list';

const F = '\x1f';
const SUB = '\x1e';
const ITEM = '\x1d';

/** A row exactly as the template writes one. */
function row(over: Partial<{
  name: string; uid: string; phase: string; reason: string; node: string;
  started: string; ownerKind: string; ownerName: string;
  specs: string; statuses: string; deletion: string;
}> = {}) {
  const f = {
    name: 'orders-api-668fdd75-92d88',
    uid: 'aa4eac11-5210-4e3d-a787-45d086fe5c0e',
    phase: 'Running',
    reason: '',
    node: 'dk8s-prod-control-plane',
    started: '2026-09-13T06:10:59Z',
    ownerKind: 'ReplicaSet',
    ownerName: 'orders-api-668fdd75',
    specs: `nginx${SUB}nginx:alpine${ITEM}`,
    statuses: `nginx${SUB}true${SUB}1${ITEM}`,
    deletion: '',
    ...over,
  };
  return [f.name, f.uid, f.phase, f.reason, f.node, f.started,
    f.ownerKind, f.ownerName, f.specs, f.statuses, f.deletion].join(F);
}

describe('reading a pod off the wire', () => {
  it('reads every field the grid draws', () => {
    const p = parseListedPod(row())!;
    expect(p.name).toBe('orders-api-668fdd75-92d88');
    expect(p.uid).toBe('aa4eac11-5210-4e3d-a787-45d086fe5c0e');
    expect(p.phase).toBe('Running');
    expect(p.node).toBe('dk8s-prod-control-plane');
    expect(p.startedAt).toBe('2026-09-13T06:10:59Z');
    expect(p.ownerKind).toBe('ReplicaSet');
    expect(p.ownerName).toBe('orders-api-668fdd75');
    expect(p.deleting).toBe(false);
  });

  it('joins each container to its image', () => {
    const p = parseListedPod(row({
      specs: `app${SUB}registry/app:1.4${ITEM}sidecar${SUB}envoy:1.29${ITEM}`,
      statuses: `app${SUB}true${SUB}0${ITEM}sidecar${SUB}false${SUB}3${ITEM}`,
    }))!;
    expect(p.containers).toEqual([
      { name: 'app', image: 'registry/app:1.4', ready: true, restarts: 0 },
      { name: 'sidecar', image: 'envoy:1.29', ready: false, restarts: 3 },
    ]);
    expect(p.ready).toEqual({ current: 1, total: 2 });
    /* The sum, which is what `kubectl get pods` prints. */
    expect(p.restarts).toBe(3);
  });

  it('counts a container that has no status yet', () => {
    /*
      The normal state of a pod that is starting. Left out, a pod about to be
      0/2 reads as 0/0 — which looks like a pod with no containers at all.
    */
    const p = parseListedPod(row({
      specs: `app${SUB}app:1${ITEM}sidecar${SUB}envoy:1${ITEM}`,
      statuses: `app${SUB}false${SUB}0${ITEM}`,
    }))!;
    expect(p.ready).toEqual({ current: 0, total: 2 });
    expect(p.containers.map(c => c.name).sort()).toEqual(['app', 'sidecar']);
  });

  it('reads a pod with no owner', () => {
    // A bare pod is a real thing; it just has no workload behind it.
    const p = parseListedPod(row({ ownerKind: '', ownerName: '' }))!;
    expect(p.ownerKind).toBeUndefined();
    expect(p.ownerName).toBeUndefined();
  });

  it('reads a failure with its reason', () => {
    const p = parseListedPod(row({ phase: 'Failed', reason: 'Evicted', statuses: '' }))!;
    expect(p.phase).toBe('Failed');
    expect(p.reason).toBe('Evicted');
  });

  it('knows a pod that is going away', () => {
    expect(parseListedPod(row({ deletion: '2026-09-17T10:00:00Z' }))!.deleting).toBe(true);
  });

  it('survives an empty node and an empty start time', () => {
    // A pod that is Pending has neither, and both sit between separators.
    const p = parseListedPod(row({ node: '', started: '', phase: 'Pending', statuses: '' }))!;
    expect(p.node).toBeUndefined();
    expect(p.startedAt).toBeUndefined();
    expect(p.phase).toBe('Pending');
  });

  describe('what it refuses', () => {
    it('ignores a blank line', () => {
      expect(parseListedPod('')).toBeUndefined();
      expect(parseListedPod('   ')).toBeUndefined();
    });

    it('ignores a line that is not one of ours', () => {
      /*
        The template writes every separator even when the value between them
        is empty, so a short line came from something else — `No resources
        found`, a warning on stdout — and is not a pod with missing parts.
      */
      expect(parseListedPod('No resources found in orders namespace.')).toBeUndefined();
      expect(parseListedPod(['a', 'b', 'c'].join(F))).toBeUndefined();
    });

    it('ignores a row with no name', () => {
      expect(parseListedPod(row({ name: '' }))).toBeUndefined();
    });
  });
});

describe('the template itself', () => {
  it('never asks go to print a missing key', () => {
    /*
      A go-template prints `<no value>` for a missing key — a literal string
      that would then have to be recognised and stripped at every field rather
      than never produced. Every optional field is guarded.
    */
    for (const optional of ['.status.reason', '.spec.nodeName', '.status.startTime',
      '.metadata.deletionTimestamp']) {
      expect(POD_LIST_TEMPLATE).toContain(`{{or ${optional} ""}}`);
    }
    expect(POD_LIST_TEMPLATE).toContain('{{if .metadata.ownerReferences}}');
  });

  it('ends each pod with a newline, so the output is one row per pod', () => {
    expect(POD_LIST_TEMPLATE.endsWith('\n{{end}}')).toBe(true);
  });
});
