/**
 * One filter, three renderings, and the simple one is the default.
 *
 * The facets are for discovering what can be filtered; the chips say in words
 * what you are looking at and let you take any of it back off; the query string
 * is what the clicking produced, for pasting into a chat. Each stays in step
 * with the other two because there is only one of them: this file. Facets tick,
 * chips render and the string round-trips off the same `FilterState`, so they
 * cannot disagree.
 *
 * **Words over operators wherever there is a choice.** `assignee:none`, not
 * `no:assignee`. `quiet:14d`, not `updated:<14d`. GitHub's search syntax is a
 * text field pretending to be a database query — you have to know the
 * vocabulary before you can use it, and a typo returns the wrong answer
 * silently instead of an error. Here the box searches, the chips filter, and the
 * string is an export.
 *
 * Two rules that everybody gets wrong once and then mistrusts the counts:
 *
 * - **Two values in one facet means either.** `type:ui,backend` is UI *or*
 *   Backend.
 * - **Two facets means both.** `type:ui env:prod` is UI *and* PROD.
 *
 * And the counts are **live and conditional** — each facet is counted with
 * every other facet applied but not its own, which is what makes "three
 * unassigned PROD issues" visible before you click anything. A value at zero
 * stays in the list, greyed: hiding it would leave you wondering where it went,
 * and showing its unfiltered count would be a lie you could act on.
 */
import type { BoardIssue, ProposedDimension } from './board-types';

/** One clause. Values inside it are OR; separate terms are AND. */
export interface Term {
  field: string;
  /** Lowercased. `none` is the absence of a value, and is a real choice. */
  values: string[];
  /** `-field:value` — everything except. Half of real filtering is subtractive. */
  negated?: boolean;
  /**
   * `all` requires every value rather than any.
   *
   * Only meaningful on a field an issue can hold more than one of — labels.
   * On a single-valued field it matches nothing, and the panel says so rather
   * than quietly returning an empty board.
   */
  mode?: 'any' | 'all';
}

export type SearchScope = 'title' | 'body' | 'comments';

export interface SearchState {
  text: string;
  /** What the box is actually searching. Said out loud, because a search that
      quietly covers only titles finds nothing for an error message. */
  scope: SearchScope;
  matchCase?: boolean;
  wholeWord?: boolean;
}

export interface FilterState {
  terms: Term[];
  search: SearchState;
}

export const EMPTY: FilterState = { terms: [], search: { text: '', scope: 'body' } };

/** Fields whose values are a list rather than a range or a phrase. */
const MULTI_VALUED = new Set(['label']);

// ── Reading a value off an issue ────────────────────────────────────────────

/**
 * What an issue's value is along a field, lowercased.
 *
 * An empty list is not "no answer" — it is the answer `none`, which is what
 * makes `assignee:none` a filter rather than a special case.
 */
export function valuesOf(issue: BoardIssue, field: string): string[] {
  switch (field) {
    case 'state': return [issue.state.toLowerCase()];
    case 'assignee': return issue.assignees.length ? issue.assignees.map(low) : ['none'];
    case 'author': return issue.author ? [low(issue.author)] : ['none'];
    case 'label': return issue.labels.length ? issue.labels.map(l => low(l.name)) : ['none'];
    case 'milestone': return issue.milestone ? [low(issue.milestone)] : ['none'];
    default: {
      const v = issue.dimensions[field];
      return v ? [low(v)] : ['none'];
    }
  }
}

function low(s: string) { return s.trim().toLowerCase(); }

// ── Matching ────────────────────────────────────────────────────────────────

export interface MatchContext {
  /** Who `@me` is. Resolved at match time so a saved view follows its reader. */
  me?: string;
  /** Now, injectable so the date arithmetic is testable. */
  now?: number;
}

const DAY = 86_400_000;

/**
 * Does one term hold for one issue?
 *
 * Negation wraps the whole clause rather than each value: `-type:ui,backend` is
 * "neither UI nor Backend", which is what somebody ticking two values and then
 * excluding them means. Distributing the negation across the values would make
 * it "not UI, or not Backend", which is every issue.
 */
