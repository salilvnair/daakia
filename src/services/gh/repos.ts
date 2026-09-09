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
  /**
   * Whether the repository has an issue tracker at all.
   *
   * A fork has one turned off by default, which is the whole of screen 03C: a
   * board with nothing on it and nothing wrong with it is the most confusing
   * possible first run.
   */
  hasIssues?: boolean;
  /**
   * When these counts were taken, for a row served from the last read.
   *
   * A picker that fires four API calls to render a list is a picker that is
   * slow every time, so the recents show what was true and say how long ago.
   */
  countedAt?: number;
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
  'parent', 'pushedAt', 'hasIssuesEnabled',
].join(',');

/**
 * The same list, minus the ones `gh search repos` does not return.
 *
 * Asking search for a field it has never had is not a degraded answer, it is
 * an error and an empty result — so the two commands get the fields each can
 * actually produce rather than one list that works for only one of them.
 */
const SEARCH_FIELDS = [
  'fullName', 'description', 'isPrivate', 'isArchived', 'isFork', 'pushedAt',
].join(',');

interface RawRepo {
  nameWithOwner?: string;
  description?: string;
  isPrivate?: boolean;
  isArchived?: boolean;
  isFork?: boolean;
  parent?: { nameWithOwner?: string } | null;
  pushedAt?: string;
  hasIssuesEnabled?: boolean;
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
    /* Undefined rather than true when the field was not asked for — `gh search
       repos` does not return it, and defaulting to "has issues" would put a
       fork's disabled tracker on screen as a live option. */
    hasIssues: r.hasIssuesEnabled,
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
): Promise<{ repos: RepoSummary[]; error?: string; commands: string[]; matched: number }> {
  const q = query.trim();
  if (!q) return { repos: [], commands: [], matched: 0 };
  const limit = opts.limit ?? 20;

  const args: string[][] = [];
  const slash = q.indexOf('/');
  if (slash > 0) {
    /* `acme/ord` — list the owner and filter by the rest, which is the only way
       to see that owner's private repositories. */
    args.push(['repo', 'list', q.slice(0, slash), '--limit', '100', '--json', REPO_FIELDS]);
  } else {
    args.push(['repo', 'list', '--limit', '100', '--json', REPO_FIELDS]);
    args.push(['search', 'repos', q, '--limit', String(limit), '--json', SEARCH_FIELDS]);
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

  /* What actually ran, for the line under the results. A search that shows its
     own command is a search somebody can repeat in a terminal when the answer
     surprises them. */
  const commands = args.map(a => `gh ${a.join(' ')}`);

  if (counted.length === 0 && firstError) {
    return { repos: [], error: firstError, commands, matched: 0 };
  }
  return { repos: counted, commands, matched: out.length };
}

/**
 * A fork, and where its issues really live — screen 03C.
 *
 * Read from `parent` rather than guessed from the name. Fork names usually
 * match their upstream, so a string comparison would be right often enough to
 * be trusted and wrong often enough to matter.
 *
 * Both sides come back with their counts and their tracker state, because the
 * choice is between two repositories and offering one of them without the
 * numbers is offering a name.
 */
export interface ForkChoice {
  fork: RepoSummary;
  upstream?: RepoSummary;
  /** Why upstream is not offered, when it could not be read. */
  upstreamError?: string;
}

export async function inspectFork(repo: RepoSummary): Promise<ForkChoice | undefined> {
  if (!repo.isFork || !repo.parent) return undefined;

  const r = await run(['repo', 'view', repo.parent, '--json', REPO_FIELDS], { timeoutMs: 20_000 });
  if (!r.ok) {
    /* A private upstream you cannot see is a real case — somebody forked out of
       an org they have since left. Named, so the fork is not silently the only
       option on a screen that exists to offer two. */
    return { fork: repo, upstreamError: (r.stderr || r.failure || '').trim() };
  }

  let raw: RawRepo;
  try {
    raw = JSON.parse(r.stdout) as RawRepo;
  } catch {
    return { fork: repo, upstreamError: 'gh returned something that is not JSON.' };
  }

  const parent = toSummary(raw);
  if (!parent) return { fork: repo, upstreamError: 'The upstream could not be read.' };
  return { fork: repo, upstream: await withCounts(parent) };
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

/**
 * Why can this account not see a repository?
 *
 * Screen 03B. gh reports "could not resolve to a Repository" for a repository
 * that does not exist AND for one you simply cannot see, which are completely
 * different problems: one is a typo, the other is an SSO authorisation you can
 * fix in thirty seconds. Telling them apart is worth one extra call.
 */
export interface RepoAccess {
  repo: string;
  /** `visible` means it resolved. The rest are the ways it did not. */
  verdict: 'visible' | 'sso' | 'not-found' | 'no-scope' | 'unknown';
  /** gh's own words, kept because they usually name the org. */
  said: string;
  /** The organisation to authorise, when the failure names one. */
  org?: string;
}

export async function inspectRepo(repo: string): Promise<RepoAccess> {
  const r = await run(['repo', 'view', repo, '--json', 'nameWithOwner'], { timeoutMs: 20_000 });
  if (r.ok) return { repo, verdict: 'visible', said: '' };

  const said = (r.stderr || r.failure || '').trim();
  const org = repo.split('/')[0];

  /*
    SSO first, because it is the recoverable one and its message is distinctive.
    GitHub says so explicitly when a token has not been authorised for an org
    that enforces SAML.
  */
  if (/SAML|single sign-on|SSO|must be authorized|authorize.*organization/i.test(said)) {
    return { repo, verdict: 'sso', said, org };
  }
  if (/insufficient|scope|OAuth/i.test(said)) return { repo, verdict: 'no-scope', said, org };
  if (/could not resolve|not found|404|NOT_FOUND/i.test(said)) {
    return { repo, verdict: 'not-found', said, org };
  }
  return { repo, verdict: 'unknown', said, org };
}
