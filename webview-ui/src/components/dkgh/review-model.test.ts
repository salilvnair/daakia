/**
 * The review, where being wrong writes to somebody's repository.
 *
 * Two of these matter more than the rest. `retryable` must never return the
 * create — re-running it against an issue that already exists files a second
 * copy, which is the exact bug screen 13D is built to prevent. And
 * `findDuplicates` must not cry duplicate at every issue in the same module, or
 * people learn to click past it and the one real duplicate goes with them.
 */
import { describe, it, expect } from 'vitest';
import type { BoardIssue } from './board-types';
import {
  created, findDuplicates, provenanceSummary, readProvenance, retryable,
  type StepOutcome,
} from './review-model';

function issue(n: number, over: Partial<BoardIssue> = {}): BoardIssue {
  return {
    number: n,
    title: `Issue ${n}`,
    state: 'OPEN',
    url: `https://example.invalid/${n}`,
    assignees: [],
    labels: [],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    commentCount: 0,
    dimensions: {},
    evidence: [],
    ageDays: 8,
    quietDays: 8,
    ...over,
  };
}

const BODY = [
  '### Summary',
  '',
  'SSO sign-in hangs on submit and never resolves.',
  '',
  '### Environment',
  '',
  'PROD',
  '',
  '### Steps to Reproduce',
  '',
  '_No response_',
].join('\n');

describe('readProvenance — 13A', () => {
  it('splits the body into the template’s own blocks', () => {
    expect(readProvenance(BODY).map(p => p.heading))
      .toEqual(['Summary', 'Environment', 'Steps to Reproduce']);
  });

  it('marks what somebody wrote as theirs', () => {
    expect(readProvenance(BODY)[0].provenance).toBe('you');
  });

  it('marks an unanswered block as the template’s, not as the reader’s words', () => {
    expect(readProvenance(BODY)[2].provenance).toBe('template');
  });

  it('marks a block a model composed, when one day something does', () => {
    const parts = readProvenance(BODY, ['Summary']);
    expect(parts[0].provenance).toBe('model');
    expect(parts[0].note).toMatch(/composed/i);
  });

  it('says plainly that nothing was generated, rather than implying it checked', () => {
    expect(provenanceSummary(readProvenance(BODY))).toMatch(/Nothing was generated/);
    expect(provenanceSummary(readProvenance(BODY, ['Summary']))).toMatch(/1 block composed/);
  });

  it('handles a repository with no template, where the body is one block', () => {
    const parts = readProvenance('It hangs on submit.');
    expect(parts).toHaveLength(1);
    expect(parts[0].heading).toBe('');
    expect(parts[0].provenance).toBe('you');
  });
});

describe('findDuplicates — 13C', () => {
  const board = [
    issue(36, {
      title: 'Session token refresh loops on a 401',
      bodyFirstLine: 'the token endpoint answers 401 and the client retries forever',
      dimensions: { module: 'Checkout', env: 'PROD' },
      commentCount: 3,
      quietDays: 2,
    }),
    issue(12, {
      title: 'SSO login slow on first attempt',
      bodyFirstLine: 'latency on the first sso attempt only',
      dimensions: { module: 'Checkout', env: 'PROD' },
      state: 'CLOSED',
    }),
    issue(99, {
      title: 'Excel import drops rows',
      dimensions: { module: 'Reporting', env: 'DEV' },
    }),
  ];

  const draft = {
    title: 'Token refresh retries forever on 401',
    description: 'the client retries the token endpoint forever after a 401',
    answers: { 'Module/Screen': 'Checkout', Environment: 'PROD' },
  };

  it('finds the one describing the same thing', () => {
    const found = findDuplicates(draft, board, ['module', 'env']);
    expect(found[0].issue.number).toBe(36);
  });

  it('calls it strong when the dimensions and the words both agree', () => {
    expect(findDuplicates(draft, board, ['module', 'env'])[0].strength).toBe('strong');
  });

  it('gives reasons that can be checked, and never a percentage', () => {
    const reasons = findDuplicates(draft, board, ['module', 'env'])[0].reasons;
    expect(reasons.join(' ')).toMatch(/Same module — Checkout/);
    expect(reasons.join(' ')).toMatch(/Both mention/);
    expect(reasons.join(' ')).not.toMatch(/%/);
  });

  it('leaves out an issue that shares nothing but a module', () => {
    const found = findDuplicates(
      { title: 'Column widths reset', description: 'widths reset on refresh', answers: { Module: 'Checkout' } },
      board,
      ['module'],
    );
    expect(found.map(f => f.issue.number)).not.toContain(12);
  });

  it('says a closed one may be the fix rather than the same bug', () => {
    const found = findDuplicates(
      { title: 'SSO login slow on first attempt', description: 'sso latency first attempt', answers: {} },
      board,
      ['module'],
    );
    const closed = found.find(f => f.issue.number === 12);
    expect(closed?.reasons.join(' ')).toMatch(/closed/);
  });

  it('finds nothing at all from an empty draft, rather than everything', () => {
    expect(findDuplicates({ title: '', description: '', answers: {} }, board, ['module']))
      .toEqual([]);
  });

  it('never offers more than three, because a list nobody reads is not a check', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      issue(i, { title: 'token refresh 401 loop', dimensions: { module: 'Checkout' } }));
    expect(findDuplicates(draft, many, ['module']).length).toBeLessThanOrEqual(3);
  });
});

describe('retryable — 13D', () => {
  const outcomes: StepOutcome[] = [
    { kind: 'create', does: 'files it', command: 'gh issue create', ok: true },
    { kind: 'labels', does: 'adds bug', command: 'gh issue edit', ok: true },
    { kind: 'assignees', does: 'assigns', command: 'gh issue edit', ok: false, error: 'rate limited' },
    { kind: 'milestone', does: 'sets it', command: 'gh issue edit', ok: false, error: 'not found' },
    { kind: 'project', does: 'priority', command: 'gh project', ok: false, skipped: true },
  ];

  it('offers only the steps that actually failed', () => {
    expect(retryable(outcomes)).toEqual(['assignees', 'milestone']);
  });

  it('never offers the create, whatever happened to it', () => {
    /* A second create files a second copy of an issue that already exists. */
    const failed: StepOutcome[] = [
      { kind: 'create', does: 'files it', command: 'gh issue create', ok: false, error: '422' },
    ];
    expect(retryable(failed)).toEqual([]);
  });

  it('leaves out a step that was skipped, which is not the same as failed', () => {
    expect(retryable(outcomes)).not.toContain('project');
  });

  it('tells the two 13D screens apart', () => {
    expect(created(outcomes)).toBe(true);
    expect(created([{ kind: 'create', does: '', command: '', ok: false }])).toBe(false);
  });
});
