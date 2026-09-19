/**
 * The two grounds a palette is previewed against, and the colour of nothing.
 *
 * ── Why these are fixed ──
 *
 * A terminal palette carries no background of its own: the panel's is the
 * background, and xterm paints over it. So a preview has to supply one, and
 * it must NOT be the app's current surface — previewing a light palette on a
 * dark panel shows you the half nobody needs convincing about. These two
 * stand in for "a dark panel" and "a light panel" so both halves of a theme
 * can be looked at without changing the app's theme to check.
 *
 * ── Why they live here ──
 *
 * They were already written once, in the terminal settings page, and the
 * theme builder needs exactly the same two. A second copy of a stand-in
 * ground is the kind of duplication that goes unnoticed until one of them is
 * adjusted and two previews of the same palette stop agreeing.
 *
 * `services/theme` is exempt from the hard-coded-colour guard, and correctly:
 * these are palette data rather than app chrome, and a theme that could
 * repaint its own preview's ground would be measuring itself.
 */

export const PREVIEW_GROUND = {
  dark: '#16161c',
  light: '#f7f7f5',
} as const;

export type PreviewGround = keyof typeof PREVIEW_GROUND;

/**
 * What a picker shows for a colour a draft does not have.
 *
 * Only reachable if a palette arrives missing a field the builder knows
 * about, which the parser should have caught — so it is a placeholder for an
 * impossible state rather than a default anybody sees.
 */
export const MISSING_COLOUR = '#000000';
