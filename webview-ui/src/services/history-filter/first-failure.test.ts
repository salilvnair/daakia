import { describe, it, expect } from 'vitest';
import {
  clockTime, diffRuns, findFailureBoundaries, likeliestChange, narrow,
} from './first-failure';
import type { HistoryRowLike } from './history-facts';

const NOW = Date.parse('2026-09-19T14:00:00Z');
const MIN = 60_000;

let seq = 0;
function run(
  status: number,
  minutesAgo: number,
  patch: { request?: object; url?: string } = {},
): HistoryRowLike {
  return {
    id: ++seq,
    method: 'POST',
    url: patch.url ?? 'https://api.acme.test/orders',
    status,
    created_at: new Date(NOW - minutesAgo * MIN).toISOString(),
    request_data: JSON.stringify(patch.request ?? {}),
  };
}

const opts = { now: NOW };

describe('finding the boundary', () => {
  it('finds where an endpoint stopped working', () => {
    // History arrives newest-first, which is the order that would report the
    // recovery as the break if it were read as given.
    const rows = [run(500, 5), run(500, 10), run(500, 19), run(200, 30), run(200, 40)];
    const [b] = findFailureBoundaries(rows, opts);
    expect(b.lastGood.status).toBe(200);
    expect(b.firstBad.status).toBe(500);
    expect(b.failuresSince).toBe(3);
  });

  it('says nothing about an endpoint that is working now', () => {
    /*
      An endpoint that broke and recovered has nothing for anybody to do, and a
      card about it trains people to close cards.
    */
    const rows = [run(200, 5), run(500, 20), run(200, 40)];
    expect(findFailureBoundaries(rows, opts)).toEqual([]);
  });

  it('says nothing about an endpoint that never worked', () => {
    // No boundary means no "it used to work", which is the whole claim.
    expect(findFailureBoundaries([run(500, 5), run(500, 20)], opts)).toEqual([]);
  });

  it('treats a request that got no response as a failure', () => {
    const rows = [run(0, 5), run(200, 20)];
    expect(findFailureBoundaries(rows, opts)[0].firstBad.status).toBe(0);
  });

  it('keeps endpoints apart', () => {
    const rows = [
      run(500, 5), run(200, 20),
      run(500, 6, { url: 'https://api.acme.test/invoices' }),
      run(200, 21, { url: 'https://api.acme.test/invoices' }),
    ];
    expect(findFailureBoundaries(rows, opts)).toHaveLength(2);
  });

  it('collapses ids so iterating on one path is one endpoint', () => {
    const rows = [
      run(500, 5, { url: 'https://api.acme.test/orders/8815' }),
      run(200, 20, { url: 'https://api.acme.test/orders/8814' }),
    ];
    const found = findFailureBoundaries(rows, opts);
    expect(found).toHaveLength(1);
    expect(found[0].endpoint).toBe('https://api.acme.test/orders/:id');
  });

  it('lets an old break go, however broken it still is', () => {
    const rows = [run(500, 40 * 24 * 60), run(200, 41 * 24 * 60)];
    expect(findFailureBoundaries(rows, opts)).toEqual([]);
  });

  it('puts the most recent break first', () => {
    const rows = [
      run(500, 5), run(200, 20),
      run(500, 200, { url: 'https://api.acme.test/older' }),
      run(200, 300, { url: 'https://api.acme.test/older' }),
    ];
    expect(findFailureBoundaries(rows, opts)[0].endpoint).toBe('https://api.acme.test/orders');
  });

  it('stays quiet about a boundary somebody has dismissed', () => {
    const rows = [run(500, 5), run(200, 20)];
    const key = findFailureBoundaries(rows, opts)[0].key;
    expect(findFailureBoundaries(rows, { ...opts, dismissed: new Set([key]) })).toEqual([]);
  });
});

