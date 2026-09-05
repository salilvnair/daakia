/**
 * What each colour in dk8s means, in one place.
 *
 * Every file in this folder opened with its own `const ACCENT`, which was
 * harmless while they all agreed and stopped being harmless the moment they
 * did not. The AI colour was the one that drifted: `--color-protocol-ai` in
 * five files, `--color-primary-light` in three, and one chip whose fill was
 * `--color-primary` while its text was `--color-primary-light` — so two "Ask
 * AI" buttons, on two screens, in two different colours.
 *
 * A name that says what the colour is FOR is what stops that. `AI` can be
 * checked against the panel it opens; `--color-primary-light` at a call site
 * cannot be checked against anything.
 *
 * Two borrowings are corrected here rather than preserved:
 *
 *   - the pod grid's "watching" and "ready" took `--color-method-get`, the
 *     REST verb colour, because it happened to be the right green. Changing
 *     the REST palette would have changed the cluster's health counts with it.
 *   - an artifact kind took `--color-protocol-graphql` for the same reason.
 *
 * Both now name the meaning they wanted.
 */

/** dk8s itself: tabs, selection, the accent on every panel in this folder. */
export const ACCENT = 'var(--color-dk8s)';

/** The accent at the strengths the panels actually use it. */
export const ACCENT_SOFT = 'color-mix(in srgb, var(--color-dk8s) 16%, transparent)';
export const ACCENT_FILL = 'color-mix(in srgb, var(--color-dk8s) 20%, transparent)';
export const ACCENT_EDGE = 'color-mix(in srgb, var(--color-dk8s) 55%, transparent)';
/** The accent's own muted variant, for a fill that must not compete with text. */
export const ACCENT_MUTED = 'var(--color-dk8s-muted)';

/**
 * Anything that sends evidence to a model, or shows what came back.
 *
 * One token, so the chip that asks and the panel that answers are the same
 * colour — they were not, and the two Ask AI buttons in this product did not
 * match each other.
 */
export const AI = 'var(--color-protocol-ai)';

/** Healthy, ready, done. */
export const OK = 'var(--color-success)';
/** Worth looking at, not yet wrong: a cap hit, a warning line, a note. */
export const WARN = 'var(--color-warning)';
/** Failed, refused, unreadable. */
export const BAD = 'var(--color-error)';

/**
 * Neutral information — a type badge, a symlink, a kind marker.
 *
 * The fallback is spelled once here rather than at four call sites, which is
 * how a fallback ends up differing from the token it is standing in for.
 */
export const INFO = 'var(--color-info, #3fb9cc)';

/** Text that is present but not the point. */
export const MUTED = 'var(--color-text-muted)';

/**
 * Syntax colours for the file viewer.
 *
 * Deliberately separate from the semantic tones above. A shell keyword was
 * being drawn in the AI colour, which is a collision rather than a choice: the
 * two have nothing to do with each other, and tying them means a change to one
 * silently restyles the other.
 */
export const SYNTAX = {
  key: ACCENT,
  value: 'var(--color-success)',
  string: 'var(--color-success)',
  keyword: 'var(--color-primary-light)',
  variable: 'var(--color-warning)',
  comment: 'var(--color-text-muted)',
  plain: 'var(--color-text-secondary)',
} as const;

/**
 * The colour a search hit is written in.
 *
 * The same `--dui-row-flash` the file list highlights a matched run with, so
 * "the thing you searched for" is one colour everywhere in dk8s — in a row, in
 * a heading, and in the empty state that says it found nothing. A second
 * yellow would read as a second meaning.
 */
export const MATCH = 'var(--dui-row-flash, #ffc400)';
