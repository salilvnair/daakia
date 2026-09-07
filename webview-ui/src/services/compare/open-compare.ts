/**
 * Open the diff view with one side taken from the page.
 *
 * ── Why the clipboard is optional ──
 *
 * `navigator.clipboard.readText()` is not always allowed to run: it needs the
 * document focused, a real user gesture, and a permission the host may simply
 * refuse. When it is refused the honest thing is not to give up — the user
 * asked to compare something, and they are one Ctrl+V away from the other
 * half. So the modal opens either way, with the clipboard pre-filled when it
 * can be read and an empty pane to paste into when it cannot.
 */
import { useCompareStore } from '../../store/compare-store';
import { useToastStore } from '../../store/toast-store';
import type { Comparable } from './comparable-text';

export async function openCompareWithClipboard(source: Comparable | null): Promise<void> {
  if (!source) return;

  let clipboard = '';
  let readable = true;
  try {
    clipboard = await navigator.clipboard.readText();
  } catch {
    readable = false;
  }

  useCompareStore.getState().openCompare({
    a: source.text,
    labelA: source.label,
    b: clipboard,
    labelB: clipboard ? 'Clipboard' : 'Paste here',
  });

  if (!readable) {
    useToastStore.getState().addToast({
      type: 'info',
      message: 'Paste the other side into the right pane — the clipboard could not be read directly.',
    });
  } else if (!clipboard.trim()) {
    useToastStore.getState().addToast({
      type: 'info',
      message: 'The clipboard is empty — paste or type the other side into the right pane.',
    });
  }
}
