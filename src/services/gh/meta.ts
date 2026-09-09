/**
 * The lists a write has to choose from.
 *
 * Assigning somebody, adding a label or setting a milestone are all "pick one
 * of a known set", and the set belongs to the repository. Reading it up front
 * is what makes the bulk bar and the inline editor offer choices rather than a
 * text field — and a text field is how you file a bug against a label that does
 * not exist and find out from gh's error message.
 *
 * Three calls, run together, and every one of them is allowed to fail on its
 * own. A repository with no milestones is ordinary; a repository whose
 * collaborator list needs a permission this account does not have is ordinary
 * too. Neither should cost you the other two lists.
 */
import { run } from './gh';

export interface RepoMeta {
  repo: string;
  labels: { name: string; color: string; description?: string }[];
  milestones: { title: string; dueOn?: string }[];
  /** Logins that can be assigned. Empty when the account may not list them. */
  assignees: string[];
  /** What could not be read, named rather than shown as an empty list. */
  unavailable: string[];
}

interface RawLabel { name?: string; color?: string; description?: string }
interface RawMilestone { title?: string; dueOn?: string; due_on?: string }
interface RawUser { login?: string }

async function json<T>(argv: string[]): Promise<T | undefined> {
  const r = await run(argv, { timeoutMs: 30_000 });
  if (!r.ok) return undefined;
  try {
    return JSON.parse(r.stdout) as T;
  } catch {
    return undefined;
  }
}

export async function fetchRepoMeta(repo: string): Promise<RepoMeta> {
  const [labels, milestones, assignees] = await Promise.all([
    json<RawLabel[]>(['label', 'list', '--repo', repo, '--limit', '200',
      '--json', 'name,color,description']),
    json<RawMilestone[]>(['api', `/repos/${repo}/milestones?state=open&per_page=100`]),
    /*
      Collaborators, not "everyone who has commented". GitHub will refuse an
      assignee who is not one, so offering a wider list would be offering
      choices that fail — and the failure arrives after the confirm screen,
      which is the worst possible moment.
    */
    json<RawUser[]>(['api', `/repos/${repo}/assignees?per_page=100`]),
  ]);

  const unavailable: string[] = [];
  if (!labels) unavailable.push('labels');
  if (!milestones) unavailable.push('milestones');
  if (!assignees) unavailable.push('assignees');

  return {
    repo,
    labels: (labels ?? [])
      .map(l => ({ name: l.name ?? '', color: l.color ?? '888888', description: l.description }))
      .filter(l => l.name),
    milestones: (milestones ?? [])
      .map(m => ({ title: m.title ?? '', dueOn: m.dueOn ?? m.due_on }))
      .filter(m => m.title),
    assignees: (assignees ?? []).map(a => a.login).filter((l): l is string => !!l),
    unavailable,
  };
}
