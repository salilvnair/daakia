/**
 * The filter, pinned down where it would otherwise be quietly wrong.
 *
 * Everything here is a place a filter panel can lie without looking broken: an
 * OR that behaves like an AND, a negation that distributes across its values
 * and matches everything, a facet count that ignores the other facets, a query
 * string that does not survive a round trip, a relative date that freezes.
 *
 * A wrong number in a facet is worse than a missing one, because somebody acts
 * on it.
 */
import { describe, it, expect } from 'vitest';
import type { BoardIssue, ProposedDimension } from './board-types';
import {
  EMPTY, buildFacets, buildActivity, costOf, describeAll, describeTerm, explain,
  except, formatQuery, matchesAll, matchesTerm, only, parseQuery, resolveRange,
  runSearch, toggleValue, valuesOf, type FilterState,
} from './filter-model';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-09T12:00:00Z');

const MODULE: ProposedDimension = {
  dimension: 'module', heading: 'Module',
  options: ['Checkout', 'Orders', 'Reporting', 'Admin'], files: ['bug.yml'],
};
const ENV: ProposedDimension = {
  dimension: 'env', heading: 'Environment', options: ['PROD', 'DEV'], files: ['bug.yml'],
};

/**
 * One issue, with its dates derived from its ages.
 *
 * The host computes `ageDays` from `createdAt`, so a fixture where they
 * disagree is a fixture that tests a state the real board cannot be in — and
 * the first version of this file had exactly that, which is how a date filter
 * quietly passed against an issue it should have missed.
 */
function issue(n: number, over: Partial<BoardIssue> = {}): BoardIssue {
  const ageDays = over.ageDays ?? 3;
  const quietDays = over.quietDays ?? ageDays;
  return {
    number: n,
    title: `Issue ${n}`,
    state: 'OPEN',
    url: `https://example.invalid/${n}`,
    assignees: [],
    labels: [],
    commentCount: 0,
    dimensions: {},
    evidence: [],
    ...over,
    ageDays,
    quietDays,
    createdAt: new Date(NOW - ageDays * DAY).toISOString(),
    updatedAt: new Date(NOW - quietDays * DAY).toISOString(),
  };
}

/** The mock's own board, near enough to reason about. */
const BOARD = [
  issue(41, { dimensions: { module: 'Checkout', env: 'PROD' }, assignees: ['salilvnair'],
              quietDays: 2, ageDays: 6 }),
  issue(36, { dimensions: { module: 'Checkout', env: 'PROD' }, quietDays: 19, ageDays: 21 }),
  issue(28, { dimensions: { module: 'Orders', env: 'PROD' }, quietDays: 22, ageDays: 22 }),
  issue(24, { dimensions: { module: 'Reporting', env: 'PROD' }, quietDays: 21, ageDays: 21 }),
  issue(33, { dimensions: { module: 'Checkout', env: 'DEV' }, assignees: ['salilvnair'],
              quietDays: 1, ageDays: 3 }),
  issue(22, { dimensions: { module: 'Orders', env: 'DEV' }, assignees: ['tshah'],
              quietDays: 16, ageDays: 16 }),
];

const ctx = { now: NOW, me: 'salilvnair' };

function apply(state: FilterState) {
  return BOARD.filter(i => matchesAll(i, state.terms, ctx));
}

describe('valuesOf', () => {
  it('reports an absent value as `none`, which is a real answer', () => {
    expect(valuesOf(issue(1), 'assignee')).toEqual(['none']);
    expect(valuesOf(issue(1), 'module')).toEqual(['none']);
  });

  it('lowercases, so a filter is not case-sensitive by accident', () => {
    expect(valuesOf(issue(1, { dimensions: { env: 'PROD' } }), 'env')).toEqual(['prod']);
  });
});

