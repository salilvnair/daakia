/**
 * Filtering request history: one state, three renderings.
 *
 * The facets are for discovering what can be filtered, the chips say in words
 * what you are looking at and let you take any of it back off, and the query
 * string is what the clicking produced — pasteable, and parseable back into the
 * same filter. All three come off one `FilterState`, so they cannot disagree.
 *
 * This is deliberately the same shape as `components/dkgh/filter-model`: the
 * counting rules, the `only`/`except` verbs and the AND/OR convention are ones
 * people have already learned in this app, and a second filter that worked
 * differently would make both of them untrustworthy. What history needs on top
 * is **conditions** — `header authorization contains Bearer` — because a header
 * name is not a facet you can list, it is a question somebody asks.
 *
 * ── The two rules everybody gets wrong once ──
 *
 * - **Two values in one facet means either.** `method:get,post` is GET *or* POST.
 * - **Two facets means both.** `method:post status:5xx` is POST *and* failing.
 *
 * Conditions follow the same rule, bracketed: rows joined `or` sit in one
 * bracket and any of them may match; brackets are ANDed. `(1 or 2) and 3` is
 * therefore the same sentence the facets above it are already telling you.
 * Each row also carries its own negation.
 *
 * ── What is searched ──
 *
 * Everything, including response bodies, always. They are stored (capped at
 * 50 KB by the writer) and a filter that quietly skipped them would answer
 * "no matches" to a question it never asked. The cost is handled by ordering
 * rather than by asking permission — see `matcher.ts`.
 */
import { prettyPhrase, resolveRange, withinRange } from '../filter/date-range';

export { prettyPhrase };

// ── Facet terms ─────────────────────────────────────────────────────────────

/** One facet clause. Values inside it are OR; separate terms are AND. */
export interface Term {
  field: TermField;
  /** Lowercased. */
  values: string[];
  /** `-field:value` — everything except. Half of real filtering is subtractive. */
  negated?: boolean;
}

export type TermField =
  | 'method'
  | 'status'
  | 'protocol'
  | 'auth'
  | 'saved'
  | 'when'
  | 'has'
  /**
   * Specific rows, by id.
   *
   * Not a facet — nobody ticks a run id out of a list. It exists so that
   * "show me those three runs" is a *filter* rather than a special display
   * mode: the chip says what happened, taking it off puts the list back, and
   * the code path is the one every other narrowing already uses. A card that
   * highlighted rows some other way would be a second way for the list to be
   * showing a subset, and the panel could then disagree with itself about
   * what it was showing.
   */
  | 'ids';

export const TERM_FIELDS: readonly TermField[] =
  ['method', 'status', 'protocol', 'auth', 'saved', 'when', 'has', 'ids'];

function isTermField(s: string): s is TermField {
  return (TERM_FIELDS as readonly string[]).includes(s);
}

// ── Conditions ──────────────────────────────────────────────────────────────

/**
 * Where a condition looks.
 *
 * Request and response are separate fields rather than one field with a
 * direction flag, because that is how the popup is laid out and how somebody
 * says it: "response header", not "header, response".
 */
export type ConditionField =
  | 'header' | 'resheader'
  | 'body' | 'resbody'
  | 'json' | 'resjson'
  | 'script'
  | 'authfield'
  | 'url';

export type Operator = 'present' | 'absent' | 'equals' | 'contains' | 'starts' | 'regex';

export const OPERATORS: readonly Operator[] =
  ['present', 'absent', 'equals', 'contains', 'starts', 'regex'];

/** Operators that need nothing typed in the value box. */
export const NULLARY: ReadonlySet<Operator> = new Set<Operator>(['present', 'absent']);

