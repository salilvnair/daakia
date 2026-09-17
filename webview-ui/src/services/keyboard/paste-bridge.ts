/**
 * Ctrl+V, in a webview that is not allowed to read the clipboard.
 *
 * ── The asymmetry ──
 *
 * Copy and Cut work everywhere and always did: they push text OUT, which needs
 * no permission. Paste pulls text IN, and a VS Code webview routinely denies
 * `clipboard-read` — so the browser never turns Ctrl+V into a `paste` event,
 * nothing fires, and the keystroke does nothing at all. Silently: no error, no
 * refusal, indistinguishable from an empty clipboard.
 *
 * Right-click → Paste worked the whole time, which is what made this confusing
 * to report. That menu does not use the clipboard API — it asks the extension
 * host, which has no such restriction. See `read-clipboard`.
 *
 * ── So the keystroke is given the same route ──
 *
 * This catches Ctrl+V (Cmd+V on a Mac) before anything else sees it, reads the
 * clipboard the way the menu does, and inserts the text at the caret. One
 * handler covers every field in the app — the URL bar, a JSON body, a script,
 * a header value — because they are all either a native field, a
 * contenteditable, or Monaco, and all three take an insert.
 *
 * ── Why it always preventDefaults ──
 *
 * Doing it only when the native path fails would mean waiting to find out,
 * and by then the keystroke is spent. Handling it unconditionally is also
 * correct where the native path DOES work — in a browser, running against the
 * local server — because `readClipboard` falls back to the browser API there
 * and inserts exactly what the native paste would have. What it must never do
 * is both, which is why the default is stopped in every branch.
 */
import { readClipboard } from '../compare/read-clipboard';
import { getMonacoEditorInstance } from '../editor/monaco-instance';

function isPasteCombo(e: KeyboardEvent): boolean {
  if (e.key !== 'v' && e.key !== 'V') return false;
  /* Ctrl on Windows and Linux, Cmd on a Mac — and never both, which is a
     different chord somebody may have bound to something else. */
  const chord = e.ctrlKey !== e.metaKey;
  /* Ctrl+Shift+V is "paste without formatting" elsewhere and Ctrl+Alt+V is a
     bound shortcut in several editors. Neither is this. */
  return chord && !e.shiftKey && !e.altKey;
}

/** The field the caret is actually in, if it is in one we can insert into. */
function editableTarget(target: EventTarget | null): HTMLElement | null {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return null;

  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    /* A field that cannot be typed into cannot be pasted into either. */
    const field = el as HTMLInputElement | HTMLTextAreaElement;
    return field.readOnly || field.disabled ? null : el;
  }
  if (el.isContentEditable) return el;
  return el.closest('[contenteditable="true"]') as HTMLElement | null;
}

async function paste(e: KeyboardEvent): Promise<void> {
  const target = e.target as HTMLElement | null;

  /*
    Monaco keeps its caret in a hidden textarea, so the plain insert would land
    there rather than in the document. It gets the edit the menu's own Paste
    gives it.
  */
  const editor = target?.closest?.('.monaco-editor')
    ? getMonacoEditorInstance(target)
    : undefined;

  if (editor) {
    e.preventDefault();
    const { text } = await readClipboard();
    const selection = editor.getSelection();
    if (text && selection) {
      editor.executeEdits('paste-bridge', [{ range: selection, text, forceMoveMarkers: true }]);
    }
    return;
  }

  const field = editableTarget(target);
  if (!field) return;

  e.preventDefault();
  const { text } = await readClipboard();
  if (!text) return;

  /*
    `insertText` rather than setting `.value`: it replaces the selection,
    leaves the caret after what it wrote, keeps the undo stack, and — the part
    that matters here — raises the `input` event that a React-controlled field
    listens for. Assigning `.value` does none of those.
  */
  field.focus();
  document.execCommand('insertText', false, text);
}

let installed = false;

/** Install the Ctrl+V bridge. Call once, beside the shortcut registry. */
export function installPasteBridge(): () => void {
  if (installed) return () => {};
  installed = true;

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isPasteCombo(e)) return;
    void paste(e);
  };

  /*
    Capture, for the same reason the context menu listens that way: Monaco
    binds Ctrl+V itself and would otherwise consume it first — and what
    Monaco does with it is the thing that does not work here.
  */
  window.addEventListener('keydown', onKeyDown, true);
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    installed = false;
  };
}

/** Exported for the tests — the combo rules are the fiddly half. */
export const __test = { isPasteCombo, editableTarget };
