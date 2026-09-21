/**
 * Running a filter over history rows.
 *
 * ── How response bodies are searched on every keystroke ──
 *
 * They are, always — but never more than they have to be. Two things pay for
 * it:
 *
 * 1. **Cheap first.** Facet terms are columns and run before any condition;
 *    conditions then run in cost order, headers before bodies before JSONPath.
 *    A row that fails `method:POST` never has its response body parsed, so a
 *    filter with any facet on it touches a fraction of the table.
 * 2. **Parsed once.** `HistoryFacts` caches each section per row object, so the
 *    second keystroke re-matches against already-parsed bodies. The expensive
 *    pass is the first one, and only for the rows that reach it.
 *
 * The regexes typed into a condition are the one thing that could still be
 * slow, so a bad pattern is caught at compile and treated as "matches nothing"
 * rather than thrown — a half-typed `(` should not empty the list with an
 * error.
 */
import {
  type Condition, type FilterState, type Operator, type Term, type TermField,
  NULLARY, isGroup, liveTree, statusBucket, withinRange, type ConditionNode,
} from './filter-model';
import { factsOf, type HistoryFacts, type HistoryRowLike, type HeaderPair } from './history-facts';
import { parsePath, queryPath, asText } from './json-path';
import { EMPTY_SAVED_INDEX, type SavedIndex } from './saved-index';

export interface MatchContext {
  /** Now, injected so the date arithmetic is testable and resolved once. */
  now: number;
  /** What the collections hold, for `saved:no`. */
  saved: SavedIndex;
}

export function contextOf(saved: SavedIndex = EMPTY_SAVED_INDEX, now = Date.now()): MatchContext {
  return { now, saved };
}

// ── Facet terms ─────────────────────────────────────────────────────────────

/** What a row's value is along a facet, lowercased. Always at least one. */
export function valuesOf(f: HistoryFacts, field: TermField, ctx: MatchContext): string[] {
  switch (field) {
    case 'method': return [f.method.toLowerCase() || 'none'];
    case 'status': return [statusBucket(f.status)];
    case 'protocol': return [f.protocol];
    case 'auth': return [f.auth.type || 'none'];
    case 'saved': return [ctx.saved.has({ method: f.method, url: f.url }) ? 'yes' : 'no'];
    case 'ids': return [String(f.id)];
    case 'has': {
      const out: string[] = [];
      if (f.headers.length) out.push('reqheaders');
      if (f.responseHeaders.length) out.push('resheaders');
      if (f.body.trim()) out.push('body');
      if (f.bodyJson !== undefined) out.push('json');
      if (f.preScript.trim()) out.push('prescript');
      if (f.postScript.trim()) out.push('postscript');
      if (f.preScript.trim() || f.postScript.trim()) out.push('script');
      if (f.hasSecret) out.push('secret');
      if (f.hasResponse) out.push('response');
      return out.length ? out : ['none'];
    }
    /*
      `when` has no list of values to tick against — it is a phrase, and the
      facet offers a fixed handful. Returning the phrases the row satisfies is
      what lets the same counting code number them.
    */
    case 'when': return [];
  }
}

export function matchesTerm(f: HistoryFacts, term: Term, ctx: MatchContext): boolean {
  const hit = rawTerm(f, term, ctx);
  return term.negated ? !hit : hit;
}

function rawTerm(f: HistoryFacts, term: Term, ctx: MatchContext): boolean {
  if (term.values.length === 0) return true;
  if (term.field === 'when') {
    /* Several phrases ticked means any of them, same as every other facet. */
    return term.values.some(v => withinRange(f.at, v, ctx.now));
  }
  const have = valuesOf(f, term.field, ctx);
  return term.values.some(v => have.includes(v));
}

// ── Conditions ──────────────────────────────────────────────────────────────

/**
 * Roughly what each condition costs, so the cheap ones run first.
 *
 * Headers are a small array already parsed for other reasons; a request body is
 * a string; a response body may be 50 KB; JSONPath parses that string. The
 * numbers only have to order correctly.
 */
const COST: Record<Condition['field'], number> = {
  url: 0,
  header: 1,
  authfield: 1,
  script: 2,
  resheader: 2,
  body: 3,
  json: 4,
  resbody: 5,
  resjson: 6,
};

export function byCost(a: Condition, b: Condition): number {
  return COST[a.field] - COST[b.field];
}

