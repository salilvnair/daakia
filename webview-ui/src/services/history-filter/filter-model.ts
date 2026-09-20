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
 * Conditions are always AND, and each carries its own negation.
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
  | 'has';

export const TERM_FIELDS: readonly TermField[] =
  ['method', 'status', 'protocol', 'auth', 'saved', 'when', 'has'];

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
  for (const c of state.conditions) {
    if (!isUsable(c)) continue;
    const head = `${c.negated ? '-' : ''}${c.field}:${c.key}:${c.op}`;
    parts.push(NULLARY.has(c.op) ? head : `${head}:${quote(c.value)}`);
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
function quote(v: string): string {
  if (!/[\s"\\]/.test(v)) return v;
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
    const parsed = parseToken(token);
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
