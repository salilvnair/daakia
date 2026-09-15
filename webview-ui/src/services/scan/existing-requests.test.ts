/**
 * Reading back what a scan wrote.
 *
 * The test that matters is the round trip: a request the scan wrote, stored
 * the way the collection stores it, must hash to the value the scan recorded.
 * If it does not, every request comes back "edited" and a quiet update becomes
 * a screen full of conflicts nobody caused — which is worse than not offering
 * re-scan at all.
 */
import { describe, it, expect } from 'vitest';
import { existingRequests, currentFingerprint, flattenRequests, findNode } from './existing-requests';
import { toCollectionRequest } from '../collections/import-to-collection';
import type { CollectionNodeWithRequests, CollectionRequestRow } from './existing-requests';

/** What the scan produces for one endpoint, in `to-requests.ts`'s shape. */
const scanned = (over: Record<string, unknown> = {}) => ({
  name: 'Create checkout',
  method: 'POST',
  url: '{{baseUrl}}/api/checkout',
  headers: [{ key: 'Idempotency-Key', value: '', enabled: true }],
  params: [{ key: 'dryRun', value: '', enabled: false }],
  bodyMode: 'raw' as const,
  bodyRaw: '{"cartId":""}',
  authType: 'inherit',
  scan: {
    detector: 'spring',
    source: 'CheckoutController.java:48',
    identity: 'POST /api/checkout',
    /* The hash `to-requests.ts` computes for exactly the fields above. */
    written: '',
    at: '2026-01-01T00:00:00Z',
    provenance: {},
  },
  ...over,
});

/** Store it the way `importRequestsAsCollection` does. */
function store(req: Record<string, unknown>): CollectionRequestRow {
  const row = toCollectionRequest({ ...req, scan: req.scan });
  return { id: row.id, name: row.name, method: row.method, url: row.url, data: JSON.stringify(row.data) };
}

describe('the round trip', () => {
  it('hashes a stored request to what the scan hashed', () => {
    /*
      Computed here the way to-requests.ts computes it: method, bare path,
      body, headers, params. The collection store adds a trailing blank row to
      headers and params, and that must not change the answer.
    */
    const req = scanned();
    const before = currentFingerprint({
      id: 'x', name: String(req.name), method: String(req.method), url: String(req.url),
      data: JSON.stringify({ headers: req.headers, params: req.params, bodyRaw: req.bodyRaw }),
    });
    const after = currentFingerprint(store(req));
    expect(after).toBe(before);
  });

  it('is unchanged by the blank row the collection store appends', () => {
    const withBlank = currentFingerprint({
      id: 'x', name: 'n', method: 'POST', url: '{{baseUrl}}/api/checkout',
      data: JSON.stringify({
        headers: [{ key: 'A', value: '1' }, { key: '', value: '' }],
        params: [], bodyRaw: '',
      }),
    });
    const without = currentFingerprint({
      id: 'x', name: 'n', method: 'POST', url: '{{baseUrl}}/api/checkout',
      data: JSON.stringify({ headers: [{ key: 'A', value: '1' }], params: [], bodyRaw: '' }),
    });
    expect(withBlank).toBe(without);
  });

  it('changes when the body changes', () => {
    const a = currentFingerprint(store(scanned()));
    const b = currentFingerprint(store(scanned({ bodyRaw: '{"cartId":"","countryCode":""}' })));
    expect(a).not.toBe(b);
  });

  it('changes when a header changes', () => {
    const a = currentFingerprint(store(scanned()));
    const b = currentFingerprint(store(scanned({
      headers: [{ key: 'Idempotency-Key', value: 'abc', enabled: true }],
    })));
    expect(a).not.toBe(b);
  });

  it('ignores the name, which people rename', () => {
    const a = currentFingerprint(store(scanned()));
    const b = currentFingerprint(store(scanned({ name: 'Create a checkout for the demo' })));
    expect(a).toBe(b);
  });

  it('ignores the base URL variable, which is not part of the path', () => {
    const withVar = currentFingerprint({ id: 'x', name: 'n', method: 'GET', url: '{{baseUrl}}/api/x' });
    const bare = currentFingerprint({ id: 'x', name: 'n', method: 'GET', url: '/api/x' });
    expect(withVar).toBe(bare);
  });
});

describe('reading a collection', () => {
  const tree: CollectionNodeWithRequests[] = [
    {
      id: 'c1', name: 'checkout-service',
      requests: [
        { id: 'r0', name: 'Health', method: 'GET', url: '{{baseUrl}}/health' },
      ],
      children: [
        {
          id: 'f1', name: 'CheckoutController',
          requests: [
            {
              id: 'r1', name: 'Create checkout', method: 'POST', url: '{{baseUrl}}/api/checkout',
              data: JSON.stringify({ scan: { identity: 'POST /api/checkout', written: 'abc' } }),
            },
          ],
        },
      ],
    },
    { id: 'c2', name: 'Other', requests: [] },
  ];

  it('flattens folders, because a scan writes one folder per file', () => {
    expect(flattenRequests(tree[0]).map(r => r.id)).toEqual(['r0', 'r1']);
  });

  it('finds a collection anywhere in the tree', () => {
    expect(findNode(tree, 'f1')?.name).toBe('CheckoutController');
    expect(findNode(tree, 'nope')).toBeUndefined();
  });

  it('carries the scan stamp through', () => {
    const rows = existingRequests(tree, 'c1');
    expect(rows.find(r => r.id === 'r1')?.scan?.identity).toBe('POST /api/checkout');
  });

  it('marks a hand-written request as having no stamp', () => {
    /* No stamp means a person made it, and reconciliation leaves it alone. */
    const rows = existingRequests(tree, 'c1');
    expect(rows.find(r => r.id === 'r0')?.scan).toBeUndefined();
  });

  it('says which folder each one lives in', () => {
    /* An update writes the request back to a collection id. Take the root's
       and a request that lives in a folder gets re-filed by being updated. */
    const rows = existingRequests(tree, 'c1');
    expect(rows.find(r => r.id === 'r1')?.collectionId).toBe('f1');
    expect(rows.find(r => r.id === 'r0')?.collectionId).toBe('c1');
  });

  it('is empty for a collection that is not there', () => {
    expect(existingRequests(tree, 'gone')).toEqual([]);
  });
});
