/**
 * The argv a write will use.
 *
 * Pinned harder than the read paths, because this is the code that changes
 * somebody else's repository. The rule these tests exist to keep is that the
 * command shown on the confirm screen and the command that runs are the same
 * object — so what is asserted here is the argv itself, not a description of it.
 */
import { describe, it, expect } from 'vitest';
import { planEdit } from './write';

const R = 'acme/orders-service';

describe('planning an edit', () => {
  it('builds one command per issue', () => {
    const plan = planEdit({ repo: R, numbers: [41, 36], addLabels: ['bug'] });
    expect(plan.commands.map(c => c.number)).toEqual([41, 36]);
    expect(plan.commands[0].argv).toEqual([
      'issue', 'edit', '41', '--repo', R, '--add-label', 'bug',
    ]);
  });

  it('passes each label as its own flag rather than a joined string', () => {
    /* `--add-label "a,b"` is a label named "a,b" on some gh versions. One flag
       per value is the only spelling that means what it looks like. */
    const plan = planEdit({ repo: R, numbers: [1], addLabels: ['bug', 'prod'] });
    expect(plan.commands[0].argv).toEqual([
      'issue', 'edit', '1', '--repo', R, '--add-label', 'bug', '--add-label', 'prod',
    ]);
  });

  it('never puts the repository or a label through a shell', () => {
    /* A label really can contain a space, a quote or a semicolon. The argv is
       an array all the way to execFile, so the value stays one argument. */
    const plan = planEdit({ repo: R, numbers: [1], addLabels: ['needs info; rm -rf ~'] });
    expect(plan.commands[0].argv).toContain('needs info; rm -rf ~');
  });

  it('tells "clear the milestone" apart from "leave it alone"', () => {
    const cleared = planEdit({ repo: R, numbers: [1], milestone: '' });
    expect(cleared.commands[0].argv).toContain('--milestone');
    expect(cleared.summary).toMatch(/clear the milestone/);

    const untouched = planEdit({ repo: R, numbers: [1], addLabels: ['bug'] });
    expect(untouched.commands[0].argv).not.toContain('--milestone');
  });

  it('refuses a request that asks for nothing', () => {
    /* Otherwise the confirm screen offers a button that runs `gh issue edit 1`
       and reports success for having done nothing. */
    const plan = planEdit({ repo: R, numbers: [1] });
    expect(plan.empty).toBe(true);
    expect(plan.commands).toEqual([]);
  });

  it('uses close and reopen, which are subcommands and not flags', () => {
    const closed = planEdit({ repo: R, numbers: [7], state: 'close', closeReason: 'not planned' });
    expect(closed.commands[0].argv).toEqual([
      'issue', 'close', '7', '--repo', R, '--reason', 'not planned',
    ]);
    const reopened = planEdit({ repo: R, numbers: [7], state: 'reopen' });
    expect(reopened.commands[0].argv).toEqual(['issue', 'reopen', '7', '--repo', R]);
  });

  it('does not pass a reason to reopen, which gh rejects', () => {
    const plan = planEdit({ repo: R, numbers: [7], state: 'reopen', closeReason: 'completed' });
    expect(plan.commands[0].argv).not.toContain('--reason');
  });

  it('says what it is about to do, in the reader\'s terms', () => {
    expect(planEdit({ repo: R, numbers: [1], addLabels: ['bug'] }).summary)
      .toBe('add bug on issue #1');
    expect(planEdit({ repo: R, numbers: [1, 2, 3], addAssignees: ['sal'] }).summary)
      .toBe('assign sal on 3 issues');
  });

  it('shows the same string it will run', () => {
    /* The confirm screen renders `display`; applyPlan runs `argv`. If these can
       disagree the whole confirmation is theatre. */
    for (const c of planEdit({ repo: R, numbers: [1, 2], addLabels: ['x'] }).commands) {
      expect(c.display).toBe(`gh ${c.argv.join(' ')}`);
    }
  });
});
