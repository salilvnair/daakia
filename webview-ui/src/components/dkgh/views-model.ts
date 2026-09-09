/**
 * Saved views — screens 09 and 09A to 09F.
 *
 * A filter you rebuild every Monday is a filter you stop using. A view is
 * named, counted, reorderable, and **remembers its layout, grouping and columns
 * as well as its filters** — which is the thing everybody gets wrong about
 * saved views, so 09A lists what it is about to capture with the current value
 * beside each and lets you drop any of it.
 *
 * Two decisions worth stating up front:
 *
 * - **Views are yours, and local.** Nothing is written to the repository. To
 *   give somebody a view you hand them its query string, which is why the
 *   string had to round-trip exactly in the first place.
 * - **Nothing is saved until you say so.** Opening a view and tweaking a filter
 *   to check something must not silently rewrite it, and must not nag. The diff
 *   is stated in words and the three ways out are ordered by commitment.
 *
 * The hardest thing here is `toGithubQuery`. A github.com link is the most
 * useful thing to send, because it needs nothing installed — and it is also the
 * one that silently widens your filter, because Module and Environment are
 * template headings GitHub cannot search on. Saying "this link shows 4, you
 * were looking at 2" is the whole value of that screen; a link that quietly
 * means something else is worse than no link.
 */
import {
  describeTerm, formatQuery, matchesAll, parseQuery, resolveRange,
  type FilterState, type MatchContext, type Term,
} from './filter-model';
import type { BoardIssue } from './board-types';
import type { BoardView, Density, SortLevel } from './board-prefs';

/** What a view can freeze. Each piece is droppable in the save dialog. */
export interface ViewCapture {
  filters?: FilterState;
  layout?: { view: BoardView; density: Density };
  grouping?: string;
  sort?: SortLevel[];
  columns?: string[];
  /** Kept separately from the filters, because it is the piece people least
      expect to come back with a view. */
  searchText?: string;
}

export interface SavedView {
  id: string;
  name: string;
  /** One emoji, or nothing. A view bar of identical tabs is a list. */
  icon?: string;
  capture: ViewCapture;
  /** A preset can be hidden but never deleted. */
  preset?: boolean;
  hidden?: boolean;
}

/** What the save dialog offers to freeze, in the order it lists them. */
export const CAPTURE_PARTS = [
  { key: 'filters', label: 'Filters' },
  { key: 'layout', label: 'Layout' },
  { key: 'grouping', label: 'Grouping' },
  { key: 'sort', label: 'Sort' },
  { key: 'columns', label: 'Columns' },
  { key: 'searchText', label: 'Search text' },
] as const;

export type CapturePart = (typeof CAPTURE_PARTS)[number]['key'];

// ── The presets ─────────────────────────────────────────────────────────────

/**
 * The five shipped views.
 *
 * Each is a query rather than a hand-built object, because a preset that
 * cannot be expressed as a query string is a preset nobody can share — and
 * because writing them this way proves the parser handles what the product
 * itself relies on.
 */
export const PRESETS: { id: string; name: string; icon: string; query: string }[] = [
  { id: 'all-open', name: 'All open', icon: '📋', query: 'state:open' },
  {
    id: 'stale-unowned',
    name: 'Stale & unowned',
    icon: '🕸️',
    query: 'state:open assignee:none quiet:14d',
  },
  { id: 'my-plate', name: 'My plate', icon: '🙋', query: 'state:open assignee:@me' },
  { id: 'this-sprint', name: 'This sprint', icon: '🏃', query: 'state:open created:sprint' },
  { id: 'closed-week', name: 'Closed this week', icon: '✅', query: 'state:closed updated:week' },
];

export function presetViews(): SavedView[] {
  return PRESETS.map(p => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    preset: true,
    capture: { filters: parseQuery(p.query) },
  }));
}

// ── Capturing, and putting one back ─────────────────────────────────────────

export interface BoardSnapshot {
  filters: FilterState;
  layout: { view: BoardView; density: Density };
  grouping: string;
  sort: SortLevel[];
  columns: string[];
}

