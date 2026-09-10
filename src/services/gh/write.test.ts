/**
 * The argv a write will use.
 *
 * Pinned harder than the read paths, because this is the code that changes
 * somebody else's repository. The rule these tests exist to keep is that the
 * command shown on the confirm screen and the command that runs are the same
 * object — so what is asserted here is the argv itself, not a description of it.
 */
import { describe, it, expect } from 'vitest';
import { planCreate, planEdit } from './write';

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

describe('planning a create', () => {
  const base = { repo: R, title: 'It hangs', body: '### Summary\n\nIt hangs.' };

  it('files first and edits after, so a bad milestone cannot lose the body', () => {
    const plan = planCreate({ ...base, labels: ['bug'], milestone: 'v2.4' });
    expect(plan.steps.map(s => s.kind)).toEqual(['create', 'labels', 'milestone']);
    expect(plan.steps[0].argv).toEqual([
      'issue', 'create', '--repo', R, '--title', 'It hangs', '--body-file', '-',
    ]);
  });

  it('leaves the issue number as a placeholder, because nobody knows it yet', () => {
    const plan = planCreate({ ...base, labels: ['bug'] });
    expect(plan.steps[1].argv).toEqual([
      'issue', 'edit', '{n}', '--repo', R, '--add-label', 'bug',
    ]);
  });

  it('takes the body on stdin rather than in the argv', () => {
    /* An issue body is prose with newlines and backticks in it, and every
       platform caps its command line differently. */
    const plan = planCreate(base);
    expect(plan.steps[0].argv).toContain('--body-file');
    expect(plan.steps[0].argv).toContain('-');
    expect(plan.body).toBe(base.body);
  });

  it('adds no step for a field nobody set', () => {
    expect(planCreate(base).steps.map(s => s.kind)).toEqual(['create']);
  });

  it('draws a Project step and marks it unavailable rather than hiding it', () => {
    /* Somebody who set a priority has to see, before pressing anything, that it
       will not be written — otherwise the gap is discovered on the board. */
    const plan = planCreate({ ...base, project: { priority: 'Urgent' } });
    const project = plan.steps.find(s => s.kind === 'project')!;
    expect(project.unavailable).toMatch(/project scope/);
  });

  it('refuses a create with no title, on the screen that can fix it', () => {
    expect(planCreate({ ...base, title: '  ' }).refusal).toBe('An issue needs a title.');
  });

  it('never puts a label through a shell', () => {
    const plan = planCreate({ ...base, labels: ['needs info; rm -rf ~'] });
    expect(plan.steps[1].argv).toContain('needs info; rm -rf ~');
  });
});

/**
 * A comment is a write like any other.
 *
 * The two rules worth pinning: the body goes in through stdin rather than an
 * argv, and on a close the comment is ordered first — GitHub notifies on both,
 * and an explanation that lands after the close reads as an afterthought to
 * everybody watching.
 */
describe('a comment', () => {
  const base = { repo: 'acme/app', numbers: [41] };

  it('goes in through stdin, not as an argument', () => {
    const [cmd] = planEdit({ ...base, comment: 'Fixed in v2.4.1' }).commands;
    expect(cmd.argv).toEqual([
      'issue', 'comment', '41', '--repo', 'acme/app', '--body-file', '-',
    ]);
    expect(cmd.stdin).toBe('Fixed in v2.4.1');
    expect(cmd.argv.join(' ')).not.toContain('Fixed');
  });

  it('is ordered before the close it explains', () => {
    const plan = planEdit({
      ...base, comment: 'Fixed', state: 'close', closeReason: 'completed',
    });
    expect(plan.commands.map(c => c.argv[1])).toEqual(['comment', 'close']);
  });

  it('is not planned for whitespace somebody left in the box', () => {
    expect(planEdit({ ...base, comment: '   ' }).commands).toEqual([]);
    expect(planEdit({ ...base, comment: '   ' }).empty).toBe(true);
  });

  it('says so in the summary, on its own and alongside a close', () => {
    expect(planEdit({ ...base, comment: 'hi' }).summary).toMatch(/leave a comment/);
    expect(planEdit({ ...base, comment: 'hi', state: 'close' }).summary)
      .toBe('Close issue #41, with a comment');
  });

  it('is one comment per issue on a bulk close', () => {
    const plan = planEdit({ repo: 'a/b', numbers: [1, 2], comment: 'hi', state: 'close' });
    expect(plan.commands.filter(c => c.argv[1] === 'comment')).toHaveLength(2);
  });
});
