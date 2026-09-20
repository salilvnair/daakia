import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MIN_SENDS, proposeFolder, proposeName, suggestSaves, suggestionForSend,
} from './repeat-suggest';
import { buildSavedIndex, EMPTY_SAVED_INDEX } from './saved-index';
import type { HistoryRowLike } from './history-facts';

const NOW = Date.parse('2026-09-19T12:00:00Z');
const DAY = 86_400_000;

let seq = 0;
function sends(n: number, patch: Partial<HistoryRowLike>, spreadDays = 0): HistoryRowLike[] {
  return Array.from({ length: n }, (_, i) => ({
    id: ++seq,
    method: 'GET',
    url: 'https://api.acme.test/orders',
    status: 200,
    created_at: new Date(NOW - (spreadDays ? i % spreadDays : 0) * DAY - i * 1000).toISOString(),
    ...patch,
  }));
}

describe('proposing a name from the path alone', () => {
  it('reads the REST convention the path already encodes', () => {
    expect(proposeName('GET', 'https://a.test/orders')).toBe('List orders');
    expect(proposeName('GET', 'https://a.test/orders/:id')).toBe('Get order');
    expect(proposeName('POST', 'https://a.test/orders')).toBe('Create order');
    expect(proposeName('DELETE', 'https://a.test/orders/:id')).toBe('Delete order');
    expect(proposeName('PATCH', 'https://a.test/orders/:id')).toBe('Update order');
  });

  it('names the thing nearest the end, not the first noun in the path', () => {
    // `/orders/:id/items` is about items.
    expect(proposeName('GET', 'https://a.test/orders/:id/items')).toBe('List items');
  });

  it('turns a slug or a camel hump into words', () => {
    expect(proposeName('GET', 'https://a.test/user-profiles')).toBe('List user profiles');
    expect(proposeName('GET', 'https://a.test/userProfiles')).toBe('List user profiles');
  });

  it('singularises only where English is unambiguous', () => {
    expect(proposeName('POST', 'https://a.test/categories')).toBe('Create category');
    expect(proposeName('GET', 'https://a.test/status/:id')).toBe('Get status');
    expect(proposeName('GET', 'https://a.test/addresses/:id')).toBe('Get address');
  });

  it('names a path-less endpoint after its host, not "request"', () => {
    /*
      GraphQL and RPC endpoints are a bare origin. Every one of them used to
      come out as "Create request" — a name nobody would keep.
    */
    expect(proposeName('POST', 'https://countries.trevorblades.com')).toBe('Create trevorblades');
    expect(proposeName('POST', 'https://api.payments.io/')).toBe('Create payments');
    expect(proposeName('POST', 'http://orders-service')).toBe('Create orders service');
  });

  it('falls back only when there is nothing at all to name it after', () => {
    expect(proposeName('POST', '')).toBe('Create request');
  });
});

describe('proposing a folder', () => {
  const tree = [
    { id: 'orders', name: 'Orders', requests: [{ method: 'GET', url: 'https://api.acme.test/orders/{{id}}' }] },
    { id: 'billing', name: 'Billing', requests: [{ method: 'GET', url: 'https://api.acme.test/invoices' }] },
    { id: 'other', name: 'Other API', requests: [{ method: 'GET', url: 'https://elsewhere.test/orders' }] },
  ];

  it('picks the collection whose requests share the most path', () => {
    expect(proposeFolder('https://api.acme.test/orders', tree)?.name).toBe('Orders');
    expect(proposeFolder('https://api.acme.test/invoices/:id', tree)?.name).toBe('Billing');
  });

  it('offers nothing when there is no neighbourhood, rather than a folder at random', () => {
    /*
      An arbitrary folder is worse than an empty box: it is the kind of wrong
      that gets accepted by reflex and then has to be undone.
    */
    expect(proposeFolder('https://unrelated.test/things', tree)).toBeUndefined();
    expect(proposeFolder('https://a.test/x', [])).toBeUndefined();
  });
});

