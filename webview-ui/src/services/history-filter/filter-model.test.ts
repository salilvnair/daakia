import { describe, it, expect } from 'vitest';
import {
  EMPTY, activeCount, addCondition, addToGroup, allRows, chipsOf, describeCondition,
  describeStructure, dropCondition, dropField, except, formatQuery, isEmpty, isUsable,
  liveGroups, newCondition, newGroup, only, parseQuery, setGroupOp, statusBucket,
  toggleValue,
  type Condition, type FilterState,
} from './filter-model';

function cond(patch: Partial<Condition>): Condition {
  return { ...newCondition(), ...patch };
}

/** A state holding one box per argument, each box being a list of rows. */
function withGroups(groups: { op?: 'and' | 'or'; rows: Condition[] }[], groupOp: 'and' | 'or' = 'and'): FilterState {
  return { ...EMPTY, groupOp, groups: groups.map(g => newGroup(g.rows, g.op ?? 'or')) };
}

function body(value: string): Condition {
  return cond({ field: 'body', key: 'text', op: 'contains', value });
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
    const typing = withGroups([
      { rows: [cond({ field: 'header', key: 'authorization', op: 'contains', value: '' })] },
    ]);
    expect(isUsable(allRows(typing)[0])).toBe(false);
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

describe('two levels: rows in a box, boxes with each other', () => {
  it('is the arrangement the flat model could not hold', () => {
    /*
      `(A and B) or (C or D)`. The old model stored a join per row and derived
      brackets from the sequence, which can say `A and (B or C)` and cannot say
      this — an OR between an AND-group and anything else is a nesting, and
      there was nowhere to put it. The panel drew it anyway, so the picture and
      the meaning had come apart.
    */
    const state = withGroups([
      { op: 'and', rows: [body('a'), body('b')] },
      { op: 'or', rows: [body('c'), body('d')] },
    ], 'or');
    expect(describeStructure(state)).toBe('(1 and 2) or (3 or 4)');
  });

  it('defaults to every box mattering', () => {
    const state = withGroups([{ rows: [body('a')] }, { rows: [body('b')] }]);
    expect(describeStructure(state)).toBe('1 and 2');
  });

  it('names a box of one without brackets', () => {
    const state = withGroups([{ op: 'or', rows: [body('a'), body('b')] }, { rows: [body('c')] }]);
    expect(describeStructure(state)).toBe('(1 or 2) and 3');
  });

  it('drops a box whose rows are all half-typed', () => {
    /*
      It matches nothing yet, and under `groupOp: 'or'` leaving it in would be
      an alternative that is trivially satisfied — the filter would quietly
      match the whole table.
    */
    const state = withGroups([{ rows: [body('a')] }, { rows: [body('')] }], 'or');
    expect(liveGroups(state)).toHaveLength(1);
    expect(describeStructure(state)).toBe('1');
  });

  it('counts and empties on live rows only', () => {
    expect(isEmpty(withGroups([{ rows: [body('')] }]))).toBe(true);
    expect(activeCount(withGroups([{ rows: [body('a'), body('b')] }]))).toBe(2);
  });
});

describe('editing groups', () => {
  it('puts a brand-new row in a box of its own', () => {
    const one = addCondition(EMPTY, 'header');
    const two = addCondition(one, 'body');
    expect(two.groups).toHaveLength(2);
    expect(allRows(two).map(c => c.field)).toEqual(['header', 'body']);
  });

  it('adds into an existing box, and the op comes along', () => {
    const one = addCondition(EMPTY, 'body');
    const two = addToGroup(one, one.groups[0].id, 'body', 'and');
    expect(two.groups).toHaveLength(1);
    expect(two.groups[0].op).toBe('and');
    expect(two.groups[0].rows).toHaveLength(2);
  });

  it('flips one box without touching the others', () => {
    const state = withGroups([
      { op: 'or', rows: [body('a'), body('b')] },
      { op: 'or', rows: [body('c')] },
    ]);
    const flipped = setGroupOp(state, state.groups[0].id, 'and');
    expect(flipped.groups.map(g => g.op)).toEqual(['and', 'or']);
  });

  it('takes the box away with its last row', () => {
    // An empty box constrains nothing and has no bin of its own.
    const state = withGroups([{ rows: [body('a')] }, { rows: [body('b')] }]);
    const after = dropCondition(state, state.groups[0].rows[0].id);
    expect(after.groups).toHaveLength(1);
    expect(allRows(after).map(c => c.value)).toEqual(['b']);
  });
});

describe('the query string', () => {
  const round = (s: FilterState) => parseQuery(formatQuery(s));

  it('writes facets and conditions in the order the row reads', () => {
    const state: FilterState = {
      ...withGroups([{ rows: [cond({ field: 'header', key: 'authorization', op: 'contains', value: 'Bearer' })] }]),
      terms: [{ field: 'method', values: ['post'] }, { field: 'status', values: ['5xx'], negated: true }],
    };
    expect(formatQuery(state))
      .toBe('method:post -status:5xx header:authorization:contains:Bearer');
  });

  it('round-trips a filter exactly, which is the only reason to offer it', () => {
    const state: FilterState = {
      ...withGroups([
        { rows: [cond({ field: 'json', key: '$.orderId', op: 'equals', value: 'A-17' })] },
        { rows: [cond({ field: 'script', key: 'any', op: 'contains', value: 'dk.env.set' })] },
        { rows: [cond({ field: 'header', key: 'x-tenant-id', op: 'present', value: '' })] },
      ]),
      terms: [{ field: 'saved', values: ['no'] }, { field: 'when', values: ['week'] }],
      text: 'orders',
    };
    const back = round(state);
    expect(back.terms).toEqual(state.terms);
    expect(allRows(back).map(c => [c.field, c.key, c.op, c.value]))
      .toEqual(allRows(state).map(c => [c.field, c.key, c.op, c.value]));
    expect(back.text).toBe('orders');
  });

  it('keeps a value that itself contains colons', () => {
    // Which every URL and every timestamp does.
    const state = withGroups([
      { rows: [cond({ field: 'resbody', key: 'text', op: 'contains', value: 'https://a.test:8443/x' })] },
    ]);
    expect(allRows(round(state))[0].value).toBe('https://a.test:8443/x');
  });

  it('quotes a phrase so it survives the round trip as one value', () => {
    const state = withGroups([
      { rows: [cond({ field: 'body', key: 'text', op: 'contains', value: '"currency": "INR"' })] },
    ]);
    expect(allRows(round(state))[0].value).toBe('"currency": "INR"');
  });

  it('writes a box as one token and reads it back as one box', () => {
    const state = withGroups([
      { op: 'or', rows: [body('x'), body('y')] },
      { rows: [cond({ field: 'header', key: 'cookie', op: 'absent', value: '' })] },
    ]);
    expect(formatQuery(state))
      .toBe('body:text:contains:x|body:text:contains:y header:cookie:absent');
    expect(describeStructure(parseQuery(formatQuery(state)))).toBe('(1 or 2) and 3');
  });

  it('uses a different separator for an ALL OF box, and says so on the way back', () => {
    const state = withGroups([{ op: 'and', rows: [body('x'), body('y')] }]);
    expect(formatQuery(state)).toBe('body:text:contains:x&body:text:contains:y');
    expect(parseQuery(formatQuery(state)).groups[0].op).toBe('and');
  });

  it('writes the top-level operator only when it is not the default', () => {
    const and = withGroups([{ rows: [body('x')] }, { rows: [body('y')] }], 'and');
    const or = withGroups([{ rows: [body('x')] }, { rows: [body('y')] }], 'or');
    expect(formatQuery(and)).not.toContain('match:');
    expect(formatQuery(or).startsWith('match:any')).toBe(true);
    expect(parseQuery(formatQuery(or)).groupOp).toBe('or');
    expect(parseQuery(formatQuery(and)).groupOp).toBe('and');
  });

  it('quotes a value containing either separator', () => {
    // Otherwise one condition would come back as two.
    for (const value of ['a|b', 'a&b']) {
      const state = withGroups([{ rows: [cond({ field: 'url', key: 'text', op: 'regex', value })] }]);
      const back = parseQuery(formatQuery(state));
      expect(allRows(back)).toHaveLength(1);
      expect(allRows(back)[0].value).toBe(value);
    }
  });

  it('treats anything it does not recognise as search text rather than an error', () => {
    const parsed = parseQuery('method:post nonsense:here plain words');
    expect(parsed.terms).toEqual([{ field: 'method', values: ['post'] }]);
    expect(parsed.text).toBe('nonsense:here plain words');
  });

  it('drops a condition whose operator needs a value and has none', () => {
    expect(parseQuery('header:authorization:contains').groups).toEqual([]);
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
      ...withGroups([
        { rows: [cond({ field: 'header', key: 'a', op: 'contains', value: 'b' })] },
        { rows: [cond({ field: 'header', key: 'c', op: 'contains', value: '' })] },
      ]),
      terms: [{ field: 'method', values: ['post'] }],
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
