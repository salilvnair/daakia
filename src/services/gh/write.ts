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
}

export interface PlannedCommand {
  /** The issue this line will change. */
  number: number;
  /** The exact argv, as it will be passed — no shell, ever. */
  argv: string[];
  /** The same thing, joined, for a human to read on the confirm screen. */
  display: string;
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

  for (const number of req.numbers) {
    if (req.state) {
      const argv = ['issue', req.state, String(number), '--repo', req.repo];
      /* gh only accepts a reason on close, and rejects it on reopen. */
      if (req.state === 'close' && req.closeReason) argv.push('--reason', req.closeReason);
      commands.push({ number, argv, display: `gh ${argv.join(' ')}` });
      continue;
    }

    const argv = ['issue', 'edit', String(number), '--repo', req.repo];
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
  if (req.state === 'close') {
    return `Close ${subject}${req.closeReason ? ` as ${req.closeReason}` : ''}`;
  }
  if (req.state === 'reopen') return `Reopen ${subject}`;

  const parts: string[] = [];
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
    const r = await run(c.argv, { timeoutMs: 30_000 });
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
 * Filing a new issue.
 *
 * Same shape as every other write here: `planCreate` builds it and returns it
 * unrun, `applyCreate` takes a plan rather than a description. A confirm screen
 * that displays one thing and files another is not expressible.
 *
 * The body travels on stdin rather than in the argv. An issue body is prose
 * with newlines, quotes and backticks in it, and every platform has a different
 * limit on how long a command line may be — a composer that works for four
 * paragraphs and fails silently at forty is worse than one that never worked.
 * `--body-file -` is gh's own answer to that.
 */
export interface CreateRequest {
  repo: string;
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  milestone?: string;
}

export interface CreatePlan {
  repo: string;
  argv: string[];
  /** What a person reads on the confirm screen — the body is shown separately. */
  display: string;
  body: string;
  /** Why this cannot run, when it cannot. */
  refusal?: string;
}

export function planCreate(req: CreateRequest): CreatePlan {
  const argv = ['issue', 'create', '--repo', req.repo, '--title', req.title, '--body-file', '-'];
  for (const l of req.labels ?? []) argv.push('--label', l);
  for (const a of req.assignees ?? []) argv.push('--assignee', a);
  if (req.milestone) argv.push('--milestone', req.milestone);

  /*
    A title is the one thing GitHub will not invent. Refused here rather than
    at gh, so the reason arrives on the screen that can fix it instead of as a
    subprocess error after a confirm.
  */
  const refusal = req.title.trim() ? undefined : 'An issue needs a title.';

  return {
    repo: req.repo,
    argv,
    display: `gh ${argv.join(' ')}`,
    body: req.body,
    refusal,
  };
}

export interface CreateResult {
  ok: boolean;
  /** The new issue's URL, which is what gh prints on success. */
  url?: string;
  number?: number;
  error?: string;
}

export async function applyCreate(plan: CreatePlan): Promise<CreateResult> {
  if (plan.refusal) return { ok: false, error: plan.refusal };

  const r = await run(plan.argv, { timeoutMs: 60_000, stdin: plan.body });
  if (!r.ok) {
    /* gh's own words. It names the label or the assignee that does not exist,
       which is the whole difference between a fixable error and a mystery. */
    return { ok: false, error: (r.stderr || r.failure || `exited with ${r.code}`).trim() };
  }

  const url = r.stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
  const number = Number(url.split('/').pop());
  return { ok: true, url, number: Number.isFinite(number) ? number : undefined };
}
