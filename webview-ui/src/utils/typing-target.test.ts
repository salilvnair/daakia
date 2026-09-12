/**
 * A global shortcut must never eat a character somebody typed.
 *
 * The bug: `PodGrid`'s k9s-style `/` listener sits on `window` and guarded only
 * `INPUT|TEXTAREA`. dui's URL bars are `contenteditable` divs, and every tab in
 * this app stays mounted after you visit it — so once dk8s had been opened,
 * typing a URL anywhere lost every slash:
 *
 *     https://jsonplaceholder.typicode.com/users/1  ->  https:jsonplaceholder…com…1
 *
 * `window` is the last stop in the bubble path, so nothing downstream could
 * undo the `preventDefault()`, and the character simply never arrived.
 */
import { describe, it, expect } from 'vitest';
import { isPlainKeyInField, isTypingTarget } from './typing-target';

/** A detached element is enough — the guard only reads tags and ancestors. */
function el(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe('isTypingTarget', () => {
  it('knows the three field tags', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isTypingTarget(el(`<${tag}></${tag}>`))).toBe(true);
    }
  });

  it('knows a contenteditable — which is what every dui URL bar is', () => {
    const bar = el('<div contenteditable="true" class="dui_select-text__editor"></div>');
    expect(isTypingTarget(bar)).toBe(true);
  });

  it('knows the inside of a Monaco editor', () => {
    const host = el('<div class="monaco-editor"><div class="inner"><textarea></textarea></div></div>');
    expect(isTypingTarget(host.querySelector('.inner'))).toBe(true);
  });

  it('knows an element that opted in', () => {
    expect(isTypingTarget(el('<div data-typing="true"></div>'))).toBe(true);
  });

  it('says no to the page itself, so shortcuts still work', () => {
    expect(isTypingTarget(el('<div class="board"></div>'))).toBe(false);
    expect(isTypingTarget(el('<button>Send</button>'))).toBe(false);
  });

  it('survives a target that is not an element', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(document as unknown as EventTarget)).toBe(false);
  });

  it('does not treat contenteditable="false" as a field', () => {
    expect(isTypingTarget(el('<div contenteditable="false"></div>'))).toBe(false);
  });
});

describe('isPlainKeyInField', () => {
  const press = (key: string, target: EventTarget | null, mods: Partial<KeyboardEvent> = {}) =>
    ({ key, target, metaKey: false, ctrlKey: false, altKey: false, ...mods }) as unknown as KeyboardEvent;

  it('leaves a slash alone inside a URL bar — the actual bug', () => {
    const bar = el('<div contenteditable="true" class="dui_select-text__editor"></div>');
    expect(isPlainKeyInField(press('/', bar))).toBe(true);
  });

  it('lets a bare slash through on the page, so `/` still focuses the filter', () => {
    expect(isPlainKeyInField(press('/', el('<div></div>')))).toBe(false);
  });

  it('leaves every letter the issue board binds alone inside a field', () => {
    const bar = el('<div contenteditable="true"></div>');
    for (const key of ['j', 'k', 'o', 'a', 'l', 'c', 'm', 'g', 'f', '/']) {
      expect(isPlainKeyInField(press(key, bar))).toBe(true);
    }
  });

  it('treats a modifier combination as the app being addressed, not typing', () => {
    expect(isPlainKeyInField(press('k', el('<div></div>'), { ctrlKey: true }))).toBe(true);
    expect(isPlainKeyInField(press('k', el('<div></div>'), { metaKey: true }))).toBe(true);
  });
});
