/**
 * Opening a link, from inside a webview.
 *
 * **`window.open` does nothing here.** A VS Code webview is a sandboxed iframe
 * without `allow-popups`, so every "Open on github.com" written that way is a
 * button that silently does nothing in the shipped extension — and works
 * perfectly in the browser dev build, which is why nine of them shipped.
 *
 * The host has `vscode.env.openExternal`, which is the only thing that can
 * actually reach a browser from here. One function, so the next one cannot go
 * the other way by accident.
 */
import { postMsg } from '../../vscode';

/** Open a URL in the reader's own browser. */
export function openExternal(url: string): void {
  if (!url) return;
  postMsg({ type: 'openExternalUrl', url });
}
