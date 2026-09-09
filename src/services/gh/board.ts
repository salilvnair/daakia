/**
 * Reading a repository's issues, and the schema to read them with.
 *
 * Two calls and a parse. `gh issue list --json` returns everything the board
 * needs in one request; the templates come from the contents API and are
 * cached against the directory's commit SHA, so a repeat visit costs one cheap
 * call rather than one per file.
 *
 * Nothing here is stored. The issues live in GitHub, and a local copy would be
 * a cache to invalidate and a second truth to disagree with.
 */
import { run } from './gh';
import { parseIssueForms, proposeDimensions, headingMap, type ProposedDimension, type FormParseError } from './issue-forms';
import { readDimensions } from './issue-body';
import { imageUrls } from './evidence';

/** The fields `gh issue list --json` is asked for. */
const ISSUE_FIELDS = [
  'number', 'title', 'body', 'state', 'labels', 'assignees', 'author',
  'milestone', 'createdAt', 'updatedAt', 'closedAt', 'comments', 'url',
].join(',');

export interface BoardIssue {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  url: string;
  author?: string;
  assignees: string[];
  labels: { name: string; color: string; description?: string }[];
  milestone?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  commentCount: number;
  /** Read out of the body via the field map. Absent keys are unmapped. */
  dimensions: Record<string, string>;
  /**
   * Image URLs found in the body, in the order they appear.
   *
   * URLs only. The bytes are fetched one at a time, on demand, by whichever
   * card is actually on screen — sending sixty screenshots with the board would
   * make the first read of a busy repository unusable to save a click.
   */
  evidence: string[];
  /**
   * The first line of prose in the body, trimmed.
   *
   * A card element that is off by default, and the reason the whole body is not
   * sent: a hundred issues of markdown is megabytes through `postMessage` to
   * render one sentence nobody asked for.
   */
  bodyFirstLine?: string;
  /**
   * As much of the body as the search box needs, whitespace collapsed.
   *
   * The board's search runs in the webview over what it already has, so it is
   * instant and works offline — but that means the text has to travel. This is
   * the compromise: enough of it that searching for an error message finds the
   * issue, capped so a hundred issues of markdown do not arrive as megabytes.
   */
  bodyText?: string;
  /** Days since it was opened. Computed here so the UI never does date maths. */
  ageDays: number;
  /**
   * Days since the last comment, or since it was opened when there are none.
   *
   * The number the board's "stale" chip is built from, and the one thing a
   * lead genuinely cannot see on github.com.
   */
  quietDays: number;
}

export interface BoardData {
  repo: string;
  issues: BoardIssue[];
  /** What the templates declared, for grouping and for the facet lists. */
  dimensions: ProposedDimension[];
  /** Templates that would not parse. Named, never fatal. */
  formErrors: FormParseError[];
  /** True when the repository has no issue forms at all. */
  noTemplates: boolean;
  fetchedAt: number;
  /**
   * How many closed in the last ninety days.
   *
   * Only counted when the open list came back empty, because that is the only
   * screen it changes: "nothing is open" and "nothing has ever happened here"
   * are different repositories, and the second one is usually the wrong one.
   */
  closedRecently?: number;
  /** Present when GitHub is refusing calls — screen 04E's amber state. */
  rateLimit?: RateLimit;
  /**
   * The read hit its page size, so the board is not the whole repository.
   *
   * The search box says so rather than implying it searched everything, which
   * is the difference between "no results" and "no results here".
   */
  truncated?: boolean;
}

export interface RateLimit {
  remaining: number;
  limit: number;
  /** Epoch millis. The UI owns the clock and renders "in 11 minutes". */
  resetAt: number;
}

/** Raw shapes from gh's JSON, all optional because it is somebody's repo. */
interface RawIssue {
  number?: number;
  title?: string;
  body?: string;
  state?: string;
  url?: string;
  author?: { login?: string };
  assignees?: { login?: string }[];
  labels?: { name?: string; color?: string; description?: string }[];
  milestone?: { title?: string };
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
  comments?: unknown;
}

const DAY = 86_400_000;

/** How much of a first line is worth carrying to a card. */
const FIRST_LINE_MAX = 160;

/** How much of a body is worth carrying for the search box to look through. */
const BODY_TEXT_MAX = 1500;