export interface Condition {
  /** Stable across edits, so React rows keep their identity while you type. */
  id: string;
  /**
   * How this row joins the one above it.
   *
   * The join describes the *gap above* the row that carries it, which is where
   * the control sits on screen. `or` puts this row in the same bracket as the
   * one above; anything else, including the default, starts a new bracket. So
   * three rows where only the second says `or` read `(1 or 2) and 3` — the
   * first row's join is never consulted, because there is no gap above it.
   *
   * ── Why not a group id ──
   *
   * A `group: number` on each row can be made inconsistent — two rows claiming
   * group 2 with a group 1 between them is a state the UI would have to
   * prevent and the parser would have to repair. A join describes a gap, and a
   * list of gaps cannot be malformed however the rows are added, removed or
   * reordered.
   */
  join?: 'and' | 'or';
  field: ConditionField;
  /**
   * Which one — a header name, a JSONPath, `pre`/`post`/`any` for scripts.
   *
   * `*` means "any of them", which is what makes `header * contains Bearer` a
   * question you can ask without knowing which header carries it.
   */
  key: string;
  op: Operator;
  value: string;
  negated?: boolean;
}

let nextId = 0;
export function newCondition(field: ConditionField = 'header'): Condition {
  return { id: `c${++nextId}`, field, key: defaultKeyFor(field), op: 'contains', value: '' };
}

export function defaultKeyFor(field: ConditionField): string {
  if (field === 'script') return 'any';
  if (field === 'json' || field === 'resjson') return '$.';
  if (field === 'body' || field === 'resbody' || field === 'url') return 'text';
  return '*';
}

/** Fields whose `key` is a fixed choice rather than free text. */
export const FIXED_KEYS: Partial<Record<ConditionField, readonly string[]>> = {
  script: ['any', 'pre', 'post'],
  body: ['text'],
  resbody: ['text'],
  url: ['text'],
};

/**
 * Is this condition worth running?
 *
 * A half-typed row — a header name and no value yet — must not filter, or the
 * list empties under your hands between the two keystrokes that would have made
 * it meaningful.
 */
export function isUsable(c: Condition): boolean {
  if (NULLARY.has(c.op)) return c.key.trim() !== '';
  if (c.value.trim() === '') return false;
  if ((c.field === 'json' || c.field === 'resjson') && c.key.trim().replace(/^\$\.?$/, '') === '') {
    return false;
  }
  return c.key.trim() !== '';
}

/**
 * The rows, bracketed.
 *
 * Within a bracket the rows are OR; brackets are AND — the same rule the facets
 * already use, said the same way ("two ticks in one list mean either, two lists
 * mean both"). One convention for the whole panel is worth more than a more
 * expressive one nobody can predict.
 *
 * Unusable rows are dropped *before* bracketing, so a half-typed row in the
 * middle of an OR bracket does not split it in two and quietly change what the
 * finished rows mean.
 */
export function bracket(conditions: readonly Condition[]): Condition[][] {
  const groups: Condition[][] = [];
  for (const c of conditions) {
    if (!isUsable(c)) continue;
    if (c.join === 'or' && groups.length > 0) groups[groups.length - 1].push(c);
    else groups.push([c]);
  }
  return groups;
}

/** How a bracketed filter reads out loud: `(1 or 2) and 3`. */
export function describeBrackets(conditions: readonly Condition[]): string {
  const groups = bracket(conditions);
  if (!groups.length) return '';
  let n = 0;
  return groups
    .map(g => {
      const nums = g.map(() => `${++n}`);
      return nums.length > 1 ? `(${nums.join(' or ')})` : nums[0];
    })
    .join(' and ');
}

// ── The whole state ─────────────────────────────────────────────────────────

export interface FilterState {
  terms: Term[];
  conditions: Condition[];
  /** The free-text box. Searches method, URL, and both bodies. */
  text: string;
}

export const EMPTY: FilterState = { terms: [], conditions: [], text: '' };

export function isEmpty(state: FilterState): boolean {
  return state.terms.length === 0
    && !state.conditions.some(isUsable)
    && state.text.trim() === '';
}

/** How many things a reader would say are switched on — the badge on the icon. */
export function activeCount(state: FilterState): number {
  return state.terms.length
    + state.conditions.filter(isUsable).length
    + (state.text.trim() ? 1 : 0);
}

// ── Changing it ─────────────────────────────────────────────────────────────