export function matchesCondition(f: HistoryFacts, c: Condition): boolean {
  const hit = rawCondition(f, c);
  return c.negated ? !hit : hit;
}

function rawCondition(f: HistoryFacts, c: Condition): boolean {
  switch (c.field) {
    case 'header': return pairMatch(f.headers, c);
    case 'resheader': return pairMatch(f.responseHeaders, c);
    case 'authfield': return pairMatch(f.auth.fields, c);
    case 'url': return textMatch(f.url, c);
    case 'body': return textMatch(f.body, c);
    case 'resbody': return textMatch(f.responseBody, c);
    case 'script': return textMatch(scriptText(f, c.key), c);
    case 'json': return pathMatch(f.bodyJson, c);
    case 'resjson': return pathMatch(f.responseJson, c);
  }
}

function scriptText(f: HistoryFacts, which: string): string {
  if (which === 'pre') return f.preScript;
  if (which === 'post') return f.postScript;
  return `${f.preScript}\n${f.postScript}`;
}

/**
 * A named-or-any lookup over key/value pairs.
 *
 * `present` on `*` asks whether there are any pairs at all, which is what
 * "has a header" means. `present` on a name asks whether that one is there —
 * and `absent` is its exact negation rather than a separate search, so the two
 * can never both be true.
 */
function pairMatch(pairs: readonly HeaderPair[], c: Condition): boolean {
  const key = c.key.trim().toLowerCase();
  const scope = key === '*' || key === '' ? pairs : pairs.filter(p => p.key === key);
  if (c.op === 'present') return scope.length > 0;
  if (c.op === 'absent') return scope.length === 0;
  /*
    An unnamed condition matches on either half. Somebody who typed `Bearer`
    into a row with no header name meant "anywhere in the headers", and making
    them also pick `authorization` would defeat the point of the `*`.
  */
  return scope.some(p =>
    compare(p.value, c.op, c.value) || (key === '' || key === '*' ? compare(p.key, c.op, c.value) : false));
}

function textMatch(text: string, c: Condition): boolean {
  if (c.op === 'present') return text.trim() !== '';
  if (c.op === 'absent') return text.trim() === '';
  return compare(text, c.op, c.value);
}

function pathMatch(root: unknown, c: Condition): boolean {
  if (root === undefined) return c.op === 'absent';
  const path = parsePath(c.key);
  if (!path) return false;
  const found = queryPath(root, path);
  if (c.op === 'present') return found.length > 0;
  if (c.op === 'absent') return found.length === 0;
  return found.some(v => compare(asText(v), c.op, c.value));
}

/** The four value operators, case-insensitive throughout. */
function compare(haystack: string, op: Operator, needle: string): boolean {
  if (NULLARY.has(op)) return false;
  if (op === 'regex') {
    const rx = compileRegex(needle);
    return rx ? rx.test(haystack) : false;
  }
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (op === 'equals') return h === n;
  if (op === 'starts') return h.startsWith(n);
  return h.includes(n);
}

/*
  A pattern people are still typing is usually not a pattern yet, so a bad one
  matches nothing instead of throwing. Compiled patterns are kept because the
  same handful are re-tested against every row on every keystroke.
*/
const REGEX_CACHE = new Map<string, RegExp | undefined>();

export function compileRegex(source: string): RegExp | undefined {
  if (REGEX_CACHE.has(source)) return REGEX_CACHE.get(source);
  let rx: RegExp | undefined;
  try { rx = new RegExp(source, 'i'); } catch { rx = undefined; }
  if (REGEX_CACHE.size > 200) REGEX_CACHE.clear();
  REGEX_CACHE.set(source, rx);
  return rx;
}

// ── The whole filter ────────────────────────────────────────────────────────

/**
 * Free text: method, URL, and both bodies.
 *
 * Headers are deliberately not in here. Searching them from the plain box would
 * make every request with a `Bearer` token match the word "bearer", and the
 * header row above exists to ask that question precisely.
 */
function matchesText(f: HistoryFacts, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  if (f.url.toLowerCase().includes(n)) return true;
  if (f.method.toLowerCase().includes(n)) return true;
  if (f.body.toLowerCase().includes(n)) return true;
  return f.responseBody.toLowerCase().includes(n);
}

