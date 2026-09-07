/**
 * Open the diff view with one side taken from the page.
 *
 * ── Why the clipboard is still optional ──
 *
 * `readClipboard` asks the extension host first, which can always read it, and
 * falls back to the browser API. But in a plain browser build there is no host
 * and the browser API may be refused, so a refusal is still possible. When it
 * happens the honest thing is not to give up — the user asked to compare
 * something and is one Ctrl+V from the other half — so the modal opens either
 * way, with an empty focused pane to paste into.
 */
import { useCompareStore } from '../../store/compare-store';
import { useToastStore } from '../../store/toast-store';
import { readClipboard } from './read-clipboard';
import type { Comparable } from './comparable-text';

export async function openCompareWithClipboard(source: Comparable | null): Promise<void> {
  if (!source) return;

  const { text: clipboard, source: readFrom } = await readClipboard();
  const readable = readFrom !== 'none';

  /* The right pane is the clipboard's, whether or not we were allowed to read
     it — so it says so either way, and an unreadable clipboard leaves the pane
     focused and waiting for the Ctrl+V that will fill it. */
  useCompareStore.getState().openCompare({
    a: source.text,
    labelA: source.label,
    b: clipboard,
    labelB: 'Clipboard content',
    focusB: !clipboard,
  });

  if (!readable) {
    useToastStore.getState().addToast({
      type: 'info',
      message: 'Press Ctrl+V in the right pane — Daakia was not allowed to read the clipboard directly.',
    });
  } else if (!clipboard.trim()) {
    useToastStore.getState().addToast({
      type: 'info',
      message: 'The clipboard is empty — copy the other side, then press Ctrl+V in the right pane.',
    });
  }
}
