// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { escapeIsTaken } from './escape-owner';

const esc = (target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
  Object.defineProperty(e, 'target', { value: target });
  return e;
};

beforeEach(() => { document.body.innerHTML = ''; });

describe('escapeIsTaken', () => {
  it('leaves Escape to the screen when nothing is on top', () => {
    expect(escapeIsTaken(esc())).toBe(false);
  });

  it('gives it to an open right-click menu', () => {
    document.body.innerHTML = '<div class="fixed z-[9999] min-w-[240px]"></div>';
    expect(escapeIsTaken(esc())).toBe(true);
  });

  it('gives it to a dropdown, a dialog or a modal', () => {
    for (const html of ['<div class="dui_select__menu"></div>', '<div role="dialog"></div>', '<div class="dui_modal__body"></div>']) {
      document.body.innerHTML = html;
      expect(escapeIsTaken(esc())).toBe(true);
    }
  });

  it('is not held up by a toast', () => {
    document.body.innerHTML = '<div class="fixed bottom-4 right-4 z-[9999]"></div>';
    expect(escapeIsTaken(esc())).toBe(false);
  });

  it('leaves a field its own Escape', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(escapeIsTaken(esc(input))).toBe(true);
  });

  it('respects a handler that already took it', () => {
    const e = esc();
    e.preventDefault();
    expect(escapeIsTaken(e)).toBe(true);
  });
});
