import { describe, it, expect, vi, afterEach } from 'vitest';
import { __test, installPasteBridge } from './paste-bridge';

vi.mock('../compare/read-clipboard', () => ({
  readClipboard: vi.fn(async () => ({ text: 'ledger-svc', source: 'host' as const })),
}));
vi.mock('../editor/monaco-instance', () => ({
  getMonacoEditorInstance: () => undefined,
}));

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

/*
  The dk8s pod search box pasted everything twice: the VS Code webview delivered
  its own `paste`, and the bridge inserted on top of it. Cancelling the keydown
  did not stop the host, so the bridge now lets the native path go first and
  only acts when nothing arrived.
*/
describe('one insert, never two', () => {
  let uninstall = () => {};
  const inserts: string[] = [];

  afterEach(() => {
    uninstall();
    uninstall = () => {};
    inserts.length = 0;
  });

  function armed() {
    inserts.length = 0;
    (document as unknown as { execCommand: unknown }).execCommand =
      (name: string, _ui: boolean, value: string) => {
        if (name === 'insertText') inserts.push(value);
        return true;
      };
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    uninstall = installPasteBridge();
    return field;
  }

  /** Past the bridge's grace window and the clipboard read behind it. */
  const settle = () => new Promise(r => setTimeout(r, 150));

  function ctrlV(field: HTMLElement) {
    field.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'v', ctrlKey: true, bubbles: true,
    }));
  }

  it('inserts when the clipboard was denied and no paste fired', async () => {
    const field = armed();
    ctrlV(field);
    await settle();

    expect(inserts).toEqual(['ledger-svc']);
    field.remove();
  });

  it('stands down when the host delivered a paste of its own', async () => {
    const field = armed();
    ctrlV(field);
    // What the webview does a moment later, and what nobody could cancel.
    field.dispatchEvent(new Event('paste', { bubbles: true }));
    await settle();

    expect(inserts).toEqual([]);
    field.remove();
  });

  it('leaves a keystroke that lands nowhere editable alone', async () => {
    armed();
    const plain = document.createElement('div');
    document.body.appendChild(plain);
    ctrlV(plain);
    await settle();

    expect(inserts).toEqual([]);
    plain.remove();
  });
});