export function matchesTerm(issue: BoardIssue, term: Term, ctx: MatchContext = {}): boolean {
  const hit = rawMatch(issue, term, ctx);
  return term.negated ? !hit : hit;
}

function rawMatch(issue: BoardIssue, term: Term, ctx: MatchContext): boolean {
  const wanted = term.values.map(v => resolveMe(v, ctx));
  if (wanted.length === 0) return true;

  switch (term.field) {
    /*
      Quiet is "at least this long", not "exactly". The chip reads "quiet for 14
      days" and the number people have in their head is a floor — an issue
      untouched for nineteen days is emphatically included.
    */
    case 'quiet': return issue.quietDays >= days(wanted[0]);
    case 'age': return issue.ageDays >= days(wanted[0]);

    case 'created': return inWindow(issue.createdAt, wanted[0], ctx);
    case 'updated': return inWindow(issue.updatedAt, wanted[0], ctx);

    case 'has':
      return wanted.some(w =>
        w === 'evidence' ? issue.evidence.length > 0
        : w === 'comments' ? issue.commentCount > 0
        : w === 'assignee' ? issue.assignees.length > 0
        : w === 'milestone' ? !!issue.milestone
        : false);

    default: {
      const have = valuesOf(issue, term.field);
      return term.mode === 'all'
        ? wanted.every(w => have.includes(w))
        : wanted.some(w => have.includes(w));
    }
  }
}

/** `@me` is the signed-in account, resolved when the filter runs. */
function resolveMe(value: string, ctx: MatchContext): string {
  return value === '@me' && ctx.me ? low(ctx.me) : value;
}

