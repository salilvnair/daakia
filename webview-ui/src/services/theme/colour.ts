/**
 * The colour arithmetic a theme needs, and nothing else.
 *
 * Thirteen seeds have to produce the sixty-odd values the stylesheet actually
 * uses, so most of this file exists to answer one question: given a ground and
 * a foreground, what does "a little lighter than that" mean. `color-mix()`
 * answers it in CSS and the stylesheet already leans on it twenty times, but a
 * palette also has to be previewed, contrast-checked and inverted in
 * JavaScript, and none of that can be done by handing the browser a string.
 */

export interface Rgb { r: number; g: number; b: number }

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A hex colour, or null for anything that is not one. */
export function parseHex(input: string): Rgb | null {
  const m = HEX.exec(input.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const p = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

/** `amount` of `a` over `b`, 0..1. The same thing `color-mix` does in CSS. */
export function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  const t = Math.min(1, Math.max(0, amount));
  return toHex({
    r: x.r * t + y.r * (1 - t),
    g: x.g * t + y.g * (1 - t),
    b: x.b * t + y.b * (1 - t),
  });
}

/** Hex plus an alpha, as an `rgba()` — for washes and rings. */
export function alpha(hex: string, a: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.min(1, Math.max(0, a))})`;
}

/**
 * Relative luminance, WCAG's version.
 *
 * The plain channel average reads green as far darker than the eye does, and a
 * theme decided on that average puts light text on a mid-green and calls it
 * fine.
 */
export function luminance(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 0;
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function isDarkColour(hex: string): boolean {
  return luminance(hex) < 0.32;
}

/**
 * The same colour, made to work against the other ground.
 *
 * Borrowed in spirit from DUI's `darkenForLight`, and for the same reason a
 * terminal theme needs it: somebody who authored only a dark half should get a
 * light one that is legible rather than nothing at all. It is explicitly not a
 * designed palette, which is why what uses it marks the result as derived.
 *
 * Near-neutrals stay neutral. Running a grey through a saturation boost
 * invents a hue that was never in the palette, and the greys are what carry
 * muted text everywhere in this app.
 */
export function flipForOtherGround(hex: string, toLight: boolean): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const { h, s, l } = toHsl(c);

  const neutral = s < 0.12;
  const targetL = toLight
    ? (neutral ? Math.min(0.45, 1 - l) : Math.min(0.46, 0.30 + l * 0.14))
    : (neutral ? Math.max(0.55, 1 - l) : Math.max(0.58, 0.62 + (1 - l) * 0.14));
  const targetS = neutral ? s : Math.min(1, s * (toLight ? 1.2 : 1.05));

  return toHex(fromHsl(h, targetS, targetL));
}

function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    h = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
