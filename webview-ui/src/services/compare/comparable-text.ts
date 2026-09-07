import { comparableSourceFor } from './comparable-registry';

/**
 * What is under the right-click, and is it worth comparing?
 *
 * "Compare with clipboard" should appear wherever there is data — a response
 * body, a request body someone typed, a script, a docs draft — and nowhere
 * else. Deciding that from the DOM is fiddly and easy to get subtly wrong, so
 * the decision lives here as a pure function with tests, and the menu only
 * gathers the raw candidates.
 */

/**
 * Below this, the entry is noise.
 *
 * A right-click on a button label or a table cell would otherwise offer to
 * diff the word "Send" against the clipboard.
 */
export const MIN_COMPARE_CHARS = 12;

export interface ComparableCandidates {
  /** Text from a surface that registered itself — see `comparable-registry`. */
  registeredText?: string;
  /** What that surface calls itself. */
  registeredLabel?: string;
  /** Text the user has selected, anywhere. */
  selection?: string;
  /** The full document of a Monaco editor under the pointer. */
  editorValue?: string;
  /** The value of a native input or textarea under the pointer. */
  inputValue?: string;
  /** Text of the nearest element that opted in with `data-comparable`. */
  markedText?: string;
  /** What that element calls itself, for the diff pane's header. */
  markedLabel?: string;
}

export interface Comparable {
  text: string;
  label: string;
}

/**
 * The best thing to compare, or nothing.
 *
 * Order matters: a selection is an explicit choice and beats the document it
 * sits in. Everything else is "the data under the pointer", most specific
 * first.
 */
export function pickComparable(c: ComparableCandidates): Comparable | null {
  const selection = (c.selection ?? '').trim();
  if (selection.length >= MIN_COMPARE_CHARS) {
    return { text: selection, label: 'Selection' };
  }

  /* A registered surface knows its own contents exactly, where the DOM has
     only the lines a virtualising editor happened to render. */
  const registered = (c.registeredText ?? '').trim();
  if (registered.length >= MIN_COMPARE_CHARS) {
    return { text: c.registeredText!, label: c.registeredLabel || 'Content' };
  }

  const editor = (c.editorValue ?? '').trim();
  if (editor.length >= MIN_COMPARE_CHARS) {
    return { text: c.editorValue!, label: c.markedLabel || 'Editor' };
  }

  const input = (c.inputValue ?? '').trim();
  if (input.length >= MIN_COMPARE_CHARS) {
    return { text: c.inputValue!, label: c.markedLabel || 'Field' };
  }

  const marked = (c.markedText ?? '').trim();
  if (marked.length >= MIN_COMPARE_CHARS) {
    return { text: c.markedText!, label: c.markedLabel || 'Content' };
  }

  return null;
}

/**
 * The candidates visible from one DOM element.
 *
 * Kept separate from `pickComparable` so the choosing is testable without a
 * DOM, and so the menu can supply the Monaco value it already knows how to
 * read rather than this file learning about Monaco.
 */
export function candidatesFrom(
  target: HTMLElement | null,
  opts: { selection?: string; editorValue?: string } = {},
): ComparableCandidates {
  const registered = comparableSourceFor(target);
  const marked = target?.closest<HTMLElement>('[data-comparable]') ?? null;
  const field = target?.closest<HTMLInputElement | HTMLTextAreaElement>('input, textarea') ?? null;

  return {
    selection: opts.selection,
    registeredText: registered?.text,
    registeredLabel: registered?.label,
    editorValue: opts.editorValue,
    inputValue: field && field.type !== 'password' ? field.value : undefined,
    /* `innerText` respects layout — it skips hidden nodes and keeps the line
       breaks the user can see — but jsdom does not implement it, so fall back
       to textContent rather than reading undefined under test. */
    markedText: marked ? (marked.innerText ?? marked.textContent ?? undefined) : undefined,
    markedLabel: marked?.dataset.comparableLabel,
  };
}
