/**
 * Changing something on GitHub.
 *
 * The first code in dkgh that is not a read, and it is shaped around one rule:
 * every write is preceded by a screen showing the exact command. Nothing here
 * can happen without having been read first.
 *
 * That rule is enforced structurally rather than by habit. `planEdit` builds
 * the argv and returns it; `applyPlan` is the only thing that runs, and it
 * takes a plan rather than a description — so a caller cannot invent a command
 * at the moment of execution that differs from the one shown. A confirm screen
 * that displays one thing and runs another is the exact failure this shape
 * makes impossible.
 *
 * Nothing is retried. A write that fails comes back said plainly, because a
 * silent retry against a board somebody else is also editing is how a status
 * board ends up quietly wrong.
 */
import { run } from './gh';

export type EditField = 'addLabels' | 'removeLabels' | 'addAssignees' | 'removeAssignees' | 'milestone';

export interface EditRequest {
  repo: string;
  /** The issues to change. One or many — the argv is the same shape. */
  numbers: number[];
  addLabels?: string[];
  removeLabels?: string[];
  addAssignees?: string[];
  removeAssignees?: string[];
  /** `''` clears it. `undefined` leaves it alone — the two are different. */
  milestone?: string;
  /** `close` and `reopen` are their own subcommands, not flags on edit. */
  state?: 'close' | 'reopen';
  /** Required with `close`, and only meaningful there. */
  closeReason?: 'completed' | 'not planned';
  /**
   * A comment to leave, on its own or alongside a close.
   *
   * It is planned as its own call and ordered **before** the close, because a
   * closed issue whose explanation arrives a second later is one that notified
   * everybody watching twice, in the wrong order.
   */
  comment?: string;
  /**
   * Rewrite one comment that already exists.
   *
   * `id` is the REST comment id — the number in `#issuecomment-3456`, which is
   * the only place gh hands it to us; `--json comments` returns the GraphQL
   * node id, which this endpoint does not take. See `commentId`.
   *
   * The new body goes through stdin as JSON for the same reason a new
   * comment's does: it is multi-line prose somebody wrote, and an argv is the
   * wrong place for that on any platform.
   */
  editComment?: { id: number; body: string };
  /**
   * Rewrite the issue's own description.
   *
   * Not a comment: the opening post is a field on the issue, so it is
   * `gh issue edit --body-file -` rather than an api call against a comment
   * id. Through stdin, like every other body here.
   */
  body?: string;
  /**
   * Rename the issue.
   *
   * Its own call for the same reason the description is: `gh issue edit` takes
   * one `--title` happily enough, but a rename and four label changes failing
   * together as one command is a rename nobody can tell happened.
   */
  title?: string;
  /**
   * Remove one comment that already exists.
   *
   * There is no undo on GitHub and there is none here. What stands between
   * this and an accident is the same thing that stands in front of every other
   * write in dkgh: the exact command, on screen, before it runs.
   */
  deleteComment?: { id: number };
}

/**
 * The REST id inside a comment's permalink.
 *
 * `https://github.com/o/r/issues/2#issuecomment-3456` → `3456`. Undefined for
 * anything that is not one, so a malformed url cannot become a `PATCH` against
 * `NaN`.
 */
