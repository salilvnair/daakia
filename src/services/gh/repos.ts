/**
 * Finding the repository, three ways.
 *
 * The guess from the open workspace, a search across every org you belong to,
 * and the ones you picked before. Ordered by how likely each is to be right:
 * the repository you are testing is usually the repository you have open.
 *
 * Every one of them carries the two facts worth knowing before you commit to a
 * repository — how many issues are waiting, and whether it has templates for
 * the composer to read. A list of names alone makes you pick one, wait for a
 * board, and come back.
 */
import { run } from './gh';

export interface RepoSummary {
  /** `owner/name`. */
  nameWithOwner: string;
  description?: string;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  /** The upstream, when this is a fork — the thing whose issues you probably want. */
  parent?: string;
  openIssues: number;
  /** ISO. Rendered as "2h ago" by the UI, which owns the clock. */
  pushedAt?: string;
  /** How many issue forms it has. `undefined` when it was not looked up. */
  templates?: number;
}

/** What the git-remote guess returns. Absent means there is nothing to guess from. */
export interface RepoGuess {
  repo?: RepoSummary;
  /** Why there is no guess — shown instead of the card, never swallowed. */
  reason?: string;
}

/** Fields `gh repo` commands are asked for, in one place so the shapes agree. */
const REPO_FIELDS = [
  'nameWithOwner', 'description', 'isPrivate', 'isArchived', 'isFork',
  'parent', 'pushedAt',
].join(',');

interface RawRepo {
  nameWithOwner?: string;
  description?: string;
  isPrivate?: boolean;
  isArchived?: boolean;
  isFork?: boolean;
  parent?: { nameWithOwner?: string } | null;
  pushedAt?: string;
  fullName?: string;
}

function toSummary(r: RawRepo): RepoSummary | undefined {
  const name = r.nameWithOwner ?? r.fullName;
  if (!name) return undefined;
  return {
    nameWithOwner: name,
    description: r.description || undefined,
    isPrivate: !!r.isPrivate,
    isArchived: !!r.isArchived,
    isFork: !!r.isFork,
    parent: r.parent?.nameWithOwner,
    openIssues: 0,
    pushedAt: r.pushedAt,
  };
}

/**
 * How many issues are open.
 *
 * Asked with `--json number` and counted here rather than read off the
 * repository object: GitHub's own `openIssuesCount` includes pull requests, so
 * a repository with four issues and thirty PRs advertises thirty-four, and the
 * board that opens next shows four. A number that disagrees with the next
 * screen is worse than no number.
 */
