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
    dimensions: templates.dimensions,
    formErrors: templates.errors,
    noTemplates: templates.noTemplates,
    fetchedAt: now,
    closedRecently,
  };
}
