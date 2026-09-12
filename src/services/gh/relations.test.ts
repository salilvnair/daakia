/**
 * What one issue is attached to.
 *
 * Two rules carry the weight here. The sub-issue count comes from GitHub's own
 * summary rather than from the page of sub-issues that came back, because a
 * page is not a count. And a cross-reference is one row per referring issue,
 * not one per time somebody re-stated it — GitHub emits the event again on
 * every edit, and an active thread would otherwise list #41 four times.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('./gh', () => ({ run: (...a: unknown[]) => run(...a) }));

const { fetchRelations, mentionsOf, related } = await import('./relations');

function answers(issue: unknown) {
  run.mockResolvedValue({
    ok: true, stdout: JSON.stringify({ data: { repository: { issue } } }), stderr: '',
  });
}

beforeEach(() => run.mockReset());

describe('related', () => {
  it('reads a node', () => {
    expect(related({ number: 36, title: 'Token loops', state: 'CLOSED' }))
      .toEqual({ number: 36, title: 'Token loops', state: 'CLOSED', assignee: undefined });
  });

  it('takes the first assignee, for the row s avatar', () => {
    expect(related({ number: 43, assignees: { nodes: [{ login: 'rmenon' }] } })?.assignee)
      .toBe('rmenon');
  });

  it('drops a node with no number — something the credential cannot see', () => {
    expect(related({ title: 'somewhere private' })).toBeUndefined();
    expect(related(null)).toBeUndefined();
  });

  it('assumes open, because a node with no state is one still being written', () => {
    expect(related({ number: 1 })?.state).toBe('OPEN');
  });
});

describe('mentionsOf', () => {
  it('folds repeated references to the same issue into one row', () => {
    const out = mentionsOf([
      { createdAt: '2026-09-04T10:00:00Z', actor: { login: 'rmenon' }, source: { number: 41 } },
      { createdAt: '2026-09-06T10:00:00Z', actor: { login: 'salilvnair' }, source: { number: 41 } },
    ], 36);
    expect(out).toHaveLength(1);
  });

  it('keeps the earliest, because that is when the link was made', () => {
    const out = mentionsOf([
      { createdAt: '2026-09-06T10:00:00Z', actor: { login: 'salilvnair' }, source: { number: 41 } },
      { createdAt: '2026-09-04T10:00:00Z', actor: { login: 'rmenon' }, source: { number: 41 } },
    ], 36);
    expect(out[0].actor).toBe('rmenon');
    expect(out[0].at).toBe('2026-09-04T10:00:00Z');
  });

  it('never lists the issue as referencing itself', () => {
    expect(mentionsOf([{ createdAt: 'x', source: { number: 36 } }], 36)).toEqual([]);
  });

  it('skips a reference whose source the credential cannot read', () => {
    expect(mentionsOf([{ createdAt: 'x', source: null }], 36)).toEqual([]);
  });

  it('marks a merged pull request as a pull request', () => {
    const out = mentionsOf([{ createdAt: 'x', source: { number: 50, state: 'MERGED' } }], 36);
    expect(out[0].pr).toBe(true);
  });

  it('orders newest first', () => {
    const out = mentionsOf([
      { createdAt: '2026-09-01T00:00:00Z', source: { number: 10 } },
      { createdAt: '2026-09-09T00:00:00Z', source: { number: 20 } },
    ], 36);
    expect(out.map(m => m.number)).toEqual([20, 10]);
  });
});

describe('fetchRelations', () => {
  it('asks for that one issue, by owner, name and number', async () => {
    answers({ number: 41 });
    await fetchRelations('acme/app', 41);
    const argv = run.mock.calls[0][0] as string[];
    expect(argv.slice(0, 2)).toEqual(['api', 'graphql']);
    expect(argv).toContain('owner=acme');
    expect(argv).toContain('name=app');
    expect(argv).toContain('number=41');
  });

  it('reads blockers, sub-issues and references from one answer', async () => {
    answers({
      number: 41,
      subIssuesSummary: { total: 3, completed: 2 },
      subIssues: { nodes: [
        { number: 43, title: 'Retry ceiling', state: 'CLOSED' },
        { number: 45, title: 'Surface a sign-in error', state: 'OPEN' },
      ] },
      blockedBy: { nodes: [{ number: 36, title: 'Token loops', state: 'OPEN' }] },
      blocking: { nodes: [{ number: 50, title: 'Ship SSO', state: 'OPEN' }] },
      parent: { number: 30, title: 'SSO epic', state: 'OPEN' },
      timelineItems: { nodes: [
        { createdAt: '2026-09-08T09:00:00Z', actor: { login: 'rmenon' }, source: { number: 41 } },
        { createdAt: '2026-09-07T09:00:00Z', actor: { login: 'rmenon' }, source: { number: 12 } },
      ] },
    });
    const r = await fetchRelations('acme/app', 41);
    expect(r.blockedBy.map(b => b.number)).toEqual([36]);
    expect(r.blocking.map(b => b.number)).toEqual([50]);
    expect(r.subIssues).toHaveLength(2);
    expect(r.parent?.number).toBe(30);
    expect(r.mentions.map(m => m.number)).toEqual([12]);
    expect(r.absent).toBeUndefined();
  });

  it('counts sub-issues from the summary, not from the page that came back', async () => {
    answers({
      number: 41,
      subIssuesSummary: { total: 60, completed: 2 },
      subIssues: { nodes: [{ number: 43, state: 'CLOSED' }] },
    });
    const r = await fetchRelations('acme/app', 41);
    expect(r.total).toBe(60);
    expect(r.done).toBe(2);
  });

  it('falls back to counting the page when GitHub sends no summary', async () => {
    answers({
      number: 41,
      subIssues: { nodes: [{ number: 43, state: 'CLOSED' }, { number: 45, state: 'OPEN' }] },
    });
    const r = await fetchRelations('acme/app', 41);
    expect(r.total).toBe(2);
    expect(r.done).toBe(1);
  });

  it('an issue attached to nothing is empty, not an error', async () => {
    answers({ number: 41, subIssuesSummary: { total: 0, completed: 0 } });
    const r = await fetchRelations('acme/app', 41);
    expect(r.absent).toBeUndefined();
    expect(r.blockedBy).toEqual([]);
    expect(r.mentions).toEqual([]);
  });

  it('names a missing scope as a scope, so the screen can offer the fix', async () => {
    run.mockResolvedValue({
      ok: false, stdout: '', stderr: 'your token has not been granted the required scopes',
    });
    expect((await fetchRelations('acme/app', 41)).absent).toBe('scope');
  });

  it('passes gh s own words through for anything else', async () => {
    run.mockResolvedValue({ ok: false, stdout: '', stderr: 'Could not resolve to a Repository' });
    expect((await fetchRelations('acme/app', 41)).absent).toBe('Could not resolve to a Repository');
  });

  it('says so rather than throwing when the answer is not JSON', async () => {
    run.mockResolvedValue({ ok: true, stdout: '<html>', stderr: '' });
    expect((await fetchRelations('acme/app', 41)).absent)
      .toBe('gh returned something that is not JSON.');
  });

  it('says so when the issue is gone', async () => {
    answers(null);
    expect((await fetchRelations('acme/app', 41)).absent)
      .toBe('That issue is not there any more.');
  });

  it('never calls gh for a repo that is not owner/name', async () => {
    const r = await fetchRelations('app', 41);
    expect(run).not.toHaveBeenCalled();
    expect(r.absent).toBe('No issue.');
  });
});
