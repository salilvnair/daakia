/**
 * What `{{` should offer, wherever somebody types it.
 *
 * ── Why this exists ──
 *
 * Daakia resolves `{{bearer-token}}` in every value field, and — since the
 * template engine reached the request path — `{{randomInt 1 100}}` and
 * `{{$randomUUID}}` too. None of it was discoverable. Sixty dynamic variables
 * and forty helpers are worth about as much as none if the only way to find
 * one is to already know its name, and the environment variables were no
 * better: you had to remember what you had called them.
 *
 * So `{{` offers all of it, in one list, in the same place: the URL bar, a
 * header value, a query param, an auth field, the body, a script.
 *
 * ── The ordering ──
 *
 * Your own variables first. They are the ones somebody is reaching for
 * ninety-nine times in a hundred, and a list that opens with `{{$randomHexColor}}`
 * above the environment's own `{{base-url}}` is a list nobody trusts twice.
 */

export type SuggestKind = 'variable' | 'secret' | 'dynamic' | 'helper';

export interface VarSuggestion {
  /** What the reader sees and filters on. */
  label: string;
  /** What is written into the field, between the braces. */
  insert: string;
  /** The right-hand note — a value, a signature, a description. */
  detail: string;
  kind: SuggestKind;
  /** The heading this sits under. */
  group: string;
  /**
   * Where the caret should end up inside the inserted text, from its start.
   *
   * A helper with arguments is only half-written when it is inserted, and
   * dropping the caret after the closing brace means deleting your way back
   * into it. `undefined` means the end, which is right for a plain variable.
   */
  caret?: number;
}

export interface VarSources {
  /** Active environment, then Global — name and current value. */
  env: { key: string; value: string; isSecret?: boolean }[];
  /** The collection's own variables, if the request is in one. */
  collection: { key: string; value: string }[];
  /** `$`-prefixed dynamic values, as the host describes them. */
  dynamic: { name: string; description: string; category: string; example?: string }[];
  /** Template helpers, from the catalogue the host and webview share. */
  helpers: { name: string; signature: string; summary: string; category: string }[];
}

export const EMPTY_SOURCES: VarSources = { env: [], collection: [], dynamic: [], helpers: [] };

/**
 * The `{{` the caret is sitting inside, if it is sitting inside one.
 *
 * Returns where the braces start and what has been typed since. A `}}` between
 * the braces and the caret means that one is finished and this is not it.
 */
export function openBraces(textBeforeCaret: string): { start: number; query: string } | null {
  const start = textBeforeCaret.lastIndexOf('{{');
  if (start === -1) return null;
  const inside = textBeforeCaret.slice(start + 2);
  if (inside.includes('}}')) return null;
  /*
    A newline ends it. Somebody who typed `{{` on one line and pressed Enter
    has moved on; keeping the list open over a whole JSON body would make
    every subsequent keystroke look like a filter.
  */
  if (inside.includes('\n')) return null;
  return { start, query: inside };
}

/** Does the text right after the caret already close the braces? */
export function closesAlready(textAfterCaret: string): boolean {
  return /^\s*\}\}/.test(textAfterCaret);
}

function score(label: string, query: string): number {
  if (!query) return 0;
  const l = label.toLowerCase();
  const i = l.indexOf(query);
  if (i === 0) return 0;      // starts with it
  if (i > 0) return 1;        // contains it
  return subsequence(l, query) ? 2 : -1;  // rIn → randomInt
}

/** Every character of `q`, in order, somewhere in `s`. */
function subsequence(s: string, q: string): boolean {
  let i = 0;
  for (const ch of s) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

/** A secret's value is never shown, only the fact that it is one. */
function envDetail(v: { value: string; isSecret?: boolean }): string {
  if (v.isSecret) return 'secret';
  if (!v.value) return 'empty';
  return v.value.length > 48 ? `${v.value.slice(0, 45)}…` : v.value;
}

export function suggestionsFor(query: string, sources: VarSources, limit = 50): VarSuggestion[] {
  const q = query.trim().toLowerCase();

  const all: VarSuggestion[] = [
    ...sources.collection.map(v => ({
      label: v.key,
      insert: v.key,
      detail: envDetail(v),
      kind: 'variable' as const,
      group: 'Collection',
    })),
    ...sources.env.map(v => ({
      label: v.key,
      insert: v.key,
      detail: envDetail(v),
      kind: (v.isSecret ? 'secret' : 'variable') as SuggestKind,
      group: 'Environment',
    })),
    ...sources.dynamic.map(v => ({
      label: `$${v.name}`,
      insert: `$${v.name}`,
      detail: v.description,
      kind: 'dynamic' as const,
      group: 'Dynamic values',
    })),
    ...sources.helpers.map(h => ({
      label: h.name,
      insert: helperInsert(h),
      detail: h.summary,
      kind: 'helper' as const,
      group: 'Helpers',
      caret: h.name.length + (takesArguments(h) ? 1 : 0),
    })),
  ];

  const ranked = all
    .map(s => ({ s, rank: score(s.label, q) }))
    .filter(x => x.rank >= 0);

  /*
    A stable sort by rank alone, so within one rank the declaration order
    above survives — which is what puts your own variables above the sixty
    built-in ones when a query matches both equally well.
  */
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.slice(0, limit).map(x => x.s);
}

function takesArguments(h: { name: string; signature: string }): boolean {
  return h.signature.trim() !== h.name;
}

/**
 * A helper is inserted with its name and a space, not its whole signature.
 *
 * Writing `randomInt min max` into the field and expecting somebody to
 * overtype the words is how snippet placeholders work in an editor that has
 * them; a header value field does not, so the arguments would be left there
 * and sent. The signature stays visible in the list instead.
 */
function helperInsert(h: { name: string; signature: string }): string {
  return takesArguments(h) ? `${h.name} ` : h.name;
}

/**
 * Put a suggestion into a value, replacing whatever was typed after the `{{`.
 *
 * Returns the whole new value and where the caret goes, because a caret left
 * at the end of the line after an insertion in the middle of a URL is the
 * kind of small wrongness that makes a feature feel unfinished.
 */
export function applySuggestion(
  value: string, caret: number, suggestion: VarSuggestion,
): { value: string; caret: number } {
  const before = value.slice(0, caret);
  const after = value.slice(caret);
  const open = openBraces(before);
  if (!open) return { value, caret };

  const head = value.slice(0, open.start);
  const closing = closesAlready(after) ? '' : '}}';
  const tail = after;

  const inserted = `{{${suggestion.insert}${closing}`;
  const caretAt = head.length + 2 + (suggestion.caret ?? suggestion.insert.length);

  return { value: `${head}${inserted}${tail}`, caret: caretAt };
}
