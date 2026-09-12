/**
 * Picking a colour for a label.
 *
 * **Not `Math.random()` across the whole cube.** A uniformly random hex is a
 * one-in-eight chance of near-black, which is invisible on the dark panel, and
 * a similar chance of near-white, which is invisible on the light one. A label
 * colour has one job — to be told apart from the other labels at a glance — so
 * this picks a random *hue* and keeps saturation and lightness in the band that
 * reads on both themes.
 *
 * That band is where GitHub's own defaults sit: `d73a4a`, `0075ca`, `a2eeef`
 * and the rest are all mid-lightness and fairly saturated.
 */

/** `#rrggbb` from h in 0–360, s and l in 0–1. */
export function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** How light a generated colour is allowed to be. Both ends read on both themes. */
export const LIGHTNESS = { min: 0.42, max: 0.64 };
export const SATURATION = { min: 0.45, max: 0.85 };

/**
 * A colour worth offering, with the hue taken at random.
 *
 * `avoid` is the colours already in use: a set of nine labels where two are
 * the same blue is a set somebody has to read rather than recognise, so a hue
 * within thirty degrees of one already there is tried again. It gives up after
 * a few attempts rather than looping — on a repository with forty labels every
 * hue is close to something, and a near-miss beats a hang.
 */
export function randomColour(
  avoid: string[] = [],
  random: () => number = Math.random,
): string {
  const taken = avoid.map(hueOf).filter((h): h is number => h !== undefined);
  for (let tries = 0; tries < 12; tries++) {
    const h = Math.floor(random() * 360);
    const s = SATURATION.min + random() * (SATURATION.max - SATURATION.min);
    const l = LIGHTNESS.min + random() * (LIGHTNESS.max - LIGHTNESS.min);
    const clash = taken.some(t => {
      const gap = Math.abs(t - h);
      return Math.min(gap, 360 - gap) < 30;
    });
    if (!clash || tries === 11) return hslToHex(h, s, l);
  }
  /* Unreachable — the loop returns on its last pass. */
  return hslToHex(Math.floor(random() * 360), 0.6, 0.5);
}

/** The hue of `#rrggbb`, or nothing if it is not one. */
export function hueOf(hex: string): number | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return undefined;
  const h = max === r ? ((g - b) / d) % 6
    : max === g ? (b - r) / d + 2
    : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** `#ededed` from `ededed`, `#EDEDED`, or `#ededed`. Anything else is left alone. */
export function normalise(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  return m ? `#${m[1].toLowerCase()}` : hex;
}

/**
 * Whether a colour is dark enough that white text sits on it.
 *
 * Used where the colour becomes a *background* rather than ink. Perceived
 * luminance, not the plain average: the eye reads green as far brighter than
 * blue at the same number.
 */
export function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}