describe('when a suggestion appears', () => {
  const opts = { saved: EMPTY_SAVED_INDEX };

  it('says nothing below the threshold', () => {
    expect(suggestSaves(sends(DEFAULT_MIN_SENDS - 1, {}), opts)).toEqual([]);
  });

  it('offers an endpoint sent often enough', () => {
    const out = suggestSaves(sends(DEFAULT_MIN_SENDS, {}), opts);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(DEFAULT_MIN_SENDS);
    expect(out[0].name).toBe('List orders');
  });

  it('counts one endpoint, not one URL per id', () => {
    // Eleven sends while iterating on an id is one request, not eleven.
    const rows = Array.from({ length: 11 }, (_, i) => sends(1, {
      url: `https://api.acme.test/orders/${8814 + i}`,
    })[0]);
    const out = suggestSaves(rows, opts);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(11);
    expect(out[0].endpoint).toBe('https://api.acme.test/orders/:id');
  });

  it('keeps methods apart', () => {
    const rows = [...sends(6, { method: 'GET' }), ...sends(6, { method: 'POST' })];
    expect(suggestSaves(rows, opts).map(s => s.method).sort()).toEqual(['GET', 'POST']);
  });

  it('never offers something already in a collection', () => {
    const saved = buildSavedIndex([{ id: 'c', name: 'Orders', requests: [
      { method: 'GET', url: 'https://api.acme.test/orders' },
    ] }]);
    expect(suggestSaves(sends(9, {}), { saved })).toEqual([]);
  });

  it('stays quiet about something already dismissed', () => {
    const first = suggestSaves(sends(9, {}), opts)[0];
    const again = suggestSaves(sends(9, {}), { ...opts, dismissed: new Set([first.key]) });
    expect(again).toEqual([]);
  });

  it('points at the newest send, which has the body as it ended up', () => {
    const rows = [
      { id: 101, method: 'GET', url: 'https://api.acme.test/orders', created_at: new Date(NOW - 5000).toISOString() },
      ...sends(5, {}),
      { id: 999, method: 'GET', url: 'https://api.acme.test/orders', created_at: new Date(NOW).toISOString() },
    ];
    expect(suggestSaves(rows, opts)[0].rowId).toBe(999);
  });

  it('says how long it has been going on', () => {
    const oneDay = suggestSaves(sends(6, {}), { ...opts, now: NOW })[0];
    expect(oneDay.days).toBe(1);
    expect(oneDay.sentToday).toBe(true);
    expect(oneDay.reason).toContain('today');

    const spread = suggestSaves(sends(6, {}, 3), { ...opts, now: NOW })[0];
    expect(spread.days).toBe(3);
    expect(spread.reason).toContain('3 days');
  });

  it('does not call last Tuesday "today"', () => {
    /*
      One distinct day is not the same as the current one, and a card that said
      "today" over timestamps reading last week would be plainly wrong.
    */
    const lastWeek = sends(6, { created_at: new Date(NOW - 7 * DAY).toISOString() });
    const s = suggestSaves(lastWeek, { ...opts, now: NOW })[0];
    expect(s.days).toBe(1);
    expect(s.sentToday).toBe(false);
    expect(s.reason).toBe('Sent 6 times, never saved');
  });

  it('sorts the busiest first', () => {
    const rows = [
      ...sends(6, { url: 'https://api.acme.test/a' }),
      ...sends(12, { url: 'https://api.acme.test/b' }),
    ];
    expect(suggestSaves(rows, opts).map(s => s.count)).toEqual([12, 6]);
  });
});

describe('the card shown on send', () => {
  const sent = { method: 'GET', url: 'https://api.acme.test/orders' };

  it('is about the request just sent, not the busiest one', () => {
    const rows = [
      ...sends(20, { url: 'https://api.acme.test/other' }),
      ...sends(7, {}),
    ];
    expect(suggestionForSend(sent, rows, { saved: EMPTY_SAVED_INDEX })?.endpoint)
      .toBe('https://api.acme.test/orders');
  });

  it('says nothing when that request is saved, dismissed, or still rare', () => {
    const rows = sends(7, {});
    const saved = buildSavedIndex([{ id: 'c', name: 'C', requests: [sent] }]);
    expect(suggestionForSend(sent, rows, { saved })).toBeUndefined();
    expect(suggestionForSend(sent, rows, {
      saved: EMPTY_SAVED_INDEX,
      dismissed: new Set(['GET https://api.acme.test/orders']),
    })).toBeUndefined();
    expect(suggestionForSend(sent, sends(2, {}), { saved: EMPTY_SAVED_INDEX })).toBeUndefined();
  });
});