export async function openIssueCount(repo: string): Promise<number> {
  const r = await run(
    ['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '200', '--json', 'number'],
    { timeoutMs: 30_000 },
  );
  if (!r.ok) return 0;
  try {
    const rows = JSON.parse(r.stdout) as unknown[];
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

/** How many issue forms it has. Cheap: one contents listing, no file bodies. */
export async function templateCount(repo: string): Promise<number> {
  const r = await run(
    ['api', `/repos/${repo}/contents/.github/ISSUE_TEMPLATE`,
      '--jq', '.[] | select(.type=="file") | .name'],
    { timeoutMs: 20_000 },
  );
  /* 404 is the ordinary case, not an error: most repositories have no forms. */
  if (!r.ok) return 0;
  return r.stdout.split(/\r?\n/)
    .map(s => s.trim())
    .filter(n => /\.ya?ml$/i.test(n) && !/^config\.ya?ml$/i.test(n))
    .length;
}

/** Both numbers at once, for a repository about to be offered. */
async function withCounts(repo: RepoSummary): Promise<RepoSummary> {
  const [openIssues, templates] = await Promise.all([
    openIssueCount(repo.nameWithOwner),
    templateCount(repo.nameWithOwner),
  ]);
  return { ...repo, openIssues, templates };
}

/**
 * The repository the open workspace points at.
 *
 * Asked of `gh` rather than parsed out of `git remote`: gh already knows how to
 * turn every remote spelling — ssh, https, an Enterprise host, a `.git` suffix,
 * an insteadOf rewrite — into `owner/name`, and re-implementing that here would
 * be a second parser to keep in step with the first.
 */
export async function guessFromWorkspace(cwd?: string): Promise<RepoGuess> {
  if (!cwd) return { reason: 'No folder is open, so there is no git remote to read.' };

  const r = await run(['repo', 'view', '--json', REPO_FIELDS], { cwd, timeoutMs: 20_000 });
  if (!r.ok) {
    const said = (r.stderr || r.failure || '').trim();
    /* gh's own words when it can be understood, because "no remote" and "you
       cannot see this repository" are different problems with different fixes. */
    return { reason: said || 'The open folder has no GitHub remote.' };
  }

  let raw: RawRepo;
  try {
    raw = JSON.parse(r.stdout) as RawRepo;
  } catch {
    return { reason: 'gh returned something that is not JSON.' };
  }

  const summary = toSummary(raw);
  if (!summary) return { reason: 'The open folder has no GitHub remote.' };
  return { repo: await withCounts(summary) };
}

/**
 * Search every repository this account can reach.
 *
 * Two commands, because they answer different questions. `gh repo list <owner>`
 * enumerates an org or a user including its private repositories; `gh search
 * repos` searches across all of GitHub but only sees public ones. A query that
 * names an owner gets the first, everything else gets both — otherwise typing
 * "orders" would miss the private `acme/orders-web` that is the whole reason
 * somebody is searching rather than typing the name.
 */
export async function searchRepos(
  query: string,
  opts: { includeArchived?: boolean; limit?: number } = {},
): Promise<{ repos: RepoSummary[]; error?: string }> {
  const q = query.trim();
  if (!q) return { repos: [] };
  const limit = opts.limit ?? 20;

  const args: string[][] = [];
  const slash = q.indexOf('/');
  if (slash > 0) {
    /* `acme/ord` — list the owner and filter by the rest, which is the only way
       to see that owner's private repositories. */
    args.push(['repo', 'list', q.slice(0, slash), '--limit', '100', '--json', REPO_FIELDS]);
  } else {
    args.push(['repo', 'list', '--limit', '100', '--json', REPO_FIELDS]);
    args.push(['search', 'repos', q, '--limit', String(limit), '--json', REPO_FIELDS]);
  }

  const term = (slash > 0 ? q.slice(slash + 1) : q).toLowerCase();
  const seen = new Set<string>();
  const out: RepoSummary[] = [];
  let firstError = '';

  for (const a of args) {
    const r = await run(a, { timeoutMs: 45_000 });
    if (!r.ok) {
      if (!firstError) firstError = (r.stderr || r.failure || '').trim();
      continue;
    }
    let rows: RawRepo[];
    try {
      rows = JSON.parse(r.stdout) as RawRepo[];
    } catch {
      continue;
    }
    for (const row of rows) {
      const s = toSummary(row);
      if (!s) continue;
      if (!s.nameWithOwner.toLowerCase().includes(term)) continue;
      if (s.isArchived && !opts.includeArchived) continue;
      if (seen.has(s.nameWithOwner)) continue;
      seen.add(s.nameWithOwner);
      out.push(s);
    }
  }

  /* Most recently pushed first: the repository somebody is looking for is
     almost always one that is being worked on. */
  out.sort((a, b) => (b.pushedAt ?? '').localeCompare(a.pushedAt ?? ''));
  const top = out.slice(0, limit);

  /*
    Counts only for what is shown. Each row costs two API calls, so counting
    every match of a broad search would spend a hundred calls to fill a list
    somebody is about to narrow.
  */
  const counted = await Promise.all(top.map(withCounts));

  if (counted.length === 0 && firstError) return { repos: [], error: firstError };
  return { repos: counted };
}

/** The counts for a known list — the recents, which already have their names. */
export async function summarise(names: string[]): Promise<RepoSummary[]> {
  return Promise.all(names.map(async name => {
    const [openIssues, templates] = await Promise.all([openIssueCount(name), templateCount(name)]);
    return {
      nameWithOwner: name,
      isPrivate: false,
      isArchived: false,
      isFork: false,
      openIssues,
      templates,
    };
  }));
}
