import { describe, it, expect } from 'vitest';
import {
  EMPTY, ROOT_ID, activeCount, addCondition, addToGroup, allRows, chipsOf, describeCondition,
  describeStructure, dropCondition, dropField, except, flipGap, formatQuery, isEmpty, isGroup,
  isUsable, liveTree, newCondition, newGroup, only, parseQuery, setGroupOp, statusBucket,
  toggleValue, wrapWith, addJoined, setCondition,
  type Condition, type ConditionGroup, type FilterState,
} from './filter-model';

function cond(patch: Partial<Condition>): Condition {
  return { ...newCondition(), ...patch };
}

/**
 * A state holding one top-level box per argument. A box of one row is stored
 * as the bare row, which is how the model keeps it.
 */
function withGroups(groups: { op?: 'and' | 'or'; rows: Condition[] }[], rootOp: 'and' | 'or' = 'and'): FilterState {
  return {
    ...EMPTY,
    root: {
      id: ROOT_ID,
      op: rootOp,
      children: groups.map(g => (g.rows.length === 1 ? g.rows[0] : newGroup(g.rows, g.op ?? 'or'))),
    },
  };
}

/** The top level of a state, for the tests that look at its boxes. */
const top = (s: FilterState) => s.root.children;

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

describe('the tree: brackets inside brackets', () => {
  it('says (A and B) or (C or D)', () => {
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

  it('drops a row that is still being typed, and any bracket left empty', () => {
    /*
      It matches nothing yet, and under `or` an empty alternative would be
      trivially satisfied — the filter would quietly match the whole table.
    */
    const state = withGroups([{ rows: [body('a')] }, { rows: [body('')] }], 'or');
    expect(describeStructure(state)).toBe('1');
    expect(liveTree(state)).toEqual(allRows(state)[0]);
  });

  it('counts and empties on live rows only', () => {
    expect(isEmpty(withGroups([{ rows: [body('')] }]))).toBe(true);
    expect(activeCount(withGroups([{ op: 'and', rows: [body('a'), body('b')] }]))).toBe(2);
  });
});

describe('flipping one gap', () => {
  /** An ALL OF box of `n` rows as the only top-level thing, and its id. */
  const allOf = (...values: string[]) => {
    const state = withGroups([{ op: 'and', rows: values.map(body) }]);
    const box = top(state)[0] as ConditionGroup;
    return { state, box, ids: box.children.map(c => c.id) };
  };

  it('turns 1 and 2 and 3 into 1 and (2 or 3) — the case that failed', () => {
    /*
      The two-level model could only flip the whole box, so this became
      `1 or 2 or 3`. Only the gap that was clicked may change.
    */
    const { state, box, ids } = allOf('a', 'b', 'c');
    const next = flipGap(state, box.id, ids[1], ids[2]);
    expect(describeStructure(next)).toBe('1 and (2 or 3)');
  });

  it('undoes itself: the chip inside the new bracket puts it back', () => {
    const { state, box, ids } = allOf('a', 'b', 'c');
    const once = flipGap(state, box.id, ids[1], ids[2]);
    const inner = (top(once)[0] as ConditionGroup).children[1] as ConditionGroup;
    const back = flipGap(once, inner.id, inner.children[0].id, inner.children[1].id);
    expect(describeStructure(back)).toBe('1 and 2 and 3');
  });

  it('extends a bracket rather than nesting one in another', () => {
    // `1 and (2 or 3) and 4`, gap between the bracket and 4 → `1 and (2 or 3 or 4)`.
    const { state, box, ids } = allOf('a', 'b', 'c', 'd');
    const once = flipGap(state, box.id, ids[1], ids[2]);
    const outer = top(once)[0] as ConditionGroup;
    const twice = flipGap(once, outer.id, outer.children[1].id, outer.children[2].id);
    expect(describeStructure(twice)).toBe('1 and (2 or 3 or 4)');
  });

  it('flips the box when the two neighbours are all it holds', () => {
    // Then the gap *is* the box's relationship; there is nothing to bracket.
    const { state, box, ids } = allOf('a', 'b');
    expect(describeStructure(flipGap(state, box.id, ids[0], ids[1]))).toBe('1 or 2');
  });

  it('does the same between top-level boxes', () => {
    const state = withGroups([{ rows: [body('a')] }, { rows: [body('b')] }, { rows: [body('c')] }]);
    const ids = top(state).map(c => c.id);
    expect(describeStructure(flipGap(state, ROOT_ID, ids[0], ids[1]))).toBe('(1 or 2) and 3');
  });
});

describe('adding with either word', () => {
  it('adds with the box own word by just joining the box', () => {
    const state = withGroups([{ op: 'or', rows: [body('a'), body('b')] }]);
    const box = top(state)[0] as ConditionGroup;
    const next = addJoined(state, box.id, 'body', 'or');
    expect((top(next)[0] as ConditionGroup).children).toHaveLength(3);
  });

  it('adds with the other word by joining only the last row', () => {
    // (A or B) + and → (A or (B and C)) — what the chip in that gap would make.
    const state = withGroups([{ op: 'or', rows: [body('a'), body('b')] }]);
    const box = top(state)[0] as ConditionGroup;
    const next = addJoined(state, box.id, 'body', 'and');
    const withValue = setCondition(next, { ...allRows(next)[2], value: 'c' });
    expect(describeStructure(withValue)).toBe('1 or (2 and 3)');
  });
});

describe('editing the tree', () => {
  it('puts a brand-new row at the top level on its own', () => {
    const two = addCondition(addCondition(EMPTY, 'header'), 'body');
    expect(top(two)).toHaveLength(2);
    expect(allRows(two).map(c => c.field)).toEqual(['header', 'body']);
  });

  it('turns a lone row into a box of two with the word chosen', () => {
    const one = addCondition(EMPTY, 'body');
    const two = wrapWith(one, top(one)[0].id, 'body', 'and');
    expect(top(two)).toHaveLength(1);
    const box = top(two)[0] as ConditionGroup;
    expect(isGroup(box) && box.op).toBe('and');
    expect(box.children).toHaveLength(2);
  });

  it('adds into an existing box', () => {
    const state = withGroups([{ op: 'or', rows: [body('a'), body('b')] }]);
    const box = top(state)[0] as ConditionGroup;
    const next = addToGroup(state, box.id, 'body');
    expect((top(next)[0] as ConditionGroup).children).toHaveLength(3);
  });

  it('keeps a top-level box that agrees with the word between boxes', () => {
    /*
      A box you built should not vanish because it happens to match the
      top-level word — only brackets inside a box dissolve like that.
    */
    const state = withGroups([{ op: 'or', rows: [body('a'), body('b')] }, { rows: [body('c')] }]);
    const box = top(state)[0] as ConditionGroup;
    const flipped = setGroupOp(state, box.id, 'and');
    expect(top(flipped)).toHaveLength(2);
    expect((top(flipped)[0] as ConditionGroup).op).toBe('and');
  });

  it('takes a bracket away when its last row goes, and unwraps one left with a single row', () => {
    const state = withGroups([{ op: 'or', rows: [body('a'), body('b')] }, { rows: [body('c')] }]);
    const box = top(state)[0] as ConditionGroup;
    const after = dropCondition(state, box.children[0].id);
    expect(top(after).every(c => !isGroup(c))).toBe(true);
    expect(allRows(after).map(c => c.value)).toEqual(['b', 'c']);
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
    expect((top(parseQuery(formatQuery(state)))[0] as ConditionGroup).op).toBe('and');
  });

  it('writes the top-level operator only when it is not the default', () => {
    const and = withGroups([{ rows: [body('x')] }, { rows: [body('y')] }], 'and');
    const or = withGroups([{ rows: [body('x')] }, { rows: [body('y')] }], 'or');
    expect(formatQuery(and)).not.toContain('match:');
    expect(formatQuery(or).startsWith('match:any')).toBe(true);
    expect(parseQuery(formatQuery(or)).root.op).toBe('or');
    expect(parseQuery(formatQuery(and)).root.op).toBe('and');
  });

  it('writes a bracket inside a box with parentheses, and reads it back', () => {
    const state = withGroups([{ op: 'and', rows: [body('a'), body('b'), body('c')] }]);
    const box = top(state)[0] as ConditionGroup;
    const nested = flipGap(state, box.id, box.children[1].id, box.children[2].id);
    const text = formatQuery(nested);
    expect(text).toBe('body:text:contains:a&(body:text:contains:b|body:text:contains:c)');
    expect(describeStructure(parseQuery(text))).toBe('1 and (2 or 3)');
  });

  it('refuses to guess a precedence for & and | mixed without brackets', () => {
    // The formatter never writes it; reading it as anything would be a guess.
    const parsed = parseQuery('body:text:contains:a&body:text:contains:b|body:text:contains:c');
    expect(allRows(parsed)).toEqual([]);
  });

  it('quotes a value containing either separator', () => {
    // Otherwise one condition would come back as two.
    for (const value of ['a|b', 'a&b', 'f(x)']) {
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
    expect(top(parseQuery('header:authorization:contains'))).toEqual([]);
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
