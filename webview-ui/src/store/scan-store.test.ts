/**
 * The scan's state machine, and the two rules that decide what somebody sees
 * before they press the button that writes anything.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../vscode', () => ({ postMsg: vi.fn() }));

import { useScanStore, nameFromDir, isInternal, byFolder, summarise, type ScannedRequest } from './scan-store';

const req = (over: Partial<ScannedRequest> = {}): ScannedRequest => ({
  name: 'Get checkout', method: 'GET', url: '{{baseUrl}}/api/checkout/{id}',
  headers: [], params: [], bodyMode: 'none', bodyRaw: '', authType: 'inherit',
  folder: 'CheckoutController',
  scan: {
    detector: 'spring', source: 'CheckoutController.java:48',
    identity: 'GET /api/checkout/{id}', written: 'abc', at: '2026-01-01T00:00:00Z',
    provenance: { path: { kind: 'read', at: { file: 'CheckoutController.java', line: 48 } } },
  },
  ...over,
});

const apply = (msg: Record<string, unknown>) => useScanStore.getState().apply(msg);

beforeEach(() => useScanStore.setState({
  open: false, stage: 'source', dir: '', requests: [], unresolved: [],
  chosen: new Set(), collectionName: '', detected: [], profiles: [], profile: undefined,
}));

describe('the result', () => {
  it('lands on the review screen with everything it found', () => {
    apply({ type: 'scan:result', dir: '/repo/checkout-service', requests: [req(), req({ scan: { ...req().scan, identity: 'POST /api/checkout' } })] });
    const s = useScanStore.getState();
    expect(s.stage).toBe('review');
    expect(s.requests).toHaveLength(2);
  });

  it('names the collection after the repository', () => {
    apply({ type: 'scan:result', dir: 'C:\\work\\checkout-service', requests: [] });
    expect(useScanStore.getState().collectionName).toBe('checkout-service');
  });

  it('ticks everything except what nobody came for', () => {
    /* Internal and actuator endpoints are listed — they are real — but arriving
       ticked in a collection somebody is about to run is not what was wanted. */
    const normal = req();
    const internal = req({
      url: '{{baseUrl}}/internal/reindex',
      scan: { ...req().scan, identity: 'POST /internal/reindex' },
    });
    apply({ type: 'scan:result', dir: '/r', requests: [normal, internal] });
    const { chosen, requests } = useScanStore.getState();
    expect(requests).toHaveLength(2);
    expect(chosen.has('GET /api/checkout/{id}')).toBe(true);
    expect(chosen.has('POST /internal/reindex')).toBe(false);
  });
});

describe('opening it again', () => {
  it('forgets the last repository’s name', () => {
    /* The name is derived from the folder. Kept across scans, a scan of the
       next repository proposes a collection named after the previous one. */
    apply({ type: 'scan:result', dir: '/repo/checkout-service', requests: [] });
    useScanStore.getState().openScan();
    apply({ type: 'scan:result', dir: '/repo/orders-service', requests: [] });
    expect(useScanStore.getState().collectionName).toBe('orders-service');
  });

  it('keeps a name typed during the scan it belongs to', () => {
    apply({ type: 'scan:result', dir: '/repo/checkout-service', requests: [] });
    useScanStore.getState().setCollectionName('Checkout (staging)');
    apply({ type: 'scan:result', dir: '/repo/checkout-service', requests: [] });
    expect(useScanStore.getState().collectionName).toBe('Checkout (staging)');
  });
});

describe('inspecting a folder', () => {
  it('takes the answer for the folder that is still in the box', () => {
    useScanStore.setState({ dir: '/repo/a' });
    apply({ type: 'scan:inspected', dir: '/repo/a', detected: [{ id: 'spring', label: 'Spring Boot' }], profiles: ['local'] });
    expect(useScanStore.getState().detected).toHaveLength(1);
  });

  it('ignores an answer for a folder somebody has already moved on from', () => {
    /* The box can change twice while the host is reading a tree, and a stale
       reply would claim a framework for a folder nobody is looking at. */
    useScanStore.setState({ dir: '/repo/b' });
    apply({ type: 'scan:inspected', dir: '/repo/a', detected: [{ id: 'spring', label: 'Spring Boot' }] });
    expect(useScanStore.getState().detected).toEqual([]);
  });
});

describe('failure', () => {
  it('is a stage, not a silence', () => {
    apply({ type: 'scan:error', message: 'That folder could not be read.' });
    const s = useScanStore.getState();
    expect(s.stage).toBe('error');
    expect(s.error).toContain('could not be read');
  });
});

describe('choosing', () => {
  beforeEach(() => {
    apply({ type: 'scan:result', dir: '/r', requests: [req(), req({ scan: { ...req().scan, identity: 'POST /api/checkout' } })] });
  });

  it('toggles one', () => {
    useScanStore.getState().toggle('GET /api/checkout/{id}');
    expect(useScanStore.getState().chosen.has('GET /api/checkout/{id}')).toBe(false);
  });

  it('toggles all', () => {
    useScanStore.getState().toggleAll(false);
    expect(useScanStore.getState().chosen.size).toBe(0);
    useScanStore.getState().toggleAll(true);
    expect(useScanStore.getState().chosen.size).toBe(2);
  });
});

describe('the helpers', () => {
  it('names a repository from either kind of path', () => {
    expect(nameFromDir('/home/me/checkout-service')).toBe('checkout-service');
    expect(nameFromDir('C:\\work\\checkout-service\\')).toBe('checkout-service');
  });

  it('knows what is internal', () => {
    expect(isInternal(req({ url: '{{baseUrl}}/internal/x' }))).toBe(true);
    expect(isInternal(req({ url: '{{baseUrl}}/actuator/health' }))).toBe(true);
    expect(isInternal(req({ url: '{{baseUrl}}/api/internally-managed' }))).toBe(false);
  });

  it('groups by the file, which is the folder each will land in', () => {
    const groups = byFolder([req(), req({ folder: 'OrderController' }), req()]);
    expect(groups.map(g => [g.folder, g.requests.length]))
      .toEqual([['CheckoutController', 2], ['OrderController', 1]]);
  });

  it('counts provenance across every request, which is the headline', () => {
    const counts = summarise([
      req(),
      req({ scan: { ...req().scan, provenance: {
        path: { kind: 'resolved', at: { file: 'X.java', line: 1 }, from: '@MyController' },
        body: { kind: 'generated', rule: '@Email' },
      } } }),
    ]);
    expect(counts).toMatchObject({ read: 1, resolved: 1, generated: 1 });
  });
});