function days(spec: string): number {
  const n = parseInt(spec.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A date phrase, resolved against the clock at the moment it is evaluated.
 *
 * **A relative filter stays relative.** Saving `created:14d` into a view saves
 * the phrase, not the two dates it happened to mean on the Monday you saved it
 * — so the view still means "the last fortnight" next Monday. Absolute forms
 * are stored absolute, because somebody who typed a date meant that date.
 *
 * `14d` is within the last fortnight; `>30d` is older than a month; `>=2026-09-01`
 * and `<2026-09-15` are the calendar.
 */
export function inWindow(iso: string | undefined, phrase: string, ctx: MatchContext): boolean {
  if (!iso) return phrase === 'none';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const range = resolveRange(phrase, ctx.now ?? Date.now());
  if (!range) return false;
  if (range.from !== undefined && t < range.from) return false;
  if (range.to !== undefined && t > range.to) return false;
  return true;
}

export interface DateRange { from?: number; to?: number }

export function resolveRange(phrase: string, now: number): DateRange | undefined {
  const p = phrase.trim().toLowerCase();
  if (!p) return undefined;

  if (p === 'today') return { from: startOfDay(now) };
  if (p === 'week') return { from: now - 7 * DAY };
  if (p === 'sprint') return { from: now - 14 * DAY };
  if (p === 'month') return { from: now - 30 * DAY };

  /* `>30d` — older than thirty days. The comparison is on age, so the sign
     points the way a reader says it out loud rather than the way the timestamp
     compares. */
  let m = p.match(/^([<>]=?)?(\d+)d$/);
  if (m) {
    const n = Number(m[2]) * DAY;
    if (m[1]?.startsWith('>')) return { to: now - n };
    return { from: now - n };
  }

  m = p.match(/^([<>]=?)(\d{4}-\d{2}-\d{2})$/);
  if (m) {
    const at = Date.parse(m[2]);
    if (Number.isNaN(at)) return undefined;
    return m[1].startsWith('>') ? { from: at } : { to: at + DAY - 1 };
  }

  const exact = Date.parse(p);
  if (!Number.isNaN(exact)) return { from: startOfDay(exact), to: startOfDay(exact) + DAY - 1 };
  return undefined;
}

function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Every term, ANDed. The search text is applied separately — see `runSearch`. */
export function matchesAll(issue: BoardIssue, terms: Term[], ctx: MatchContext = {}): boolean {
  return terms.every(t => matchesTerm(issue, t, ctx));
}

// ── The query string ────────────────────────────────────────────────────────

/**
 * `state:open env:prod -assignee:@me quiet:14d`, and back again.
 *
 * The string is an export, not an input requirement — but it has to round-trip
 * exactly, because a view is a string and a colleague pasting one back must get
 * the filter you were looking at rather than an approximation of it.
 */
export function formatQuery(state: FilterState): string {
  const parts: string[] = [];
  for (const t of state.terms) {
    const values = t.values.join(',');
    const joined = t.mode === 'all' ? t.values.join('+') : values;
    parts.push(`${t.negated ? '-' : ''}${t.field}:${joined}`);
  }
  const text = state.search.text.trim();
  if (text) parts.push(/\s/.test(text) ? `"${text}"` : text);
  return parts.join(' ');
}

/**
 * Parse one back.
 *
 * Anything that is not `field:value` is search text, because that is what a
 * person typing into the box means and refusing it would make the string a
 * language rather than a convenience.
 */
export function parseQuery(input: string, keep: SearchState = EMPTY.search): FilterState {
  const terms: Term[] = [];
  const words: string[] = [];

  for (const token of tokenise(input)) {
    const m = token.match(/^(-?)([a-z][\w.-]*):(.+)$/i);
    if (!m) { words.push(token.replace(/^"|"$/g, '')); continue; }
    const [, minus, field, rest] = m;
    const mode = rest.includes('+') ? 'all' : 'any';
    const values = rest.split(mode === 'all' ? '+' : ',').map(low).filter(Boolean);
    if (values.length === 0) continue;
    terms.push({
      field: low(field),
      values,
      ...(minus ? { negated: true } : {}),
      ...(mode === 'all' ? { mode } : {}),
    });
  }

  return { terms, search: { ...keep, text: words.join(' ') } };
}

/** Split on spaces, but not inside quotes. */
function tokenise(input: string): string[] {
  return input.match(/"[^"]*"|\S+/g) ?? [];
}

// ── Changing the filter ─────────────────────────────────────────────────────

export function termFor(state: FilterState, field: string): Term | undefined {
  return state.terms.find(t => t.field === field);
}

function replace(state: FilterState, field: string, next: Term | undefined): FilterState {
  const others = state.terms.filter(t => t.field !== field);
  return { ...state, terms: next ? [...others, next] : others };
}

/** Tick or untick one value. The everyday interaction. */
export function toggleValue(state: FilterState, field: string, value: string): FilterState {
  const term = termFor(state, field);
  const v = low(value);
  if (!term) return replace(state, field, { field, values: [v] });
  const has = term.values.includes(v);
  const values = has ? term.values.filter(x => x !== v) : [...term.values, v];
  return replace(state, field, values.length ? { ...term, values } : undefined);
}

/**
 * `only` — replace the whole facet with this one value.
 *
 * One click where the alternative is untick, untick, untick. The verb people
 * actually mean when they have five values ticked and want one.
 */
export function only(state: FilterState, field: string, value: string): FilterState {
  return replace(state, field, { field, values: [low(value)] });
}

/**
 * `except` — exclude this value and keep the rest.
 *
 * The other verb, and the one that makes a subtractive filter expressible at
 * all. Ticking the other eleven values is how filter panels get abandoned.
 */
export function except(state: FilterState, field: string, value: string): FilterState {
  const term = termFor(state, field);
  const v = low(value);
  if (term?.negated) {
    const values = term.values.includes(v) ? term.values : [...term.values, v];
    return replace(state, field, { ...term, values });
  }
  return replace(state, field, { field, values: [v], negated: true });
}

export function dropField(state: FilterState, field: string): FilterState {
  return replace(state, field, undefined);
}

export function setMode(state: FilterState, field: string, mode: 'any' | 'all'): FilterState {
  const term = termFor(state, field);
  return term ? replace(state, field, { ...term, mode }) : state;
}

export function isEmpty(state: FilterState): boolean {
  return state.terms.length === 0 && state.search.text.trim() === '';
}

// ── Facets ──────────────────────────────────────────────────────────────────

export interface FacetValue {
  value: string;
  label: string;
  /** How many would match if this were ticked, with every other facet applied. */
  count: number;
  ticked: boolean;
  excluded: boolean;
}

export interface Facet {
  field: string;
  label: string;
  kind: 'native' | 'form' | 'activity';
  values: FacetValue[];
  /** Set when the field exists in the mock but not in this repository. */
  unavailable?: string;
  multiValued: boolean;
}

/**
 * The counts, conditional on everything except the facet's own term.
 *
 * That exclusion is the whole trick. Counting a facet against its own filter
 * would show one value at its full count and every sibling at zero, which is
 * useless — the number a reader wants is "how many would I get if I ticked
 * this instead", and that means every other term applied and this one lifted.
 */
export function buildFacets(
  issues: BoardIssue[],
  state: FilterState,
  dimensions: ProposedDimension[],
  ctx: MatchContext = {},
): Facet[] {
  const fields: { field: string; label: string; kind: Facet['kind'] }[] = [
    { field: 'state', label: 'State', kind: 'native' },
    ...dimensions.map(d => ({
      field: d.dimension,
      label: d.dimension.charAt(0).toUpperCase() + d.dimension.slice(1),
      kind: 'form' as const,
    })),
    { field: 'assignee', label: 'Assignee', kind: 'native' },
    { field: 'label', label: 'Label', kind: 'native' },
    { field: 'milestone', label: 'Milestone', kind: 'native' },
    { field: 'author', label: 'Author', kind: 'native' },
  ];

  const declared = new Map(dimensions.map(d => [d.dimension, d.options]));

  return fields.map(({ field, label, kind }) => {
    const others = state.terms.filter(t => t.field !== field);
    const pool = issues.filter(i => matchesAll(i, others, ctx));
    const term = termFor(state, field);

    /*
      The list of values comes from the whole board; only the numbers are
      conditional.

      Deriving the list from the filtered pool instead would empty the panel the
      moment a filter matched nothing — and a facet with no rows in it cannot be
      unticked, which is the one state a filter panel must never reach.
    */
    const counts = new Map<string, number>();
    for (const i of issues) for (const v of valuesOf(i, field)) counts.set(v, 0);
    for (const i of pool) for (const v of valuesOf(i, field)) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }

    /* Values the form declared but nothing currently uses still appear, at
       zero. A dropdown option with no issues on it is a real answer. */
    for (const option of declared.get(field) ?? []) {
      const v = low(option);
      if (!counts.has(v)) counts.set(v, 0);
    }
    /* So does anything already ticked — an excluded value has to stay visible
       or you cannot untick it. */
    for (const v of term?.values ?? []) if (!counts.has(v)) counts.set(v, 0);

    const values = [...counts.entries()]
      .map(([value, count]) => ({
        value,
        label: value === 'none' ? noneLabel(field) : value,
        count,
        ticked: !!term && !term.negated && term.values.includes(value),
        excluded: !!term?.negated && term.values.includes(value),
      }))
      /* The unowned pile first, then by weight, then by name — the same order
         the board groups in, so the panel and the board agree. */
      .sort((a, b) =>
        (a.value === 'none' ? -1 : 0) - (b.value === 'none' ? -1 : 0)
        || b.count - a.count
        || a.value.localeCompare(b.value));

    return { field, label, kind, values, multiValued: MULTI_VALUED.has(field) };
  });
}

function noneLabel(field: string): string {
  if (field === 'assignee') return 'Nobody';
  if (field === 'label') return 'No label';
  if (field === 'milestone') return 'No milestone';
  if (field === 'author') return 'No author';
  return `No ${field}`;
}

/**
 * The four with no GitHub equivalent at all, which are what a lead opens this
 * tab for.
 *
 * `ETA passed` is here and marked unavailable rather than quietly missing: the
 * dates live on a Project, dkgh does not read Projects yet, and a facet that
 * silently is not offered is indistinguishable from one that found nothing.
 */
export interface ActivityFacet {
  id: string;
  label: string;
  term: Term;
  count: number;
  ticked: boolean;
  unavailable?: string;
}

export function buildActivity(
  issues: BoardIssue[],
  state: FilterState,
  ctx: MatchContext = {},
): ActivityFacet[] {
  const rows: { id: string; label: string; term: Term; unavailable?: string }[] = [
    { id: 'quiet', label: 'No comment in 14d', term: { field: 'quiet', values: ['14d'] } },
    { id: 'new', label: 'Opened this week', term: { field: 'created', values: ['week'] } },
    {
      id: 'eta',
      label: 'ETA passed',
      term: { field: 'eta', values: ['passed'] },
      unavailable: 'Start and target dates live on a Project, which dkgh does not read yet.',
    },
    { id: 'evidence', label: 'Has evidence', term: { field: 'has', values: ['evidence'] } },
  ];

  return rows.map(r => {
    const others = state.terms.filter(t => t.field !== r.term.field);
    const pool = issues.filter(i => matchesAll(i, others, ctx));
    return {
      ...r,
      count: r.unavailable ? 0 : pool.filter(i => matchesTerm(i, r.term, ctx)).length,
      ticked: state.terms.some(t => t.field === r.term.field
        && t.values.join(',') === r.term.values.join(',')),
    };
  });
}

// ── Saying it in words ──────────────────────────────────────────────────────

/** `not assignee me`, `type UI or Backend` — the chip's two halves. */
export function describeTerm(term: Term): { key: string; value: string } {
  const join = term.mode === 'all' ? ' and ' : ' or ';
  const value = term.values.map(prettyValue).join(join);
  if (term.field === 'quiet') return { key: 'quiet for', value: `${days(term.values[0])} days` };
  if (term.field === 'age') return { key: 'older than', value: `${days(term.values[0])} days` };
  if (term.field === 'created') return { key: 'opened', value: prettyPhrase(term.values[0]) };
  if (term.field === 'updated') return { key: 'updated', value: prettyPhrase(term.values[0]) };
  if (term.field === 'has') return { key: 'has', value };
  return { key: term.negated ? `not ${term.field}` : term.field, value };
}

function prettyValue(v: string): string {
  if (v === 'none') return 'Nobody';
  if (v === '@me') return 'me';
  return v.toUpperCase() === v ? v : v.charAt(0).toUpperCase() + v.slice(1);
}

export function prettyPhrase(p: string): string {
  if (p === 'today') return 'today';
  if (p === 'week') return 'this week';
  if (p === 'sprint') return 'this sprint';
  if (p === 'month') return 'this month';
  const m = p.match(/^([<>]=?)?(\d+)d$/);
  if (m) return m[1]?.startsWith('>') ? `older than ${m[2]} days` : `last ${m[2]} days`;
  const abs = p.match(/^([<>]=?)(\d{4}-\d{2}-\d{2})$/);
  if (abs) return `${abs[1].startsWith('>') ? 'after' : 'before'} ${abs[2]}`;
  return p;
}

/** The sentence under the count: "open · PROD · unassigned · quiet 14 days". */
export function describeAll(state: FilterState): string {
  const parts = state.terms.map(t => {
    const d = describeTerm(t);
    return `${d.key} ${d.value}`.trim();
  });
  if (state.search.text.trim()) parts.push(`matching “${state.search.text.trim()}”`);
  return parts.join(' · ');
}

// ── 08E — why is this here, and where did that one go ───────────────────────

export interface TermVerdict {
  term: Term;
  key: string;
  /**
   * What this issue's value actually is, as a phrase that reads on its own.
   *
   * The verb lives here rather than in the template because the fields do not
   * share one — "is salilvnair" and "has no evidence" both need saying, and a
   * template that supplied "is" produced "is has no evidence".
   */
  actual: string;
  passes: boolean;
}

/**
 * Every term against one issue, ticked or crossed, with the real value beside
 * it.
 *
 * Not just the one that failed. Knowing that #41 would *also* have been caught
 * by the quiet filter is what stops somebody dropping the assignee filter and
 * being surprised a second time.
 */
export function explain(
  issue: BoardIssue,
  state: FilterState,
  ctx: MatchContext = {},
): TermVerdict[] {
  return state.terms.map(term => ({
    term,
    key: describeTerm(term).key,
    actual: actualValue(issue, term),
    passes: matchesTerm(issue, term, ctx),
  }));
}

function actualValue(issue: BoardIssue, term: Term): string {
  switch (term.field) {
    case 'quiet': return `last activity was ${issue.quietDays} days ago`;
    case 'age': return `is ${issue.ageDays} days old`;
    case 'created': return `was opened ${issue.ageDays} days ago`;
    case 'updated': return `was touched ${issue.quietDays} days ago`;
    case 'has':
      return term.values.includes('evidence')
        ? (issue.evidence.length ? `has ${issue.evidence.length} attached` : 'has no evidence')
        : term.values.includes('comments')
          ? (issue.commentCount ? `has ${issue.commentCount} comments` : 'has no comments')
          : 'has none of those';
    default: {
      const v = valuesOf(issue, term.field);
      return v.includes('none') ? `is ${noneLabel(term.field).toLowerCase()}` : `is ${v.join(', ')}`;
    }
  }
}

export interface TermCost {
  term: Term;
  label: string;
  /**
   * How many of the excluded issues this term alone is responsible for.
   *
   * Counted against everything *else* being applied, so a term that removes
   * nothing the others had not already taken shows zero — which is the finding.
   * A filter you could drop without changing the answer is a filter that is
   * decoration.
   */
  removes: number;
}

export function costOf(
  issues: BoardIssue[],
  state: FilterState,
  ctx: MatchContext = {},
): TermCost[] {
  return state.terms.map(term => {
    const others = state.terms.filter(t => t !== term);
    const withoutIt = issues.filter(i => matchesAll(i, others, ctx));
    const withIt = withoutIt.filter(i => matchesTerm(i, term, ctx));
    const d = describeTerm(term);
    return { term, label: `${d.key} ${d.value}`.trim(), removes: withoutIt.length - withIt.length };
  });
}

// ── The search box ──────────────────────────────────────────────────────────

export interface SearchHit {
  /** Which of the three it matched in, for the line under the result. */
  where: 'title' | 'body' | 'comments';
  /** The matching text with a little either side of it. */
  snippet: string;
}

/**
 * The search, run over what the board already has.
 *
 * Instant, works offline, and only sees loaded issues — which the toolbar says
 * out loud rather than implying it searched the repository. Comments are the
 * exception: they are not on the board, so that scope asks the host and merges
 * the issue numbers it comes back with.
 */
export function runSearch(
  issue: BoardIssue,
  search: SearchState,
  commentHits?: Set<number>,
): SearchHit | undefined {
  const q = search.text.trim();
  if (!q) return undefined;

  const rx = buildRegex(q, search);
  const inTitle = rx.exec(issue.title);
  if (inTitle) return { where: 'title', snippet: snippetOf(issue.title, inTitle.index, q.length) };
  if (search.scope === 'title') {
    return commentHits?.has(issue.number)
      ? { where: 'comments', snippet: 'matched in a comment' }
      : undefined;
  }

  const body = issue.bodyText ?? issue.bodyFirstLine ?? '';
  const inBody = rx.exec(body);
  if (inBody) return { where: 'body', snippet: snippetOf(body, inBody.index, q.length) };

  if (search.scope === 'comments' && commentHits?.has(issue.number)) {
    return { where: 'comments', snippet: 'matched in a comment' };
  }
  return undefined;
}

function buildRegex(q: string, search: SearchState): RegExp {
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = search.wholeWord ? `\\b${escaped}\\b` : escaped;
  return new RegExp(body, search.matchCase ? '' : 'i');
}

/** A window around the hit, so a result says where it matched with the line. */
function snippetOf(text: string, at: number, length: number): string {
  const from = Math.max(0, at - 40);
  const to = Math.min(text.length, at + length + 40);
  return (from > 0 ? '…' : '') + text.slice(from, to).trim() + (to < text.length ? '…' : '');
}
