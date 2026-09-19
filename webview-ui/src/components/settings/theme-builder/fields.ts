/**
 * What a builder edits, for each of the two kinds of theme.
 *
 * ── Why one description rather than two builders ──
 *
 * An app palette and a terminal palette are different lists of colours with
 * the same shape around them: an id, a name, a swatch, a dark half, a light
 * half, and a note saying whether the light one was authored. Everything a
 * builder does — pick a colour, copy the other half, check the contrast,
 * name it, save it — is the same work in both cases.
 *
 * So the builder takes one of these and knows nothing else about either kind.
 * Two builders would agree for about a month.
 */
import { TERMINAL_ANSI_KEYS, type TerminalAnsi, type TerminalPalette } from '@salilvnair/dui';
import { SEED_KEYS, SEED_META, type AppPalette, type AppSeeds } from '../../../services/theme/palette';

export type ThemeKind = 'app' | 'terminal';

export interface FieldSpec {
  key: string;
  label: string;
  /** One line saying what it reaches, shown under the picker. */
  hint?: string;
  /** Fields in the same group are drawn together under one heading. */
  group: string;
}

/**
 * A palette either kind can be edited as: a flat map of colours per half.
 *
 * The builder works in this shape and converts at the edges. It is the only
 * reason one component can drive both without a union type threaded through
 * every callback.
 */
export interface DraftPalette {
  id: string;
  label: string;
  swatch: string;
  dark: Record<string, string>;
  light: Record<string, string>;
  lightDerived?: boolean;
}

const APP_GROUPS: Record<keyof AppSeeds, string> = {
  ground: 'Surfaces', surface: 'Surfaces', border: 'Surfaces',
  text: 'Text', muted: 'Text',
  inputBg: 'Fields', inputBorder: 'Fields', inputText: 'Fields',
  accent: 'Accent',
  success: 'Status', warning: 'Status', error: 'Status', info: 'Status',
};

/* The ANSI sixteen, in the order a terminal lists them — normal row then
   bright row — because that is the order anybody comparing two themes reads
   them in. */
const TERMINAL_GROUPS: Record<string, string> = {
  foreground: 'Base', cursor: 'Base', selectionBackground: 'Base',
  black: 'Normal', red: 'Normal', green: 'Normal', yellow: 'Normal',
  blue: 'Normal', magenta: 'Normal', cyan: 'Normal', white: 'Normal',
  brightBlack: 'Bright', brightRed: 'Bright', brightGreen: 'Bright', brightYellow: 'Bright',
  brightBlue: 'Bright', brightMagenta: 'Bright', brightCyan: 'Bright', brightWhite: 'Bright',
};

const TERMINAL_HINTS: Record<string, string> = {
  foreground: 'Ordinary output, and anything the shell does not colour',
  cursor: 'The block, bar or underline',
  selectionBackground: 'Behind dragged text — translucent is usually right',
};

function humanise(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

export const APP_FIELDS: FieldSpec[] = SEED_KEYS.map(key => ({
  key,
  label: SEED_META[key].label,
  hint: SEED_META[key].reaches,
  group: APP_GROUPS[key],
}));

export const TERMINAL_FIELDS: FieldSpec[] = TERMINAL_ANSI_KEYS.map(key => ({
  key,
  label: humanise(key),
  hint: TERMINAL_HINTS[key],
  group: TERMINAL_GROUPS[key] ?? 'Normal',
}));

export function fieldsFor(kind: ThemeKind): FieldSpec[] {
  return kind === 'app' ? APP_FIELDS : TERMINAL_FIELDS;
}

// ── Converting at the edges ────────────────────────────────────────────────

export function appToDraft(p: AppPalette): DraftPalette {
  return {
    id: p.id, label: p.label, swatch: p.swatch,
    dark: { ...p.dark }, light: { ...p.light },
    lightDerived: p.lightDerived,
  };
}

export function terminalToDraft(p: TerminalPalette): DraftPalette {
  return {
    id: p.id, label: p.label, swatch: p.swatch,
    dark: { ...p.dark }, light: { ...p.light },
    lightDerived: p.lightDerived,
  };
}

export function draftToApp(d: DraftPalette): AppPalette {
  return {
    id: d.id, label: d.label, swatch: d.swatch,
    dark: d.dark as unknown as AppSeeds,
    light: d.light as unknown as AppSeeds,
    ...(d.lightDerived ? { lightDerived: true } : {}),
  };
}

export function draftToTerminal(d: DraftPalette): TerminalPalette {
  return {
    id: d.id, label: d.label, swatch: d.swatch,
    dark: d.dark as unknown as TerminalAnsi,
    light: d.light as unknown as TerminalAnsi,
    ...(d.lightDerived ? { lightDerived: true } : {}),
  };
}

/**
 * An id from a name, kept stable while the name is being typed.
 *
 * A builder that regenerated the id on every keystroke would save "My th",
 * "My the", "My them" and "My theme" as four themes the first time somebody
 * typed slowly and hit save.
 */
export function idFromLabel(label: string, taken: string[]): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