/** Freeze the parts that were ticked, and only those. */
export function capture(now: BoardSnapshot, parts: Set<CapturePart>): ViewCapture {
  const out: ViewCapture = {};
  if (parts.has('filters')) {
    /* The search text is its own tickbox, so the filters half is stored
       without it — otherwise dropping "Search text" would do nothing. */
    out.filters = { ...now.filters, search: { ...now.filters.search, text: '' } };
  }
  if (parts.has('layout')) out.layout = { ...now.layout };
  if (parts.has('grouping')) out.grouping = now.grouping;
  if (parts.has('sort')) out.sort = [...now.sort];
  if (parts.has('columns')) out.columns = [...now.columns];
  if (parts.has('searchText')) out.searchText = now.filters.search.text;
  return out;
}

/** What each captured part currently says, for the dialog's second column. */
export function describeCapture(now: BoardSnapshot, part: CapturePart): string {
  switch (part) {
    case 'filters': {
      const n = now.filters.terms.length;
      return n === 0 ? 'none set'
        : now.filters.terms.map(t => t.field).join(', ');
    }
    case 'layout':
      return `${now.layout.view === 'table' ? 'Table' : 'Cards'}, ${now.layout.density}`;
    case 'grouping': return now.grouping === 'none' ? 'nothing' : now.grouping;
    case 'sort':
      return now.sort.length === 0 ? 'default order'
        : now.sort.map(s => `${s.key} ${s.dir === 'asc' ? 'ascending' : 'descending'}`).join(', ');
    case 'columns':
      return now.layout.view === 'table'
        ? `${now.columns.length} columns, in this order`
        : 'table layout only';
    case 'searchText':
      return now.filters.search.text.trim() ? `“${now.filters.search.text.trim()}”` : 'empty';
  }
}

/** Which parts a view actually holds — the ticks when it is reopened. */
export function partsIn(capture: ViewCapture): Set<CapturePart> {
  const parts = new Set<CapturePart>();
  for (const { key } of CAPTURE_PARTS) {
    if (capture[key as keyof ViewCapture] !== undefined) parts.add(key);
  }
  return parts;
}

// ── 09B — has it been changed? ──────────────────────────────────────────────

export interface ViewDiff {
  /** Terms the view had and the board no longer does. */
  dropped: Term[];
  /** Terms the board has and the view did not. */
  added: Term[];
  /** Everything else that moved, said plainly. */
  changed: string[];
  dirty: boolean;
}

/**
 * What has changed since the view was opened, in words.
 *
 * The removed chip stays visible struck through and the added one is amber, so
 * the sentence and the chips agree and a single piece can be undone rather than
 * resetting everything. Which is why this returns the terms themselves and not
 * a boolean.
 */
export function diffView(view: SavedView, now: BoardSnapshot): ViewDiff {
  const was = view.capture.filters?.terms ?? [];
  const has = view.capture.filters ? now.filters.terms : [];

  const key = (t: Term) => `${t.negated ? '-' : ''}${t.field}:${[...t.values].sort().join(',')}`;
  const wasKeys = new Map(was.map(t => [key(t), t]));
  const hasKeys = new Map(has.map(t => [key(t), t]));

  const dropped = [...wasKeys].filter(([k]) => !hasKeys.has(k)).map(([, t]) => t);
  const added = [...hasKeys].filter(([k]) => !wasKeys.has(k)).map(([, t]) => t);

  const changed: string[] = [];
  if (view.capture.layout && (view.capture.layout.view !== now.layout.view
    || view.capture.layout.density !== now.layout.density)) {
    changed.push(`layout is now ${now.layout.view}, ${now.layout.density}`);
  }
  if (view.capture.grouping !== undefined && view.capture.grouping !== now.grouping) {
    changed.push(`grouped by ${now.grouping === 'none' ? 'nothing' : now.grouping}`);
  }
  if (view.capture.sort && formatSort(view.capture.sort) !== formatSort(now.sort)) {
    changed.push(`sorted by ${formatSort(now.sort) || 'nothing'}`);
  }
  if (view.capture.columns && view.capture.columns.join(',') !== now.columns.join(',')) {
    changed.push('the columns have moved');
  }
  if (view.capture.searchText !== undefined
    && view.capture.searchText !== now.filters.search.text) {
    changed.push(now.filters.search.text.trim()
      ? `searching for “${now.filters.search.text.trim()}”`
      : 'the search is cleared');
  }

  return {
    dropped,
    added,
    changed,
    dirty: dropped.length > 0 || added.length > 0 || changed.length > 0,
  };
}

function formatSort(sort: SortLevel[]): string {
  return sort.map(s => `${s.key} ${s.dir}`).join(', ');
}