describe('what changed between the two runs', () => {
  it('finds a one-character body edit', () => {
    const good = run(200, 20, { request: { body: '{"currency": "INR"}' } });
    const bad = run(500, 5, { request: { body: '{"currency": "inr"}' } });
    const changes = diffRuns(good, bad);
    expect(changes).toHaveLength(1);
    expect(changes[0].where).toBe('body');
    expect(changes[0].after).toContain('inr');
  });

  it('finds a header that appeared, and one that went away', () => {
    const good = run(200, 20, { request: { headers: { 'x-tenant-id': 'acme' } } });
    const bad = run(500, 5, { request: { headers: { 'x-region': 'eu' } } });
    const changes = diffRuns(good, bad).filter(c => c.where === 'header');
    expect(changes.map(c => c.key).sort()).toEqual(['x-region', 'x-tenant-id']);
    expect(changes.find(c => c.key === 'x-tenant-id')!.after).toBe('');
  });

  it('reports a changed query parameter by name', () => {
    const good = run(200, 20, { url: 'https://a.test/orders?page=1' });
    const bad = run(500, 5, { url: 'https://a.test/orders?page=999' });
    const change = diffRuns(good, bad).find(c => c.where === 'query')!;
    expect(change.key).toBe('page');
    expect([change.before, change.after]).toEqual(['1', '999']);
  });

  it('does not report the query twice as a path change', () => {
    // It is already reported field by field; reporting it again would make one
    // change look like two.
    const good = run(200, 20, { url: 'https://a.test/orders?page=1' });
    const bad = run(500, 5, { url: 'https://a.test/orders?page=2' });
    expect(diffRuns(good, bad).filter(c => c.where === 'url')).toEqual([]);
  });

  it('says a token changed without saying what it changed to', () => {
    /*
      The card is the kind of thing people screen-share. A diff that printed
      the Authorization header would be a help feature that leaks a credential.
    */
    const good = run(200, 20, { request: { headers: { authorization: 'Bearer old-token-value' } } });
    const bad = run(500, 5, { request: { headers: { authorization: 'Bearer new-token-value' } } });
    const change = diffRuns(good, bad)[0];
    expect(change.redacted).toBe(true);
    expect(change.before).toBe('(a value)');
    expect(JSON.stringify(change)).not.toContain('old-token-value');
  });

  it('notices the auth type changing', () => {
    const good = run(200, 20, { request: { authType: 'bearer' } });
    const bad = run(500, 5, { request: { authType: 'none' } });
    const change = diffRuns(good, bad).find(c => c.key === 'type')!;
    expect([change.before, change.after]).toEqual(['bearer', 'none']);
  });

  it('reports nothing when the two runs were identical', () => {
    // Which is itself the finding: nothing you sent changed, so it was them.
    const good = run(200, 20, { request: { body: 'same' } });
    const bad = run(500, 5, { request: { body: 'same' } });
    expect(diffRuns(good, bad)).toEqual([]);
  });
});

describe('what the card shows', () => {
  it('puts the body change first, because that is what people were editing', () => {
    const changes = diffRuns(
      run(200, 20, { request: { body: 'a', headers: { 'x-a': '1' } } }),
      run(500, 5, { request: { body: 'b', headers: { 'x-a': '2' } } }),
    );
    expect(likeliestChange(changes)!.where).toBe('body');
  });

  it('shows the change rather than the document', () => {
    const before = `${'x'.repeat(500)}"currency": "INR"${'y'.repeat(500)}`;
    const after = `${'x'.repeat(500)}"currency": "inr"${'y'.repeat(500)}`;
    const n = narrow(before, after);
    expect(n.before.length).toBeLessThan(120);
    expect(n.before).toContain('INR');
    expect(n.after).toContain('inr');
    expect(n.before.startsWith('…')).toBe(true);
  });

  it('leaves a short value alone rather than eliding nothing', () => {
    expect(narrow('INR', 'inr')).toEqual({ before: 'INR', after: 'inr' });
  });

  it('formats the time the way the sentence reads', () => {
    expect(clockTime(Date.parse('2026-09-19T13:41:00'))).toBe('13:41');
    expect(clockTime(NaN)).toBe('');
  });
});
