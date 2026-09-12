/**
 * Is the user typing into something right now?
 *
 * ── The bug this exists to end ──
 *
 * Three places in this app register a **global** single-key shortcut —
 * `PodGrid`'s k9s-style `/`, the issue board's `j k o a l c /`, the wiki
 * tour's — and each wrote its own guard for "don't steal a key from somebody
 * who is typing". Two of them checked only `INPUT` and `TEXTAREA`.
 *
 * That is not enough in this app. dui's URL bars (`SelectTextInputView`,
 * `HighlightedInputView`) are `contenteditable` divs, and Monaco puts focus in
 * its own host. So once the dk8s tab had been opened — and every tab stays
 * mounted after you visit it — typing a URL anywhere in the app silently lost
 * every `/`:
 *
 *     https://jsonplaceholder.typicode.com/users/1
 *     https:jsonplaceholder.typicode.comusers1
 *
 * The character never reached the field: the listener called
 * `preventDefault()` from `window`, which is the last stop in the bubble path,
 * so nothing downstream could put it back. It cost a whole take of the demo
 * video before anyone noticed, and it is worse in the product than in the
 * recording — a user cannot see why their URL is wrong.
 *
 * One guard, used by all of them, and it knows about every kind of field this
 * app actually has.
 */

/** The elements that are a text field in their own right. */
const FIELDS = /^(INPUT|TEXTAREA|SELECT)$/;

/**
 * True when a keystroke belongs to whatever the user is editing.
 *
 * Pass the event's `target`. Covers:
 *
 * - `<input>`, `<textarea>`, `<select>`
 * - anything `contenteditable` — every dui URL bar, and the rich-text half of
 *   the markdown editor
 * - Monaco, whose focus sits in a hidden textarea *inside* `.monaco-editor`;
 *   the tag check catches that today, and the ancestor check keeps it caught if
 *   Monaco ever switches to its contenteditable input mode
 * - anything that opts in with `data-typing="true"`, for a widget that takes
 *   keystrokes without being a field
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (FIELDS.test(el.tagName)) return true;
  if (el.isContentEditable) return true;
  return !!el.closest('.monaco-editor, [contenteditable="true"], [data-typing="true"]');
}

/**
 * True when this key event should be left alone by a global shortcut.
 *
 * The modifier check is here too because it is the same decision: `Ctrl+K` is
 * somebody asking the app for something, `k` on its own inside a field is a
 * letter. A shortcut that wants modifiers should test for them itself.
 */
export function isPlainKeyInField(e: KeyboardEvent): boolean {
  return isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey;
}