/** The diff as one sentence, which is what the bar shows. */
export function describeDiff(diff: ViewDiff, labels?: Map<string, string>): string {
  const parts: string[] = [];
  if (diff.dropped.length) {
    parts.push(`Dropped ${diff.dropped.map(t => phrase(t, labels)).join(', ')}`);
  }
  if (diff.added.length) {
    parts.push(`added ${diff.added.map(t => phrase(t, labels)).join(', ')}`);
  }
  parts.push(...diff.changed);
  if (parts.length === 0) return '';
  return `${parts.join(', ')}.`;
}

function phrase(t: Term, labels?: Map<string, string>): string {
  const d = describeTerm(t, labels);
  return `${d.key} ${d.value}`.trim();
}

// ── 09E and 09F — getting one out ───────────────────────────────────────────

/** `daakia://dkgh/<owner>/<name>?q=…`, which opens dkgh on this view. */
export function daakiaLink(repo: string, state: FilterState): string {
  return `daakia://dkgh/${repo}?q=${encodeURIComponent(formatQuery(state))}`;
}

export interface GithubLink {
  url: string;
  /** GitHub's own search syntax, before it was encoded. */
  q: string;
  /**
   * Terms GitHub cannot express, named rather than dropped in silence.
   *
   * Module and Environment are headings in an issue template. GitHub has no
   * such fields and no way to search them, so a github.com link built from a
   * filter that uses them is a *wider* filter than the one on screen.
   */
  dropped: Term[];
  /** A term GitHub can express, but only by freezing a relative date. */
  frozen: Term[];
}

/**
 * Translate as much of a filter as GitHub's search syntax can carry.
 *
 * Everything native survives. Everything from the field map is dropped and
 * named. Relative dates survive as absolute ones and are named too, because a
 * link that says `updated:<2026-08-26` will still say that next month, which is
 * not what the person who sent it meant.
 */
export function toGithubQuery(
  repo: string,
  state: FilterState,
  /** The dimensions this repository's templates declared — none of them survive. */
  formFields: string[],
  now = Date.now(),
): GithubLink {
  const parts = ['is:issue'];
  const dropped: Term[] = [];
  const frozen: Term[] = [];
  const forms = new Set(formFields);

  for (const t of state.terms) {
    const minus = t.negated ? '-' : '';

    if (forms.has(t.field) || t.field === 'has' || t.field === 'eta') {
      dropped.push(t);
      continue;
    }

    switch (t.field) {
      case 'state':
        /* `is:open` rather than `state:open` — GitHub's own spelling, because
           this string is going into GitHub's box and not ours. */
        for (const v of t.values) parts.push(`${minus}is:${v}`);
        break;

      case 'assignee':
      case 'author':
        for (const v of t.values) {
          if (v === 'none' && t.field === 'assignee') parts.push(`${minus}no:assignee`);
          else parts.push(`${minus}${t.field}:${v === '@me' ? '@me' : v}`);
        }
        break;

      case 'label':
        /* Comma is OR in GitHub search; repeating the qualifier is AND. Getting
           this backwards would hand somebody a link that matches nothing. */
        parts.push(t.mode === 'all'
          ? t.values.map(v => `${minus}label:${quote(v)}`).join(' ')
          : `${minus}label:${t.values.map(quote).join(',')}`);
        break;

      case 'milestone':
        for (const v of t.values) {
          if (v === 'none') parts.push(`${minus}no:milestone`);
          else parts.push(`${minus}milestone:${quote(v)}`);
        }
        break;

      case 'quiet': {
        const days = parseInt(t.values[0], 10) || 0;
        parts.push(`updated:<${isoDay(now - days * 86_400_000)}`);
        frozen.push(t);
        break;
      }

      case 'created':
      case 'updated': {
        const range = resolveRange(t.values[0], now);
        if (!range) { dropped.push(t); break; }
        if (range.from !== undefined) parts.push(`${t.field}:>=${isoDay(range.from)}`);
        if (range.to !== undefined) parts.push(`${t.field}:<=${isoDay(range.to)}`);
        if (/^[<>]?\d+d$|^(today|week|sprint|month)$/.test(t.values[0])) frozen.push(t);
        break;
      }

      default:
        dropped.push(t);
    }
  }

  const text = state.search.text.trim();
  if (text) parts.push(/\s/.test(text) ? `"${text}"` : text);

  const q = parts.join(' ');
  return {
    q,
    url: `https://github.com/${repo}/issues?q=${encodeURIComponent(q)}`,
    dropped,
    frozen,
  };
}

