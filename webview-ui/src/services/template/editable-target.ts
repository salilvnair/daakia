/**
 * Reading and writing whatever field the reader is actually typing in.
 *
 * ── Why one global listener instead of a prop on every input ──
 *
 * "Everywhere" means the URL bar, header values, query params, auth fields,
 * form rows, the body, and a dozen one-off text fields across eleven
 * protocols — several of them inside DUI components this repo does not own.
 * Threading a suggestion prop through all of that would reach most of them
 * eventually and quietly miss the rest, and the ones it missed would be
 * indistinguishable from the feature not working.
 *
 * So the popup listens on `document` and works out the field from the event,
 * which is the same approach the right-click menu already takes here. A field
 * has to opt OUT (`data-no-var-suggest`), not in.
 *
 * ── Writing back through React ──
 *
 * Assigning `el.value` on a controlled input updates the DOM and not React,
 * so the next render puts the old value back. The native setter plus a
 * dispatched `input` event is what makes React see it as typing.
 */

export type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const TEXTY_INPUT = /^(text|search|url|email|tel|password|number|)$/i;

/** The field this event happened in, if it is one we should complete in. */
export function editableFrom(target: EventTarget | null): Editable | null {
  const el = target as HTMLElement | null;
  if (!el || !el.closest) return null;
  if (el.closest('[data-no-var-suggest]')) return null;

  if (el instanceof HTMLInputElement) {
    return TEXTY_INPUT.test(el.type) && !el.readOnly && !el.disabled ? el : null;
  }
  if (el instanceof HTMLTextAreaElement) {
    return !el.readOnly && !el.disabled ? el : null;
  }
  /*
    Monaco renders its own hidden textarea and draws the text itself, so a
    popup positioned over the field would sit in the wrong place and fight
    Monaco's own completion widget. Monaco gets a real completion provider
    instead — see monaco-var-completions.ts.
  */
  if (el.closest('.monaco-editor')) return null;
  if (el.isContentEditable) return el;
  return null;
}

/** The text and caret of a field, however it stores them. */
export function readEditable(el: Editable): { value: string; caret: number } | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return { value: el.value, caret: el.selectionStart ?? el.value.length };
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const before = range.cloneRange();
  before.selectNodeContents(el);
  before.setEnd(range.endContainer, range.endOffset);
  return { value: el.innerText.replace(/\r/g, ''), caret: before.toString().length };
}

/**
 * Replace the whole value and put the caret somewhere in it.
 *
 * The contenteditable path goes through `execCommand('insertText')` rather
 * than writing `innerText`: the DUI URL bars repaint their own HTML on every
 * input event and keep their own undo stack, and a direct DOM write would
 * bypass both — the value would look right and the component would not know
 * it had changed.
 */
export function writeEditable(el: Editable, value: string, caret: number): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement : HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.setSelectionRange(caret, caret);
    return;
  }

  el.focus();
  selectAll(el);
  document.execCommand('insertText', false, value);
  setCaret(el, caret);
}

function selectAll(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Walk the text nodes to put the caret at an offset in the rendered text. */
export function setCaret(el: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.data.length;
    if (seen + len >= offset) {
      const range = document.createRange();
      range.setStart(node, Math.max(0, offset - seen));
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
    seen += len;
    node = walker.nextNode() as Text | null;
  }
  selectAll(el);
  window.getSelection()?.collapseToEnd();
}
