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
 * The conditions, as a tree of brackets.
 *
 * ── Why a tree, after two attempts that were not ──
 *
 * The first design stored a join on every row. That is flat: a list of
 * OR-brackets, ANDed. It could not say `(A and B) or C`.
 *
 * The second had two fixed levels: rows in a box shared one operator, and
 * boxes shared another. It could say `(A and B) or (C or D)`. It could not say
 * `A and (B or C)` *inside one box*, because a box had exactly one operator, so
 * the chip between B and C could only flip the whole box. Asking for `1 and
 * (2 or 3)` turned `1 and 2 and 3` into `1 or 2 or 3`.
 *
 * Both failures had the same shape: the reader pointed at one gap and the model
 * could only answer about a bigger unit. So the unit is now the gap. A group
 * holds conditions *and other groups*, and the chip between two neighbours
 * changes those two neighbours and nothing else (see `flipGap`). How deep it
 * goes is decided by what people click, not by a limit in here.
 */
export type Op = 'and' | 'or';

export interface ConditionGroup {
  /** Stable across edits, so React boxes keep their identity. */
  id: string;
  /** How the children of this group combine. */
  op: Op;
  children: ConditionNode[];
}

export type ConditionNode = Condition | ConditionGroup;

export function isGroup(node: ConditionNode): node is ConditionGroup {
  return 'children' in node;
}

let nextGroupId = 0;

export function newGroup(children: ConditionNode[] = [], op: Op = 'and'): ConditionGroup {
  return { id: `g${++nextGroupId}`, op, children };
}

const flip = (op: Op): Op => (op === 'and' ? 'or' : 'and');

// ── The whole state ─────────────────────────────────────────────────────────

export interface FilterState {
  terms: Term[];
  /**
   * The top bracket. Its children are what the panel draws as separate boxes,
   * and its `op` is the word between those boxes.
   */
  root: ConditionGroup;
  /** The free-text box. Searches method, URL, and both bodies. */
  text: string;
}

export const ROOT_ID = 'root';

export function emptyRoot(op: Op = 'and'): ConditionGroup {
  return { id: ROOT_ID, op, children: [] };
}

export const EMPTY: FilterState = { terms: [], root: emptyRoot(), text: '' };

/** Every row in the filter, in reading order. */
export function allRows(state: FilterState): Condition[] {
  const out: Condition[] = [];
  const walk = (n: ConditionNode) => { if (isGroup(n)) n.children.forEach(walk); else out.push(n); };
  walk(state.root);
  return out;
}

/**
 * The part of the tree that actually constrains anything.
 *
 * Half-typed rows match nothing yet, so they are cut, and a bracket left with
 * nothing in it goes with them — which matters most under `or`, where an empty
 * alternative would be trivially satisfied and quietly match the whole table.
 * A bracket left holding one thing is that thing: the parentheses round a
 * single clause say nothing.
 */
export function prune(node: ConditionNode): ConditionNode | undefined {
  if (!isGroup(node)) return isUsable(node) ? node : undefined;
  const children = node.children.map(prune).filter((c): c is ConditionNode => !!c);
  if (!children.length) return undefined;
  if (children.length === 1) return children[0];
  return { ...node, children };
}

export function liveTree(state: FilterState): ConditionNode | undefined {
  return prune(state.root);
}

export function isEmpty(state: FilterState): boolean {
  return state.terms.length === 0 && !liveTree(state) && state.text.trim() === '';
}

/** How many things a reader would say are switched on — the badge on the icon. */
export function activeCount(state: FilterState): number {
  return state.terms.length
    + allRows(state).filter(isUsable).length
    + (state.text.trim() ? 1 : 0);
}

/** How the filter reads out loud: `1 and (2 or 3)`. */
export function describeStructure(state: FilterState): string {
  const tree = liveTree(state);
  if (!tree) return '';
  let n = 0;
  const say = (node: ConditionNode, top: boolean): string => {
    if (!isGroup(node)) return `${++n}`;
    const inner = node.children.map(c => say(c, false)).join(` ${node.op} `);
    return top ? inner : `(${inner})`;
  };
  return say(tree, true);
}

