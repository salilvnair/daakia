/**
 * Editing a repository's labels — screen 19.
 *
 * GitHub's own label editor is a settings page nobody visits: one row at a
 * time, a colour picker per row, no way to see the set as a set. Labels are the
 * one piece of GitHub's schema worth editing from here, because they are the
 * thing a testing team actually curates.
 *
 * **Sync is one-way on purpose.** Edits are staged in the webview and nothing
 * leaves until a push. This file's job is the two halves of that push: what it
 * would run, and running it.
 *
 * **A rename is not a local rename.** Renaming `auth-sso` to `sso` changes it
 * on every issue carrying it and breaks any saved search written against the
 * old name — GitHub's own included. `planLabels` marks a rename as one so the
 * screen can say so by name and by count before it runs.
 *
 * **Nothing merges silently.** A staged edit against a label somebody else has
 * since changed is a conflict, reported per label; two people recolouring one
 * label is a question, not something to resolve by timestamp.
 */
import { run } from './gh';

export interface Label {
  name: string;
  color: string;
  description?: string;
}

/** A staged change, as the screen holds it. */
export interface LabelEdit {
  /** The name on GitHub. Absent for a label created here. */
  was?: string;
  /** The name it should have. Absent when the label is being deleted. */
  name?: string;
  color?: string;
  description?: string;
  deleted?: boolean;
  /** What the label looked like when it was read, for the conflict check. */
  readAs?: Label;
}

export type StepKind = 'create' | 'rename' | 'update' | 'delete';

export interface LabelStep {
  kind: StepKind;
  /** The label this step is about, by the name it has on GitHub right now. */
  label: string;
  does: string;
  argv: string[];
  display: string;
  /** Set for a rename, because that is the step with consequences elsewhere. */
  renamesTo?: string;
}

export interface LabelPlan {
  repo: string;
  steps: LabelStep[];
  refusal?: string;
}

/** GitHub wants bare hex; people paste `#f85149`. */
export function hex(colour: string): string {
  return colour.replace(/^#/, '').trim().toLowerCase();
}

/**
 * What pushing these edits would run, unrun.
 *
 * One call per label, and the verb is decided here rather than by the screen:
 * a label with no `was` is a create, one whose name changed is a rename, and
 * one that only changed colour or description is an update. The screen renders
 * what comes back.
 */
export function planLabels(repo: string, edits: LabelEdit[]): LabelPlan {
  const steps: LabelStep[] = [];

  for (const edit of edits) {
    if (edit.deleted && edit.was) {
      const argv = ['api', '--method', 'DELETE', `/repos/${repo}/labels/${enc(edit.was)}`];
      steps.push({
        kind: 'delete',
        label: edit.was,
        does: `Deletes ${edit.was}`,
        argv,
        display: `gh ${argv.join(' ')}`,
      });
      continue;
    }

    if (!edit.was) {
      if (!edit.name) continue;
      const argv = [
        'api', '--method', 'POST', `/repos/${repo}/labels`,
        '-f', `name=${edit.name}`,
        '-f', `color=${hex(edit.color ?? 'ededed')}`,
        ...(edit.description ? ['-f', `description=${edit.description}`] : []),
      ];
      steps.push({
        kind: 'create',
        label: edit.name,
        does: `Creates ${edit.name}`,
        argv,
        display: `gh ${argv.join(' ')}`,
      });
      continue;
    }

    const renamed = !!edit.name && edit.name !== edit.was;
    const fields: string[] = [];
    if (renamed) fields.push('-f', `new_name=${edit.name}`);
    if (edit.color !== undefined) fields.push('-f', `color=${hex(edit.color)}`);
    if (edit.description !== undefined) fields.push('-f', `description=${edit.description}`);
    if (fields.length === 0) continue;

    const argv = [
      'api', '--method', 'PATCH', `/repos/${repo}/labels/${enc(edit.was)}`, ...fields,
    ];
    steps.push({
      kind: renamed ? 'rename' : 'update',
      label: edit.was,
      does: renamed
        ? `Renames ${edit.was} to ${edit.name}`
        : `Updates ${edit.was}`,
      argv,
      display: `gh ${argv.join(' ')}`,
      renamesTo: renamed ? edit.name : undefined,
    });
  }

  return {
    repo,
    steps,
    refusal: steps.length === 0 ? 'Nothing has changed.' : undefined,
  };
}

/** A label name goes in a URL path, and `bug: ui` is a perfectly legal one. */
function enc(name: string): string {
  return encodeURIComponent(name);
}

export interface LabelOutcome {
  label: string;
  ok: boolean;
  error?: string;
}

/**
 * Run the plan, one label at a time.
 *
 * Not atomic, and it says so — three renames is three calls, and if the second
 * fails the first has already happened. Reporting which landed is more use than
 * an all-or-nothing that would need three more calls to undo two.
 */
export async function applyLabels(plan: LabelPlan): Promise<LabelOutcome[]> {
  const out: LabelOutcome[] = [];
  for (const step of plan.steps) {
    const r = await run(step.argv, { timeoutMs: 30_000 });
    out.push({
      label: step.label,
      ok: r.ok,
      error: r.ok ? undefined : (r.stderr || r.failure || `gh exited with ${r.code}`).trim(),
    });
  }
  return out;
}

export interface Conflict {
  label: string;
  /** What it looked like when this session read it. */
  was: Label;
  /** What it looks like on GitHub now. */
  now: Label;
}

/**
 * 19C — somebody changed it there while it was staged here.
 *
 * Compared against what was read, not against what is staged: a label the
 * reader edited to the same value somebody else chose is not a conflict, and a
 * label they did not touch is not one either.
 */
export function conflicts(edits: LabelEdit[], current: Label[]): Conflict[] {
  const now = new Map(current.map(l => [l.name, l]));
  const out: Conflict[] = [];
  for (const edit of edits) {
    if (!edit.was || !edit.readAs) continue;
    const live = now.get(edit.was);
    /* Gone from GitHub entirely is its own kind of conflict, and the push will
       say so in gh's own words — there is nothing useful to compare. */
    if (!live) continue;
    const moved = hex(live.color) !== hex(edit.readAs.color)
      || (live.description ?? '') !== (edit.readAs.description ?? '');
    if (moved) out.push({ label: edit.was, was: edit.readAs, now: live });
  }
  return out;
}