function quote(v: string): string {
  return /\s/.test(v) ? `"${v}"` : v;
}

function isoDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * How many the github.com link would show, against how many are on screen.
 *
 * Counted locally over the board, by applying only the terms that survived —
 * which is exactly what the link will do on the other end. It is an estimate
 * only in that the board may not hold every issue; the arithmetic itself is the
 * same arithmetic.
 */
export function widening(
  issues: BoardIssue[],
  state: FilterState,
  link: GithubLink,
  ctx: MatchContext = {},
): { here: number; there: number } {
  const surviving = state.terms.filter(t => !link.dropped.includes(t));
  return {
    here: issues.filter(i => matchesAll(i, state.terms, ctx)).length,
    there: issues.filter(i => matchesAll(i, surviving, ctx)).length,
  };
}

// ── 09E — taking one in ─────────────────────────────────────────────────────

export interface ImportedQuery {
  state: FilterState;
  /** Terms this repository can evaluate. */
  understood: Term[];
  /**
   * Terms naming a field this repository does not have.
   *
   * Named and dropped, never guessed at. The failure everybody has had with a
   * shared search string is the one where an unknown term is quietly ignored
   * and you spend ten minutes reading the wrong list.
   */
  unknown: Term[];
  matches: number;
}

/** Fields that exist whatever the repository is. */
const NATIVE_FIELDS = new Set([
  'state', 'assignee', 'author', 'label', 'milestone',
  'quiet', 'age', 'created', 'updated', 'has',
]);

export function importQuery(
  input: string,
  issues: BoardIssue[],
  formFields: string[],
  ctx: MatchContext = {},
): ImportedQuery {
  const parsed = parseQuery(input);
  const known = new Set([...NATIVE_FIELDS, ...formFields]);

  const understood = parsed.terms.filter(t => known.has(t.field));
  const unknown = parsed.terms.filter(t => !known.has(t.field));
  const state: FilterState = { ...parsed, terms: understood };

  return {
    state,
    understood,
    unknown,
    matches: issues.filter(i => matchesAll(i, understood, ctx)).length,
  };
}

// ── Storage ─────────────────────────────────────────────────────────────────

const KEY = 'dkgh.views';

interface Stored {
  views: SavedView[];
  /** Which one opens by default, if any. */
  defaultId?: string;
  order?: string[];
}

/**
 * Views live in this browser, keyed by repository — never in the repository.
 *
 * A view is a preference about how somebody reads a backlog, not a fact about
 * the project. Writing one into the repository would put a personal filter into
 * everybody else's checkout, and giving somebody a view is what the query string
 * is for.
 */
export function loadViews(repo: string): Stored {
  const fallback: Stored = { views: presetViews() };
  try {
    const raw = window.localStorage.getItem(`${KEY}.${repo}`);
    if (!raw) return fallback;
    const stored = JSON.parse(raw) as Stored;
    /* A preset added since this was written appears; one the reader hid stays
       hidden. Merging rather than replacing is what makes that true. */
    const byId = new Map(stored.views.map(v => [v.id, v]));
    for (const p of presetViews()) if (!byId.has(p.id)) stored.views.push(p);
    return { ...fallback, ...stored };
  } catch {
    return fallback;
  }
}

export function saveViews(repo: string, stored: Stored): void {
  try {
    window.localStorage.setItem(`${KEY}.${repo}`, JSON.stringify(stored));
  } catch {
    /* Storage off. The views last as long as the tab, which is worth more than
       an error message about a preference. */
  }
}

export type { Stored as StoredViews };

/** In the order the reader put them, hidden ones left out. */
export function orderedViews(stored: Stored): SavedView[] {
  const order = stored.order ?? [];
  const rank = new Map(order.map((id, at) => [id, at]));
  return stored.views
    .filter(v => !v.hidden)
    .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
}

/** How many issues a view would show right now, for the count on its tab. */
export function countFor(view: SavedView, issues: BoardIssue[], ctx: MatchContext = {}): number {
  const terms = view.capture.filters?.terms ?? [];
  return issues.filter(i => matchesAll(i, terms, ctx)).length;
}
