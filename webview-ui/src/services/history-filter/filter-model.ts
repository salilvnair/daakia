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

// ── Groups ──────────────────────────────────────────────────────────────────

/**
 * A box of rows that share one operator.
 *
 * ── Why the model has two levels, and why one was not enough ──
 *
 * The first design stored a join on each row and derived the structure from the
 * sequence of joins. That is a *flat* model: a list of OR-brackets, ANDed. It
 * can say `A and (B or C)`. It cannot say `(A and B) or C`, because an OR
 * between an AND-group and anything else is a nesting, and there was no nesting
 * to hold it.
 *
 * The panel, meanwhile, drew boxes — and boxes imply exactly that nesting. So
 * an ALL OF box with an `OR` above an ANY OF box *looked* like `(A and B) or
 * (C or D)` and actually evaluated as `A and (B or C or D)`. The picture and
 * the meaning had come apart, and the giveaway was that flipping the operator
 * between two boxes collapsed one into the other — the model was re-deriving
 * boxes it could not really represent.
 *
 * Two levels fix it and stop there. Rows combine inside a group with the
 * group's operator; groups combine with each other using `groupOp`. That is
 * unambiguous with no precedence rules to learn, it is exactly the shape the
 * panel already drew, and it covers every arrangement anybody has asked for.
 * Arbitrary nesting would buy expressions nobody can read off a sidebar.
 */
export interface ConditionGroup {
  /** Stable across edits, so React boxes keep their identity. */
  id: string;
  /** How the rows inside this box combine. */
  op: 'and' | 'or';
  rows: Condition[];
}

let nextGroupId = 0;

export function newGroup(rows: Condition[] = [], op: 'and' | 'or' = 'or'): ConditionGroup {
  return { id: `g${++nextGroupId}`, op, rows };
}

// ── The whole state ─────────────────────────────────────────────────────────

export interface FilterState {
  terms: Term[];
  groups: ConditionGroup[];
  /** How the groups combine with each other. */
  groupOp: 'and' | 'or';
  /** The free-text box. Searches method, URL, and both bodies. */
  text: string;
}

export const EMPTY: FilterState = { terms: [], groups: [], groupOp: 'and', text: '' };

/** Every row in the filter, in reading order. */
export function allRows(state: FilterState): Condition[] {
  return state.groups.flatMap(g => g.rows);
}

/**
 * The groups that actually constrain anything.
 *
 * A group whose rows are all half-typed matches nothing yet, so it is dropped
 * rather than counted — which matters most under `groupOp: 'or'`, where an
 * empty group left in would be an alternative that is trivially satisfied and
 * would quietly match the whole table.
 */
export function liveGroups(state: FilterState): { op: 'and' | 'or'; rows: Condition[] }[] {
  return state.groups
    .map(g => ({ op: g.op, rows: g.rows.filter(isUsable) }))
    .filter(g => g.rows.length > 0);
}

export function isEmpty(state: FilterState): boolean {
  return state.terms.length === 0
    && liveGroups(state).length === 0
    && state.text.trim() === '';
}

/** How many things a reader would say are switched on — the badge on the icon. */
export function activeCount(state: FilterState): number {
  return state.terms.length
    + liveGroups(state).reduce((n, g) => n + g.rows.length, 0)
    + (state.text.trim() ? 1 : 0);
}

/** How the filter reads out loud: `(1 and 2) or (3 or 4)`. */
export function describeStructure(state: FilterState): string {
  const groups = liveGroups(state);
  if (!groups.length) return '';
  let n = 0;
  const parts = groups.map(g => {
    const nums = g.rows.map(() => `${++n}`);
    return nums.length > 1 ? `(${nums.join(` ${g.op} `)})` : nums[0];
  });
  return parts.join(` ${state.groupOp} `);
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
  return {
    ...state,
    groups: state.groups.map(g => ({
      ...g,
      rows: g.rows.map(c => (c.id === next.id ? next : c)),
    })),
  };
}

/** A new row in a box of its own — what the main add button makes. */
export function addCondition(state: FilterState, field?: ConditionField): FilterState {
  return { ...state, groups: [...state.groups, newGroup([newCondition(field)])] };
}

