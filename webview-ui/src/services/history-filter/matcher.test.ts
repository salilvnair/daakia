import { describe, it, expect } from 'vitest';
import {
  EMPTY, HAS_VALUES, STATUS_VALUES, WHEN_VALUES, newCondition, parseQuery,
  type Condition, type FilterState,
} from './filter-model';
import { applyFilter, buildFacet, contextOf, matchesRow } from './matcher';
import { factsOf, type HistoryRowLike } from './history-facts';
import { buildSavedIndex } from './saved-index';

const NOW = Date.parse('2026-09-19T12:00:00Z');
const DAY = 86_400_000;

let seq = 0;
function row(patch: Partial<HistoryRowLike> & { request?: object; response?: object } = {}): HistoryRowLike {
  const { request, response, ...rest } = patch;
  return {
    id: ++seq,
    method: 'GET',
    url: 'https://api.acme.test/orders',
    status: 200,
    protocol: 'rest',
    created_at: new Date(NOW - DAY).toISOString(),
    request_data: JSON.stringify(request ?? {}),
    response_data: response ? JSON.stringify(response) : undefined,
    ...rest,
  };
}

function cond(patch: Partial<Condition>): Condition {
  return { ...newCondition(), ...patch };
}

function state(patch: Partial<FilterState>): FilterState {
  return { ...EMPTY, ...patch };
}

const ctx = contextOf(undefined, NOW);

describe('facet terms', () => {
  it('matches a method, case however it was stored', () => {
    const r = row({ method: 'post' });
    expect(matchesRow(r, state({ terms: [{ field: 'method', values: ['post'] }] }), ctx)).toBe(true);
    expect(matchesRow(r, state({ terms: [{ field: 'method', values: ['get'] }] }), ctx)).toBe(false);
  });

  it('two values in one facet means either', () => {
    const r = row({ method: 'PUT' });
    expect(matchesRow(r, state({ terms: [{ field: 'method', values: ['get', 'put'] }] }), ctx)).toBe(true);
  });

  it('two facets means both', () => {
    const r = row({ method: 'POST', status: 500 });
    const both = state({ terms: [
      { field: 'method', values: ['post'] },
      { field: 'status', values: ['5xx'] },
    ] });
    expect(matchesRow(r, both, ctx)).toBe(true);
    expect(matchesRow(row({ method: 'POST', status: 200 }), both, ctx)).toBe(false);
  });

  it('negation excludes the whole clause, not each value', () => {
    // `-status:2xx,3xx` is "neither", which is what ticking two and excluding means.
    const term = { field: 'status' as const, values: ['2xx', '3xx'], negated: true };
    expect(matchesRow(row({ status: 200 }), state({ terms: [term] }), ctx)).toBe(false);
    expect(matchesRow(row({ status: 302 }), state({ terms: [term] }), ctx)).toBe(false);
    expect(matchesRow(row({ status: 404 }), state({ terms: [term] }), ctx)).toBe(true);
  });

  it('filters by when, against the clock it is given', () => {
    const old = row({ created_at: new Date(NOW - 40 * DAY).toISOString() });
    const recent = row({ created_at: new Date(NOW - 2 * DAY).toISOString() });
    const week = state({ terms: [{ field: 'when', values: ['week'] }] });
    expect(matchesRow(recent, week, ctx)).toBe(true);
    expect(matchesRow(old, week, ctx)).toBe(false);
    expect(matchesRow(old, state({ terms: [{ field: 'when', values: ['>30d'] }] }), ctx)).toBe(true);
  });

  it('knows which rows are not in any collection', () => {
    const saved = buildSavedIndex([{ id: 'c', name: 'Orders', requests: [
      { method: 'GET', url: 'https://api.acme.test/orders/{{id}}' },
    ] }]);
    const withSaved = contextOf(saved, NOW);
    const inCollection = row({ url: 'https://api.acme.test/orders/99' });
    const not = row({ url: 'https://api.acme.test/invoices' });
    const unsaved = state({ terms: [{ field: 'saved', values: ['no'] }] });
    expect(matchesRow(inCollection, unsaved, withSaved)).toBe(false);
    expect(matchesRow(not, unsaved, withSaved)).toBe(true);
  });

  it('has:secret finds a filled token and passes over an empty one', () => {
    /*
      A Bearer row with nothing in it is exactly the request somebody opens this
      filter to find. Calling it a secret would hide it.
    */
    const filled = row({ request: { authType: 'bearer', authData: { token: 'abc' } } });
    const blank = row({ request: { authType: 'bearer', authData: { token: '' } } });
    const secret = state({ terms: [{ field: 'has', values: ['secret'] }] });
    expect(matchesRow(filled, secret, ctx)).toBe(true);
    expect(matchesRow(blank, secret, ctx)).toBe(false);
  });

  it('matches specific rows by id, which is how a card shows its runs', () => {
    /*
      Not a facet anybody ticks — it exists so "show me those three runs" is a
      filter with a chip you can take off, rather than a second display mode
      the panel could disagree with.
    */
    const rows = [row({ id: 501 }), row({ id: 502 }), row({ id: 503 })];
    const ids = state({ terms: [{ field: 'ids', values: ['501', '503'] }] });
    expect(applyFilter(rows, ids, ctx).map(r => r.id)).toEqual([501, 503]);
  });

  it('has:script covers either script, and the two are separable', () => {
    const pre = row({ request: { preRequestScript: 'dk.env.set("a",1)' } });
    expect(matchesRow(pre, state({ terms: [{ field: 'has', values: ['script'] }] }), ctx)).toBe(true);
    expect(matchesRow(pre, state({ terms: [{ field: 'has', values: ['prescript'] }] }), ctx)).toBe(true);
    expect(matchesRow(pre, state({ terms: [{ field: 'has', values: ['postscript'] }] }), ctx)).toBe(false);
  });
});

