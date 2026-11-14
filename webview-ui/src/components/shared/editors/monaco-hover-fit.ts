/**
 * Keeps Monaco's tooltips inside what clips the editor.
 *
 * Monaco mounts a tooltip (the find widget's "Close (Escape)", a toolbar
 * button's name) inside the editor's own container, but keeps it on screen by
 * measuring against the *window*. In VS Code those are the same box. Here the
 * editor sits in a column with `overflow: hidden` that ends where the sidebar
 * begins, so a tooltip near the right edge was laid out past the column and
 * cut off by it.
 *
 * Monaco offers no option for the container (standalone takes it from the
 * editor itself), so this shifts a tooltip back inside the clipping box
 * after Monaco has placed it, in the same frame, before it is painted.
 */

interface MountedEditor {
  getContainerDomNode(): HTMLElement;
  onDidDispose(listener: () => void): unknown;
}

const GAP = 4;

/** The visible box once every clipping ancestor of `el` has had its say. */
export function clipBox(el: HTMLElement): { left: number; right: number } {
  let left = 0;
  let right = window.innerWidth;
  for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
    if (getComputedStyle(a).overflowX === 'visible') continue;
    const r = a.getBoundingClientRect();
    left = Math.max(left, r.left);
    right = Math.min(right, r.right);
  }
  return { left, right };
}

/** How far to move a box of [left, right] so it sits inside `clip`, `GAP` from its edges. */
export function shiftInto(box: { left: number; right: number }, clip: { left: number; right: number }): number {
  if (box.right > clip.right - GAP) {
    const dx = clip.right - GAP - box.right;
    /* Wider than the space: line its left edge up instead, so the start of the text shows. */
    return box.left + dx < clip.left + GAP ? clip.left + GAP - box.left : dx;
  }
  if (box.left < clip.left + GAP) return clip.left + GAP - box.left;
  return 0;
}

export function keepHoversInView(editor: MountedEditor): void {
  const root = editor.getContainerDomNode();
  let frame = 0;

  const fit = () => {
    frame = 0;
    for (const view of root.querySelectorAll<HTMLElement>('.context-view')) {
      if (!view.querySelector('.workbench-hover-container')) continue;
      const r = view.getBoundingClientRect();
      if (!r.width) continue;
      const dx = shiftInto(r, clipBox(view));
      /* dx is in screen pixels; `left` is in the view's own, which Settings →
         Appearance may have zoomed. */
      const zoom = (view as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;
      if (dx) view.style.left = `${(parseFloat(view.style.left) || 0) + dx / zoom}px`;
    }
  };

  /* Typing changes the editor's DOM constantly; only a change inside a
     context view — a tooltip arriving — is worth a look. */
  const observer = new MutationObserver(records => {
    if (frame) return;
    if (records.some(rec => (rec.target as Element).closest?.('.context-view'))) {
      frame = requestAnimationFrame(fit);
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  editor.onDidDispose(() => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  });
}