export function termFor(state: FilterState, field: TermField): Term | undefined {
  return state.terms.find(t => t.field === field);
}

function replace(state: FilterState, field: TermField, next: Term | undefined): FilterState {
  const others = state.terms.filter(t => t.field !== field);
  return { ...state, terms: next ? [...others, next] : others };
}

/** Tick or untick one value. The everyday interaction. */
export function toggleValue(state: FilterState, field: TermField, value: string): FilterState {
  const term = termFor(state, field);
  const v = low(value);
  if (!term) return replace(state, field, { field, values: [v] });
  const has = term.values.includes(v);
  const values = has ? term.values.filter(x => x !== v) : [...term.values, v];
  return replace(state, field, values.length ? { ...term, values } : undefined);
}

/** Replace the whole facet with this one value — one click instead of five unticks. */
export function only(state: FilterState, field: TermField, value: string): FilterState {
  return replace(state, field, { field, values: [low(value)] });
}

/** Exclude this value and keep the rest — the verb that makes subtraction expressible. */
export function except(state: FilterState, field: TermField, value: string): FilterState {
  const term = termFor(state, field);
  const v = low(value);
  if (term?.negated) {
    const values = term.values.includes(v) ? term.values : [...term.values, v];
    return replace(state, field, { ...term, values });
  }
  return replace(state, field, { field, values: [v], negated: true });
}

export function dropField(state: FilterState, field: TermField): FilterState {
  return replace(state, field, undefined);
}

export function setCondition(state: FilterState, next: Condition): FilterState {
  return { ...state, conditions: state.conditions.map(c => (c.id === next.id ? next : c)) };
}

export function addCondition(state: FilterState, field?: ConditionField): FilterState {
  return { ...state, conditions: [...state.conditions, newCondition(field)] };
}

export function dropCondition(state: FilterState, id: string): FilterState {
  return { ...state, conditions: state.conditions.filter(c => c.id !== id) };
}

function low(s: string) { return s.trim().toLowerCase(); }

// ── The query string ────────────────────────────────────────────────────────

/**
 * `method:post status:5xx header:authorization:contains:Bearer`, and back again.
 *
 * The string is an export rather than something anybody has to learn — but it
 * has to round-trip exactly, because pasting one into a chat and getting a
 * different filter back is worse than not offering it.
 *
 * A condition is `field:key:op:value`, in that order, because that is the order
 * the row reads on screen. The value is whatever is left after the third colon,
 * so it may contain colons — which URLs and timestamps invariably do.
 */
export function formatQuery(state: FilterState): string {
  const parts: string[] = [];
  for (const t of state.terms) {
    parts.push(`${t.negated ? '-' : ''}${t.field}:${t.values.join(',')}`);
  }
  /* A bracket of OR'd rows is one token joined by `|`; brackets are separate
     tokens, which the parser already ANDs. The string therefore says exactly
     what the panel draws. */
  for (const group of bracket(state.conditions)) {
    parts.push(group.map(oneCondition).join('|'));
  }
  const text = state.text.trim();
  if (text) parts.push(/\s/.test(text) ? `"${text}"` : text);
  return parts.join(' ');
}

/*
  A value is quoted when it has whitespace in it — and the quotes inside it are
  escaped, because the values people type are JSON fragments: `"currency":
  "INR"` is the single most likely thing to go in a body condition, and naive
  quoting turned it into an empty string followed by rubbish.
*/
function oneCondition(c: Condition): string {
  const head = `${c.negated ? '-' : ''}${c.field}:${c.key}:${c.op}`;
  return NULLARY.has(c.op) ? head : `${head}:${quote(c.value)}`;
}

