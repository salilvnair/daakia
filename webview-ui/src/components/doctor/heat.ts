/**
 * What a number means, as a colour.
 *
 * ── Why colour at all ──
 *
 * A profiler answers one question — where is the time going — and every view
 * here answered it with identical grey bars of different lengths. Length alone
 * makes you compare bars pairwise to find the worst one; a scale you can read
 * without comparing anything is the whole reason to open a profiler.
 *
 * ── One scale, five views ──
 *
 * The bands are shared so a colour means the same thing whichever tab you are
 * on: red is "this is where your time went", amber is "worth a look", and the
 * long grey tail is everything that added up to nothing. If Hot spots called
 * 40% red and Allocation called it green, the colour would carry no
 * information and would be decoration with extra steps.
 *
 * ── Why thresholds and not a gradient ──
 *
 * A continuous ramp gives every row a slightly different colour, which reads
 * as noise and makes two rows at 22% and 24% look meaningfully apart. Four
 * bands put a row in a category you can name.
 */

export type HeatBand = 'critical' | 'high' | 'moderate' | 'low';

export interface Heat {
  band: HeatBand;
  /** For the bar and any text that should carry the same weight. */
  color: string;
  /** For a tinted background behind a whole row. */
  wash: string;
  /** What the band means, for a tooltip or a legend. */
  label: string;
}

const BANDS: Record<HeatBand, Omit<Heat, 'band'>> = {
  critical: {
    color: 'var(--color-error)',
    wash: 'color-mix(in srgb, var(--color-error) 9%, transparent)',
    label: 'dominant — most of the measurement is here',
  },
  high: {
    color: 'var(--color-warning)',
    wash: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
    label: 'significant',
  },
  moderate: {
    color: 'var(--color-dk8s)',
    wash: 'transparent',
    label: 'minor',
  },
  low: {
    color: 'var(--color-text-muted)',
    wash: 'transparent',
    label: 'negligible',
  },
};

/**
 * A share of the whole, 0–100, as a band.
 *
 * The thresholds are where they are because of how profiles actually
 * distribute: one or two frames hold most of the samples and a long tail holds
 * almost none. 25% is roughly "this alone is a quarter of your runtime", which
 * is always worth reading; below 5% a frame is noise in a recording of any
 * length, and colouring it would drown the rows that are not.
 */
export function heatOf(percent: number): Heat {
  const band: HeatBand =
    percent >= 25 ? 'critical'
    : percent >= 10 ? 'high'
    : percent >= 5 ? 'moderate'
    : 'low';
  return { band, ...BANDS[band] };
}

/**
 * The same scale for a value measured against the largest in its list.
 *
 * Blocking times and allocation sizes have no natural "percent of everything" —
 * one lock held for four seconds is not 4% of anything meaningful. Relative to
 * the worst row, though, the same reading applies: the top row is where to look
 * and the tail is not.
 */
export function heatOfMax(value: number, max: number): Heat {
  if (max <= 0) return { band: 'low', ...BANDS.low };
  return heatOf((value / max) * 100);
}

/** The legend a coloured view owes its reader. */
export const HEAT_LEGEND: { band: HeatBand; label: string; color: string }[] = [
  { band: 'critical', label: '25%+', color: BANDS.critical.color },
  { band: 'high', label: '10–25%', color: BANDS.high.color },
  { band: 'moderate', label: '5–10%', color: BANDS.moderate.color },
  { band: 'low', label: 'under 5%', color: BANDS.low.color },
];
