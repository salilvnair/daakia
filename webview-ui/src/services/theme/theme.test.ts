import { describe, it, expect, beforeEach } from 'vitest';
import { mix, contrast, luminance, isDarkColour, parseHex, flipForOtherGround } from './colour';
import {
  BUILT_IN_PALETTES, SEED_KEYS, cssVariables, paletteCss, deriveLightSeeds,
  type AppPalette,
} from './palette';
import { parseAppThemes, serializeThemes } from './palette-file';
import { applyPalette, appliedCss } from './apply';

const DAAKIA = BUILT_IN_PALETTES[0];

describe('the colour arithmetic', () => {
  it('reads both hex lengths and rejects anything else', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#1e1e1e')).toEqual({ r: 30, g: 30, b: 30 });
    expect(parseHex('rgb(0,0,0)')).toBeNull();
    expect(parseHex('red')).toBeNull();
  });

  it('mixes towards the first colour', () => {
    expect(mix('#ffffff', '#000000', 1)).toBe('#ffffff');
    expect(mix('#ffffff', '#000000', 0)).toBe('#000000');
    expect(mix('#ffffff', '#000000', 0.5)).toBe('#808080');
  });

  it('weights green the way the eye does', () => {
    // A plain channel average would call these two equally bright, and a
    // theme decided on that puts light text on a mid-green.
    expect(luminance('#00ff00')).toBeGreaterThan(luminance('#0000ff'));
  });

  it('knows which ground it is on', () => {
    expect(isDarkColour('#181818')).toBe(true);
    expect(isDarkColour('#f3f3f3')).toBe(false);
  });

  it('measures contrast the way WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 1);
  });

  it('keeps a grey grey when flipping grounds', () => {
    /*
      Running a near-neutral through a saturation boost invents a hue that was
      never in the palette — and the greys are what carry muted text
      everywhere in this app.
    */
    const flipped = flipForOtherGround('#6d6d6d', true);
    const c = parseHex(flipped)!;
    expect(Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)).toBeLessThan(12);
  });
});

describe('a palette, as the stylesheet sees it', () => {
  it('derives the surface ramp from the seeds', () => {
    const vars = cssVariables(DAAKIA.dark);
    expect(vars['--color-panel']).toBe(DAAKIA.dark.ground);
    expect(vars['--color-surface']).toBe(DAAKIA.dark.surface);
    expect(vars['--color-surface-border']).toBe(DAAKIA.dark.border);
    // Hover and active are lifts off the surface, not repeats of it.
    expect(vars['--color-surface-hover']).not.toBe(DAAKIA.dark.surface);
    expect(vars['--color-surface-active']).not.toBe(vars['--color-surface-hover']);
  });

  it('lifts towards the text on a dark ground and away on a light one', () => {
    const dark = cssVariables(DAAKIA.dark);
    const light = cssVariables(DAAKIA.light);
    expect(luminance(dark['--color-surface-hover'])).toBeGreaterThan(luminance(DAAKIA.dark.surface));
    expect(luminance(light['--color-surface-hover'])).toBeLessThan(luminance(DAAKIA.light.surface));
  });

  it('picks button text that can be read on the accent', () => {
    const onIndigo = cssVariables({ ...DAAKIA.dark, accent: '#4338ca' })['--color-btn-primary-text'];
    const onYellow = cssVariables({ ...DAAKIA.dark, accent: '#fabd2f' })['--color-btn-primary-text'];
    expect(contrast(onIndigo, '#4338ca')).toBeGreaterThan(4.5);
    expect(contrast(onYellow, '#fabd2f')).toBeGreaterThan(4.5);
  });

  it('gives every built-in a legible pairing in both halves', () => {
    /*
      The one assertion that would catch a palette somebody adds carelessly:
      body text on its own surface has to be readable in dark and in light.
    */
    for (const p of BUILT_IN_PALETTES) {
      for (const half of ['dark', 'light'] as const) {
        const seeds = p[half];
        expect(contrast(seeds.text, seeds.surface), `${p.label} ${half}`).toBeGreaterThan(4.5);
        expect(contrast(seeds.inputText, seeds.inputBg), `${p.label} ${half} field`).toBeGreaterThan(4.5);
      }
    }
  });

  it('writes a :root block that only contains variables', () => {
    const css = paletteCss(DAAKIA, 'dark');
    expect(css.startsWith(':root {')).toBe(true);
    for (const line of css.split('\n').slice(1, -1)) {
      expect(line.trim()).toMatch(/^--[\w-]+: .+;$/);
    }
  });

  it('leaves identity colours alone unless the theme asks', () => {
    expect(paletteCss(DAAKIA, 'dark')).not.toContain('--color-protocol-rest');
    const withIdentity: AppPalette = { ...DAAKIA, identity: { protocolRest: '#ff0000' } };
    expect(paletteCss(withIdentity, 'dark')).toContain('--color-protocol-rest: #ff0000;');
  });

  it('lets a named override win', () => {
    const css = paletteCss({ ...DAAKIA, overrides: { '--color-panel': '#123456' } }, 'dark');
    expect(css).toContain('--color-panel: #123456;');
    expect(css).not.toContain(`--color-panel: ${DAAKIA.dark.ground};`);
  });

  it('refuses an override that is not a variable name', () => {
    const css = paletteCss({ ...DAAKIA, overrides: { 'color: red; }': '#fff' } }, 'dark');
    expect(css).not.toContain('color: red');
  });
});