describe('two ticks in one facet mean either', () => {
  it('ORs values inside a term', () => {
    const state = { ...EMPTY, terms: [{ field: 'module', values: ['checkout', 'orders'] }] };
    expect(apply(state).map(i => i.number).sort()).toEqual([22, 28, 33, 36, 41]);
  });

  it('ANDs across terms', () => {
    const state = {
      ...EMPTY,
      terms: [
        { field: 'module', values: ['checkout', 'orders'] },
        { field: 'env', values: ['prod'] },
      ],
    };
    expect(apply(state).map(i => i.number).sort()).toEqual([28, 36, 41]);
  });

  it('`all of these` on a single-valued field matches nothing, rather than everything', () => {
    const state = {
      ...EMPTY,
      terms: [{ field: 'module', values: ['checkout', 'orders'], mode: 'all' as const }],
    };
    expect(apply(state)).toEqual([]);
  });

  it('`all of these` works on a field an issue can hold several of', () => {
    const both = issue(1, { labels: [
      { name: 'bug', color: 'f00' }, { name: 'prod', color: '0f0' },
    ] });
    const one = issue(2, { labels: [{ name: 'bug', color: 'f00' }] });
    const term = { field: 'label', values: ['bug', 'prod'], mode: 'all' as const };
    expect(matchesTerm(both, term)).toBe(true);
    expect(matchesTerm(one, term)).toBe(false);
  });
});

describe('negation', () => {
  it('excludes every value in the clause rather than distributing across them', () => {
    /* `-module:checkout,orders` is "neither"; distributing the not would make it
       "not Checkout or not Orders", which is every issue. */
    const state = {
      ...EMPTY,
      terms: [{ field: 'module', values: ['checkout', 'orders'], negated: true }],
    };
    expect(apply(state).map(i => i.number)).toEqual([24]);
  });

  it('resolves @me at match time, so a shared view follows its reader', () => {
    const state = { ...EMPTY, terms: [{ field: 'assignee', values: ['@me'], negated: true }] };
    expect(apply(state).map(i => i.number).sort()).toEqual([22, 24, 28, 36]);
    const asOther = BOARD.filter(i => matchesAll(i, state.terms, { now: NOW, me: 'tshah' }));
    expect(asOther.map(i => i.number).sort()).toEqual([24, 28, 33, 36, 41]);
  });
});

describe('quiet and age are floors, not equalities', () => {
  it('includes anything quiet for at least that long', () => {
    const state = { ...EMPTY, terms: [{ field: 'quiet', values: ['14d'] }] };
    expect(apply(state).map(i => i.number).sort()).toEqual([22, 24, 28, 36]);
  });
});

describe('dates', () => {
  it('reads a bare span as "within the last N days"', () => {
    expect(resolveRange('14d', NOW)).toEqual({ from: NOW - 14 * DAY });
  });

  it('reads a greater-than span as "older than N days"', () => {
    expect(resolveRange('>30d', NOW)).toEqual({ to: NOW - 30 * DAY });
  });

  it('takes an absolute date as an absolute date', () => {
    const r = resolveRange('<2026-09-15', NOW)!;
    expect(r.to).toBe(Date.parse('2026-09-15') + DAY - 1);
    expect(r.from).toBeUndefined();
  });

  it('keeps a relative phrase relative — the same term means different days', () => {
    const term = { field: 'created', values: ['7d'] };
    const fresh = issue(1, { createdAt: new Date(NOW - 3 * DAY).toISOString() });
    expect(matchesTerm(fresh, term, { now: NOW })).toBe(true);
    /* A fortnight later the phrase has not changed and the answer has. */
    expect(matchesTerm(fresh, term, { now: NOW + 14 * DAY })).toBe(false);
  });

  it('refuses a phrase it does not understand instead of matching everything', () => {
    expect(resolveRange('soonish', NOW)).toBeUndefined();
    expect(matchesTerm(issue(1), { field: 'created', values: ['soonish'] }, { now: NOW }))
      .toBe(false);
  });
});

describe('the query string', () => {
  it('round-trips a filter exactly', () => {
    const state: FilterState = {
      terms: [
        { field: 'state', values: ['open'] },
        { field: 'env', values: ['prod'] },
        { field: 'assignee', values: ['@me'], negated: true },
        { field: 'quiet', values: ['14d'] },
      ],
      search: { text: '401', scope: 'body' },
    };
    const query = formatQuery(state);
    expect(query).toBe('state:open env:prod -assignee:@me quiet:14d 401');
    expect(parseQuery(query, state.search)).toEqual(state);
  });

  it('keeps a quoted phrase together', () => {
    const parsed = parseQuery('env:prod "rate limit headers"');
    expect(parsed.search.text).toBe('rate limit headers');
    expect(parsed.terms).toEqual([{ field: 'env', values: ['prod'] }]);
  });

  it('treats anything that is not field:value as search text', () => {
    expect(parseQuery('token refresh').search.text).toBe('token refresh');
  });

  it('round-trips `all of these` through the plus form', () => {
    const state: FilterState = {
      terms: [{ field: 'label', values: ['bug', 'prod'], mode: 'all' }],
      search: { text: '', scope: 'body' },
    };
    expect(formatQuery(state)).toBe('label:bug+prod');
    expect(parseQuery('label:bug+prod')).toEqual(state);
  });
});