export function commentId(url: string | undefined): number | undefined {
  const m = /#issuecomment-(\d+)\s*$/.exec(url ?? '');
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

export interface PlannedCommand {
  /** The issue this line will change. */
  number: number;
  /** The exact argv, as it will be passed — no shell, ever. */
  argv: string[];
  /** The same thing, joined, for a human to read on the confirm screen. */
  display: string;
  /**
   * Fed to the command's stdin.
   *
   * A comment body goes in through `--body-file -` rather than as an argument:
   * it is multi-line prose somebody wrote, and an argv is the wrong place for
   * that on any platform.
   */
  stdin?: string;
}

export interface EditPlan {
  repo: string;
  commands: PlannedCommand[];
  /** What this does, in one sentence, for the confirm screen's heading. */
  summary: string;
  /** Set when the request asks for nothing — the confirm screen refuses it. */
  empty?: boolean;
}

/** `gh issue edit 41 --add-label bug` etc, built once and shown before it runs. */
export function planEdit(req: EditRequest): EditPlan {
  const commands: PlannedCommand[] = [];
  /* A comment belongs to one issue, so these are planned once rather than once
     per number — a bulk request carrying a comment id would otherwise emit the
     same PATCH several times. */
  const on = req.numbers[0] ?? 0;

  if (req.editComment) {
    const argv = [
      'api', '--method', 'PATCH',
      `repos/${req.repo}/issues/comments/${req.editComment.id}`,
      '--input', '-',
    ];
    commands.push({
      number: on,
      argv,
      display: `gh ${argv.join(' ')}`,
      stdin: JSON.stringify({ body: req.editComment.body }),
    });
  }

  if (req.deleteComment) {
    const argv = [
      'api', '--method', 'DELETE',
      `repos/${req.repo}/issues/comments/${req.deleteComment.id}`,
    ];
    commands.push({ number: on, argv, display: `gh ${argv.join(' ')}` });
  }

  for (const number of req.numbers) {
    /*
      The comment first, whatever else is happening.

      On a close it has to be: GitHub notifies on both, and an explanation that
      lands after the close reads as an afterthought to everybody watching.
    */
    if (req.comment?.trim()) {
      const argv = ['issue', 'comment', String(number), '--repo', req.repo, '--body-file', '-'];
      commands.push({
        number,
        argv,
        display: `gh ${argv.join(' ')}`,
        stdin: req.comment,
      });
    }

    if (req.state) {
      const argv = ['issue', req.state, String(number), '--repo', req.repo];
      /* gh only accepts a reason on close, and rejects it on reopen. */
      if (req.state === 'close' && req.closeReason) argv.push('--reason', req.closeReason);
      commands.push({ number, argv, display: `gh ${argv.join(' ')}` });
      continue;
    }

    const argv = ['issue', 'edit', String(number), '--repo', req.repo];
    /*
      Its own call, and first, because it takes stdin. `gh issue edit` reads
      one `--body-file -` per invocation, and folding the description into the
      same argv as four label changes would mean a single failure lost both.
    */
    if (req.title !== undefined) {
      const titleArgv = ['issue', 'edit', String(number), '--repo', req.repo,
                         '--title', req.title];
      commands.push({ number, argv: titleArgv, display: `gh ${titleArgv.join(' ')}` });
    }

    if (req.body !== undefined) {
      const bodyArgv = ['issue', 'edit', String(number), '--repo', req.repo, '--body-file', '-'];
      commands.push({
        number,
        argv: bodyArgv,
        display: `gh ${bodyArgv.join(' ')}`,
        stdin: req.body,
      });
    }
    for (const l of req.addLabels ?? []) argv.push('--add-label', l);
    for (const l of req.removeLabels ?? []) argv.push('--remove-label', l);
    for (const a of req.addAssignees ?? []) argv.push('--add-assignee', a);
    for (const a of req.removeAssignees ?? []) argv.push('--remove-assignee', a);
    /*
      An empty string is how gh clears a milestone, and it is a real request —
      so only `undefined` means "leave it alone". Collapsing the two would make
      "remove the milestone" impossible to express.
    */
    if (req.milestone !== undefined) argv.push('--milestone', req.milestone);

    /*
      The base is five elements — issue, edit, the number, --repo and the repo.
      Anything longer carries a real change; anything at five is a request that
      asked for nothing, and running it would report success for having done
      nothing at all.
    */
    if (argv.length > 5) commands.push({ number, argv, display: `gh ${argv.join(' ')}` });
  }

  return {
    repo: req.repo,
    commands,
    summary: describe(req),
    empty: commands.length === 0,
  };
}

function describe(req: EditRequest): string {
  const n = req.numbers.length;
  const subject = n === 1 ? `issue #${req.numbers[0]}` : `${n} issues`;
  /* Said first and said plainly. There is no undo on either of these, and a
     heading that buried them in a list of label changes would be the one
     place a reader skims. */
  if (req.deleteComment) return `Delete a comment on ${subject} — this cannot be undone`;
  if (req.editComment) return `Rewrite a comment on ${subject}`;
  if (req.body !== undefined) return `Rewrite the description of ${subject}`;
  if (req.title !== undefined) return `Rename ${subject}`;
  if (req.state === 'close') {
    return `Close ${subject}${req.closeReason ? ` as ${req.closeReason}` : ''}`
      + (req.comment?.trim() ? ', with a comment' : '');
  }
  if (req.state === 'reopen') {
    return `Reopen ${subject}${req.comment?.trim() ? ', with a comment' : ''}`;
  }

  const parts: string[] = [];
  if (req.comment?.trim()) parts.push('leave a comment');
  if (req.addLabels?.length) parts.push(`add ${req.addLabels.join(', ')}`);
  if (req.removeLabels?.length) parts.push(`remove ${req.removeLabels.join(', ')}`);
  if (req.addAssignees?.length) parts.push(`assign ${req.addAssignees.join(', ')}`);
  if (req.removeAssignees?.length) parts.push(`unassign ${req.removeAssignees.join(', ')}`);
  if (req.milestone !== undefined) {
    parts.push(req.milestone ? `set milestone ${req.milestone}` : 'clear the milestone');
  }
  if (parts.length === 0) return `Nothing to change on ${subject}`;
  return `${parts.join(', ')} on ${subject}`;
}

export interface EditOutcome {
  number: number;
  command: string;
  ok: boolean;
  error?: string;
}

export interface EditResult {
  outcomes: EditOutcome[];
  /** True when every command succeeded. */
  allOk: boolean;
  /**
   * True when some worked and some did not.
   *
   * The state worth naming loudly. A bulk action that half-applies leaves the
   * board disagreeing with GitHub in a way a blanket "failed" would hide, and
   * the reader needs to know which rows moved before they try again.
   */
  partial: boolean;
}

/**
 * Run a plan that has already been shown.
 *
 * Sequential rather than parallel, deliberately: GitHub's secondary rate limit
 * punishes bursts of writes, and a bulk action that trips it fails halfway with
 * no useful message. In order also means the outcomes read in the order the
 * confirm screen listed them.
 */
export async function applyPlan(plan: EditPlan): Promise<EditResult> {
  const outcomes: EditOutcome[] = [];

  for (const c of plan.commands) {
    const r = await run(c.argv, { timeoutMs: 30_000, stdin: c.stdin });
    outcomes.push({
      number: c.number,
      command: c.display,
      ok: r.ok,
      /* gh's own words. It usually names the label or the user that does not
         exist, which is the whole difference between a fixable error and a
         mystery. */
      error: r.ok ? undefined : (r.stderr || r.failure || `exited with ${r.code}`).trim(),
    });
  }

  const okCount = outcomes.filter(o => o.ok).length;
  return {
    outcomes,
    allOk: okCount === outcomes.length && outcomes.length > 0,
    partial: okCount > 0 && okCount < outcomes.length,
  };
}

// ── Creating one ────────────────────────────────────────────────────────────

/**
 * Filing a new issue, as a numbered sequence rather than one call.
 *
 * **Step one is the one that matters and it goes first.** Everything else —
 * labels, the assignee, the milestone, and one day the Project fields — is a
 * follow-up against an issue that already exists. If a follow-up fails the
 * issue is still filed with its title, body and evidence, and the result screen
 * says which fields did not land.
 *
 * The alternative is what most tools do: put every flag on `gh issue create`
 * and let GitHub validate them all at once. That is one call instead of four,
 * and it means a milestone somebody closed while you were writing loses the
 * whole issue. A network blip should not cost somebody four paragraphs.
 *
 * The whole sequence is on screen before it runs — the same promise every other
 * write in dkgh makes, and the only honest way to present an operation that is
 * not atomic.
 */
export type StepKind = 'create' | 'labels' | 'assignees' | 'milestone' | 'project';

export interface CreateStep {
  kind: StepKind;
  /** What it does, in the reader's terms. */
  does: string;
  /**
   * The argv, with `{n}` where the new issue's number goes.
   *
   * Substituted after step one returns, because until then nobody knows it.
   */
  argv: string[];
  display: string;
  /** Set when this step cannot run here, with the reason. Never attempted. */
  unavailable?: string;
}

export interface CreateRequest {
  repo: string;
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  milestone?: string;
  /** Project fields, for when the scope exists. Currently always skipped. */
  project?: { status?: string; priority?: string; target?: string };
}

export interface CreatePlan {
  repo: string;
  steps: CreateStep[];
  body: string;
  /** Why this cannot run at all, when it cannot. */
  refusal?: string;
}

/** What a Project step would need, said once rather than per row. */
const NO_PROJECT =
  'Needs the writable project scope, and dkgh does not write Projects yet — '
  + 'skipped entirely rather than attempted and failed.';

export function planCreate(req: CreateRequest): CreatePlan {
  const steps: CreateStep[] = [];

  const create = [
    'issue', 'create', '--repo', req.repo, '--title', req.title, '--body-file', '-',
  ];
  steps.push({
    kind: 'create',
    does: 'Files the issue with its title and body',
    argv: create,
    display: `gh ${create.join(' ')}`,
  });

  const edit = (flag: string, values: string[]) => {
    const argv = ['issue', 'edit', '{n}', '--repo', req.repo];
    for (const v of values) argv.push(flag, v);
    return argv;
  };

  if (req.labels?.length) {
    const argv = edit('--add-label', req.labels);
    steps.push({
      kind: 'labels',
      does: `Adds ${req.labels.join(', ')}`,
      argv,
      display: `gh ${argv.join(' ')}`,
    });
  }
  if (req.assignees?.length) {
    const argv = edit('--add-assignee', req.assignees);
    steps.push({
      kind: 'assignees',
      does: `Assigns ${req.assignees.join(', ')}`,
      argv,
      display: `gh ${argv.join(' ')}`,
    });
  }
  if (req.milestone) {
    const argv = edit('--milestone', [req.milestone]);
    steps.push({
      kind: 'milestone',
      does: `Sets the milestone to ${req.milestone}`,
      argv,
      display: `gh ${argv.join(' ')}`,
    });
  }

  /*
    The Project rows are drawn and greyed rather than hidden. Somebody who set a
    priority in the composer needs to see, before pressing anything, that it is
    not going to be written — otherwise the issue is created under a false
    expectation and the gap is discovered later on the board.
  */
  for (const [field, value] of Object.entries(req.project ?? {})) {
    if (!value) continue;
    steps.push({
      kind: 'project',
      does: `Sets ${field} to ${value} on the Project`,
      argv: ['project', 'item-edit', '--field', field, '--value', value],
      display: `gh project item-edit --field ${field} --value ${value}`,
      unavailable: NO_PROJECT,
    });
  }

  return {
    repo: req.repo,
    steps,
    body: req.body,
    /* A title is the one thing GitHub will not invent. Refused here so the
       reason arrives on the screen that can fix it. */
    refusal: req.title.trim() ? undefined : 'An issue needs a title.',
  };
}

export interface StepOutcome {
  kind: StepKind;
  does: string;
  command: string;
  ok: boolean;
  /**
   * True when it was never attempted — a Project step, or one after a failed
   * create. Distinct from having failed, and the result screen says so.
   */
  skipped?: boolean;
  error?: string;
}

export interface CreateResult {
  outcomes: StepOutcome[];
  /** The new issue, when step one worked. */
  url?: string;
  number?: number;
  /** True when step one worked and something after it did not. */
  partial: boolean;
}

/**
 * Run a sequence that has already been shown.
 *
 * Stops after step one if step one fails: there is nothing to edit. Carries on
 * past any later failure, because a milestone that would not set is no reason
 * to skip the assignee.
 *
 * `only` re-runs a subset — the retry on screen 13D. **Never step one**, which
 * is why the retry is per failed step rather than a blanket "try again": a
 * second create would file a second copy of an issue that already exists, which
 * is the specific bug that screen exists to prevent.
 */
export async function applyCreate(
  plan: CreatePlan,
  opts: { only?: StepKind[]; number?: number } = {},
): Promise<CreateResult> {
  if (plan.refusal) return { outcomes: [], partial: false };

  const outcomes: StepOutcome[] = [];
  let number = opts.number;
  let url: string | undefined;

  const skip = (step: CreateStep, why: string | undefined) => outcomes.push({
    kind: step.kind,
    does: step.does,
    command: step.display,
    ok: false,
    skipped: true,
    error: why,
  });

  for (let at = 0; at < plan.steps.length; at++) {
    const step = plan.steps[at];
    const retrying = !!opts.only;
    const wanted = !opts.only || opts.only.includes(step.kind);

    /* A retry never re-runs the create, whatever it was asked for. */
    if (step.unavailable || !wanted || (retrying && step.kind === 'create')) {
      skip(step, step.unavailable);
      continue;
    }

    if (step.kind === 'create') {
      const r = await run(step.argv, { timeoutMs: 60_000, stdin: plan.body });
      if (!r.ok) {
        outcomes.push({
          kind: 'create',
          does: step.does,
          command: step.display,
          ok: false,
          /* gh's own words, with the field it names. "Validation Failed" alone
             sends somebody to a browser to guess. */
          error: (r.stderr || r.failure || `exited with ${r.code}`).trim(),
        });
        /* Nothing exists, so nothing after this has anything to edit. */
        for (const rest of plan.steps.slice(at + 1)) {
          skip(rest, 'Not attempted — the issue was never created.');
        }
        return { outcomes, partial: false };
      }
      url = r.stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
      const parsed = Number(url.split('/').pop());
      number = Number.isFinite(parsed) ? parsed : undefined;
      outcomes.push({ kind: 'create', does: step.does, command: step.display, ok: true });
      continue;
    }

    if (number === undefined) {
      skip(step, 'Not attempted — no issue number to edit.');
      continue;
    }

    const argv = step.argv.map(a => (a === '{n}' ? String(number) : a));
    const r = await run(argv, { timeoutMs: 30_000 });
    outcomes.push({
      kind: step.kind,
      does: step.does,
      command: `gh ${argv.join(' ')}`,
      ok: r.ok,
      error: r.ok ? undefined : (r.stderr || r.failure || `exited with ${r.code}`).trim(),
    });
  }

  const created = outcomes.find(o => o.kind === 'create');
  const failedAfter = outcomes.some(o => o.kind !== 'create' && !o.ok && !o.skipped);
  return {
    outcomes,
    url,
    number,
    partial: (created?.ok ?? !!opts.number) && failedAfter,
  };
}
