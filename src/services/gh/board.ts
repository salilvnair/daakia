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
): Promise<BoardData | { error: string }> {
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
    return { error: (r.stderr || r.failure || `gh exited with ${r.code}`).trim() };
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

  return {
    repo,
    issues,
    dimensions: templates.dimensions,
    formErrors: templates.errors,
    noTemplates: templates.noTemplates,
    fetchedAt: now,
  };
}
