/**
 * The colours the Follow boards are drawn in — search hit, Follow, Window,
 * Fields, Determinants and the split gutter.
 *
 * ── Why not `tone.ts` ──
 *
 * `tone.ts` says what each colour means across the whole of dk8s, and its
 * accent is the cyan every other panel wears. The boards these screens were
 * built from draw them in a quieter, greyer teal, with the editor's syntax
 * colours for a field's key and value and two dimmed level colours for the
 * gutter. Folding those into `ACCENT` would repaint every panel that has never
 * heard of Follow; spelling them at each call site is how the four screens
 * would drift apart again. So they are named here, once, for these screens.
 *
 * ── Why every one is a `var()` ──
 *
 * The hex is the board's, exactly, and it is what a dark theme gets: none of
 * the `--color-follow-*` names is defined in the dark palette, so the fallback
 * IS the colour. The light palette (`index.css`) defines the few that go thin
 * on white, deeper, the way every other hue in that block is stepped. The
 * syntax colours ride on the debugger's tokens, whose dark values are the same
 * three hexes and whose light values are VS Code Light+'s.
 */

/** Follow itself: the selected card, the filled button, the active pill, the you-are-here box. */
export const FOLLOW = 'var(--color-follow, #7EACB5)';
/** Text on a filled Follow button — dark, so the teal stays the loud part. */
export const FOLLOW_INK = 'var(--color-follow-ink, #10262b)';
/** The tick in every checkbox on these boards. */
export const CHECK = 'var(--color-follow-check, #2dd4bf)';

/** A field's name, as the editor draws a variable. */
export const FIELD_KEY = 'var(--color-debug-object, #9cdcfe)';
/** A field's value, as the editor draws a string. */
export const FIELD_VALUE = 'var(--color-debug-string, #ce9178)';
/** A field's value when it is a reading — a count, a pool size — as the editor draws a number. */
export const FIELD_NUMBER = 'var(--color-debug-number, #b5cea8)';

/** A pattern's named hole, a request method, the MDC reader: the boards' purple. */
export const HOLE_FIELD = 'var(--color-follow-field, #a78bfa)';
/** "Matches 214 lines", "28×201", "all fine" — the boards' green, a shade off `--color-success`. */
export const GOOD = 'var(--color-follow-ok, #10b981)';
export const AMBER = 'var(--color-warning, #f59e0b)';
export const RED = 'var(--color-error, #ef4444)';
export const BLUE = 'var(--color-info, #3b82f6)';

/**
 * The gutter's calm and warning blocks.
 *
 * Solid, dimmed hues rather than the level colours at a low opacity: a block
 * at 30% over a pane's background is a different colour on every background,
 * and the boards draw these as colours of their own. Errors keep `RED` at full
 * strength — the gutter exists to make trouble findable.
 */
export const GUTTER_CALM = 'var(--color-gutter-calm, #2f6b5e)';
/**
 * The ribbon's calm share, in the INFO label's own blue — so the strip reads
 * with the same key as the lines beside it: red ERROR, amber WARN, blue INFO.
 * Mixed a little toward the panel so an error is still the loudest thing in it.
 */
export const GUTTER_INFO = 'var(--color-ribbon-info, color-mix(in srgb, var(--color-info, #6aa9ff) 72%, var(--color-panel, #1e1e1e)))';
export const GUTTER_WARN = 'var(--color-gutter-warn, #8a7320)';

/** A colour at a strength, over whatever is behind it. */
export function tint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}
