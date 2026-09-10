/**
 * The timeline's wording.
 *
 * The value of this file is the translation: GitHub's payload is a union of
 * about thirty shapes and the page renders one sentence per row. Everything
 * here is about that mapping being right, and about the two rules it keeps —
 * an event this file cannot word is counted rather than rendered raw, and a
 * comment is not counted as skipped because it is already on the page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('./gh', () => ({ run: (...a: unknown[]) => run(...a) }));

const { fetchTimeline } = await import('./timeline');

function answers(events: unknown[]) {
  run.mockResolvedValue({ ok: true, stdout: JSON.stringify(events), stderr: '' });
}

beforeEach(() => run.mockReset());

describe('fetchTimeline', () => {
  it('reads the timeline endpoint for that one issue', async () => {
    answers([]);
    await fetchTimeline('acme/app', 41);
    expect(run).toHaveBeenCalledWith(
      ['api', '/repos/acme/app/issues/41/timeline?per_page=100'],
      expect.anything(),
    );
  });

  it('words a label as added, with its colour', async () => {
    answers([{ event: 'labeled', actor: { login: 'salilvnair' },
      label: { name: 'bug', color: 'f85149' }, created_at: '2026-09-01T10:00:00Z' }]);
    const t = await fetchTimeline('acme/app', 41);
    expect(t.events).toEqual([{
      kind: 'label', actor: 'salilvnair', at: '2026-09-01T10:00:00Z',
      text: 'added', value: 'bug', colour: 'f85149',
    }]);
  });

  it('says self-assigned when the assignee is the actor', async () => {
    answers([{ event: 'assigned', actor: { login: 'rmenon' }, assignee: { login: 'rmenon' } }]);
    const [one] = (await fetchTimeline('acme/app', 41)).events;
    expect(one.text).toBe('self-assigned this');
    expect(one.value).toBeUndefined();
  });

  it('names the other person when somebody else was assigned', async () => {
    answers([{ event: 'assigned', actor: { login: 'rmenon' }, assignee: { login: 'salilvnair' } }]);
    const [one] = (await fetchTimeline('acme/app', 41)).events;
    expect(one.text).toBe('assigned');
    expect(one.value).toBe('salilvnair');
  });

  it('distinguishes closed from closed as not planned', async () => {
    answers([
      { event: 'closed', actor: { login: 'a' } },
      { event: 'closed', actor: { login: 'b' }, state_reason: 'not_planned' },
    ]);
    const t = await fetchTimeline('acme/app', 41);
    expect(t.events.map(e => e.text)).toEqual(['closed this', 'closed this as not planned']);
  });

  it('counts an event it cannot word rather than rendering it', async () => {
    answers([
      { event: 'labeled', label: { name: 'bug' } },
      { event: 'user_blocked' },
      { event: 'convert_to_draft' },
    ]);
    const t = await fetchTimeline('acme/app', 41);
    expect(t.events).toHaveLength(1);
    expect(t.skipped).toBe(2);
  });

  it('does not count a comment as skipped — the page already has it', async () => {
    answers([{ event: 'commented', body: 'hello' }, { event: 'labeled', label: { name: 'bug' } }]);
    const t = await fetchTimeline('acme/app', 41);
    expect(t.events).toHaveLength(1);
    expect(t.skipped).toBe(0);
  });

  it('reports gh’s own words when the call fails', async () => {
    run.mockResolvedValue({ ok: false, stdout: '', stderr: 'HTTP 404: Not Found' });
    const t = await fetchTimeline('acme/app', 41);
    expect(t.error).toBe('HTTP 404: Not Found');
    expect(t.events).toEqual([]);
  });

  it('does not throw on a body that is not JSON', async () => {
    run.mockResolvedValue({ ok: true, stdout: 'not json', stderr: '' });
    const t = await fetchTimeline('acme/app', 41);
    expect(t.error).toMatch(/not JSON/);
  });
});
