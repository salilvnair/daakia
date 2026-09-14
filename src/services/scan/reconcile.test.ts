/**
 * Re-scanning a collection somebody has been working in.
 *
 * Every row here is a promise about somebody's work: that a rename does not
 * orphan a request, that an edit is never overwritten without being shown, and
 * that nothing is deleted on the evidence of a file having moved.
 */
import { describe, it, expect } from 'vitest';
import { reconcile, summarise, untouched, defaultSelection } from './reconcile';
import { toRequest, identityOf } from './to-requests';
import type { Finding } from './api-detector';
import type { ExistingRequest } from './reconcile';

const finding = (over: Partial<Finding> = {}): Finding => ({
  method: 'POST', path: '/api/checkout', name: 'Create checkout',
  pathParams: [], queryParams: [], headers: [],
  body: { mode: 'raw', raw: '{"cartId":""}' },
  provenance: {}, detector: 'spring',
  source: { file: 'CheckoutController.java', line: 48 },
  ...over,
});

/** A row the scan wrote and nobody has touched. */
const asWritten = (f: Finding): ExistingRequest => {
  const r = toRequest(f);
  return {
    id: 'row-1', name: r.name, method: r.method, url: r.url,
    scan: r.scan, current: r.scan.written,
  };
};

describe('a request nobody has touched', () => {
  it('is left alone when the code has not changed', () => {
    const f = finding();
    const rows = reconcile([asWritten(f)], [toRequest(f)]);
    expect(rows.map(r => r.outcome)).toEqual(['unchanged']);
  });

  it('is updated silently when the code has', () => {
    // Nothing of anybody's is lost, so there is nothing to ask about.
    const before = finding();
    const after = finding({ body: { mode: 'raw', raw: '{"cartId":"","countryCode":""}' } });
    const rows = reconcile([asWritten(before)], [toRequest(after)]);
    expect(rows.map(r => r.outcome)).toEqual(['updated']);
  });
});

describe('a request somebody has edited', () => {
  const edited = (f: Finding): ExistingRequest => ({
    ...asWritten(f),
    current: 'something-else',            // it no longer hashes to what was written
  });

  it('is a conflict when the code changed too', () => {
    const before = finding();
    const after = finding({ body: { mode: 'raw', raw: '{"cartId":"","countryCode":""}' } });
    const [row] = reconcile([edited(before)], [toRequest(after)]);
    expect(row.outcome).toBe('conflict');
    expect(row.changedFields).toContain('body, headers or parameters');
  });

  it('is not news when the code did not', () => {
    /* Their edit stands. Offering a "conflict" against an unchanged source
       would ask somebody to reconcile their own work with itself. */
    const f = finding();
    const [row] = reconcile([edited(f)], [toRequest(f)]);
    expect(row.outcome).toBe('unchanged');
  });

  it('is recognised as edited', () => {
    expect(untouched(edited(finding()))).toBe(false);
    expect(untouched(asWritten(finding()))).toBe(true);
  });
});

describe('renaming', () => {
  it('does not orphan anything, because identity is the route', () => {
    const f = finding();
    const row = asWritten(f);
    row.name = 'Create a checkout for the demo';      // renamed by hand
    const rows = reconcile([row], [toRequest(f)]);
    expect(rows.map(r => r.outcome)).toEqual(['unchanged']);
  });
});

describe('an endpoint that is no longer there', () => {
  it('is marked, never removed', () => {
    const [row] = reconcile([asWritten(finding())], []);
    expect(row.outcome).toBe('orphaned');
    expect(row.existing).toBeDefined();
    expect(row.next).toBeUndefined();
  });

  it('is not selected by default', () => {
    const rows = reconcile([asWritten(finding())], []);
    expect(defaultSelection(rows).size).toBe(0);
  });
});

describe('a request somebody wrote themselves', () => {
  it('is invisible to the scan', () => {
    // No scan block: the scan did not write it and has no business with it.
    const mine: ExistingRequest = {
      id: 'mine', name: 'Poke staging', method: 'GET',
      url: '{{baseUrl}}/health', current: 'whatever',
    };
    expect(reconcile([mine], [])).toEqual([]);
  });
});

describe('a new endpoint', () => {
  it('is added, and ticked', () => {
    const rows = reconcile([], [toRequest(finding())]);
    expect(rows.map(r => r.outcome)).toEqual(['added']);
    expect(defaultSelection(rows).size).toBe(1);
  });
});

describe('the summary', () => {
  it('counts every outcome', () => {
    const kept = finding();
    const changed = finding({ path: '/api/orders', name: 'List orders' });
    const changedAfter = finding({ path: '/api/orders', name: 'List orders', body: { mode: 'raw', raw: '{"x":1}' } });
    const gone = finding({ path: '/api/coupon', name: 'Coupon' });
    const added = finding({ path: '/api/gift', name: 'Gift' });

    const rows = reconcile(
      [asWritten(kept), asWritten(changed), asWritten(gone)],
      [toRequest(kept), toRequest(changedAfter), toRequest(added)],
    );
    expect(summarise(rows)).toEqual({ added: 1, unchanged: 1, updated: 1, conflict: 0, orphaned: 1 });
  });
});

describe('identity', () => {
  it('separates two handlers that share a path', () => {
    const json = finding({ discriminator: 'json' });
    const form = finding({ discriminator: 'form-data' });
    expect(identityOf(json)).not.toBe(identityOf(form));
    const rows = reconcile([], [toRequest(json), toRequest(form)]);
    expect(rows.map(r => r.outcome)).toEqual(['added', 'added']);
  });
});
