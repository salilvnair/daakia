/**
 * Which surfaces have data worth comparing, and how to read it.
 *
 * ── Why a registry rather than the DOM ──
 *
 * The obvious way to read an editor's contents from a context menu is
 * `monaco.editor.getEditors()`. It does not work here: `window.monaco` is a
 * different copy of the module from the one the editor component bundles, so
 * that call returns an empty list and every editor is invisible to it. Reading
 * the DOM instead gives you only the lines Monaco has rendered, because it
 * virtualises — fine for a menu label, useless for a diff.
 *
 * So the surface that owns the text says so. It already has the value in
 * React state; it registers its container and a getter, and the menu walks up
 * from whatever was right-clicked to find the nearest one.
 */
import { useEffect, type RefObject } from 'react';

interface Source {
  label: string;
  getText: () => string;
}

const sources = new Map<HTMLElement, Source>();

/** Register a container. Returns the un-register. */
export function registerComparable(el: HTMLElement, source: Source): () => void {
  sources.set(el, source);
  return () => { sources.delete(el); };
}

/**
 * The nearest registered source at or above this element.
 *
 * Nearest wins: an editor inside a panel that also registered should answer
 * for its own contents, not the panel's.
 */
export function comparableSourceFor(target: HTMLElement | null): { label: string; text: string } | null {
  for (let el: HTMLElement | null = target; el; el = el.parentElement) {
    const source = sources.get(el);
    if (!source) continue;
    try {
      const text = source.getText();
      if (text) return { label: source.label, text };
    } catch {
      /* A surface that cannot answer right now is not an error worth showing;
         the menu simply does not offer the entry. */
    }
    return null;
  }
  return null;
}

/**
 * Mark a surface as holding comparable data.
 *
 * `getText` is called when the menu opens, not when the hook runs, so it must
 * read current state rather than close over a stale value — pass a ref or a
 * getter, not the value itself.
 */
export function useComparable(
  ref: RefObject<HTMLElement | null>,
  label: string,
  getText: () => string,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerComparable(el, { label, getText });
  });
}

/** Test seam. */
export function __clearComparables(): void {
  sources.clear();
}