describe('facet counts are conditional on the other facets, not on their own', () => {
  const state: FilterState = {
    terms: [{ field: 'env', values: ['prod'] }, { field: 'module', values: ['checkout'] }],
    search: { text: '', scope: 'body' },
  };
  const facets = buildFacets(BOARD, state, [MODULE, ENV], ctx);

  it('counts a facet with every other term applied but not its own', () => {
    const modules = facets.find(f => f.field === 'module')!;
    /* PROD is on, Checkout is not counted against itself: of the four PROD
       issues, two are Checkout, one Orders, one Reporting. */
    expect(Object.fromEntries(modules.values.map(v => [v.value, v.count])))
      .toMatchObject({ checkout: 2, orders: 1, reporting: 1, admin: 0 });
  });

  it('keeps a zero value visible rather than hiding it', () => {
    const modules = facets.find(f => f.field === 'module')!;
    /* Admin is declared by the form and has nothing on it — it is not that
       Admin has no issues, it is that it has none given everything else. */
    expect(modules.values.some(v => v.value === 'admin' && v.count === 0)).toBe(true);
  });

  it('marks what is ticked', () => {
    const modules = facets.find(f => f.field === 'module')!;
    expect(modules.values.find(v => v.value === 'checkout')?.ticked).toBe(true);
  });

  it('keeps an excluded value in the list, or it could never be unticked', () => {
    const excluded = { ...EMPTY, terms: [{ field: 'module', values: ['reporting'], negated: true }] };
    const f = buildFacets(BOARD, excluded, [MODULE, ENV], ctx).find(x => x.field === 'module')!;
    const row = f.values.find(v => v.value === 'reporting')!;
    expect(row.excluded).toBe(true);
    expect(row.ticked).toBe(false);
  });
});

describe('the activity facets', () => {
  it('counts the ones with no GitHub equivalent', () => {
    const rows = buildActivity(BOARD, EMPTY, ctx);
    expect(rows.find(r => r.id === 'quiet')?.count).toBe(4);
    expect(rows.find(r => r.id === 'new')?.count).toBe(2);
  });

  it('names why ETA is not offered rather than quietly omitting it', () => {
    const eta = buildActivity(BOARD, EMPTY, ctx).find(r => r.id === 'eta')!;
    expect(eta.unavailable).toMatch(/Project/);
    expect(eta.count).toBe(0);
  });
});

describe('only and except', () => {
  it('`only` replaces the whole facet', () => {
    let s = toggleValue(EMPTY, 'module', 'checkout');
    s = toggleValue(s, 'module', 'orders');
    expect(only(s, 'module', 'orders').terms).toEqual([{ field: 'module', values: ['orders'] }]);
  });

  it('`except` excludes one value and keeps the rest', () => {
    const s = except(EMPTY, 'module', 'reporting');
    expect(s.terms).toEqual([{ field: 'module', values: ['reporting'], negated: true }]);
    expect(apply(s).map(i => i.number).sort()).toEqual([22, 28, 33, 36, 41]);
  });

  it('adds to an existing exclusion rather than replacing it', () => {
    const s = except(except(EMPTY, 'module', 'reporting'), 'module', 'orders');
    expect(s.terms[0].values).toEqual(['reporting', 'orders']);
  });

  it('unticking the last value drops the term entirely', () => {
    const s = toggleValue(toggleValue(EMPTY, 'env', 'prod'), 'env', 'prod');
    expect(s.terms).toEqual([]);
  });
});

