/**
 * The ribbon's geometry, measured against the pane it is drawn in.
 *
 * ── Why this is its own file ──
 *
 * Everything the ribbon draws is a number derived from one other number: the
 * height of its own track. The failures a split pane showed were all that
 * number being taken from somewhere else — the viewport, once at mount, a
 * floor of 60px — so a 190px pane drew to a 900px ruler, its bands ran past
 * the bottom edge, and the one ERROR in a quiet pane rounded to nothing. The
 * rules that keep those from coming back are pure arithmetic, so they live
 * here, where they can be tested at every height a pane can have rather than
 * at the one height somebody's window happened to be.
 *
 *   1. The track measures itself (a ResizeObserver in the view), and every
 *      rule below takes that height as an argument, never a constant.
 *   2. A band is never thinner than `BAND_FLOOR_PX`. The band count follows
 *      from that, not the other way round, so a lone error always has three
 *      pixels of its own colour.
 *   3. Under `COMPACT_RIBBON_PX` (log-view.ts) the ribbon draws ticks, not
 *      bands.
 *   4. The you-are-here box is clamped to the track and never thinner than
 *      `MARKER_MIN_PX`.
 *   5. The hover card is placed inside the pane, on whichever side has room.
 */
import { ribbonBands } from './log-view';
import type { LogLevel } from '../../store/k8s-store';
import { GUTTER_INFO, GUTTER_WARN, RED as LEVEL_RED } from './follow-tone';

/* The ribbon's red, a touch softer than the level's on a light background. */
const RED = `var(--color-ribbon-error, ${LEVEL_RED})`;

/** The thinnest a band is ever drawn. Three pixels is the least that reads as a colour. */
export const BAND_FLOOR_PX = 3;
/** The gap under each band — two pixels, so neighbouring blocks read as blocks and not as one bar. */
export const BAND_GAP_PX = 2;
/** The thinnest the you-are-here box is ever drawn. */
export const MARKER_MIN_PX = 6;

// ── How it is drawn ─────────────────────────────────────────────────────────

/**
 * The gutter's width, hairline included, and its blocks'.
 *
 * Sixteen pixels down the pane's right edge with an 8px column of blocks in
 * it: a gutter, not a second pane. It was 38px with 20px bands, which in a
 * three-way split is most of a word of every line, in every pane, for a
 * picture the eye reads at a glance.
 */
export const GUTTER_W = 16;
export const GUTTER_BLOCK_W = 8;
/** How far the you-are-here box stands out past the blocks on each side: 12px over 8. */
export const MARKER_EDGE = 2;

/**
 * A block's colour, by the worst level in it.
 *
 * Solid colours rather than the level colours faded: a calm stretch is the
 * INFO blue, a warning a dim amber, and an error full red, so the one thing
 * the gutter is for — where the trouble is — is the only loud thing in it.
 */
export function blockColor(worst: LogLevel): string {
  return worst === 'error' ? RED : worst === 'warn' ? GUTTER_WARN : GUTTER_INFO;
}

/**
 * A block's fill: its lines in proportion, not its worst line.
 *
 * Coloured by the worst line alone, a block of twenty-five lines with one
 * error in it was as red as a block of twenty-five errors — so a log that is
 * mostly INFO with an error every few seconds drew a ribbon that was solid
 * red, and the ribbon said the opposite of the lines beside it. Now each block
 * is red, amber and calm from left to right in the share each level has, with
 * a sliver of at least 15% for any error or warning so one is never lost.
 */
export function bandFill(b: { count: number; events?: number; errors?: number; warns?: number }): string {
  if (!b.count) return 'var(--color-surface-border)';
  /* Out of the events, as the level chips count — a stack frame is part of
     its error, not a calm line beside it. */
  const of = Math.max(1, b.events ?? b.count);
  const share = (n = 0) => (n > 0 ? Math.max(0.15, n / of) : 0);
  let e = share(b.errors);
  let w = share(b.warns);
  if (e + w > 1) { const k = 1 / (e + w); e *= k; w *= k; }
  const ep = Math.round(e * 100);
  const wp = Math.round((e + w) * 100);
  if (ep === 0 && wp === 0) return GUTTER_INFO;
  return `linear-gradient(to right, ${RED} 0 ${ep}%, ${GUTTER_WARN} ${ep}% ${wp}%, ${GUTTER_INFO} ${wp}% 100%)`;
}

/** A compact tick's colour: an error is red, a warning the gutter's amber. */
export function tickColor(level: 'error' | 'warn'): string {
  return level === 'error' ? RED : GUTTER_WARN;
}

/**
 * How many bands a track this tall gets, each at least the floor.
 *
 * `ribbonBands` with the floor as its minimum: one band per ~7px where there is
 * room, and never more than fit at the floor with their gaps.
 */
export function bandCount(trackPx: number): number {
  return ribbonBands(trackPx, BAND_FLOOR_PX, BAND_GAP_PX);
}

