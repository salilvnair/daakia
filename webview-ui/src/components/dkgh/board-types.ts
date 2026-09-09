/**
 * What the board is made of, and the two rules everything on it obeys.
 *
 * Mirrors `services/gh/board.ts` for the same reason the rest of dkgh's types
 * do: the webview and the extension are separate TypeScript projects and
 * neither can reach the other's source.
 *
 * **Nothing here is stored.** Age, quiet-for and every grouping are derived from
 * what the host computed or GitHub already had. A local copy would be a cache to
 * invalidate and a second truth to disagree with.
 *
 * **The unowned pile sorts first.** Alphabetical order buries "nobody" in the
 * middle and "no module" at the end, and three unassigned issues with an urgent
 * among them is the finding a lead can act on today — not a footnote after
 * everyone's name.
 */

export interface Label { name: string; color: string; description?: string }

export interface BoardIssue {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  url: string;
  author?: string;
  assignees: string[];
  labels: Label[];
  milestone?: string;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  /** Read out of the body via the repository's own field map. */
  dimensions: Record<string, string>;
  /** Image URLs in the body. The bytes come later, one at a time. */
  evidence: string[];
  bodyFirstLine?: string;
  /**
   * As much of the body as the search box needs, whitespace collapsed.
   *
   * Truncated by the host: a hundred issues of full markdown is megabytes
   * through `postMessage` to answer a word somebody typed. Long enough that a
   * search for an error message finds it, short enough that the board still
   * arrives in one go.
   */
  bodyText?: string;
  ageDays: number;
  quietDays: number;
}

export interface ProposedDimension {
  dimension: string;
  heading: string;
  /** In the order the form declared them — which is the order they sort in. */
  options: string[];
  files: string[];
}

export interface BoardData {
  repo: string;
  issues: BoardIssue[];
  dimensions: ProposedDimension[];
  formErrors: { file: string; message: string; line?: number }[];
  noTemplates: boolean;
  fetchedAt: number;
  /** Counted only when the open list came back empty. */
  closedRecently?: number;
  rateLimit?: { remaining: number; limit: number; resetAt: number };
  /** The read hit its page size, so the board is not the whole repository. */
  truncated?: boolean;
  error?: string;
}

/** Nothing is stale until a fortnight — the number the plan settled on. */
export const QUIET_DAYS = 14;

/** Grouping the board always has, whatever the templates declared. */
export const NATIVE_GROUPS = [
  { id: 'none', label: 'Nothing' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'milestone', label: 'Milestone' },
];

export interface Group {
  key: string;
  label: string;
  issues: BoardIssue[];
  /** The pile nobody owns — tinted, and first. */
  unowned?: boolean;
}

/** The value an issue has along one dimension, whatever kind of dimension it is. */
export function valueOf(issue: BoardIssue, by: string): string {
  if (by === 'assignee') return issue.assignees[0] ?? '';
  if (by === 'milestone') return issue.milestone ?? '';
  return issue.dimensions[by] ?? '';
}

export function groupIssues(issues: BoardIssue[], by: string): Group[] {
  if (by === 'none') return [{ key: 'all', label: '', issues }];

  const buckets = new Map<string, BoardIssue[]>();
  for (const i of issues) {
    const key = valueOf(i, by) || '__none__';
    const list = buckets.get(key) ?? [];
    list.push(i);
    buckets.set(key, list);
  }

  const named = [...buckets.entries()]
    .filter(([k]) => k !== '__none__')
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ key: k, label: k, issues: v }));

  const none = buckets.get('__none__');
  if (!none) return named;
  const label = by === 'assignee' ? 'Nobody' : by === 'milestone' ? 'No milestone' : `No ${by}`;
  return [{ key: '__none__', label, issues: none, unowned: true }, ...named];
}

/**
 * Where a value sits in its own field's declared order.
 *
 * **Priority sorts by rank, not alphabetically.** Urgent, High, Medium, Low is
 * the order the form declares, and sorting it as text would put High above Low
 * above Medium above Urgent — wrong in a way that looks plausible enough to go
 * unnoticed. Any single-select sorts by its declared order; anything the field
 * did not declare goes last, because a value that is not in the list is either
 * a typo or something newer than the template.
 */
export function rankOf(value: string, options: string[] | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  if (!options || options.length === 0) return Number.MAX_SAFE_INTEGER - 1;
  const at = options.findIndex(o => o.toLowerCase() === value.toLowerCase());
  return at < 0 ? Number.MAX_SAFE_INTEGER - 1 : at;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