describe('conditions', () => {
  const withHeaders = row({ request: {
    headers: [
      { key: 'Authorization', value: 'Bearer abc123', enabled: true },
      { key: 'X-Tenant-Id', value: 'acme', enabled: true },
      { key: 'X-Disabled', value: 'nope', enabled: false },
    ],
  } });

  it('matches a named header by value, case-insensitively both ways', () => {
    expect(matchesRow(withHeaders, state({ conditions: [
      cond({ field: 'header', key: 'authorization', op: 'contains', value: 'bearer' }),
    ] }), ctx)).toBe(true);
  });

  it('ignores a header the user had unticked, because it was never sent', () => {
    expect(matchesRow(withHeaders, state({ conditions: [
      cond({ field: 'header', key: 'x-disabled', op: 'present', value: '' }),
    ] }), ctx)).toBe(false);
  });

  it('present and absent are exact opposites', () => {
    const present = state({ conditions: [cond({ field: 'header', key: 'x-tenant-id', op: 'present', value: '' })] });
    const absent = state({ conditions: [cond({ field: 'header', key: 'x-tenant-id', op: 'absent', value: '' })] });
    expect(matchesRow(withHeaders, present, ctx)).toBe(true);
    expect(matchesRow(withHeaders, absent, ctx)).toBe(false);
  });

  it('an unnamed header condition looks at names as well as values', () => {
    // Somebody who typed `tenant` with no header picked meant "anywhere".
    expect(matchesRow(withHeaders, state({ conditions: [
      cond({ field: 'header', key: '*', op: 'contains', value: 'tenant' }),
    ] }), ctx)).toBe(true);
  });

  it('matches a JSONPath in the request body', () => {
    const r = row({ request: { body: '{"orderId":"A-17","items":[{"sku":"PEN-1"}]}' } });
    expect(matchesRow(r, state({ conditions: [
      cond({ field: 'json', key: '$.orderId', op: 'equals', value: 'A-17' }),
    ] }), ctx)).toBe(true);
    expect(matchesRow(r, state({ conditions: [
      cond({ field: 'json', key: '$.items[*].sku', op: 'contains', value: 'PEN' }),
    ] }), ctx)).toBe(true);
  });

  it('searches response bodies, always', () => {
    const r = row({ response: { body: '{"error":"SocketTimeout after 30s"}' } });
    expect(matchesRow(r, state({ conditions: [
      cond({ field: 'resbody', key: 'text', op: 'contains', value: 'sockettimeout' }),
    ] }), ctx)).toBe(true);
    expect(matchesRow(r, state({ conditions: [
      cond({ field: 'resjson', key: '$.error', op: 'starts', value: 'Socket' }),
    ] }), ctx)).toBe(true);
  });

  it('finds a script by what it calls', () => {
    const r = row({ request: { postResponseScript: 'dk.env.set("token", res.body.token)' } });
    expect(matchesRow(r, state({ conditions: [
      cond({ field: 'script', key: 'any', op: 'contains', value: 'dk.env.set' }),
    ] }), ctx)).toBe(true);
    expect(matchesRow(r, state({ conditions: [
      cond({ field: 'script', key: 'pre', op: 'contains', value: 'dk.env.set' }),
    ] }), ctx)).toBe(false);
  });

  it('treats a half-written regex as matching nothing rather than throwing', () => {
    const r = row({ url: 'https://api.acme.test/orders' });
    expect(() => matchesRow(r, state({ conditions: [
      cond({ field: 'url', key: 'text', op: 'regex', value: 'orders(' }),
    ] }), ctx)).not.toThrow();
    expect(matchesRow(r, state({ conditions: [
      cond({ field: 'url', key: 'text', op: 'regex', value: 'ord(er)s$' }),
    ] }), ctx)).toBe(true);
  });

  it('several conditions are all required', () => {
    const r = row({ method: 'POST', request: { body: '{"a":1}', headers: { 'x-a': '1' } } });
    expect(matchesRow(r, parseQuery('header:x-a:present body:text:contains:"a"'), ctx)).toBe(true);
    expect(matchesRow(r, parseQuery('header:x-b:present body:text:contains:"a"'), ctx)).toBe(false);
  });

  it('matches any row in a bracket, and every bracket', () => {
    /*
      `(body contains alpha or body contains beta) and method POST` — the shape
      the user asked for, checked against all four combinations.
    */
    const or = (v: string, join?: 'or') =>
      cond({ field: 'body', key: 'text', op: 'contains', value: v, join });
    const s = state({
      terms: [{ field: 'method', values: ['post'] }],
      conditions: [or('alpha'), or('beta', 'or')],
    });
    expect(matchesRow(row({ method: 'POST', request: { body: 'alpha' } }), s, ctx)).toBe(true);
    expect(matchesRow(row({ method: 'POST', request: { body: 'beta' } }), s, ctx)).toBe(true);
    expect(matchesRow(row({ method: 'POST', request: { body: 'gamma' } }), s, ctx)).toBe(false);
    expect(matchesRow(row({ method: 'GET', request: { body: 'alpha' } }), s, ctx)).toBe(false);
  });

  it('ANDs a negated row sitting in its own bracket', () => {
    // "(1 or 2) and not 3" — the third clause of the user's example.
    const s = parseQuery(
      'body:text:contains:alpha|body:text:contains:beta -body:text:contains:gamma');
    expect(matchesRow(row({ request: { body: 'alpha' } }), s, ctx)).toBe(true);
    expect(matchesRow(row({ request: { body: 'alpha gamma' } }), s, ctx)).toBe(false);
  });

  it('negates a condition without negating the others', () => {
    const r = row({ request: { headers: { cookie: 'sid=1' } } });
    expect(matchesRow(r, state({ conditions: [
      cond({ field: 'header', key: 'cookie', op: 'present', value: '', negated: true }),
    ] }), ctx)).toBe(false);
  });

  it('survives a row whose stored data will not parse', () => {
    // One corrupt row should cost you that row, not the filter.
    const broken: HistoryRowLike = { ...row(), request_data: '{not json' };
    expect(() => matchesRow(broken, state({ conditions: [
      cond({ field: 'header', key: '*', op: 'present', value: '' }),
    ] }), ctx)).not.toThrow();
    expect(matchesRow(broken, state({ conditions: [
      cond({ field: 'header', key: '*', op: 'present', value: '' }),
    ] }), ctx)).toBe(false);
  });
});

