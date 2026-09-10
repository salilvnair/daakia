/**
 * The label push.
 *
 * Every rule here is about a label edit reaching further than it looks: a
 * rename touching every issue carrying it, a name that is legal on GitHub and
 * illegal in a URL, and somebody else's change arriving while yours is staged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('./gh', () => ({ run: (...a: unknown[]) => run(...a) }));

const { applyLabels, conflicts, hex, planLabels } = await import('./labels');

beforeEach(() => run.mockReset());

describe('hex', () => {
  it('takes the hash off, because GitHub wants bare hex', () => {
    expect(hex('#F85149')).toBe('f85149');
    expect(hex('f85149')).toBe('f85149');
  });
});

describe('planLabels', () => {
  it('refuses when nothing changed', () => {
    expect(planLabels('a/b', []).refusal).toBe('Nothing has changed.');
    expect(planLabels('a/b', [{ was: 'bug' }]).refusal).toBe('Nothing has changed.');
  });

  it('creates a label that has no name on GitHub yet', () => {
    const [step] = planLabels('a/b', [{ name: 'needs-evidence', color: '#3fb950' }]).steps;
    expect(step.kind).toBe('create');
    expect(step.argv).toEqual([
      'api', '--method', 'POST', '/repos/a/b/labels',
      '-f', 'name=needs-evidence', '-f', 'color=3fb950',
    ]);
  });

  it('marks a rename as one, and says what it becomes', () => {
    const [step] = planLabels('a/b', [{ was: 'auth-sso', name: 'sso' }]).steps;
    expect(step.kind).toBe('rename');
    expect(step.renamesTo).toBe('sso');
    expect(step.argv).toContain('new_name=sso');
    expect(step.does).toBe('Renames auth-sso to sso');
  });

  it('is an update, not a rename, when only the colour moved', () => {
    const [step] = planLabels('a/b', [{ was: 'bug', name: 'bug', color: '#db6d28' }]).steps;
    expect(step.kind).toBe('update');
    expect(step.renamesTo).toBeUndefined();
    expect(step.argv).not.toContain('new_name=bug');
  });

  it('deletes by the name GitHub knows, not the staged one', () => {
    const [step] = planLabels('a/b', [{ was: 'wontfix', name: 'never', deleted: true }]).steps;
    expect(step.kind).toBe('delete');
    expect(step.argv).toContain('/repos/a/b/labels/wontfix');
  });

  it('escapes a name that is legal on GitHub and not in a URL', () => {
    const [step] = planLabels('a/b', [{ was: 'bug: ui', color: '#fff' }]).steps;
    expect(step.argv).toContain('/repos/a/b/labels/bug%3A%20ui');
  });

  it('sets a description that was cleared, rather than skipping it', () => {
    const [step] = planLabels('a/b', [{ was: 'bug', description: '' }]).steps;
    expect(step.argv).toContain('description=');
  });
});

describe('applyLabels', () => {
  it('reports per label, and one failure does not stop the rest', async () => {
    run
      .mockResolvedValueOnce({ ok: false, stderr: 'HTTP 422: already exists' })
      .mockResolvedValueOnce({ ok: true, stdout: '{}' });
    const out = await applyLabels({
      repo: 'a/b',
      steps: [
        { kind: 'create', label: 'x', does: '', argv: ['api'], display: '' },
        { kind: 'update', label: 'y', does: '', argv: ['api'], display: '' },
      ],
    });
    expect(out).toEqual([
      { label: 'x', ok: false, error: 'HTTP 422: already exists' },
      { label: 'y', ok: true, error: undefined },
    ]);
  });
});

describe('conflicts', () => {
  const read = { name: 'bug', color: 'f85149', description: 'Broken' };

  it('is silent when nobody else touched it', () => {
    expect(conflicts([{ was: 'bug', color: '#000', readAs: read }], [read])).toEqual([]);
  });

  it('reports a colour somebody else changed while yours was staged', () => {
    const now = { name: 'bug', color: 'db6d28', description: 'Broken' };
    expect(conflicts([{ was: 'bug', color: '#000', readAs: read }], [now]))
      .toEqual([{ label: 'bug', was: read, now }]);
  });

  it('reports a description somebody else changed', () => {
    const now = { name: 'bug', color: 'f85149', description: 'Something is broken' };
    expect(conflicts([{ was: 'bug', color: '#000', readAs: read }], [now])).toHaveLength(1);
  });

  it('compares against what was read, not against what is staged', () => {
    /* Both people chose the same new colour: not a conflict. */
    const now = { name: 'bug', color: 'db6d28', description: 'Broken' };
    const out = conflicts([{ was: 'bug', color: 'db6d28', readAs: now }], [now]);
    expect(out).toEqual([]);
  });

  it('ignores a label the reader never edited', () => {
    expect(conflicts([], [read])).toEqual([]);
  });
});
