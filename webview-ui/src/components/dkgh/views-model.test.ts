/**
 * Saved views, where they would otherwise be quietly wrong.
 *
 * The github.com translation is the one that matters most: it is the link a
 * lead actually sends, and every term it silently drops makes the recipient's
 * list wider than the one the sender was looking at. A link that means
 * something else is worse than no link, so the dropped terms and the widened
 * count are asserted rather than assumed.
 *
 * The diff is second. Get it wrong in one direction and saved work is lost; get
 * it wrong in the other and the bar nags at a view nobody touched.
 */
import { describe, it, expect } from 'vitest';
import type { BoardIssue } from './board-types';
import { parseQuery, type FilterState } from './filter-model';
import {
  capture, countFor, describeCapture, describeDiff, diffView, importQuery,
  loadViews, orderedViews, partsIn, presetViews, toGithubQuery, widening,
  type BoardSnapshot, type CapturePart, type SavedView,
} from './views-model';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-09T12:00:00Z');

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

const BOARD = [
  issue(39, { dimensions: { env: 'PROD' }, assignees: ['rmenon'] }),
  issue(27, { dimensions: { env: 'PROD' }, assignees: ['rmenon'] }),
  issue(31, { dimensions: { env: 'DEV' }, assignees: ['rmenon'] }),
  issue(22, { dimensions: { env: 'DEV' }, assignees: ['rmenon'] }),
  issue(41, { dimensions: { env: 'PROD' }, assignees: ['salilvnair'] }),
];

const SNAPSHOT: BoardSnapshot = {
  filters: parseQuery('state:open env:prod assignee:rmenon'),
  layout: { view: 'cards', density: 'comfortable' },
  grouping: 'module',
  sort: [{ key: 'age', dir: 'desc' }],
  columns: ['number', 'title', 'age'],
};

const ALL: Set<CapturePart> =
  new Set(['filters', 'layout', 'grouping', 'sort', 'columns', 'searchText']);

describe('capture', () => {
  it('freezes only the parts that were ticked', () => {
    const only = capture(SNAPSHOT, new Set<CapturePart>(['filters', 'grouping']));
    expect(Object.keys(only).sort()).toEqual(['filters', 'grouping']);
  });

  it('keeps the search text out of the filters half, so its tickbox does something', () => {
    const snap = { ...SNAPSHOT, filters: parseQuery('state:open 401') };
    const withoutText = capture(snap, new Set<CapturePart>(['filters']));
    expect(withoutText.filters?.search.text).toBe('');
    const withText = capture(snap, new Set<CapturePart>(['filters', 'searchText']));
    expect(withText.searchText).toBe('401');
  });

  it('round-trips through partsIn', () => {
    expect(partsIn(capture(SNAPSHOT, ALL))).toEqual(ALL);
  });

  it('shows the current value beside each part, not just its name', () => {
    expect(describeCapture(SNAPSHOT, 'grouping')).toBe('module');
    expect(describeCapture(SNAPSHOT, 'layout')).toBe('Cards, comfortable');
    expect(describeCapture(SNAPSHOT, 'sort')).toBe('age descending');
    /* Columns capture nothing useful from a card layout, and the dialog says so
       rather than offering a tick that would freeze an unused list. */
    expect(describeCapture(SNAPSHOT, 'columns')).toBe('table layout only');
  });
});

describe('diffView — 09B', () => {
  const view: SavedView = {
    id: 'v', name: 'PROD fires', capture: capture(SNAPSHOT, ALL),
  };

  it('is clean when nothing has moved', () => {
    expect(diffView(view, SNAPSHOT).dirty).toBe(false);
  });

  it('names the term that was dropped and the one that was added', () => {
    const now = { ...SNAPSHOT, filters: parseQuery('state:open module:checkout assignee:rmenon') };
    const d = diffView(view, now);
    expect(d.dropped.map(t => t.field)).toEqual(['env']);
    expect(d.added.map(t => t.field)).toEqual(['module']);
    /* The declared spelling wins — a chip reading `Prod` beside a board
       reading `PROD` is two names for one value. */
    const labels = new Map([['prod', 'PROD'], ['checkout', 'Checkout']]);
    expect(describeDiff(d, labels)).toBe('Dropped env PROD, added module Checkout.');
    expect(describeDiff(d)).toBe('Dropped env Prod, added module Checkout.');
  });

  it('notices a grouping change, which is the piece people forget a view holds', () => {
    const d = diffView(view, { ...SNAPSHOT, grouping: 'none' });
    expect(d.dirty).toBe(true);
    expect(d.changed).toEqual(['grouped by nothing']);
  });

  it('ignores parts the view never captured', () => {
    const filtersOnly: SavedView = {
      id: 'v', name: 'x', capture: capture(SNAPSHOT, new Set<CapturePart>(['filters'])),
    };
    /* The grouping moved, but this view does not hold a grouping — so there is
       nothing to be dirty about, and nagging here would be nagging about
       something the reader deliberately left out. */
    expect(diffView(filtersOnly, { ...SNAPSHOT, grouping: 'none' }).dirty).toBe(false);
  });

  it('does not care about the order two identical terms are in', () => {
    const reordered = { ...SNAPSHOT, filters: parseQuery('assignee:rmenon env:prod state:open') };
    expect(diffView(view, reordered).dropped).toEqual([]);
    expect(diffView(view, reordered).added).toEqual([]);
  });
});