describe('free text', () => {
  it('reaches the URL, the method and both bodies', () => {
    expect(matchesRow(row({ url: 'https://a.test/invoices' }), state({ text: 'invoice' }), ctx)).toBe(true);
    expect(matchesRow(row({ request: { body: 'currency INR' } }), state({ text: 'inr' }), ctx)).toBe(true);
    expect(matchesRow(row({ response: { body: 'rate limited' } }), state({ text: 'rate lim' }), ctx)).toBe(true);
  });

  it('does not reach headers, so Bearer is not every authorised request', () => {
    const r = row({ request: { headers: { authorization: 'Bearer abc' } } });
    expect(matchesRow(r, state({ text: 'bearer' }), ctx)).toBe(false);
  });
});

describe('cost ordering', () => {
  it('never opens a body for a row a facet already rejected', () => {
    /*
      This is what pays for searching response bodies on every keystroke, so it
      is asserted rather than assumed: the getter is spied on through the facts
      object the matcher will reuse.
    */
    const r = row({ method: 'GET', response: { body: 'x'.repeat(1000) } });
    const facts = factsOf(r);
    let opened = 0;
    Object.defineProperty(facts, 'responseBody', { get() { opened++; return 'x'; } });

    matchesRow(r, state({
      terms: [{ field: 'method', values: ['post'] }],
      conditions: [cond({ field: 'resbody', key: 'text', op: 'contains', value: 'x' })],
    }), ctx);
    expect(opened).toBe(0);
  });
});

