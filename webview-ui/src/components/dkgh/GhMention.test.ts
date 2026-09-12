/**
 * When `#` means "which issue" and when it does not.
 *
 * That judgement is the whole feature. A picker that opens on `#fff` or on a
 * markdown heading is a picker in the way, and one that does not open on a
 * real reference is the sentence the box used to show instead — "type # and a
 * number", which is true and useless because nobody knows the number.
 */
import { describe, it, expect } from 'vitest';
import { completed, matches, queryAt } from './GhMention';
import type { BoardIssue } from './board-types';

const issue = (number: number, title: string, state: 'OPEN' | 'CLOSED' = 'OPEN'): BoardIssue => ({
  number, title, state, url: '', assignees: [], labels: [],
  createdAt: '', updatedAt: '', commentCount: 0, dimensions: {}, evidence: [],
  ageDays: 0, quietDays: 0,
});

const board = [
  issue(42, 'Login page hangs on submit'),
  issue(41, 'Orders API returns 500'),
  issue(4, 'Search returns stale results', 'CLOSED'),
  issue(7, 'Webhook retries are not backing off'),
];

describe('queryAt', () => {
  it('opens on a # at the very start', () => {
    expect(queryAt('#', 1)).toBe('');
  });

  it('opens on a # after a space, and carries what follows it', () => {
    expect(queryAt('see #4', 6)).toBe('4');
    expect(queryAt('see #42', 7)).toBe('42');
  });

  it('opens inside a markdown link, where a reference is ordinary', () => {
    expect(queryAt('[see](#4', 8)).toBe('4');
  });

  it('stays shut inside a word — that is a colour or an anchor', () => {
    expect(queryAt('color:#fff', 10)).toBeUndefined();
    expect(queryAt('a#4', 3)).toBeUndefined();
  });

  it('closes once a space is typed — `# ` is a heading', () => {
    expect(queryAt('# ', 2)).toBeUndefined();
    expect(queryAt('# Heading', 9)).toBeUndefined();
  });

  it('reads the # nearest the caret, not the first one', () => {
    expect(queryAt('#41 and #7', 10)).toBe('7');
  });

  it('is nothing when there is no # at all', () => {
    expect(queryAt('nothing here', 12)).toBeUndefined();
  });

  it('ignores text after the caret', () => {
    expect(queryAt('#4 trailing', 2)).toBe('4');
  });
});

describe('matches', () => {
  it('offers the most recent when nothing has been typed yet', () => {
    expect(matches(board, '').map(h => h.number)).toEqual([42, 41, 4, 7]);
  });

  it('puts number matches before title matches', () => {
    const out = matches(board, '4');
    expect(out[0].number).toBe(42);
    expect(out.map(h => h.number)).toContain(4);
  });

  it('finds an issue by a word in its title', () => {
    expect(matches(board, 'webhook').map(h => h.number)).toEqual([7]);
  });

  it('is case-insensitive, because nobody types a title in its own case', () => {
    expect(matches(board, 'LOGIN').map(h => h.number)).toEqual([42]);
  });

  it('carries the state, so a closed issue can say so', () => {
    expect(matches(board, '4').find(h => h.number === 4)?.state).toBe('CLOSED');
  });

  it('stops at the limit rather than listing a whole repository', () => {
    const many = Array.from({ length: 40 }, (_, i) => issue(i + 1, `Issue ${i + 1}`));
    expect(matches(many, '')).toHaveLength(8);
  });

  it('offers nothing when nothing matches', () => {
    expect(matches(board, 'zzzz')).toEqual([]);
  });
});

describe('completed', () => {
  it('replaces the query with the number and a space', () => {
    expect(completed('see #4', 6, { number: 42, title: '', state: 'OPEN' }))
      .toEqual({ text: 'see #42 ', caret: 8 });
  });

  it('works on a bare # with nothing typed after it', () => {
    expect(completed('see #', 5, { number: 7, title: '', state: 'OPEN' }))
      .toEqual({ text: 'see #7 ', caret: 7 });
  });

  it('keeps whatever was after the caret', () => {
    expect(completed('see #4 later', 6, { number: 42, title: '', state: 'OPEN' }).text)
      .toBe('see #42  later');
  });
});
