/**
 * Putting a palette on the page.
 *
 * One `<style>` element holding one `:root` block, layered over what
 * `index.css` already declares. Nothing in the stylesheet moves and nothing
 * is removed: the 78 values that already derive from a neighbour follow the
 * seeds without being mentioned, and switching theme is rewriting one
 * element's text.
 *
 * ── Why a style element and not inline variables on <html> ──
 *
 * `documentElement.style.setProperty` would work and is harder to see. A
 * named element can be read in devtools, diffed against the stylesheet, and
 * removed in one line when the built-in theme is selected — which is what
 * "no theme" should mean, rather than sixty properties left behind pointing
 * at the same values by coincidence.
 */
import { paletteCss, type AppPalette } from './palette';

const ELEMENT_ID = 'daakia-theme';

function styleElement(): HTMLStyleElement {
  const existing = document.getElementById(ELEMENT_ID);
  if (existing instanceof HTMLStyleElement) return existing;
  const el = document.createElement('style');
  el.id = ELEMENT_ID;
  /*
    Appended to <head> last, so it wins over index.css without either
    selector needing to be more specific than `:root`. Specificity wars
    between a stylesheet and a theme are unwinnable — later simply wins.
  */
  document.head.appendChild(el);
  return el;
}

/** Paint a palette, or clear back to what the stylesheet says. */
export function applyPalette(palette: AppPalette | null, mode: 'dark' | 'light'): void {
  if (!palette) {
    document.getElementById(ELEMENT_ID)?.remove();
    return;
  }
  styleElement().textContent = paletteCss(palette, mode);
}

/** What is painted right now, for tests and for the settings page. */
export function appliedCss(): string {
  return document.getElementById(ELEMENT_ID)?.textContent ?? '';
}