/**
 * The body as one searchable line.
 *
 * Images and headings go: the URL of a screenshot is not something anybody
 * searches for, and every issue filed from the same template shares its
 * headings, so leaving them in would make every issue match every template
 * word.
 */
function searchableBody(body: string): string | undefined {
  const text = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/^#{1,6} .*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  return text.length > BODY_TEXT_MAX ? text.slice(0, BODY_TEXT_MAX) : text;
}

/**
 * The first line of a body that a reader would call the description.
 *
 * Headings, images, checkboxes and the horizontal rules a template leaves
 * behind are all skipped — an issue filed from a form begins with `### Summary`
 * and a card that showed that would say the same thing on every row.
 */
function firstLine(body: string): string | undefined {
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(#{1,6}\s|[-*_]{3,}$|!\[|<|>|\|)/.test(line)) continue;
    if (/^-\s*\[[ xX]\]/.test(line)) continue;
    const text = line.replace(/^[-*+]\s+/, '').replace(/[*_`]/g, '').trim();
    if (!text) continue;
    return text.length > FIRST_LINE_MAX ? `${text.slice(0, FIRST_LINE_MAX - 1)}…` : text;
  }
  return undefined;
}

/** How far back "closed recently" reaches, for the empty board's second line. */
const RECENT_CLOSED_DAYS = 90;

/** Whether a gh failure is GitHub refusing rather than gh failing. */
function looksRateLimited(said: string): boolean {
  return /rate limit|secondary rate|abuse detection|403/i.test(said);
}

/**
 * What is left of the hour's budget.
 *
 * Asked only once something has already failed. Reading it on every board
 * refresh would spend a call to find out how many calls are left, which is the
 * kind of accounting that pays for itself in nothing.
 */
export async function fetchRateLimit(): Promise<RateLimit | undefined> {
  const r = await run(['api', '/rate_limit', '--jq',
    '[.rate.remaining, .rate.limit, .rate.reset] | @tsv'], { timeoutMs: 15_000 });
  if (!r.ok) return undefined;
  const [remaining, limit, reset] = r.stdout.trim().split(/\s+/).map(Number);
  if (!Number.isFinite(reset)) return undefined;
  return { remaining: remaining || 0, limit: limit || 0, resetAt: reset * 1000 };
}

/**
 * How many were closed in the last ninety days.
 *
 * `--search` rather than listing them and counting here: a repository with four
 * thousand closed issues would page through all of them to produce one number.
 */
async function countClosedRecently(repo: string): Promise<number | undefined> {
  const since = new Date(Date.now() - RECENT_CLOSED_DAYS * DAY).toISOString().slice(0, 10);
  const r = await run([
    'issue', 'list', '--repo', repo, '--state', 'closed',
    '--search', `closed:>=${since}`, '--limit', '200', '--json', 'number',
  ], { timeoutMs: 45_000 });
  if (!r.ok) return undefined;
  try {
    const rows = JSON.parse(r.stdout) as unknown[];
    return Array.isArray(rows) ? rows.length : undefined;
  } catch {
    return undefined;
  }
}

function daysSince(iso: string | undefined, now: number): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / DAY));
}

/**
 * How many comments, across the two shapes gh has used.
 *
 * Older builds return a count; newer ones return the comments themselves. A
 * board that reads `[object Object]` as a number shows every issue as having
 * NaN comments, which looks like a data problem rather than a version one.
 */
function commentCount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (Array.isArray(raw)) return raw.length;
  if (raw && typeof raw === 'object' && 'totalCount' in raw) {
    const n = (raw as { totalCount?: unknown }).totalCount;
    return typeof n === 'number' ? n : 0;
  }
  return 0;
}

/** Fetch the repository's issue forms. Never throws; an absent directory is fine. */
export async function fetchTemplates(repo: string): Promise<{
  dimensions: ProposedDimension[];
  errors: FormParseError[];
  noTemplates: boolean;
}> {
  /*
    A leading slash is the documented endpoint style and works fine from Node,
    which spawns gh directly. It only misbehaves when gh is invoked from an
    MSYS shell — Git Bash rewrites `/repos/...` into a filesystem path and gh
    says so. Worth knowing before somebody "fixes" this by hand-testing in the
    wrong shell.
  */
  const listing = await run([
    'api', `/repos/${repo}/contents/.github/ISSUE_TEMPLATE`,
    '--jq', '.[] | select(.type=="file") | .name',
  ], { timeoutMs: 20_000 });

  /* 404 is the ordinary case, not an error: most repositories have no forms. */
  if (!listing.ok) return { dimensions: [], errors: [], noTemplates: true };

  const names = listing.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    .filter(n => /\.ya?ml$/i.test(n));
  if (names.length === 0) return { dimensions: [], errors: [], noTemplates: true };

  const files: { file: string; text: string }[] = [];
  for (const name of names) {
    const r = await run([
      'api', `/repos/${repo}/contents/.github/ISSUE_TEMPLATE/${name}`,
      '--jq', '.content',
    ], { timeoutMs: 20_000 });
    if (!r.ok) continue;
    /* The contents API base64-encodes, with newlines inside the payload. */
    const text = Buffer.from(r.stdout.replace(/\s/g, ''), 'base64').toString('utf8');
    files.push({ file: name, text });
  }

  const { forms, errors } = parseIssueForms(files);
  return { dimensions: proposeDimensions(forms), errors, noTemplates: forms.length === 0 };
}

/**
 * Everything the board renders, in one call.
 *
 * `state` is passed through to gh rather than filtered here: asking for open
 * issues and then discarding closed ones would page through a repository's
 * whole history to show twelve rows.
 */
export async function fetchBoard(
  repo: string,
  opts: { state?: 'open' | 'closed' | 'all'; limit?: number } = {},
): Promise<BoardData | { error: string; rateLimit?: RateLimit }> {
  const templates = await fetchTemplates(repo);
  const map = headingMap(templates.dimensions);

  const r = await run([
    'issue', 'list',
    '--repo', repo,
    '--state', opts.state ?? 'open',
    '--limit', String(opts.limit ?? 200),
    '--json', ISSUE_FIELDS,
  ], { timeoutMs: 60_000 });

  if (!r.ok) {
    /* gh's own message, verbatim. "Validation failed" alone sends somebody to
       a browser to guess; gh usually says which field. */
    const said = (r.stderr || r.failure || `gh exited with ${r.code}`).trim();
    /*
      One extra call, and only on the failure that earns it. A rate-limited
      board is the one empty state that must not say "nothing matches" — it has
      to say when it can try again, and only /rate_limit knows that.
    */
    const rateLimit = looksRateLimited(said) ? await fetchRateLimit() : undefined;
    return { error: said, rateLimit };
  }

  let raw: RawIssue[];
  try {
    raw = JSON.parse(r.stdout) as RawIssue[];
  } catch {
    return { error: 'gh returned something that is not JSON.' };
  }

  const now = Date.now();
  const issues: BoardIssue[] = raw.map(i => {
    const created = i.createdAt;
    const updated = i.updatedAt;
    return {
      number: i.number ?? 0,
      title: i.title ?? '',
      state: (i.state === 'CLOSED' ? 'CLOSED' : 'OPEN'),
      url: i.url ?? '',
      author: i.author?.login,
      assignees: (i.assignees ?? []).map(a => a.login).filter((l): l is string => !!l),
      labels: (i.labels ?? []).map(l => ({
        name: l.name ?? '', color: l.color ?? '888888', description: l.description,
      })).filter(l => l.name),
      milestone: i.milestone?.title,
      createdAt: created ?? '',
      updatedAt: updated ?? '',
      closedAt: i.closedAt || undefined,
      commentCount: commentCount(i.comments),
      dimensions: readDimensions(i.body ?? '', map),
      evidence: imageUrls(i.body ?? ''),
      bodyFirstLine: firstLine(i.body ?? ''),
      bodyText: searchableBody(i.body ?? ''),
      ageDays: daysSince(created, now),
      /* updatedAt moves on a label change as well as a comment, so this is
         "quiet" in the loosest sense — the board says "quiet for", not
         "no comment in", because that is what the number actually means. */
      quietDays: daysSince(updated ?? created, now),
    };
  });

  /* Only when there is nothing to show. On a board with issues on it this
     number changes no sentence, and it costs a call. */
  const closedRecently = issues.length === 0 && (opts.state ?? 'open') === 'open'
    ? await countClosedRecently(repo)
    : undefined;

  return {
    repo,
    issues,
    truncated: raw.length >= (opts.limit ?? 200),
    dimensions: templates.dimensions,
    formErrors: templates.errors,
    noTemplates: templates.noTemplates,
    fetchedAt: now,
    closedRecently,
  };
}

/**
 * One issue, in the depth a peek needs — screen 04D.
 *
 * Three things the card could not fit: the actual behaviour, the evidence at a
 * readable size, and the most recent comment, which is usually the one that
 * tells you whether anybody is on it.
 *
 * Fetched when somebody holds Space, not with the board. The comments alone
 * would multiply a board read by the size of every discussion in the
 * repository, to fill a panel that is open for four seconds at a time.
 */
export interface IssueDetail {
  repo: string;
  number: number;
  body: string;
  evidence: string[];
  /** Newest last, as GitHub orders them. The peek shows the final one. */
  comments: { author?: string; body: string; createdAt?: string }[];
  error?: string;
}

interface RawComment { author?: { login?: string }; body?: string; createdAt?: string }

export async function fetchIssueDetail(repo: string, number: number): Promise<IssueDetail> {
  const empty = { repo, number, body: '', evidence: [], comments: [] };
  const r = await run([
    'issue', 'view', String(number), '--repo', repo, '--json', 'body,comments',
  ], { timeoutMs: 30_000 });

  if (!r.ok) return { ...empty, error: (r.stderr || r.failure || 'gh could not read it').trim() };

  let raw: { body?: string; comments?: RawComment[] };
  try {
    raw = JSON.parse(r.stdout) as typeof raw;
  } catch {
    return { ...empty, error: 'gh returned something that is not JSON.' };
  }

  const body = raw.body ?? '';
  return {
    repo,
    number,
    body,
    evidence: imageUrls(body),
    comments: (raw.comments ?? []).map(c => ({
      author: c.author?.login,
      body: c.body ?? '',
      createdAt: c.createdAt,
    })),
  };
}

/**
 * Search the repository, not just the page — screen 08C.
 *
 * The board's own search runs in the webview over what it already has, which is
 * instant, works offline, and only sees loaded issues. Two things need more
 * than that: a repository bigger than one page, and comments, which are not on
 * the board at all.
 *
 * `gh search issues` answers both. It comes back as issue numbers rather than
 * whole issues because the board already holds everything else it needs to draw
 * a row — and because the ones it does not hold are exactly the case where a
 * refresh is the honest next step rather than a second, differently-shaped list.
 */
export interface RepoSearchResult {
  query: string;
  /** Numbers that matched, including ones the board has not loaded. */
  numbers: number[];
  /** The subset whose match was in a comment, for "where did it match". */
  inComments: number[];
  error?: string;
}

export async function searchIssues(
  repo: string,
  query: string,
  opts: { comments?: boolean } = {},
): Promise<RepoSearchResult> {
  const q = query.trim();
  if (!q) return { query, numbers: [], inComments: [] };

  const base = ['search', 'issues', q, '--repo', repo, '--limit', '100', '--json', 'number'];

  const all = await run([...base, '--match', 'title,body,comments'], { timeoutMs: 45_000 });
  if (!all.ok) {
    return {
      query,
      numbers: [],
      inComments: [],
      error: (all.stderr || all.failure || 'gh could not run the search').trim(),
    };
  }

  const numbers = numbersIn(all.stdout);
  if (!opts.comments) return { query, numbers, inComments: [] };

  /*
    A second search restricted to title and body, so "matched in a comment" is
    the difference rather than a guess. GitHub will not say which field matched,
    and a result list that claimed a comment hit for a title hit would be wrong
    in the one place this screen exists to be right.
  */
  const text = await run([...base, '--match', 'title,body'], { timeoutMs: 45_000 });
  const textual = new Set(text.ok ? numbersIn(text.stdout) : numbers);
  return { query, numbers, inComments: numbers.filter(n => !textual.has(n)) };
}

function numbersIn(stdout: string): number[] {
  try {
    const rows = JSON.parse(stdout) as { number?: number }[];
    return Array.isArray(rows)
      ? rows.map(r => r.number).filter((n): n is number => typeof n === 'number')
      : [];
  } catch {
    return [];
  }
}