/** What each band actually gets, in px, once the gaps are taken out. */
export function bandPx(trackPx: number, bands: number): number {
  if (bands < 1) return 0;
  return (trackPx - BAND_GAP_PX * (bands - 1)) / bands;
}

/** Which band a point on the track falls in. */
export function bandAt(y: number, trackPx: number, bands: number): number {
  if (bands < 1 || trackPx <= 0) return -1;
  return Math.min(bands - 1, Math.max(0, Math.floor((y / trackPx) * bands)));
}

// ── You are here ────────────────────────────────────────────────────────────

export interface MarkerInput {
  trackPx: number;
  scrollTop: number;
  contentHeight: number;
  viewportHeight: number;
  /** The shared clock, when the split has one. */
  range?: { from: number; to: number };
  /** When the first and last rows on screen were logged. */
  viewTimes?: { from?: number; to?: number };
}

/**
 * Where the you-are-here box goes, and how tall it is.
 *
 * By scroll fraction — the quantity the scrollbar itself uses — or, on a
 * shared clock, by the instants at the top and bottom of the screen, because
 * the bands are drawn by time there and a box on another scale would sit at
 * the right percentage of the wrong thing.
 *
 * Never taller than the track (a short pane holding most of its buffer asks
 * for exactly that), never thinner than `MARKER_MIN_PX` (a pane holding two
 * screens of a long log would otherwise draw a hairline nobody can find), and
 * its travel is the track minus itself, so at the end its bottom meets the
 * track's bottom rather than running past it.
 */
export function markerBox(m: MarkerInput): { top: number; height: number } {
  const track = Math.max(0, m.trackPx);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  if (m.range && m.viewTimes?.from !== undefined && m.viewTimes.to !== undefined) {
    const span = Math.max(1, m.range.to - m.range.from);
    const top = clamp((m.viewTimes.from - m.range.from) / span) * track;
    const bottom = clamp((m.viewTimes.to - m.range.from) / span) * track;
    const height = Math.min(track, Math.max(MARKER_MIN_PX, bottom - top));
    return { top: Math.min(Math.max(0, track - height), top), height };
  }

  const scrollable = Math.max(0, m.contentHeight - m.viewportHeight);
  const visible = m.contentHeight > 0 ? Math.min(1, m.viewportHeight / m.contentHeight) : 1;
  const scrolled = scrollable > 0 ? clamp(m.scrollTop / scrollable) : 0;
  const height = Math.min(track, Math.max(MARKER_MIN_PX, visible * track));
  return { top: Math.max(0, scrolled * (track - height)), height };
}

// ── The hover card ──────────────────────────────────────────────────────────

export interface CardInput {
  /** The pointer, measured from the top of the ribbon's column. */
  pointerY: number;
  /** The column's height — the pane's body, which the card must stay inside. */
  columnPx: number;
  cardHeight: number;
  cardWidth: number;
  /** Room between the column and the pane's left and right edges. */
  roomLeft: number;
  roomRight: number;
  /** Space between the pointer and the card, and between the card and an edge. */
  gap?: number;
}

export interface CardPlacement {
  /** From the top of the column. */
  top: number;
  /** Which side of the ribbon the card opens on. */
  side: 'left' | 'right';
  /** When neither side fits the card, the width it may have. */
  maxWidth: number;
}

/**
 * Where the hover card goes: inside the pane, beside the pointer.
 *
 * The card used to be placed in page coordinates, which is right for the one
 * pane at the left of the screen and wrong for every other: in the right-hand
 * panes of a split it opened past the edge and was clipped. So it is placed
 * against the pane instead. Sideways, it takes whichever side has room —
 * normally the left, since the ribbon runs down the pane's right edge — and
 * when neither does it takes the roomier one and narrows to fit. Up and down,
 * it sits below the pointer in the top half and above it in the bottom half,
 * so it never runs off the end it is nearest, and is then clamped inside the
 * column whatever its height.
 */
export function hoverCardPlacement(c: CardInput): CardPlacement {
  const gap = c.gap ?? 6;
  const fitsLeft = c.roomLeft >= c.cardWidth + gap;
  const fitsRight = c.roomRight >= c.cardWidth + gap;
  const side: 'left' | 'right' = fitsLeft ? 'left' : fitsRight ? 'right' : (c.roomLeft >= c.roomRight ? 'left' : 'right');
  const room = side === 'left' ? c.roomLeft : c.roomRight;
  const maxWidth = Math.max(0, Math.min(c.cardWidth, room - gap));

  const below = c.pointerY <= c.columnPx / 2;
  const wanted = below ? c.pointerY + gap : c.pointerY - gap - c.cardHeight;
  const top = Math.min(Math.max(0, c.columnPx - c.cardHeight), Math.max(0, wanted));
  return { top, side, maxWidth };
}