// ── Walking the tree ────────────────────────────────────────────────────────

function mapGroups(node: ConditionGroup, fn: (g: ConditionGroup) => ConditionGroup): ConditionGroup {
  const children = node.children.map(c => (isGroup(c) ? mapGroups(c, fn) : c));
  return fn({ ...node, children });
}

/** The group directly holding `id`, and where in it. */
function parentOf(root: ConditionGroup, id: string): { parent: ConditionGroup; index: number } | undefined {
  const i = root.children.findIndex(c => c.id === id);
  if (i >= 0) return { parent: root, index: i };
  for (const c of root.children) {
    if (isGroup(c)) {
      const hit = parentOf(c, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

function findGroup(root: ConditionGroup, id: string): ConditionGroup | undefined {
  if (root.id === id) return root;
  for (const c of root.children) {
    if (isGroup(c)) {
      const hit = findGroup(c, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Tidy the tree after a change: drop empty brackets, and replace any bracket
 * holding a single thing with that thing. The root is never replaced, only
 * emptied.
 *
 * Unlike `prune` this keeps half-typed rows — the panel has to keep drawing
 * a row somebody is still typing into.
 */
function normalise(root: ConditionGroup): ConditionGroup {
  const tidy = (node: ConditionGroup): ConditionNode[] => {
    const children: ConditionNode[] = [];
    for (const c of node.children) {
      if (!isGroup(c)) { children.push(c); continue; }
      const inner = tidy(c);
      if (inner.length === 0) continue;
      if (inner.length === 1) { children.push(inner[0]); continue; }
      children.push({ ...c, children: inner });
    }
    return children;
  };
  return { ...root, children: tidy(root) };
}

function withRoot(state: FilterState, root: ConditionGroup): FilterState {
  return { ...state, root: normalise(root) };
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
  const swap = (g: ConditionGroup) => ({
    ...g, children: g.children.map(c => (!isGroup(c) && c.id === next.id ? next : c)),
  });
  return { ...state, root: mapGroups(state.root, swap) };
}

/** A new row of its own at the top level — what the main add button makes. */
export function addCondition(state: FilterState, field?: ConditionField): FilterState {
  return { ...state, root: { ...state.root, children: [...state.root.children, newCondition(field)] } };
}

/** A new row at the end of an existing group, which takes `op` if given. */
export function addToGroup(
  state: FilterState, groupId: string, field?: ConditionField, op?: Op,
): FilterState {
  const add = (g: ConditionGroup) => (g.id === groupId
    ? { ...g, op: op ?? g.op, children: [...g.children, newCondition(field)] }
    : g);
  return { ...state, root: mapGroups(state.root, add) };
}

/**
 * A new row at the end of a group, joined to the last one by `op`.
 *
 * With the group's own word it simply joins the group. With the other word it
 * joins only the last row — `(A or B)` plus `+ and` gives `(A or (B and C))` —
 * which is the same thing clicking the chip in that gap would do, so the add
 * buttons and the chips can never disagree about what a gap means. It is
 * literally `flipGap` on the new gap.
 */
export function addJoined(
  state: FilterState, groupId: string, field: ConditionField, op: Op,
): FilterState {
  const group = findGroup(state.root, groupId);
  if (!group) return state;
  if (op === group.op || group.children.length < 2) return addToGroup(state, groupId, field, op);
  const fresh = newCondition(field);
  const withRow: FilterState = {
    ...state,
    root: mapGroups(state.root, g => (g.id === groupId ? { ...g, children: [...g.children, fresh] } : g)),
  };
  const last = group.children[group.children.length - 1];
  return flipGap(withRow, groupId, last.id, fresh.id);
}

/**
 * A new row joined to one row that has no box of its own yet.
 *
 * A lone row at the top level is drawn as a box of one, and its `+ and` /
 * `+ or` buttons mean "make this a box of two". So the row and its new
 * neighbour are wrapped together, rather than the new row landing at the top
 * level under whatever the top-level word happens to be.
 */
export function wrapWith(state: FilterState, conditionId: string, field: ConditionField, op: Op): FilterState {
  const at = parentOf(state.root, conditionId);
  if (!at) return state;
  const target = at.parent.children[at.index];
  const box = newGroup([target, newCondition(field)], op);
  const wrap = (g: ConditionGroup) => (g.id === at.parent.id
    ? { ...g, children: g.children.map((c, i) => (i === at.index ? box : c)) }
    : g);
  return withRoot(state, mapGroups(state.root, wrap));
}

/**
 * Set a group's operator.
 *
 * A bracket nested *inside* a box that ends up with the same word as the box
 * around it is dissolved into it: `1 and (2 and 3)` is `1 and 2 and 3`, and
 * leaving the inner brackets on screen would suggest they mean something. That
 * is what makes clicking the chip inside a bracket an undo. Top-level boxes
 * are left alone — they are yours, and a box you built should not vanish
 * because it happens to agree with the word between the boxes.
 */
export function setGroupOp(state: FilterState, groupId: string, op: Op): FilterState {
  let root = mapGroups(state.root, g => (g.id === groupId ? { ...g, op } : g));
  const at = parentOf(root, groupId);
  if (at && at.parent.id !== ROOT_ID && at.parent.op === op) {
    const inner = findGroup(root, groupId)!;
    root = mapGroups(root, g => (g.id === at.parent.id
      ? { ...g, children: g.children.flatMap((c, i) => (i === at.index ? inner.children : [c])) }
      : g));
  }
  return withRoot(state, root);
}

/**
 * Flip the gap between two neighbours — and only that gap.
 *
 * - If the group holds exactly those two, the gap *is* the group's operator,
 *   so the group flips.
 * - Otherwise the two are pulled into a bracket of their own with the other
 *   word: `1 and 2 and 3`, gap 2–3 → `1 and (2 or 3)`.
 * - If one side is already a bracket with that word, the other joins it rather
 *   than nesting a bracket in a bracket: `1 and (2 or 3) and 4`, gap
 *   (2 or 3)–4 → `1 and (2 or 3 or 4)`.
 *
 * If the two are not adjacent in the real tree — which happens when a tab
 * hides some rows — the only honest reading is the group's operator, so that
 * flips instead.
 */
export function flipGap(state: FilterState, groupId: string, leftId: string, rightId: string): FilterState {
  const group = findGroup(state.root, groupId);
  if (!group) return state;
  const i = group.children.findIndex(c => c.id === leftId);
  const j = group.children.findIndex(c => c.id === rightId);
  if (i < 0 || j !== i + 1 || group.children.length === 2) {
    return setGroupOp(state, groupId, flip(group.op));
  }

  const target = flip(group.op);
  const left = group.children[i];
  const right = group.children[j];
  let merged: ConditionNode[];
  if (isGroup(left) && left.op === target) {
    merged = [{ ...left, children: [...left.children, right] }];
  } else if (isGroup(right) && right.op === target) {
    merged = [{ ...right, children: [left, ...right.children] }];
  } else {
    merged = [newGroup([left, right], target)];
  }

  const next = (g: ConditionGroup) => (g.id === groupId
    ? { ...g, children: [...g.children.slice(0, i), ...merged, ...g.children.slice(j + 1)] }
    : g);
  return withRoot(state, mapGroups(state.root, next));
}

/** Remove one row; brackets it leaves empty or single go with it. */
export function dropCondition(state: FilterState, id: string): FilterState {
  const drop = (g: ConditionGroup) => ({ ...g, children: g.children.filter(c => c.id !== id) });
  return withRoot(state, mapGroups(state.root, drop));
}

/** Everything off, but the free text and the top-level word kept. */
export function clearConditions(state: FilterState): FilterState {
  return { ...state, terms: [], root: emptyRoot(state.root.op) };
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
    The conditions as expressions: `&` for and, `|` for or, brackets for
    nesting. Each top-level box is its own space-separated token, and the
    parser ANDs tokens by default — so a filter whose boxes are ORed says so
    with a leading `match:any`, because the default has to stay the one nobody
    has to write down.
  */
  const tree = liveTree(state);
  if (tree) {
    const top = isGroup(tree) ? tree : undefined;
    if (top && top.op === 'or' && top.id === ROOT_ID) parts.push('match:any');
    const tokens = top && top.id === ROOT_ID
      ? top.children.map(c => expression(c, false))
      : [expression(tree, false)];
    parts.push(...tokens);
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
function expression(node: ConditionNode, nested: boolean): string {
  if (!isGroup(node)) return oneCondition(node);
  const inner = node.children.map(c => expression(c, true)).join(node.op === 'and' ? '&' : '|');
  return nested ? `(${inner})` : inner;
}

function oneCondition(c: Condition): string {
  const head = `${c.negated ? '-' : ''}${c.field}:${c.key}:${c.op}`;
  return NULLARY.has(c.op) ? head : `${head}:${quote(c.value)}`;
}

function quote(v: string): string {
  /* `|`, `&` and brackets are the grammar between conditions, so a value
     holding any of them has to be quoted or one condition would come back as
     several. */
  if (!/[\s"\\|&()]/.test(v)) return v;
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
  const children: ConditionNode[] = [];
  const words: string[] = [];
  let rootOp: Op = 'and';

  for (const token of tokenise(input)) {
    if (token === 'match:any') { rootOp = 'or'; continue; }
    if (token === 'match:all') { rootOp = 'and'; continue; }

    /*
      The expression reader goes first. `parseToken` would happily read
      `body:text:contains:x|body:text:contains:y` as one condition whose value
      is everything after the third colon, separators included — so a bracket
      has to be recognised before anything tries to read the token whole.
    */
    const node = parseExpression(token);
    if (node) { children.push(node); continue; }

    /* A token with a bare `&`, `|` or bracket that did not parse as an
       expression is malformed, not one condition with punctuation in its
       value — reading it that way would be the silent misreading the refusal
       above exists to prevent. It stays visible as search text instead. */
    const single = hasBareGrammar(token) ? undefined : parseToken(token);
    if (single && !('op' in single)) { terms.push(single); continue; }
    if (single) { children.push(single); continue; }
    words.push(unquote(token));
  }

  return { terms, root: normalise({ id: ROOT_ID, op: rootOp, children }), text: words.join(' ') };
}

/** Does the token hold `&`, `|` or a bracket outside quotes? */
function hasBareGrammar(token: string): boolean {
  let quoted = false;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (quoted && ch === '\\') { i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && '&|()'.includes(ch)) return true;
  }
  return false;
}

/**
 * One token of `&`, `|` and brackets, back into a tree.
 *
 * Mixing `&` and `|` at one level without brackets is refused rather than
 * given a precedence: the formatter never writes it, and a guessed precedence
 * is exactly the kind of silent misreading this string exists to avoid.
 */
function parseExpression(src: string): ConditionNode | undefined {
  let i = 0;

  const atom = (): string => {
    let out = '';
    let quoted = false;
    while (i < src.length) {
      const ch = src[i];
      if (quoted && ch === '\\' && i + 1 < src.length) { out += ch + src[i + 1]; i += 2; continue; }
      if (ch === '"') { quoted = !quoted; out += ch; i++; continue; }
      if (!quoted && (ch === '&' || ch === '|' || ch === '(' || ch === ')')) break;
      out += ch;
      i++;
    }
    return out;
  };

  const sequence = (): ConditionNode | undefined => {
    const items: ConditionNode[] = [];
    let op: Op | undefined;
    for (;;) {
      let node: ConditionNode | undefined;
      if (src[i] === '(') {
        i++;
        node = sequence();
        if (src[i] !== ')') return undefined;
        i++;
      } else {
        const text = atom();
        const parsed = text ? parseToken(text) : undefined;
        if (!parsed || !('op' in parsed)) return undefined;
        node = parsed;
      }
      if (!node) return undefined;
      items.push(node);
      const ch = src[i];
      if (ch === '&' || ch === '|') {
        const next: Op = ch === '&' ? 'and' : 'or';
        if (op && op !== next) return undefined;
        op = next;
        i++;
        continue;
      }
      break;
    }
    return items.length === 1 ? items[0] : newGroup(items, op ?? 'and');
  };

  const node = sequence();
  return node && i === src.length ? node : undefined;
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
