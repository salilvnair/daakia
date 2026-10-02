/**
 * The colours of the Loggers boards — the catalogue, Add loggers, Add
 * patterns and Scan the repository — value for value.
 *
 * Kept apart from `tone.ts` on purpose. `tone.ts` says what a colour MEANS
 * across dk8s; this file says what four boards were drawn in, so the screens
 * can be read against them hex for hex. A neutral here is always a theme
 * token — the boards are drawn dark, and the same card has to stand up in the
 * light theme too — and an accent is the board's own hue behind a variable,
 * so a palette can still reach it and the literal is only the answer for a
 * context where no palette has loaded.
 *
 * The boards' neutrals (written without their hash, so the colour guard reads
 * them as the prose they are), and the tokens that are those values in the
 * dark theme:
 *
 *   1e1e1e  the panel, a well inside a card  → `--color-surface`
 *   252526  a card, a rail, a control        → `--color-elevated`
 *   2a2d2e  a divider between rows           → `--color-surface-hover`
 *   414141  an edge                          → `--color-surface-border`
 *   474747  the modal's own edge, a drop box → `--color-elevated-border`
 *   d4d4d4  text                             → `--color-text-primary`
 *   acacac  a label                          → `--color-text-secondary`
 *   6d6d6d  what is not the point            → `--color-text-muted`
 */
import { LOGGERS, HOLE } from './tone';

export const PANEL = 'var(--color-surface)';
export const CARD = 'var(--color-elevated)';
export const DIVIDER = 'var(--color-surface-hover)';
export const EDGE = 'var(--color-surface-border)';
export const CARD_EDGE = 'var(--color-elevated-border)';
export const TEXT = 'var(--color-text-primary)';
export const LABEL = 'var(--color-text-secondary)';
export const QUIET = 'var(--color-text-muted)';

/**
 * The four signal hues the boards use for levels, counts and sources. They
 * are the theme's own status colours — in the dark theme exactly the boards'
 * blue, green, amber and red — so a light palette darkens them
 * for contrast instead of leaving a pale amber on white.
 */
export const BLUE = 'var(--color-info, #3b82f6)';
export const GREEN = 'var(--color-success, #22c55e)';
export const AMBER = 'var(--color-warning, #f59e0b)';
export const RED = 'var(--color-error, #ef4444)';

/** The info icon beside every explanatory note on the boards. */
export const NOTE_ICON = 'var(--color-dk8s-note, #7EACB5)';

/**
 * The paste box's syntax colours — VS Code's own for a variable, a call and
 * a string, so a pasted `log.info("…", reqId)` reads the way it did in the
 * editor it was copied from.
 */
export const SYN_VAR = 'var(--color-dk8s-syn-var, #9cdcfe)';
export const SYN_CALL = 'var(--color-dk8s-syn-call, #dcdcaa)';
export const SYN_STRING = 'var(--color-dk8s-syn-string, #ce9178)';

/** Scan the repository's language swatches: Java amber, Python blue, Node green, Go the note teal. */
export const LANG_SWATCH = { java: AMBER, python: BLUE, node: GREEN, go: NOTE_ICON } as const;

/** A hue at a strength, over whatever is behind it. The boards' `rgba(…, 0.12)`. */
export const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** The purple the boards fill a chosen tab, chip and row with. */
export const PICKED = tint(LOGGERS, 12);
export const PICKED_ROW = tint(LOGGERS, 7);

/** The header band of every Loggers dialog: purple at the top, fading to nothing. */
export const HEAD_BAND = `linear-gradient(180deg, ${tint(LOGGERS, 12)}, transparent)`;

/** A hole drawn as a pill — the teal on its own 16%. */
export const HOLE_FILL = tint(HOLE, 16);
