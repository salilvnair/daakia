/**
 * Read the clipboard, from the one place that is allowed to.
 *
 * ── Why not just `navigator.clipboard.readText()` ──
 *
 * A VS Code webview frequently denies the `clipboard-read` permission, and it
 * has no way to prompt for it — the call rejects with `NotAllowedError` and
 * there is nothing the user can do about it from there. This codebase already
 * works around it once, in the editor's Paste action.
 *
 * The extension host has no such restriction: `vscode.env.clipboard.readText()`
 * is exactly this, and always works. So the host is asked first and the
 * browser API is the fallback, rather than the other way round.
 */
import { postMsg } from '../../vscode';

/** Long enough for a round trip to the host, short enough not to feel stuck. */
const TIMEOUT_MS = 1500;

let seq = 0;

export interface ClipboardRead {
  text: string;
  /** Where it came from, for a caller that wants to explain a failure. */
  source: 'host' | 'browser' | 'none';
}

/** Ask the extension host. Resolves to null if it does not answer in time. */
function fromHost(): Promise<string | null> {
  return new Promise(resolve => {
    const requestId = `clip-${++seq}-${Date.now()}`;
    let done = false;

    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', handler);
      clearTimeout(timer);
      resolve(value);
    };

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type !== 'clipboard:text' || msg.requestId !== requestId) return;
      finish(msg.failed ? null : String(msg.text ?? ''));
    };

    /* A host that has no handler for this never replies, which is the same
       thing as a refusal as far as the caller is concerned. */
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    window.addEventListener('message', handler);
    postMsg({ type: 'clipboard:read', requestId });
  });
}

export async function readClipboard(): Promise<ClipboardRead> {
  const hosted = await fromHost();
  if (hosted !== null) return { text: hosted, source: 'host' };

  try {
    return { text: await navigator.clipboard.readText(), source: 'browser' };
  } catch {
    return { text: '', source: 'none' };
  }
}
