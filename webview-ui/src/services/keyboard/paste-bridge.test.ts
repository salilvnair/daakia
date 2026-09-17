import { describe, it, expect } from 'vitest';
import { __test } from './paste-bridge';

const { isPasteCombo, editableTarget } = __test;

const key = (over: Partial<KeyboardEvent>) => ({
  key: 'v', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over,
} as KeyboardEvent);

function el(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe('which chord is a paste', () => {
  it('takes Ctrl+V and Cmd+V', () => {
    expect(isPasteCombo(key({ ctrlKey: true }))).toBe(true);
    expect(isPasteCombo(key({ metaKey: true }))).toBe(true);
    expect(isPasteCombo(key({ ctrlKey: true, key: 'V' }))).toBe(true);
  });

  it('leaves a bare v alone', () => {
    // Otherwise typing the letter would paste.
    expect(isPasteCombo(key({}))).toBe(false);
  });

  it('leaves the chords that mean something else alone', () => {
    // Ctrl+Shift+V is paste-without-formatting elsewhere, and Ctrl+Alt+V is
    // bound to other things in several editors. Neither is this.
    expect(isPasteCombo(key({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isPasteCombo(key({ ctrlKey: true, altKey: true }))).toBe(false);
  });

  it('leaves both modifiers at once alone', () => {
    // A different chord somebody may have bound to something of their own.
    expect(isPasteCombo(key({ ctrlKey: true, metaKey: true }))).toBe(false);
  });

  it('ignores every other key', () => {
    for (const k of ['c', 'x', 'a', 'Enter']) {
      expect(isPasteCombo(key({ ctrlKey: true, key: k }))).toBe(false);
    }
  });
});

describe('where a paste can land', () => {
  it('takes the three kinds of field', () => {
    expect(editableTarget(el('<input />'))).toBeTruthy();
    expect(editableTarget(el('<textarea></textarea>'))).toBeTruthy();
    const ce = el('<div contenteditable="true"></div>');
    expect(editableTarget(ce)).toBe(ce);
  });

  it('finds the contenteditable a target sits inside', () => {
    // The URL bar renders {{var}} tokens as spans, so the event target is
    // often a child of the editable rather than the editable itself.
    const host = el('<div contenteditable="true"><span>token</span></div>');
    document.body.appendChild(host);
    const span = host.querySelector('span')!;
    expect(editableTarget(span)).toBe(host);
    host.remove();
  });

  it('refuses a field that cannot be typed into', () => {
    // A read-only field that accepted a paste would be lying about being
    // read-only.
    const ro = el('<input readonly />');
    const off = el('<input disabled />');
    expect(editableTarget(ro)).toBeNull();
    expect(editableTarget(off)).toBeNull();
  });

  it('refuses anything that is not a field', () => {
    expect(editableTarget(el('<div>plain</div>'))).toBeNull();
    expect(editableTarget(null)).toBeNull();
  });
});