export function matchesFacts(f: HistoryFacts, state: FilterState, ctx: MatchContext): boolean {
  for (const term of state.terms) if (!matchesTerm(f, term, ctx)) return false;

  /*
    The conditions are a tree of brackets: a group is `and` or `or` over its
    children, and a child is a row or another group.

    Within each group the rows run cheapest first and nested groups run last,
    for the same reason as everywhere else — an `or` satisfied by a header
    never opens a response body, and an `and` that fails on one never opens it
    either. Reordering inside a group cannot change its answer; moving
    something between groups would, so nothing does.
  */
  const tree = liveTree(state);
  if (tree && !matchesNode(f, tree)) return false;
  return matchesText(f, state.text);
}

function costOf(node: ConditionNode): number {
  return isGroup(node) ? 100 : COST[node.field];
}

function matchesNode(f: HistoryFacts, node: ConditionNode): boolean {
  if (!isGroup(node)) return matchesCondition(f, node);
  const ordered = [...node.children].sort((a, b) => costOf(a) - costOf(b));
  return node.op === 'and'
    ? ordered.every(c => matchesNode(f, c))
    : ordered.some(c => matchesNode(f, c));
}

export function matchesRow(row: HistoryRowLike, state: FilterState, ctx: MatchContext): boolean {
  return matchesFacts(factsOf(row), state, ctx);
}

export function applyFilter<T extends HistoryRowLike>(
  rows: readonly T[],
  state: FilterState,
  ctx: MatchContext,
): T[] {
  return rows.filter(r => matchesFacts(factsOf(r), state, ctx));
}

// ── Facets, with live conditional counts ────────────────────────────────────

export interface FacetValue {
  value: string;
  label: string;
  /** How many would match if this were ticked, with every other facet applied. */
  count: number;
  ticked: boolean;
  excluded: boolean;
}

export interface Facet {
  field: TermField;
  label: string;
  values: FacetValue[];
}

/**
 * The counts, conditional on everything except this facet's own term.
 *
 * That exclusion is the whole trick: counting a facet against its own filter
 * would show one value at its full count and every sibling at zero. The number
 * a reader wants is "how many would I get if I ticked this instead", which
 * means every other term applied and this one lifted.
 *
 * A value at zero stays in the list, greyed. Hiding it would leave somebody
 * wondering where POST went, and showing an unfiltered count would be a lie
 * they could act on.
 */
export function buildFacet(
  rows: readonly HistoryRowLike[],
  state: FilterState,
  field: TermField,
  label: string,
  fixedValues: readonly string[] | undefined,
  labelOf: (value: string) => string,
  ctx: MatchContext,
): Facet {
  const others: FilterState = {
    ...state,
    terms: state.terms.filter(t => t.field !== field),
  };
  const pool = rows.filter(r => matchesFacts(factsOf(r), others, ctx));
  const term = state.terms.find(t => t.field === field);

  const counts = new Map<string, number>();
  for (const v of fixedValues ?? []) counts.set(v, 0);

  if (field === 'when') {
    /* A phrase is not a value a row holds, so it is counted by asking. */
    for (const v of fixedValues ?? []) {
      counts.set(v, pool.filter(r => withinRange(factsOf(r).at, v, ctx.now)).length);
    }
  } else {
    /* The list of values comes from the whole table; only the numbers are
       conditional. Deriving the list from the filtered pool would empty the
       panel the moment a filter matched nothing — and a facet with nothing in
       it cannot be unticked, which is the one state a filter must never reach. */
    if (!fixedValues) {
      for (const r of rows) for (const v of valuesOf(factsOf(r), field, ctx)) {
        if (!counts.has(v)) counts.set(v, 0);
      }
    }
    for (const r of pool) for (const v of valuesOf(factsOf(r), field, ctx)) {
      if (fixedValues && !counts.has(v)) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }

  /* Anything ticked stays visible even at zero — an excluded value you cannot
     see is an excluded value you cannot take back off. */
  for (const v of term?.values ?? []) if (!counts.has(v)) counts.set(v, 0);

  const order = fixedValues ? new Map(fixedValues.map((v, i) => [v, i])) : undefined;
  const values = [...counts.entries()]
    .map(([value, count]) => ({
      value,
      label: labelOf(value),
      count,
      ticked: !!term && !term.negated && term.values.includes(value),
      excluded: !!term?.negated && term.values.includes(value),
    }))
    .sort((a, b) => order
      ? (order.get(a.value) ?? 99) - (order.get(b.value) ?? 99)
      : b.count - a.count || a.value.localeCompare(b.value));

  return { field, label, values };
}
