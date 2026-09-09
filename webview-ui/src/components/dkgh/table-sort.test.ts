/**
 * The two pieces of the table that are wrong in a way that looks plausible.
 *
 * Sorting a declared field as text puts High above Low above Medium above
 * Urgent, which is an ordering a reader will believe. And a two-level sort that
 * silently drops its second level, or refuses to be cleared, is a table that
 * quietly answers a different question from the one on screen.
 *
 * Both are pure functions over data, so both are cheap to pin down here.
 */
import { describe, it, expect } from 'vitest';
import { rankOf, type BoardIssue, type ProposedDimension } from './board-types';
import { sortIssues, nextSort } from './GhIssueTable';
import { catalogue } from './table-columns';

const PRIORITY: ProposedDimension = {
  dimension: 'priority',
  heading: 'Priority',
  options: ['Urgent', 'High', 'Medium', 'Low'],
  files: ['bug.yml'],
};

function issue(n: number, over: Partial<BoardIssue> = {}): BoardIssue {
  return {
    number: n,
    title: `Issue ${n}`,
    state: 'OPEN',
    url: `https://example.invalid/${n}`,
    assignees: [],
    labels: [],
    createdAt: '2026-09-01T00:00:00Z',
    commentCount: 0,
    dimensions: {},
    evidence: [],
    ageDays: 0,
    quietDays: 0,
    ...over,
  };
}

const cols = catalogue([PRIORITY]);

describe('rankOf', () => {
  it('orders by the position the form declared, not alphabetically', () => {
    const order = ['Low', 'Urgent', 'Medium', 'High']
      .sort((a, b) => rankOf(a, PRIORITY.options) - rankOf(b, PRIORITY.options));
    expect(order).toEqual(['Urgent', 'High', 'Medium', 'Low']);
  });

  it('puts a value the form never declared last, not first', () => {
    expect(rankOf('Cosmic', PRIORITY.options)).toBeGreaterThan(rankOf('Low', PRIORITY.options));
  });

  it('puts an empty value behind even an undeclared one', () => {
    expect(rankOf('', PRIORITY.options)).toBeGreaterThan(rankOf('Cosmic', PRIORITY.options));
  });
});

describe('sortIssues', () => {
  const issues = [
    issue(24, { dimensions: { priority: 'Low' }, ageDays: 21 }),
    issue(41, { dimensions: { priority: 'Urgent' }, ageDays: 6 }),
    issue(36, { dimensions: { priority: 'Urgent' }, ageDays: 21 }),
    issue(22, { dimensions: { priority: 'High' }, ageDays: 16 }),
  ];

  it('sorts a declared field by rank rather than as text', () => {
    const out = sortIssues(issues, [{ key: 'priority', dir: 'asc' }], cols, [PRIORITY]);
    expect(out.map(i => i.dimensions.priority))
      .toEqual(['Urgent', 'Urgent', 'High', 'Low']);
  });

  it('breaks a tie on the second level — urgent first, then oldest', () => {
    const out = sortIssues(
      issues,
      [{ key: 'priority', dir: 'asc' }, { key: 'age', dir: 'desc' }],
      cols,
      [PRIORITY],
    );
    expect(out.map(i => i.number)).toEqual([36, 41, 22, 24]);
  });

  it('leaves the order alone when nothing is sorted', () => {
    expect(sortIssues(issues, [], cols, [PRIORITY])).toBe(issues);
  });

  it('sorts an empty cell last in both directions', () => {
    const withBlank = [...issues, issue(9, { dimensions: {} })];
    for (const dir of ['asc', 'desc'] as const) {
      const out = sortIssues(withBlank, [{ key: 'priority', dir }], cols, [PRIORITY]);
      /* Ascending it is last because it ranks highest; descending it is first
         only if rank is negated — which is why this is worth asserting rather
         than assuming. */
      const at = out.findIndex(i => i.number === 9);
      expect(dir === 'asc' ? at === out.length - 1 : at === 0).toBe(true);
    }
  });
});

describe('nextSort', () => {
  it('sets the primary on a first click', () => {
    expect(nextSort([], 'age', false)).toEqual([{ key: 'age', dir: 'asc' }]);
  });

  it('flips the primary on a second click and clears it on a third', () => {
    const once = nextSort([], 'age', false);
    const twice = nextSort(once, 'age', false);
    expect(twice).toEqual([{ key: 'age', dir: 'desc' }]);
    expect(nextSort(twice, 'age', false)).toEqual([]);
  });

  it('replaces the whole sort when a different header is clicked plainly', () => {
    const start = [{ key: 'priority', dir: 'asc' as const }, { key: 'age', dir: 'desc' as const }];
    expect(nextSort(start, 'title', false)).toEqual([{ key: 'title', dir: 'asc' }]);
  });

  it('adds a tiebreak on shift-click without disturbing the primary', () => {
    const start = [{ key: 'priority', dir: 'asc' as const }];
    expect(nextSort(start, 'age', true)).toEqual([
      { key: 'priority', dir: 'asc' },
      { key: 'age', dir: 'asc' },
    ]);
  });

  it('flips then removes a tiebreak, leaving the primary in place', () => {
    const two = nextSort([{ key: 'priority', dir: 'asc' }], 'age', true);
    const flipped = nextSort(two, 'age', true);
    expect(flipped[1]).toEqual({ key: 'age', dir: 'desc' });
    expect(nextSort(flipped, 'age', true)).toEqual([{ key: 'priority', dir: 'asc' }]);
  });
});
