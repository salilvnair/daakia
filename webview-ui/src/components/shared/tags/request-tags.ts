/**
 * Tags on a request.
 *
 * ── Why they live in the request's data blob ──
 *
 * A tag is metadata about a request, not a setting that changes how it runs, so
 * it travels with the request rather than through the execution-settings
 * resolver. The blob is already what a saved request is made of and already
 * what history keeps a copy of, which means a tag survives Save, Export, Git
 * sync and a replay from history without a single one of those paths needing to
 * know tags exist.
 *
 * ── Why the normalising is here rather than in the input ──
 *
 * Tags arrive from four places: typed into the Settings tab, parsed out of a
 * saved request, restored from history, and imported from somebody else's file.
 * If each normalised its own way, "Smoke" and "smoke" would be two chips in one
 * list and a filter would match one of them. One function, used by all four.
 */

/** What a tag may contain. Anything else is a separator or is dropped. */
const ALLOWED = /[^a-z0-9._/-]+/g;

/** Kept short enough to stay a chip rather than a paragraph. */
const MAX_LENGTH = 32;

/** More than this on one request is a filing system, not a label. */
const MAX_TAGS = 12;

/**
 * One tag, cleaned.
 *
 * Lower-cased because a tag is an identity, not a label: `Smoke` and `smoke`
 * name the same thing, and letting both exist means every filter has to
 * remember that.
 */
export function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase().replace(ALLOWED, '-').replace(/^-+|-+$/g, '').slice(0, MAX_LENGTH);
}

/**
 * A list of tags, cleaned, de-duplicated, and in the order first written.
 *
 * Order is kept rather than sorted: somebody who puts `prod` first meant it to
 * read first, and re-sorting their list on every save is the kind of small
 * disobedience that makes an editor feel unreliable.
 */
export function normaliseTags(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[,\s]+/)
      : [];

  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = normaliseTag(item);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Read tags off a saved request's parsed data blob. */
export function tagsFromData(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  return normaliseTags((data as { tags?: unknown }).tags);
}

/**
 * A stable colour per tag.
 *
 * Derived from the text rather than assigned in order, so the same tag is the
 * same colour on every screen it appears on — the whole point of a chip is that
 * you learn to recognise it, which a colour that changes with list position
 * would defeat.
 *
 * The palette is the app's own protocol and status hues, so a tag never
 * introduces a colour Daakia does not otherwise use.
 */
const PALETTE = [
  'var(--color-protocol-rest)',
  'var(--color-dk8s)',
  'var(--color-success)',
  'var(--color-protocol-mqtt)',
  'var(--color-protocol-graphql)',
  'var(--color-mock-server)',
  'var(--color-protocol-grpc)',
  'var(--color-protocol-mcp)',
];

/**
 * FNV-1a with a final mix, not the textbook `hash * 31 + char`.
 *
 * The simple one clusters badly on short lowercase words, which is all a tag
 * ever is: across eighteen realistic tag names it left two of the eight colours
 * unused and put five on one. The avalanche step spreads the low bits the
 * modulo actually reads.
 */
export function tagColor(tag: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13;
  return PALETTE[(h >>> 0) % PALETTE.length];
}
