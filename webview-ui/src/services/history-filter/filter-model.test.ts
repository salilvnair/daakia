import { describe, it, expect } from 'vitest';
import {
  EMPTY, activeCount, chipsOf, describeCondition, dropField, except, formatQuery,
  isEmpty, isUsable, newCondition, only, parseQuery, statusBucket, toggleValue,
  type Condition, type FilterState,
} from './filter-model';

function cond(patch: Partial<Condition>): Condition {
  return { ...newCondition(), ...patch };
}

describe('the filter state', () => {
  it('starts empty and says so', () => {
    expect(isEmpty(EMPTY)).toBe(true);
    expect(activeCount(EMPTY)).toBe(0);
  });

  it('ticks and unticks one value', () => {
    const on = toggleValue(EMPTY, 'method', 'POST');
    expect(on.terms).toEqual([{ field: 'method', values: ['post'] }]);
    expect(isEmpty(toggleValue(on, 'method', 'post'))).toBe(true);
  });

  it('keeps several values in one facet, which means either', () => {
    const two = toggleValue(toggleValue(EMPTY, 'method', 'get'), 'method', 'post');
    expect(two.terms[0].values).toEqual(['get', 'post']);
  });

  it('only replaces the facet; except negates it', () => {
    const many = toggleValue(toggleValue(EMPTY, 'method', 'get'), 'method', 'post');
    expect(only(many, 'method', 'put').terms[0].values).toEqual(['put']);
    const ex = except(many, 'status', '2xx');
    expect(ex.terms.find(t => t.field === 'status')).toEqual({
      field: 'status', values: ['2xx'], negated: true,
    });
  });

  it('adds to an existing exclusion rather than starting a new one', () => {
    const ex = except(except(EMPTY, 'status', '2xx'), 'status', '3xx');
    expect(ex.terms[0].values).toEqual(['2xx', '3xx']);
    expect(dropField(ex, 'status').terms).toEqual([]);
  });

  it('does not count a half-typed condition as a filter', () => {
    /*
      The list must not empty between the keystroke that names a header and the
      one that says what to look for in it.
    */
    const typing: FilterState = {
      ...EMPTY,
      conditions: [cond({ field: 'header', key: 'authorization', op: 'contains', value: '' })],
    };
    expect(isUsable(typing.conditions[0])).toBe(false);
    expect(isEmpty(typing)).toBe(true);
    expect(activeCount(typing)).toBe(0);
  });

  it('counts a value-less operator as a filter, because it is one', () => {
    const present = cond({ field: 'header', key: 'x-tenant-id', op: 'present', value: '' });
    expect(isUsable(present)).toBe(true);
  });

  it('will not run a JSONPath condition on an empty path', () => {
    expect(isUsable(cond({ field: 'json', key: '$.', op: 'equals', value: 'x' }))).toBe(false);
    expect(isUsable(cond({ field: 'json', key: '$.id', op: 'equals', value: 'x' }))).toBe(true);
  });
});

describe('the query string', () => {
  const round = (s: FilterState) => parseQuery(formatQuery(s));

  it('writes facets and conditions in the order the row reads', () => {
    const state: FilterState = {
      terms: [{ field: 'method', values: ['post'] }, { field: 'status', values: ['5xx'], negated: true }],
      conditions: [cond({ field: 'header', key: 'authorization', op: 'contains', value: 'Bearer' })],
      text: '',
    };
    expect(formatQuery(state))
      .toBe('method:post -status:5xx header:authorization:contains:Bearer');
  });

  it('round-trips a filter exactly, which is the only reason to offer it', () => {
    const state: FilterState = {
      terms: [{ field: 'saved', values: ['no'] }, { field: 'when', values: ['week'] }],
      conditions: [
        cond({ field: 'json', key: '$.orderId', op: 'equals', value: 'A-17' }),
        cond({ field: 'script', key: 'any', op: 'contains', value: 'dk.env.set' }),
        cond({ field: 'header', key: 'x-tenant-id', op: 'present', value: '' }),
      ],
      text: 'orders',
    };
    const back = round(state);
    expect(back.terms).toEqual(state.terms);
    expect(back.conditions.map(c => [c.field, c.key, c.op, c.value]))
      .toEqual(state.conditions.map(c => [c.field, c.key, c.op, c.value]));
    expect(back.text).toBe('orders');
  });

  it('keeps a value that itself contains colons', () => {
    // Which every URL and every timestamp does.
    const state: FilterState = {
      ...EMPTY,
      conditions: [cond({ field: 'resbody', key: 'text', op: 'contains', value: 'https://a.test:8443/x' })],
    };
    expect(round(state).conditions[0].value).toBe('https://a.test:8443/x');
  });

  it('quotes a phrase so it survives the round trip as one value', () => {
    const state: FilterState = {
      ...EMPTY,
      conditions: [cond({ field: 'body', key: 'text', op: 'contains', value: '"currency": "INR"' })],
    };
    expect(round(state).conditions[0].value).toBe('"currency": "INR"');
  });

  it('treats anything it does not recognise as search text rather than an error', () => {
    const parsed = parseQuery('method:post nonsense:here plain words');
    expect(parsed.terms).toEqual([{ field: 'method', values: ['post'] }]);
    expect(parsed.text).toBe('nonsense:here plain words');
  });

  it('drops a condition whose operator needs a value and has none', () => {
    expect(parseQuery('header:authorization:contains').conditions).toEqual([]);
  });
});

describe('what the chips say', () => {
  it('splits a chip into the three parts the popup paints separately', () => {
    const parts = describeCondition(
      cond({ field: 'resheader', key: 'content-type', op: 'contains', value: 'json' }));
    expect(parts).toEqual({
      key: 'response header content-type', op: 'contains', value: 'json', negated: false,
    });
  });

  it('says the field alone when the condition is not about one named thing', () => {
    expect(describeCondition(cond({ field: 'script', key: 'any', op: 'contains', value: 'dk' })).key)
      .toBe('script');
  });

  it('marks a negated condition in the words, not only in a colour', () => {
    const parts = describeCondition(
      cond({ field: 'header', key: 'cookie', op: 'present', value: '', negated: true }));
    expect(parts.key).toBe('not header cookie');
    expect(parts.value).toBe('');
  });

  it('draws one chip per thing switched on and none for a half-typed row', () => {
    const state: FilterState = {
      terms: [{ field: 'method', values: ['post'] }],
      conditions: [
        cond({ field: 'header', key: 'a', op: 'contains', value: 'b' }),
        cond({ field: 'header', key: 'c', op: 'contains', value: '' }),
      ],
      text: '',
    };
    expect(chipsOf(state)).toHaveLength(2);
  });
});

describe('status buckets', () => {
  it('sorts codes into the five a reader thinks in', () => {
    expect(statusBucket(204)).toBe('2xx');
    expect(statusBucket(301)).toBe('3xx');
    expect(statusBucket(404)).toBe('4xx');
    expect(statusBucket(503)).toBe('5xx');
  });

  it('keeps a request that never got a response out of 5xx', () => {
    /*
      A connection that failed has status 0. Somebody hunting a server's 500s
      does not mean the requests that never reached it.
    */
    expect(statusBucket(0)).toBe('error');
  });
});
