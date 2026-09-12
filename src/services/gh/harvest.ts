/**
 * The whole repository, a page at a time — screen 15D.
 *
 * Exporting the current view is one call against issues that are already in
 * memory. Exporting a repository's whole history is dozens, and it is the
 * export somebody runs once a quarter and really needs to complete.
 *
 * **REST, because it is the only endpoint that pages.** `gh issue list` takes a
 * `--limit` and gives you the first N; there is no second page. So this walks
 * `/repos/{o}/{r}/issues?page=N`, which does page, and normalises each row into
 * the shape `board.ts` already maps — one mapping, two sources, so the export
 * and the board can never disagree about what an issue's Module is.
 *
 * **Pull requests are issues on that endpoint.** GitHub returns both and marks
 * a PR with a `pull_request` key. Dropping them is not a filter anybody chose;
 * it is what "export the issues" means.
 *
 * **It pauses rather than exhausting somebody's budget.** An export that spends
 * the last of an hourly rate limit breaks every other tool that account uses
 * for the next fifty minutes — `gh`, CI, the browser. When the remaining budget
 * drops under a tenth, this waits for the reset rather than pressing on.
 *
 * **Nothing is held in memory that does not have to be.** Progress is reported
 * page by page as it goes, so the dialog can say "page 14 of 22" while it is
 * happening rather than showing a spinner for two minutes and then a file.
 */
import { run } from './gh';
import { fetchRateLimit, fetchTemplates, toBoardIssue } from './board';
import { headingMap } from './issue-forms';
import type { BoardIssue, RateLimit, RawIssue } from './board';

/** How much of the hourly budget has to be left before another page is asked for. */
export const RESERVE = 0.1;

/** The page size. GitHub's maximum, and the fewest round trips. */
export const PER_PAGE = 100;

export interface HarvestProgress {
  /** Issues read so far. */
  done: number;
  /** How many there are, from one count call before the walk starts. */
  total: number;
  page: number;
  pages: number;
  /** Bodies that had the repository's headings in them. */
  parsed: number;
  /**
   * Bodies that did not — 15D's amber line.
   *
   * These predate the templates, and their Module and Environment columns come
   * out empty. Said during the export rather than discovered later as a gap in
   * a spreadsheet somebody has already circulated.
   */
  unparsed: number;
  rate?: RateLimit;
  /** Seconds, from the pages done so far. Absent until there is a rate to go on. */
  etaSeconds?: number;
  /** Set while waiting out a rate limit, with the epoch millis it resumes at. */
  pausedUntil?: number;
}

export interface HarvestResult {
  repo: string;
  issues: BoardIssue[];
  progress: HarvestProgress;
  /** Set when the walk stopped early. The issues read so far are still returned. */
  error?: string;
  cancelled?: boolean;
}

/** A REST issue row. Only the fields the board's shape needs. */
interface RestIssue {
  number?: number;
  title?: string;
  body?: string;
  state?: string;
  html_url?: string;
  user?: { login?: string };
  assignees?: { login?: string }[];
  labels?: { name?: string; color?: string; description?: string }[];
  milestone?: { title?: string } | null;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  comments?: number;
  /** Present, and only present, when the row is a pull request. */
  pull_request?: unknown;
}

/** REST's spelling of an issue, in the shape `toBoardIssue` reads. */
export function fromRest(i: RestIssue): RawIssue {
  return {
    number: i.number,
    title: i.title,
    body: i.body ?? '',
    /* REST says "open"/"closed" in lower case; the board's mapping wants
       GitHub's GraphQL spelling, which is what `gh issue list --json` gives. */
    state: i.state === 'closed' ? 'CLOSED' : 'OPEN',
    url: i.html_url,
    author: i.user,
    assignees: i.assignees,
    labels: i.labels,
    milestone: i.milestone ?? undefined,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    closedAt: i.closed_at ?? undefined,
    comments: i.comments,
  };
}

/** True for a row that is a pull request wearing an issue's clothes. */
export function isPullRequest(i: RestIssue): boolean {
  return i.pull_request !== undefined && i.pull_request !== null;
}

/**
 * How many issues there are, before walking any of them.
 *
 * One GraphQL call, because REST has no count that excludes pull requests —
 * `open_issues_count` on the repository includes them, and an export that says
 * "1,320 of 2,140" while the denominator counts PRs is a progress bar that
 * never reaches the end.
 */