describe('deriving the half a theme did not ship', () => {
  it('produces a light half from a dark one', () => {
    const light = deriveLightSeeds(BUILT_IN_PALETTES[1].dark);
    expect(luminance(light.surface)).toBeGreaterThan(luminance(BUILT_IN_PALETTES[1].dark.surface));
    // A light theme's panel sits darker than its surface — the opposite of
    // the dark case, which flipping each seed independently gets wrong.
    expect(luminance(light.ground)).toBeLessThan(luminance(light.surface));
  });

  it('gives every seed a value', () => {
    const light = deriveLightSeeds(DAAKIA.dark);
    for (const key of SEED_KEYS) expect(light[key]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('reading a theme file', () => {
  const file = () => JSON.parse(serializeThemes([BUILT_IN_PALETTES[1]]));

  it('round-trips what it wrote', () => {
    const parsed = parseAppThemes(serializeThemes([BUILT_IN_PALETTES[1]]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.palettes[0].label).toBe('Tokyo Night');
    expect(parsed.palettes[0].dark).toEqual(BUILT_IN_PALETTES[1].dark);
  });

  it('tags each theme with its kind, so one file can carry both', () => {
    expect(file().themes[0].kind).toBe('app');
    const both = JSON.parse(serializeThemes([DAAKIA], [{ id: 't', label: 'T' }]));
    expect(both.themes.map((t: { kind: string }) => t.kind)).toEqual(['app', 'terminal']);
  });

  it('ignores the terminal half rather than choking on it', () => {
    // DUI's parser is the only thing that should decide whether a terminal
    // palette is valid.
    const parsed = parseAppThemes(serializeThemes([DAAKIA], [{ nonsense: true }]));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.palettes).toHaveLength(1);
  });

  it('takes a bare array and a single theme too', () => {
    expect(parseAppThemes([DAAKIA]).ok).toBe(true);
    expect(parseAppThemes(DAAKIA).ok).toBe(true);
  });

  it('derives the light half when a file ships only dark, and says so', () => {
    const { light: _light, ...darkOnly } = DAAKIA;
    const parsed = parseAppThemes([darkOnly]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.palettes[0].lightDerived).toBe(true);
  });

  describe('what it refuses', () => {
    it('anything that is not JSON, or is enormous', () => {
      expect(parseAppThemes('not json')).toMatchObject({ ok: false });
      expect(parseAppThemes('x'.repeat(2_000_001))).toMatchObject({ ok: false });
    });

    it('a theme with a colour that is not hex', () => {
      /*
        Not pedantry: the derivation does arithmetic on these, and `hsl()`
        comes out as NaN — which CSS discards silently, leaving one value
        from the old theme and the rest from the new one.
      */
      const bad = { ...DAAKIA, dark: { ...DAAKIA.dark, accent: 'hsl(240 60% 60%)' } };
      expect(parseAppThemes([bad])).toMatchObject({ ok: false });
    });

    it('a theme with no id or no name', () => {
      expect(parseAppThemes([{ ...DAAKIA, id: '' }])).toMatchObject({ ok: false });
      expect(parseAppThemes([{ ...DAAKIA, label: '  ' }])).toMatchObject({ ok: false });
    });

    it('an override that could close the rule it sits in', () => {
      const parsed = parseAppThemes([{ ...DAAKIA, overrides: { 'x; } body {': '#fff' } }]);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.palettes[0].overrides).toBeUndefined();
    });

    it('an empty file', () => {
      expect(parseAppThemes([])).toMatchObject({ ok: false });
    });
  });
});

describe('painting it', () => {
  beforeEach(() => { document.getElementById('daakia-theme')?.remove(); });

  it('writes one style element and rewrites it on the next change', () => {
    applyPalette(BUILT_IN_PALETTES[1], 'dark');
    expect(appliedCss()).toContain(BUILT_IN_PALETTES[1].dark.ground);
    applyPalette(BUILT_IN_PALETTES[2], 'dark');
    expect(document.querySelectorAll('#daakia-theme')).toHaveLength(1);
    expect(appliedCss()).toContain(BUILT_IN_PALETTES[2].dark.ground);
  });

  it('paints the half it is asked for', () => {
    applyPalette(BUILT_IN_PALETTES[1], 'light');
    expect(appliedCss()).toContain(BUILT_IN_PALETTES[1].light.ground);
  });

  it('removes itself rather than restating the stylesheet', () => {
    applyPalette(BUILT_IN_PALETTES[1], 'dark');
    applyPalette(null, 'dark');
    expect(document.getElementById('daakia-theme')).toBeNull();
  });
});
