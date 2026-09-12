/**
 * 14D's two judgements.
 *
 * Whether the panel is drawn at all — an issue attached to nothing gets no
 * heading, not an empty one — and how late a blocker is, which is the sentence
 * that explains why the issue in front of you has not moved.
 */
import { describe, it, expect } from 'vitest';
import { isEmpty, overdueDays, etaOf } from './GhRelations';
import type { Relations } from './GhRelations';
import type { BoardIssue } from './board-types';

const bare: Relations = {
  repo: 'acme/app', number: 41,
  blockedBy: [], blocking: [], subIssues: [], done: 0, total: 0, mentions: [],
};

const issue = (dimensions: Record<string, string>): BoardIssue => ({
  number: 36, title: 'Token loops', state: 'OPEN', url: '',
  assignees: [], labels: [], createdAt: '', updatedAt: '',
  commentCount: 0, dimensions, evidence: [], ageDays: 0, quietDays: 0,
});

describe('isEmpty', () => {
  it('is empty before the answer arrives', () => {
    expect(isEmpty(null)).toBe(true);
  });

  it('is empty when the issue is attached to nothing', () => {
    expect(isEmpty(bare)).toBe(true);
  });

  it('is not empty when something failed — that has to be said', () => {
    expect(isEmpty({ ...bare, absent: 'scope' })).toBe(false);
    expect(isEmpty({ ...bare, error: 'gh went away' })).toBe(false);
  });

  it.each([
    ['a blocker', { blockedBy: [{ number: 36, title: '', state: 'OPEN' }] }],
    ['something it blocks', { blocking: [{ number: 50, title: '', state: 'OPEN' }] }],
    ['a sub-issue', { subIssues: [{ number: 43, title: '', state: 'OPEN' }] }],
    ['a parent', { parent: { number: 30, title: '', state: 'OPEN' } }],
    ['a mention', { mentions: [{ number: 12, title: '', state: 'OPEN' }] }],
  ])('draws the panel for %s', (_what, part) => {
    expect(isEmpty({ ...bare, ...part } as Relations)).toBe(false);
  });
});

describe('overdueDays', () => {
  const now = new Date('2026-09-10T12:00:00Z');

  it('counts whole days past the date', () => {
    expect(overdueDays('2026-09-06', 'OPEN', now)).toBe(4);
  });

  it('is not late on the day itself', () => {
    expect(overdueDays('2026-09-10', 'OPEN', now)).toBe(0);
  });

  it('is not late before it', () => {
    expect(overdueDays('2026-09-20', 'OPEN', now)).toBe(0);
  });

  it('a closed blocker is never late — it is finished, not overdue', () => {
    expect(overdueDays('2026-09-01', 'CLOSED', now)).toBe(0);
  });

  it('says nothing when there is no date rather than guessing one', () => {
    expect(overdueDays(undefined, 'OPEN', now)).toBe(0);
    expect(overdueDays('not a date', 'OPEN', now)).toBe(0);
  });
});

describe('etaOf', () => {
  const end = { id: 'f1', name: 'Target date', dataType: 'DATE' };

  it('reads the field the roadmap reads, by its lowercased name', () => {
    expect(etaOf(issue({ 'target date': '2026-09-04' }), end)).toBe('2026-09-04');
  });

  it('has no ETA when the Project declares no date field', () => {
    expect(etaOf(issue({ 'target date': '2026-09-04' }), undefined)).toBeUndefined();
  });

  it('has no ETA for an issue that is not on the board', () => {
    expect(etaOf(undefined, end)).toBeUndefined();
  });
});