describe('facets and their live counts', () => {
  const rows = [
    row({ method: 'GET', status: 200 }),
    row({ method: 'GET', status: 500 }),
    row({ method: 'POST', status: 500 }),
  ];

  it('counts a facet with every other filter applied but not its own', () => {
    /*
      With `status:5xx` on, the method facet must read GET 1 / POST 1 — the
      number you would get if you ticked it, not the unfiltered total.
    */
    const s = state({ terms: [{ field: 'status', values: ['5xx'] }] });
    const facet = buildFacet(rows, s, 'method', 'Method', undefined, v => v.toUpperCase(), ctx);
    expect(facet.values.map(v => [v.value, v.count])).toEqual([['get', 1], ['post', 1]]);
  });

  it('leaves its own facet lifted, so siblings are not all zero', () => {
    const s = state({ terms: [{ field: 'method', values: ['get'] }] });
    const facet = buildFacet(rows, s, 'method', 'Method', undefined, v => v, ctx);
    const post = facet.values.find(v => v.value === 'post')!;
    expect(post.count).toBe(1);
    expect(facet.values.find(v => v.value === 'get')!.ticked).toBe(true);
  });

  it('keeps a zero value in the list rather than hiding it', () => {
    const facet = buildFacet(rows, EMPTY, 'status', 'Status', STATUS_VALUES, v => v, ctx);
    expect(facet.values.map(v => v.value)).toEqual([...STATUS_VALUES]);
    expect(facet.values.find(v => v.value === '4xx')!.count).toBe(0);
  });

  it('holds fixed facets in their declared order, not by size', () => {
    const facet = buildFacet(rows, EMPTY, 'has', 'Has', HAS_VALUES, v => v, ctx);
    expect(facet.values.map(v => v.value)).toEqual([...HAS_VALUES]);
  });

  it('counts when-phrases by asking, since no row holds one as a value', () => {
    const mixed = [
      row({ created_at: new Date(NOW - 2 * DAY).toISOString() }),
      row({ created_at: new Date(NOW - 40 * DAY).toISOString() }),
    ];
    const facet = buildFacet(mixed, EMPTY, 'when', 'When', WHEN_VALUES, v => v, ctx);
    expect(facet.values.find(v => v.value === 'week')!.count).toBe(1);
    expect(facet.values.find(v => v.value === '>30d')!.count).toBe(1);
  });
});

describe('applying the whole thing', () => {
  it('returns the rows in the order they came, filtered', () => {
    const rows = [
      row({ id: 1, method: 'GET' }),
      row({ id: 2, method: 'POST' }),
      row({ id: 3, method: 'POST' }),
    ];
    const out = applyFilter(rows, parseQuery('method:post'), ctx);
    expect(out.map(r => r.id)).toEqual([2, 3]);
  });

  it('an empty filter keeps everything', () => {
    const rows = [row(), row()];
    expect(applyFilter(rows, EMPTY, ctx)).toHaveLength(2);
  });
});
