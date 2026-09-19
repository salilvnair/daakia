/**
 * Reading and writing a theme file, and never trusting one.
 *
 * ── One file, two kinds ──
 *
 * An export carries whatever you have: the app palette, the terminal palette,
 * or both, each tagged with its `kind`. "Here is my Daakia setup" should be
 * one attachment rather than two files somebody has to import in the right
 * order — and the parser learns one more branch instead of being cloned.
 *
 * ── Everything read back goes through this ──
 *
 * Including what comes out of localStorage. That store is per-origin,
 * editable by anything that can run in this context, and it survives an
 * upgrade that changed what a palette means. A file somebody was sent and a
 * value the app wrote itself are the same class of input, so they take the
 * same road in.
 *
 * Colours are hex and only hex. Not pedantry: the derivation that turns
 * thirteen seeds into sixty variables does real arithmetic on them, and a
 * `hsl()` or a bare colour name would come out of it as `NaN` — which CSS
 * discards silently, leaving one value from the old theme and the rest from
 * the new one.
 */
import {
  SEED_KEYS, IDENTITY_KEYS, deriveLightSeeds,
  type AppPalette, type AppSeeds, type IdentityColours,
} from './palette';

export const THEME_FORMAT = 'daakia.theme';
export const THEME_VERSION = 1;
/** Enough to collect from, small enough that the list stays a list. */
export const MAX_THEMES_STORED = 200;
const MAX_FILE_BYTES = 2_000_000;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export type ParseResult =
  | { ok: true; palettes: AppPalette[] }
  | { ok: false; error: string };

function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v.trim());
}

function seedsOf(raw: unknown, where: string): AppSeeds | string {
  if (!raw || typeof raw !== 'object') return `${where} is missing its colours.`;
  const o = raw as Record<string, unknown>;
  const out = {} as AppSeeds;
  for (const key of SEED_KEYS) {
    const v = o[key];
    if (!isHex(v)) return `${where} has no valid ${key} colour.`;
    out[key] = v.trim().toLowerCase();
  }
  return out;
}

function identityOf(raw: unknown): Partial<IdentityColours> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const out: Partial<IdentityColours> = {};
  for (const key of IDENTITY_KEYS) {
    const v = o[key];
    if (isHex(v)) out[key] = v.trim().toLowerCase();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The named overrides, filtered to things that can only be CSS variables.
 *
 * A name is checked against `--[\w-]+` and a value against hex, so an
 * override cannot smuggle a `}` and close the rule it sits in — the style
 * element this ends up in is written as text.
 */
function overridesOf(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (/^--[\w-]+$/.test(name) && isHex(value)) out[name] = (value as string).trim().toLowerCase();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function paletteOf(raw: unknown, where: string): AppPalette | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return `${where} is not a theme.`;
  const o = raw as Record<string, unknown>;

  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : null;
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : null;
  if (!id) return `${where} has no id.`;
  if (!label) return `${where} has no name.`;

  const dark = seedsOf(o.dark, `"${label}"`);
  if (typeof dark === 'string') return dark;

  /*
    A theme that ships only a dark half still works, and says so.

    Deriving is how a palette from somebody's editor — where the light variant
    is usually an afterthought or absent — becomes usable here. Marking it is
    the honest part: a derived variant is legible rather than designed, and
    whoever is deciding whether to keep the theme should know which they are
    looking at.
  */
  let light = seedsOf(o.light, `"${label}"`);
  let lightDerived = false;
  if (typeof light === 'string') {
    light = deriveLightSeeds(dark);
    lightDerived = true;
  }

  const swatch = isHex(o.swatch) ? (o.swatch as string).trim().toLowerCase() : dark.accent;

  return {
    id, label, swatch, dark, light,
    ...(lightDerived ? { lightDerived: true } : {}),
    ...(identityOf(o.identity) ? { identity: identityOf(o.identity) } : {}),
    ...(overridesOf(o.overrides) ? { overrides: overridesOf(o.overrides) } : {}),
  };
}

/**
 * Every app palette in whatever was handed over.
 *
 * Tolerant about shape and strict about content: a Daakia theme file, a bare
 * array, or a single palette all get read, and anything inside them that is
 * not a valid palette is the thing that fails.
 */
export function parseAppThemes(input: unknown): ParseResult {
  let raw = input;

  if (typeof raw === 'string') {
    if (raw.length > MAX_FILE_BYTES) return { ok: false, error: 'That file is too large to be a theme.' };
    try { raw = JSON.parse(raw); } catch { return { ok: false, error: 'That is not valid JSON.' }; }
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'That is not a theme file.' };

  let entries: unknown[];
  if (Array.isArray(raw)) {
    entries = raw;
  } else {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.themes)) {
      /* The one-file form: keep the app ones, ignore the terminal ones —
         those are DUI's to read, and its parser is the only thing that
         should be deciding whether one is valid. */
      entries = o.themes.filter(t => {
        const kind = (t as Record<string, unknown>)?.kind;
        return kind === undefined || kind === 'app';
      });
    } else if (Array.isArray(o.app)) {
      entries = o.app;
    } else {
      entries = [raw];
    }
  }

  if (entries.length === 0) return { ok: false, error: 'That file has no Daakia themes in it.' };
  if (entries.length > MAX_THEMES_STORED) {
    return { ok: false, error: `That file has more than ${MAX_THEMES_STORED} themes in it.` };
  }

  const palettes: AppPalette[] = [];
  for (let i = 0; i < entries.length; i++) {
    const parsed = paletteOf(entries[i], `Theme ${i + 1}`);
    if (typeof parsed === 'string') return { ok: false, error: parsed };
    palettes.push(parsed);
  }
  return { ok: true, palettes };
}

/**
 * A file carrying app palettes, and any terminal ones handed alongside them.
 *
 * The terminal side is passed through untouched — this is not the place that
 * knows what a terminal palette is, only the place that knows they travel
 * together.
 */
export function serializeThemes(
  app: AppPalette[], terminal: unknown[] = [],
): string {
  return JSON.stringify({
    [THEME_FORMAT]: THEME_VERSION,
    themes: [
      ...app.map(p => ({ kind: 'app' as const, ...stripRuntime(p) })),
      ...terminal.map(t => ({ kind: 'terminal' as const, ...(t as object) })),
    ],
  }, null, 2);
}

/** `builtIn` is about this install, not about the theme. */
function stripRuntime(p: AppPalette): Omit<AppPalette, 'builtIn'> {
  const { builtIn: _builtIn, ...rest } = p;
  return rest;
}
