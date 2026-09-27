/**
 * The colours of the Ask the log board, and of the marks in the Logs tab.
 *
 * Kept apart from `tone.ts` on purpose. `tone.ts` says what a colour MEANS
 * across dk8s; this file says what two boards were drawn in, so the screens
 * can be read against them value for value. A neutral here is always a theme
 * token — the boards are drawn dark, and the same card has to stand up in the
 * light theme too — and an accent is the board's own hue behind a variable,
 * so a palette can still reach it and the literal is only the answer for a
 * context where no palette has loaded.
 *
 * The boards' neutrals (hex, written without the hash so the colour budget
 * counts code, not this note), and the tokens that are those values in the
 * dark theme:
 *
 *   1e1e1e  the panel             → `--color-surface`
 *   252526  a card, a rail        → `--color-elevated`
 *   2a2d2e  a divider inside one  → `--color-surface-hover`
 *   414141  an edge               → `--color-surface-border`
 *   d4d4d4  text                  → `--color-text-primary`
 *   acacac  a label               → `--color-text-secondary`
 *   6d6d6d  what is not the point → `--color-text-muted`
 */
import { AI, AI_INK, LOGGERS } from './tone';

export const PANEL = 'var(--color-surface)';
export const CARD = 'var(--color-elevated)';
export const DIVIDER = 'var(--color-surface-hover)';
export const EDGE = 'var(--color-surface-border)';
export const TEXT = 'var(--color-text-primary)';
export const LABEL = 'var(--color-text-secondary)';
export const QUIET = 'var(--color-text-muted)';

/**
 * The Ask accent — the tab's underline, the question box's edge, the Ask
 * button, the step numbers and the citations. The app's AI colour, which in
 * the dark theme is the board's 7EACB5 exactly.
 */
export const ASK = AI;
export const ASK_INK = AI_INK;

/**
 * What a link to the log is written in, and an id inside the answer: the
 * board's 2dd4bf. "OrderService ›" and `A-4470` are the same colour because
 * both are things you can go and look at.
 */
export const ASK_LINK = 'var(--color-asklog-link, #2dd4bf)';
export const ASK_ID = ASK_LINK;

/** A value the answer quotes — `capture_timeout` — in the board's amber. */
export const ASK_VALUE = 'var(--color-warning, #f59e0b)';

/** A failed step and its exception line; a warning step. */
export const ASK_ERROR = 'var(--color-error, #ef4444)';
export const ASK_WARN = 'var(--color-warning, #f59e0b)';
/** The failed step's row, tinted the way the board tints it (8%). */
export const ASK_ERROR_ROW = `color-mix(in srgb, ${ASK_ERROR} 8%, transparent)`;

/** Was this right: yes in green, no in red. */
export const ASK_YES = 'var(--color-success, #22c55e)';
export const ASK_NO = ASK_ERROR;

/** Monospace, as the boards spell it. */
export const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

/**
 * The marks' purple, and its chip — "3 marked patterns highlighted" sits on
 * 14% of it with no edge, which is what tells it apart from a level chip.
 */
export const MARKS = LOGGERS;
export const MARKS_CHIP = `color-mix(in srgb, ${LOGGERS} 14%, transparent)`;

/**
 * The outlined control the boards use for every small button: Copy, Open all
 * in Logs, Save as a check, Jump to next match, Ask AI about this window.
 * 24px, a hairline edge, no fill, the label colour.
 */
export const OUTLINE_BUTTON = {
  height: 24,
  padding: '0 10px',
  border: `1px solid ${EDGE}`,
  borderRadius: 6,
  background: 'none',
  color: LABEL,
  fontSize: 11.5,
  fontWeight: 400,
} as const;

/** A "try" chip, a follow-up question: an outlined pill. */
export const OUTLINE_PILL = {
  padding: '0 10px',
  border: `1px solid ${EDGE}`,
  borderRadius: 999,
  background: 'none',
  color: LABEL,
  fontSize: 11.5,
  fontWeight: 400,
  letterSpacing: 'normal',
} as const;