describe('toGithubQuery — 09F', () => {
  const forms = ['module', 'env', 'type'];

  it('translates the native half into GitHub’s own spelling', () => {
    const link = toGithubQuery('o/r', parseQuery('state:open assignee:rmenon'), forms, NOW);
    expect(link.q).toBe('is:issue is:open assignee:rmenon');
    expect(link.dropped).toEqual([]);
  });

  it('drops a template field and names it, rather than silently widening', () => {
    const state = parseQuery('state:open assignee:rmenon env:prod');
    const link = toGithubQuery('o/r', state, forms, NOW);
    expect(link.q).toBe('is:issue is:open assignee:rmenon');
    expect(link.dropped.map(t => t.field)).toEqual(['env']);
  });

  it('says how much wider the link is than the screen', () => {
    const state = parseQuery('state:open assignee:rmenon env:prod');
    const link = toGithubQuery('o/r', state, forms, NOW);
    /* Two PROD issues on screen; the link drops env and shows all four of
       rmenon's. This number is the whole point of the dialog. */
    expect(widening(BOARD, state, link)).toEqual({ here: 2, there: 4 });
  });

  it('uses no:assignee for the unowned pile', () => {
    expect(toGithubQuery('o/r', parseQuery('assignee:none'), forms, NOW).q)
      .toBe('is:issue no:assignee');
  });

  it('keeps a negation as a leading minus', () => {
    expect(toGithubQuery('o/r', parseQuery('-assignee:@me'), forms, NOW).q)
      .toBe('is:issue -assignee:@me');
  });

  it('uses a comma for OR labels and repeats the qualifier for AND', () => {
    /* Backwards here would hand somebody a link that matches nothing. */
    expect(toGithubQuery('o/r', parseQuery('label:bug,prod'), forms, NOW).q)
      .toBe('is:issue label:bug,prod');
    expect(toGithubQuery('o/r', parseQuery('label:bug+prod'), forms, NOW).q)
      .toBe('is:issue label:bug label:prod');
  });

  it('freezes a relative date into an absolute one, and says it did', () => {
    const link = toGithubQuery('o/r', parseQuery('quiet:14d'), forms, NOW);
    expect(link.q).toBe('is:issue updated:<2026-08-26');
    expect(link.frozen.map(t => t.field)).toEqual(['quiet']);
  });

  it('drops an activity filter GitHub has no notion of', () => {
    const link = toGithubQuery('o/r', parseQuery('has:evidence'), forms, NOW);
    expect(link.dropped.map(t => t.field)).toEqual(['has']);
    expect(link.q).toBe('is:issue');
  });

  it('encodes the query into a browsable URL', () => {
    const link = toGithubQuery('o/r', parseQuery('state:open'), forms, NOW);
    expect(link.url).toBe('https://github.com/o/r/issues?q=is%3Aissue%20is%3Aopen');
  });
});

describe('importQuery — 09E', () => {
  const forms = ['module', 'env'];

  it('reports what it understood and how many it matches', () => {
    const taken = importQuery('state:open assignee:rmenon env:prod', BOARD, forms);
    expect(taken.understood).toHaveLength(3);
    expect(taken.unknown).toEqual([]);
    expect(taken.matches).toBe(2);
  });

  it('names an unknown field and drops it rather than guessing', () => {
    const taken = importQuery('state:open team:payments', BOARD, forms);
    expect(taken.unknown.map(t => t.field)).toEqual(['team']);
    expect(taken.state.terms.map(t => t.field)).toEqual(['state']);
    /* And the count is for what will actually be applied — not for the string
       as sent, which would be a number nobody can reproduce. */
    expect(taken.matches).toBe(5);
  });
});

describe('the presets', () => {
  it('are all expressible as query strings', () => {
    for (const v of presetViews()) {
      expect(v.capture.filters?.terms.length, `${v.name} parsed to nothing`).toBeGreaterThan(0);
    }
  });

  it('count against the board they are shown beside', () => {
    const stale = presetViews().find(v => v.id === 'stale-unowned')!;
    /* Nothing on this board is both unassigned and quiet for a fortnight. */
    expect(countFor(stale, BOARD)).toBe(0);
    const open = presetViews().find(v => v.id === 'all-open')!;
    expect(countFor(open, BOARD)).toBe(5);
  });

  it('resolve @me against whoever is reading', () => {
    const mine = presetViews().find(v => v.id === 'my-plate')!;
    expect(countFor(mine, BOARD, { me: 'rmenon' })).toBe(4);
    expect(countFor(mine, BOARD, { me: 'salilvnair' })).toBe(1);
  });
});

describe('storage', () => {
  it('starts with the presets when nothing is stored', () => {
    expect(loadViews('nobody/nothing').views.map(v => v.id))
      .toEqual(presetViews().map(v => v.id));
  });

  it('leaves out a hidden view but keeps the reader’s order', () => {
    const stored = {
      views: [
        { id: 'a', name: 'A', capture: {} },
        { id: 'b', name: 'B', capture: {}, hidden: true },
        { id: 'c', name: 'C', capture: {} },
      ],
      order: ['c', 'a'],
    };
    expect(orderedViews(stored).map(v => v.id)).toEqual(['c', 'a']);
  });
});

describe('a view is a filter, and a filter is a string', () => {
  it('survives being written out and read back', () => {
    const state: FilterState = parseQuery('state:open env:prod -assignee:@me quiet:14d');
    const taken = importQuery('state:open env:prod -assignee:@me quiet:14d', BOARD, ['env']);
    expect(taken.state.terms).toEqual(state.terms);
  });
});