/** A new row inside an existing box, beside the ones already there. */
export function addToGroup(
  state: FilterState, groupId: string, field?: ConditionField, op?: 'and' | 'or',
): FilterState {
  return {
    ...state,
    groups: state.groups.map(g => (g.id === groupId
      ? { ...g, op: op ?? g.op, rows: [...g.rows, newCondition(field)] }
      : g)),
  };
}

export function setGroupOp(state: FilterState, groupId: string, op: 'and' | 'or'): FilterState {
  return {
    ...state,
    groups: state.groups.map(g => (g.id === groupId ? { ...g, op } : g)),
  };
}

/**
 * Remove one row, and the box with it if that was the last one in it.
 *
 * An empty box left behind is a control that constrains nothing and cannot be
 * got rid of — the bin is on the rows, not on the box.
 */
export function dropCondition(state: FilterState, id: string): FilterState {
  return {
    ...state,
    groups: state.groups
      .map(g => ({ ...g, rows: g.rows.filter(c => c.id !== id) }))
      .filter(g => g.rows.length > 0),
  };
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
  /*
    One token per box, its rows joined by the box's operator — `|` for or, `&`
    for and. Boxes are separate tokens, which the parser ANDs by default; a
    filter whose boxes are ORed says so with a leading `match:any`, because the
    default has to stay the one nobody has to write down.
  */
  if (state.groupOp === 'or' && liveGroups(state).length > 1) parts.push('match:any');
  for (const group of liveGroups(state)) {
    parts.push(group.rows.map(oneCondition).join(group.op === 'or' ? '|' : '&'));
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
  /* `|` and `&` join the rows of a box, so a value holding either has to be
     quoted or the string would split one condition into two. */
  if (!/[\s"\\|&]/.test(v)) return v;
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
  const groups: ConditionGroup[] = [];
  const words: string[] = [];
  let groupOp: 'and' | 'or' = 'and';

  for (const token of tokenise(input)) {
    if (token === 'match:any') { groupOp = 'or'; continue; }
    if (token === 'match:all') { groupOp = 'and'; continue; }

    /* Which separator a token uses tells us the box's operator. A token with
       neither is a box of one, whose operator is unobservable — `or`, so that
       the box's add button offers the alternative people reach for most. */
    const op: 'and' | 'or' = splitMembers(token, '&').length > 1 ? 'and' : 'or';
    const members = splitMembers(token, op === 'and' ? '&' : '|');

    const parsedMembers = members.map(parseToken);
    if (members.length > 1 && parsedMembers.every(m => m && 'op' in m)) {
      groups.push(newGroup(parsedMembers as Condition[], op));
      continue;
    }
    const parsed = members.length === 1 ? parsedMembers[0] : undefined;
    if (!parsed) { words.push(unquote(token)); continue; }
    if ('op' in parsed) groups.push(newGroup([parsed], 'or'));
    else terms.push(parsed);
  }

  return { terms, groups, groupOp, text: words.join(' ') };
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
 * Split a token on the separator that joins a box's rows, ignoring any inside
 * quotes.
 *
 * Written as a scan rather than a regex because the thing being skipped is a
 * quoted span with escapes in it, and a regex that got that subtly wrong would
 * fail on exactly the values people quote: the ones with punctuation.
 */
function splitMembers(token: string, sep: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (inQuotes && ch === '\\' && i + 1 < token.length) { current += ch + token[++i]; continue; }
    if (ch === '"') { inQuotes = !inQuotes; current += ch; continue; }
    if (ch === sep && !inQuotes) { out.push(current); current = ''; continue; }
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
  reqheaders: 'request headers',
  resheaders: 'response headers',
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
    ...allRows(state).filter(isUsable)
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

export const HAS_VALUES =
  ['reqheaders', 'resheaders', 'body', 'json', 'prescript', 'postscript', 'secret', 'response'] as const;

// ── Re-exported so callers need one import ──────────────────────────────────

export { resolveRange, withinRange };