describe('08E — why is this here', () => {
  const state: FilterState = {
    terms: [
      { field: 'env', values: ['prod'] },
      { field: 'assignee', values: ['none'] },
      { field: 'quiet', values: ['14d'] },
    ],
    search: { text: '', scope: 'body' },
  };

  it('reports every term against the issue, not only the one that failed', () => {
    const verdicts = explain(BOARD[0], state, ctx); // #41: PROD, assigned, quiet 2d
    expect(verdicts.map(v => v.passes)).toEqual([true, false, false]);
    expect(verdicts[1].actual).toBe('is salilvnair');
  });

  it('says what each filter actually costs, so a decorative one is visible', () => {
    /*
      Its own board, because the cost of a term is only interesting when the
      terms are not redundant — and on the shared fixture all three happen to
      select the same three issues, which would make every cost zero and the
      assertion meaningless.

      Here two DEV issues are unassigned and long quiet, so they survive both of
      the other terms and only `env` takes them out.
    */
    const board = [
      ...BOARD,
      issue(19, { dimensions: { module: 'Reporting', env: 'DEV' }, quietDays: 30, ageDays: 30 }),
      issue(15, { dimensions: { module: 'Orders', env: 'DEV' }, quietDays: 40, ageDays: 40 }),
    ];
    const costs = costOf(board, state, ctx);
    const byField = Object.fromEntries(costs.map(c => [c.term.field, c.removes]));

    expect(byField.env).toBe(2);
    /* `quiet` removes nothing the others had not already taken — a filter you
       could drop without changing the answer, which is the finding. */
    expect(byField.quiet).toBe(0);
    expect(byField.assignee).toBe(0);
  });
});

describe('saying it in words', () => {
  it('spells a negation as "not"', () => {
    expect(describeTerm({ field: 'module', values: ['reporting'], negated: true }))
      .toEqual({ key: 'not module', value: 'Reporting' });
  });

  it('spells quiet as a duration rather than a token', () => {
    expect(describeTerm({ field: 'quiet', values: ['14d'] }))
      .toEqual({ key: 'quiet for', value: '14 days' });
  });

  it('joins a whole filter into one readable line', () => {
    expect(describeAll({
      terms: [{ field: 'state', values: ['open'] }, { field: 'assignee', values: ['none'] }],
      search: { text: '', scope: 'body' },
    })).toBe('state Open · assignee Nobody');
  });
});

describe('the search box', () => {
  const withBody = issue(28, {
    title: 'Rate limit headers missing on 429',
    bodyText: 'expected a 401 before the 429, got neither',
  });

  it('says where it matched', () => {
    expect(runSearch(withBody, { text: '429', scope: 'body' })?.where).toBe('title');
    expect(runSearch(withBody, { text: '401', scope: 'body' })?.where).toBe('body');
  });

  it('does not look in the body when the scope is titles only', () => {
    expect(runSearch(withBody, { text: '401', scope: 'title' })).toBeUndefined();
  });

  it('takes comment hits from the host, since comments are not on the board', () => {
    const hit = runSearch(withBody, { text: 'nowhere', scope: 'comments' }, new Set([28]));
    expect(hit?.where).toBe('comments');
  });

  it('honours whole-word so `401` does not match `4010`', () => {
    const near = issue(1, { title: 'row 4010 of the file' });
    expect(runSearch(near, { text: '401', scope: 'title' })).toBeTruthy();
    expect(runSearch(near, { text: '401', scope: 'title', wholeWord: true })).toBeUndefined();
  });

  it('treats a term with regex characters as text, not as a pattern', () => {
    const dotted = issue(1, { title: 'version 1.2.3 fails' });
    expect(runSearch(dotted, { text: '1.2.3', scope: 'title' })).toBeTruthy();
    expect(runSearch(issue(2, { title: 'version 1x2x3 fails' }), { text: '1.2.3', scope: 'title' }))
      .toBeUndefined();
  });
});

/*
  The two halves of a term, kept apart.

  `label` flattened them, so the panel drew every term as one run of grey text
  and three rows looked the same. The field is a label; the value is a chip.
*/
describe('costOf carries the field and the value separately', () => {
  const board = [issue(1), issue(2)];

  it('splits "state Open" into its two halves', () => {
    const [c] = costOf(board, { ...EMPTY, terms: [{ field: 'state', values: ['open'] }] });
    expect(c.key).toBe('state');
    expect(c.value).toBe('Open');
  });

  it('still agrees with the flattened label', () => {
    const [c] = costOf(board, { ...EMPTY, terms: [{ field: 'state', values: ['open'] }] });
    expect(`${c.key} ${c.value}`.trim()).toBe(c.label);
  });

  it('handles a field whose key already carries the preposition', () => {
    const [c] = costOf(board, { ...EMPTY, terms: [{ field: 'quiet', values: ['14'] }] });
    expect(c.key).toBe('quiet for');
    expect(c.value).toBe('14 days');
  });
});