function quote(v: string): string {
  /* `|` joins a bracket, so a value holding one has to be quoted or the string
     would split a single condition into two. */
  if (!/[\s"\\|]/.test(v)) return v;
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function unquote(v: string): string {
  if (!v.startsWith('"') || !v.endsWith('"') || v.length < 2) return v;
  return v.slice(1, -1).replace(/\\(["\\])/g, '$1');
}

/**
 * Parse one back.
 *
 * Anything that is not a recognised term or condition is search text, because
 * that is what somebody typing into the box meant, and refusing it would make
 * the string a language you can fail at rather than a convenience.
 */
export function parseQuery(input: string): FilterState {
  const terms: Term[] = [];
  const conditions: Condition[] = [];
  const words: string[] = [];

  for (const token of tokenise(input)) {
    const members = splitOr(token);
    /*
      A token is a bracket when it has more than one member. Every member after
      the first carries `join: 'or'`, which is what puts them back into one
      bracket when the panel re-draws them.
    */
    const parsedMembers = members.map(parseToken);
    if (members.length > 1 && parsedMembers.every(m => m && 'op' in m)) {
      parsedMembers.forEach((m, i) => {
        conditions.push(i === 0 ? (m as Condition) : { ...(m as Condition), join: 'or' });
      });
      continue;
    }
    const parsed = members.length === 1 ? parsedMembers[0] : undefined;
    if (!parsed) { words.push(unquote(token)); continue; }
    if ('op' in parsed) conditions.push(parsed);
    else terms.push(parsed);
  }

  return { terms, conditions, text: words.join(' ') };
}

function parseToken(token: string): Term | Condition | undefined {
  const m = token.match(/^(-?)([a-z]+):(.+)$/i);
  if (!m) return undefined;
  const [, minus, rawField, rest] = m;
  const field = low(rawField);

  if (isTermField(field)) {
    const values = rest.split(',').map(low).filter(Boolean);
    if (!values.length) return undefined;
    return { field, values, ...(minus ? { negated: true } : {}) };
  }

  if (!isConditionField(field)) return undefined;
  /* key : op : value — split off the first two, keep the rest whole. */
  const first = rest.indexOf(':');
  if (first < 0) return undefined;
  const key = rest.slice(0, first);
  const after = rest.slice(first + 1);
  const second = after.indexOf(':');
  const opText = low(second < 0 ? after : after.slice(0, second));
  if (!isOperator(opText)) return undefined;
  const value = second < 0 ? '' : unquote(after.slice(second + 1));
  if (!NULLARY.has(opText) && value === '') return undefined;
  return {
    id: `c${++nextId}`,
    field,
    key,
    op: opText,
    value,
    ...(minus ? { negated: true } : {}),
  };
}

const CONDITION_FIELDS: readonly ConditionField[] =
  ['header', 'resheader', 'body', 'resbody', 'json', 'resjson', 'script', 'authfield', 'url'];

function isConditionField(s: string): s is ConditionField {
  return (CONDITION_FIELDS as readonly string[]).includes(s);
}

function isOperator(s: string): s is Operator {
  return (OPERATORS as readonly string[]).includes(s);
}

/**
 * Split a token on the `|` that joins a bracket, ignoring any inside quotes.
 *
 * Written as a scan rather than a regex because the thing being skipped is a
 * quoted span with escapes in it, and a regex that got that subtly wrong would
 * fail on exactly the values people quote: the ones with punctuation.
 */
function splitOr(token: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (inQuotes && ch === '\\' && i + 1 < token.length) { current += ch + token[++i]; continue; }
    if (ch === '"') { inQuotes = !inQuotes; current += ch; continue; }
    if (ch === '|' && !inQuotes) { out.push(current); current = ''; continue; }
    current += ch;
  }
  out.push(current);
  return out.filter(Boolean);
}

/** Split on spaces, but not inside quotes — and an escaped quote is not a quote. */
function tokenise(input: string): string[] {
  return input.match(/(?:[^\s"]|"(?:\\.|[^"\\])*")+/g) ?? [];
}

// ── Saying it in words ──────────────────────────────────────────────────────

const FIELD_WORDS: Record<ConditionField, string> = {
  header: 'header',
  resheader: 'response header',
  body: 'body',
  resbody: 'response body',
  json: 'body',
  resjson: 'response',
  script: 'script',
  authfield: 'auth',
  url: 'URL',
};

const OP_WORDS: Record<Operator, string> = {
  present: 'is present',
  absent: 'is absent',
  equals: 'is',
  contains: 'contains',
  starts: 'starts with',
  regex: 'matches',
};

export function operatorWord(op: Operator): string { return OP_WORDS[op]; }
export function fieldWord(field: ConditionField): string { return FIELD_WORDS[field]; }

/**
 * A chip's three coloured parts.
 *
 * Kept apart rather than flattened into one string, because the popup paints
 * the field, the operator and the value in three different colours — the same
 * three a token gets anywhere else in Daakia — and a chip that arrived
 * pre-joined could only be grey.
 */
export interface ChipParts {
  key: string;
  op: string;
  value: string;
  negated: boolean;
}

export function describeTerm(term: Term): ChipParts {
  /* A list of row ids is not a phrase anybody reads — the chip says how many,
     which is the part that means something. */
  if (term.field === 'ids') {
    return {
      key: 'showing',
      op: '',
      value: `${term.values.length} ${term.values.length === 1 ? 'run' : 'runs'}`,
      negated: !!term.negated,
    };
  }
  const value = term.values.map(valueWord).join(' or ');
  return {
    key: TERM_LABELS[term.field],
    op: term.negated ? 'is not' : 'is',
    value,
    negated: !!term.negated,
  };
}

export function describeCondition(c: Condition): ChipParts {
  const anyKey = c.key === '*' || c.key === 'any' || c.key === 'text';
  const key = anyKey ? FIELD_WORDS[c.field] : `${FIELD_WORDS[c.field]} ${c.key}`;
  return {
    key: c.negated ? `not ${key}` : key,
    op: OP_WORDS[c.op],
    value: NULLARY.has(c.op) ? '' : c.value,
    negated: !!c.negated,
  };
}

export const TERM_LABELS: Record<TermField, string> = {
  method: 'method',
  status: 'status',
  protocol: 'protocol',
  auth: 'auth',
  saved: 'saved',
  when: 'sent',
  has: 'has',
  ids: 'runs',
};

function valueWord(v: string): string {
  if (v === 'none') return 'none';
  if (v === 'yes') return 'yes';
  if (v === 'no') return 'no';
  if (/^\d?xx$/.test(v)) return v.toUpperCase();
  if (HAS_LABELS[v]) return HAS_LABELS[v];
  if (/^(today|week|sprint|month)$/.test(v) || /^[<>]?=?\d+d$/.test(v)) return prettyPhrase(v);
  return v;
}

export const HAS_LABELS: Record<string, string> = {
  body: 'a body',
  json: 'a JSON body',
  prescript: 'a pre-request script',
  postscript: 'a post-response script',
  script: 'a script',
  secret: 'a secret',
  response: 'a stored response',
};

/** Every chip the bar should draw, in the order it reads. */
export function chipsOf(state: FilterState): (ChipParts & { kind: 'term'; field: TermField } | ChipParts & { kind: 'condition'; id: string })[] {
  return [
    ...state.terms.map(t => ({ ...describeTerm(t), kind: 'term' as const, field: t.field })),
    ...state.conditions.filter(isUsable)
      .map(c => ({ ...describeCondition(c), kind: 'condition' as const, id: c.id })),
  ];
}

// ── Status buckets ──────────────────────────────────────────────────────────

/**
 * Which bucket a status code falls in.
 *
 * `error` is its own bucket rather than folded into 5xx: a request that never
 * got a response has status 0, and somebody looking for failures means both —
 * but somebody looking for a server's 500s does not mean the ones that never
 * reached it.
 */
export function statusBucket(status: number): string {
  if (!status) return 'error';
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  if (status >= 200) return '2xx';
  return 'error';
}

export const STATUS_VALUES = ['2xx', '3xx', '4xx', '5xx', 'error'] as const;

export const WHEN_VALUES = ['today', 'week', 'month', '>30d'] as const;

export const HAS_VALUES = ['body', 'json', 'prescript', 'postscript', 'secret', 'response'] as const;

// ── Re-exported so callers need one import ──────────────────────────────────

export { resolveRange, withinRange };
