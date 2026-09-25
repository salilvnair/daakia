/**
 * Copying text from a webview is not one API call.
 *
 * `navigator.clipboard.writeText` is a promise, and inside a VS Code webview it
 * rejects more often than it looks: the async clipboard needs the document to be
 * focused, and a click that lands while focus still belongs to the editor, a
 * panel that was just revealed, or the host window itself throws
 * `NotAllowedError: Document is not focused`. Callers that ignored the promise
 * showed "Copied!" anyway, so the button lied — nothing was on the clipboard.
 *
 * `document.execCommand('copy')` is deprecated but synchronous, and runs inside
 * the click's own user gesture, so it still works where the promise API refuses.
 * Try the modern one, fall back to it, and tell the caller which happened.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the synchronous path below.
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    // Off-screen but still focusable: `display: none` cannot be selected.
    field.style.position = 'fixed';
    field.style.top = '0';
    field.style.left = '-9999px';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}
