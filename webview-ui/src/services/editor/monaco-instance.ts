/**
 * The Monaco editor a DOM node belongs to.
 *
 * Extracted so the context menu and the Ctrl+V bridge share one copy. Both
 * need to turn "the element the caret is in" into "the editor to run an edit
 * on", and two copies of this walk would be two things to keep in step for no
 * reason.
 *
 * The match is deliberately loose about direction — `domNode === container`,
 * either containing the other — because Monaco's DOM node and the
 * `.monaco-editor` element found from a target are not always the same node,
 * depending on which part of the editor was under the cursor.
 */

/* Monaco is loaded as a global by the host page rather than imported, so its
   types are not available here. */
/* eslint-disable @typescript-eslint/no-explicit-any */

export function getMonacoEditorInstance(el: HTMLElement | null): any | null {
  const container = el?.closest?.('.monaco-editor');
  if (!container) return null;

  const monacoGlobal = (window as any).monaco?.editor;
  if (!monacoGlobal) return null;

  const editors = monacoGlobal.getEditors?.() || [];
  for (const editor of editors) {
    try {
      const domNode = editor.getDomNode();
      if (domNode && (domNode === container || domNode.contains(container) || container.contains(domNode))) {
        return editor;
      }
    } catch { /* an editor mid-dispose has no DOM node; skip it */ }
  }
  return null;
}
