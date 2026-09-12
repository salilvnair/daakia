/**
 * What colour a field's value is, and why.
 *
 * The rule from the plan, in three parts:
 *
 * - **A form dropdown has an order**, so its options take colours from a fixed
 *   palette by index — stable for the life of the field. Colour follows the
 *   value, never its rank in the current filter, so hiding three modules does
 *   not repaint the ones that are left.
 * - **Labels carry their own hex from GitHub.** Use it; it is the one the
 *   reporter already recognises.
 * - **A small semantic override**, and it is a mapping rather than magic:
 *   anything matching PROD or PRODUCTION takes the critical red, DEV and
 *   STAGING the muted grey. A repository where PROD is not the scary one
 *   should be able to say so — which is why this table is data and not a
 *   condition buried in a component.
 *
 * Nine values in a dropdown is the case the palette does not cover, and it is
 * not solved by generating a ninth hue: past the eighth slot values share the
 * ramp again, and every use of these colours carries its own text label, so
 * identity never rests on the colour alone.
 */
import type { ProposedDimension } from './board-types';

/** The eight slots, as CSS variables — see index.css for the values and why. */
const SLOTS = [
  'var(--dkgh-cat-1)', 'var(--dkgh-cat-2)', 'var(--dkgh-cat-3)', 'var(--dkgh-cat-4)',
  'var(--dkgh-cat-5)', 'var(--dkgh-cat-6)', 'var(--dkgh-cat-7)', 'var(--dkgh-cat-8)',
];

/**
 * The semantic overrides, in the order they are tried.
 *
 * Editable on screen 17 rather than compiled in — this is the default, not the
 * rule. The point of writing it as a table is that somebody can disagree with
 * it.
 */
export interface SemanticRule { match: RegExp; colour: string; why: string }

export const SEMANTIC_DEFAULTS: SemanticRule[] = [
  {
    match: /^prod(uction)?$/i,
    colour: 'var(--color-error)',
    why: 'Production is the one that wakes somebody up.',
  },
  {
    match: /^(dev|development|staging|stage|local|test)$/i,
    colour: 'var(--color-text-muted)',
    why: 'A pre-production environment is context, not an alarm.',
  },
  {
    match: /^(urgent|critical|p0|blocker)$/i,
    colour: 'var(--color-error)',
    why: 'The top of a declared priority scale.',
  },
  {
    match: /^(high|p1|major)$/i,
    colour: 'var(--color-warning)',
    why: 'The second step of a declared priority scale.',
  },
];

/**
 * The colour for one value of one dimension.
 *
 * `options` is the dropdown's own declared order, which is where the index
 * comes from. A value the form never declared — a typo, or something newer than
 * the template — falls back to the muted ink rather than borrowing a slot that
 * belongs to a declared value.
 */
export function colourOf(
  value: string,
  options: string[] | undefined,
  rules: SemanticRule[] = SEMANTIC_DEFAULTS,
): string {
  const v = value.trim();
  if (!v) return 'var(--color-text-muted)';

  for (const rule of rules) if (rule.match.test(v)) return rule.colour;

  const at = (options ?? []).findIndex(o => o.toLowerCase() === v.toLowerCase());
  if (at < 0) return 'var(--color-text-muted)';
  return SLOTS[at % SLOTS.length];
}

/** Every dimension's options, indexed once so a board render is not O(n·m). */
export function colourMap(dimensions: ProposedDimension[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of dimensions) {
    for (const o of d.options) out.set(`${d.dimension}:${o.toLowerCase()}`, colourOf(o, d.options));
  }
  return out;
}

/** Look one up, falling back the same way `colourOf` does. */
export function fromMap(map: Map<string, string>, dimension: string, value: string): string {
  return map.get(`${dimension}:${value.trim().toLowerCase()}`) ?? 'var(--color-text-muted)';
}