export async function countIssues(repo: string): Promise<number | undefined> {
  const [owner, name] = repo.split('/');
  if (!owner || !name) return undefined;
  const q = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){'
    + 'issues(states:[OPEN,CLOSED]){totalCount}}}';
  const r = await run(
    ['api', 'graphql', '-f', `query=${q}`, '-F', `owner=${owner}`, '-F', `name=${name}`],
    { timeoutMs: 30_000 },
  );
  if (!r.ok) return undefined;
  try {
    const raw = JSON.parse(r.stdout) as {
      data?: { repository?: { issues?: { totalCount?: number } } };
    };
    const n = raw.data?.repository?.issues?.totalCount;
    return typeof n === 'number' ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Seconds left, from how long the pages so far actually took. */
export function etaFrom(startedAt: number, done: number, total: number, now: number)
: number | undefined {
  if (done <= 0 || total <= done) return undefined;
  const elapsed = now - startedAt;
  if (elapsed <= 0) return undefined;
  return Math.round(((total - done) * (elapsed / done)) / 1000);
}

/** True when there is not enough budget left to spend another page on. */
export function tooLow(rate: RateLimit | undefined): boolean {
  if (!rate || !rate.limit) return false;
  return rate.remaining / rate.limit < RESERVE;
}

export interface HarvestOptions {
  /** Called after each page, so the dialog can move. */
  onProgress?: (p: HarvestProgress) => void;
  /** Returns true to stop. Checked between pages, never mid-page. */
  cancelled?: () => boolean;
  /** Waits, so a test does not. */
  wait?: (ms: number) => Promise<void>;
  /** A ceiling, so a runaway repository cannot page forever. */
  maxPages?: number;
  now?: () => number;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function harvest(
  repo: string,
  opts: HarvestOptions = {},
): Promise<HarvestResult> {
  const now = opts.now ?? (() => Date.now());
  const wait = opts.wait ?? sleep;
  const startedAt = now();

  const templates = await fetchTemplates(repo);
  const map = headingMap(templates.dimensions);

  const total = (await countIssues(repo)) ?? 0;
  const pages = total > 0 ? Math.ceil(total / PER_PAGE) : 0;
  const maxPages = opts.maxPages ?? 200;

  const issues: BoardIssue[] = [];
  let parsed = 0;
  let unparsed = 0;
  let rate = await fetchRateLimit();

  const progress = (page: number, extra: Partial<HarvestProgress> = {}): HarvestProgress => ({
    done: issues.length,
    total: Math.max(total, issues.length),
    page,
    pages: Math.max(pages, page),
    parsed,
    unparsed,
    rate,
    etaSeconds: etaFrom(startedAt, issues.length, Math.max(total, issues.length), now()),
    ...extra,
  });

  for (let page = 1; page <= maxPages; page++) {
    if (opts.cancelled?.()) {
      return { repo, issues, progress: progress(page), cancelled: true };
    }

    /*
      The pause, before the call rather than after it.

      Checking afterwards means the call that took the budget under the line
      has already been made, and on a repository whose export needs twenty-two
      pages that is twenty-two chances to be the one that broke somebody's
      afternoon.
    */
    if (tooLow(rate) && rate) {
      const until = rate.resetAt;
      opts.onProgress?.(progress(page, { pausedUntil: until }));
      const ms = until - now();
      if (ms > 0) await wait(ms);
      rate = await fetchRateLimit();
    }

    const r = await run(
      ['api', `/repos/${repo}/issues?state=all&per_page=${PER_PAGE}&page=${page}`],
      { timeoutMs: 60_000 },
    );
    if (!r.ok) {
      const said = (r.stderr || r.failure || `gh exited with ${r.code}`).trim();
      return { repo, issues, progress: progress(page), error: said };
    }

    let raw: RestIssue[];
    try {
      raw = JSON.parse(r.stdout) as RestIssue[];
    } catch {
      return {
        repo, issues, progress: progress(page),
        error: 'gh returned something that is not JSON.',
      };
    }
    if (!Array.isArray(raw) || raw.length === 0) break;

    for (const row of raw) {
      if (isPullRequest(row)) continue;
      const issue = toBoardIssue(fromRest(row), map, now());
      if (Object.keys(issue.dimensions).length > 0) parsed++;
      else unparsed++;
      issues.push(issue);
    }

    rate = await fetchRateLimit();
    opts.onProgress?.(progress(page));

    /* A short page is the last page. */
    if (raw.length < PER_PAGE) break;
  }

  return { repo, issues, progress: progress(Math.max(pages, 1)) };
}
