/**
 * Writing text into ConvEngineChat's composer.
 *
 * The library exposes no programmatic input API — no ref, no `initialText`, nothing on its
 * props. Its composer is a plain <textarea class="ce-composer-input"> rendered inside the
 * library's own React tree, so the only way in is the DOM.
 *
 * Assigning `.value` directly is NOT enough: React tracks the previous value on the node and
 * would swallow the change, leaving the library's state stale — the text would appear and then
 * vanish on the next keystroke, and Send would post an empty message. Going through the native
 * value setter and dispatching a bubbling `input` event is what makes React's onChange fire and
 * the library's state actually update.
 */

const COMPOSER_SELECTOR = '.ce-composer-input';

export function findComposer(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(COMPOSER_SELECTOR);
}

/**
 * Put `text` in the composer and focus it, leaving the caret at the end so the user can keep
 * typing. Returns false when the composer isn't mounted (e.g. the panel is still loading).
 *
 * @param mode 'replace' overwrites whatever is there; 'append' adds to it, which is what you
 *        want when inserting a second snippet rather than clobbering a half-written question.
 */
export function insertIntoComposer(text: string, mode: 'replace' | 'append' = 'replace'): boolean {
  const el = findComposer();
  if (!el || !text) return false;

  const next = mode === 'append' && el.value.trim()
    ? `${el.value.replace(/\s+$/, '')}\n\n${text}`
    : text;

  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(el, next);
  else el.value = next;                       // fallback; React may ignore it, hence the setter above
  el.dispatchEvent(new Event('input', { bubbles: true }));

  el.focus();
  el.setSelectionRange(next.length, next.length);
  // The composer auto-grows, so nudge it after the value lands.
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
  return true;
}
