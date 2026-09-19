/**
 * What a Daakia theme is, and what it turns into.
 *
 * ── Thirteen seeds, not a hundred and one ──
 *
 * `index.css` declares 180 values for the dark theme. 101 of them are literal
 * colours and the other 78 already derive from something else — `color-mix`
 * or a `var()` pointing at a neighbour. Of the 101, most are shades of four or
 * five real decisions: four flavours of surface, four of input, three of text.
 *
 * So a theme answers thirteen questions and this file derives the rest, the
 * same way the stylesheet already derives 78 of them. Asking somebody for a
 * hundred and one colours is not a feature, it is a chore nobody finishes.
 *
 * ── Why this lives here and not in DUI ──
 *
 * The terminal palette lives in DUI because the component that renders it does.
 * These values drive Daakia's own stylesheet, which DUI has never heard of —
 * and putting them there would put this feature behind an npm publish for no
 * benefit. The file format still carries both kinds, so one export is still
 * one attachment; see palette-file.ts.
 */
import { mix, alpha, flipForOtherGround, isDarkColour } from './colour';

/** The thirteen. Everything a reader looks at comes out of these. */
export interface AppSeeds {
  /** Sidebars, tab strips, the ground everything sits on. */
  ground: string;
  /** Editors, cards, the pane you read. */
  surface: string;
  border: string;
  text: string;
  muted: string;
  inputBg: string;
  inputBorder: string;
  /**
   * The text inside a value field.
   *
   * Reaches native inputs and textareas. The DUI contenteditable editors —
   * the URL bars — take `--color-text-primary` from an inline style, so they
   * follow `text` instead; every built-in below sets the two the same so the
   * difference is invisible unless somebody deliberately diverges them.
   */
  inputText: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

/**
 * The colours that tell one thing from another, rather than setting a mood.
 *
 * Optional, and off unless a theme says otherwise. You read *orange* and know
 * it is a POST before you have read the word; a palette that makes every
 * method a shade of its own accent looks tidier and takes that away.
 */
export interface IdentityColours {
  protocolRest: string;
  protocolGraphql: string;
  protocolWebsocket: string;
  protocolSse: string;
  protocolSocketio: string;
  protocolMqtt: string;
  protocolGrpc: string;
  protocolSoap: string;
  protocolAi: string;
  protocolMcp: string;
  methodGet: string;
  methodPost: string;
  methodPut: string;
  methodPatch: string;
  methodDelete: string;
  methodHead: string;
  methodOptions: string;
}

export interface AppPalette {
  id: string;
  label: string;
  /** The colour that stands for this palette in the picker. */
  swatch: string;
  dark: AppSeeds;
  light: AppSeeds;
  /**
   * The light half was computed, not authored.
   *
   * Worth carrying because it is worth saying: a derived variant is legible
   * rather than designed, and somebody deciding whether to keep a theme should
   * know which of the two they are looking at. Same rule the terminal follows.
   */
  lightDerived?: boolean;
  /** Opt-in. Absent means Daakia keeps its own. */
  identity?: Partial<IdentityColours>;
  /**
   * The escape hatch: any `--color-*` by name, applied after everything else.
   *
   * Thirteen seeds is what makes a theme five minutes of work. This is what
   * stops the answer to "can I change *that* one" being no.
   */
  overrides?: Record<string, string>;
  /** Shipped with Daakia rather than imported. */
  builtIn?: boolean;
}

export const SEED_KEYS: (keyof AppSeeds)[] = [
  'ground', 'surface', 'border', 'text', 'muted',
  'inputBg', 'inputBorder', 'inputText',
  'accent', 'success', 'warning', 'error', 'info',
];

/** What each seed is called and what it reaches, for the settings page. */
export const SEED_META: Record<keyof AppSeeds, { label: string; reaches: string }> = {
  ground: { label: 'Ground', reaches: 'Sidebars, tab strips, the panel behind everything' },
  surface: { label: 'Surface', reaches: 'Editors, cards, modals, and the hover and active shades of each' },
  border: { label: 'Border', reaches: 'Every divider, outline and separator' },
  text: { label: 'Text', reaches: 'Body text, and the secondary shade between it and Muted' },
  muted: { label: 'Muted', reaches: 'Placeholders, captions, disabled labels' },
  inputBg: { label: 'Field', reaches: 'The inside of every text field, and its hover' },
  inputBorder: { label: 'Field border', reaches: 'The outline of every text field' },
  inputText: { label: 'Field text', reaches: 'What you type into a native field' },
  accent: { label: 'Accent', reaches: 'Primary buttons, focus rings, selection, every accent wash' },
  success: { label: 'Success', reaches: '2xx, connected, passing tests' },
  warning: { label: 'Warning', reaches: '4xx, unsaved, mock server' },
  error: { label: 'Error', reaches: '5xx, failures, destructive actions' },
  info: { label: 'Info', reaches: 'Notices and neutral highlights' },
};

// ── Daakia's own palette, restated as seeds ────────────────────────────────

const DAAKIA_DARK: AppSeeds = {
  ground: '#181818',
  surface: '#1e1e1e',
  border: '#414141',
  text: '#d4d4d4',
  muted: '#6d6d6d',
  inputBg: '#2d2d2d',
  inputBorder: '#3c3c3c',
  inputText: '#d4d4d4',
  accent: '#6366f1',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
};

const DAAKIA_LIGHT: AppSeeds = {
  ground: '#f3f3f3',
  surface: '#ffffff',
  border: '#d8d8d8',
  text: '#1f2328',
  muted: '#6e7781',
  inputBg: '#ffffff',
  inputBorder: '#d0d7de',
  inputText: '#1f2328',
  accent: '#4338ca',
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  info: '#2563eb',
};

/**
 * The built-ins.
 *
 * Daakia's own first, then palettes people already recognise from their own
 * editors — the same reasoning the terminal's six follow. A theme in somebody
 * else's tool should be able to look like the one they configured for
 * themselves.
 */
export const BUILT_IN_PALETTES: AppPalette[] = [
  {
    id: 'daakia',
    label: 'Daakia',
    swatch: '#6366f1',
    dark: DAAKIA_DARK,
    light: DAAKIA_LIGHT,
    builtIn: true,
  },
  {
    id: 'tokyo',
    label: 'Tokyo Night',
    swatch: '#7aa2f7',
    dark: {
      ground: '#16161e', surface: '#1a1b26', border: '#2f3549',
      text: '#a9b1d6', muted: '#565f89',
      inputBg: '#1f2335', inputBorder: '#343b58', inputText: '#a9b1d6',
      accent: '#7aa2f7', success: '#9ece6a', warning: '#e0af68',
      error: '#f7768e', info: '#7dcfff',
    },
    light: {
      ground: '#e6e7ed', surface: '#f2f3f7', border: '#c4c8da',
      text: '#343b58', muted: '#6c7394',
      inputBg: '#ffffff', inputBorder: '#c4c8da', inputText: '#343b58',
      accent: '#2e5ec9', success: '#4a7a22', warning: '#8f6424',
      error: '#b4263f', info: '#1c7c9e',
    },
    builtIn: true,
  },
  {
    id: 'gruvbox',
    label: 'Gruvbox',
    swatch: '#fabd2f',
    dark: {
      ground: '#1d2021', surface: '#282828', border: '#504945',
      text: '#ebdbb2', muted: '#928374',
      inputBg: '#32302f', inputBorder: '#504945', inputText: '#ebdbb2',
      accent: '#fabd2f', success: '#b8bb26', warning: '#fe8019',
      error: '#fb4934', info: '#83a598',
    },
    light: {
      ground: '#f2e5bc', surface: '#fbf1c7', border: '#d5c4a1',
      text: '#3c3836', muted: '#7c6f64',
      inputBg: '#fbf1c7', inputBorder: '#d5c4a1', inputText: '#3c3836',
      accent: '#b57614', success: '#79740e', warning: '#af3a03',
      error: '#9d0006', info: '#076678',
    },
    builtIn: true,
  },
  {
    id: 'nord',
    label: 'Nord',
    swatch: '#88c0d0',
    dark: {
      ground: '#2e3440', surface: '#3b4252', border: '#4c566a',
      text: '#eceff4', muted: '#7b88a1',
      inputBg: '#434c5e', inputBorder: '#4c566a', inputText: '#eceff4',
      accent: '#88c0d0', success: '#a3be8c', warning: '#ebcb8b',
      error: '#bf616a', info: '#81a1c1',
    },
    light: {
      ground: '#e5e9f0', surface: '#eceff4', border: '#c2ccdb',
      text: '#2e3440', muted: '#5c6a83',
      inputBg: '#ffffff', inputBorder: '#c2ccdb', inputText: '#2e3440',
      accent: '#2f7c96', success: '#4f7a3a', warning: '#996b1f',
      error: '#a3454e', info: '#3c6491',
    },
    builtIn: true,
  },
  {
    id: 'rose',
    label: 'Rosé Pine',
    swatch: '#c4a7e7',
    dark: {
      ground: '#191724', surface: '#1f1d2e', border: '#403d52',
      text: '#e0def4', muted: '#6e6a86',
      inputBg: '#26233a', inputBorder: '#403d52', inputText: '#e0def4',
      accent: '#c4a7e7', success: '#9ccfd8', warning: '#f6c177',
      error: '#eb6f92', info: '#31748f',
    },
    light: {
      ground: '#faf4ed', surface: '#fffaf3', border: '#dfd9d2',
      text: '#575279', muted: '#797593',
      inputBg: '#fffaf3', inputBorder: '#dfd9d2', inputText: '#575279',
      accent: '#907aa9', success: '#286983', warning: '#ea9d34',
      error: '#b4637a', info: '#56949f',
    },
    builtIn: true,
  },
];

// ── Seeds → the stylesheet ─────────────────────────────────────────────────

/**
 * The variables a theme sets, derived from its thirteen.
 *
 * Everything not listed here keeps whatever `index.css` gives it, which is the
 * point: the 78 values that already derive from a neighbour follow these
 * without being mentioned, and nothing in the stylesheet has to move.
 */
export function cssVariables(seeds: AppSeeds): Record<string, string> {
  const { ground, surface, border, text, muted, accent } = seeds;
  const onDark = isDarkColour(ground);
  /* Lift towards the text colour on a dark ground and away from it on a light
     one — "slightly raised" is a different direction in each. */
  const lift = (base: string, amount: number) => mix(text, base, onDark ? amount : amount * 0.55);

  return {
    '--color-panel': ground,
    '--color-panel-border': mix(border, ground, 0.6),

    '--color-surface': surface,
    '--color-surface-bg': surface,
    '--color-surface-hover': lift(surface, 0.06),
    '--color-surface-active': lift(surface, 0.11),
    '--color-surface-border': border,
    '--color-elevated': lift(surface, 0.04),
    '--color-elevated-border': mix(border, text, 0.12),

    '--color-input-bg': seeds.inputBg,
    '--color-input-border': seeds.inputBorder,
    '--color-input-hover': lift(seeds.inputBg, 0.05),
    '--color-input-focus': seeds.inputBg,
    '--color-input-text': seeds.inputText,

    '--color-text-primary': text,
    '--color-text-secondary': mix(text, muted, 0.55),
    '--color-text-muted': muted,

    '--color-primary': accent,
    '--color-primary-hover': mix(accent, text, 0.82),
    '--color-primary-light': mix(accent, text, 0.62),
    '--color-primary-dark': mix(accent, ground, 0.78),
    '--color-accent': accent,
    '--color-icon-hover-bg': alpha(accent, 0.15),
    '--color-item-hover-bg': lift(surface, 0.06),

    '--color-success': seeds.success,
    '--color-warning': seeds.warning,
    '--color-error': seeds.error,
    '--color-info': seeds.info,

    /* Three values that are about the ground, not the palette — a backdrop
       over a light app should not be the same black as over a dark one. */
    '--color-modal-backdrop': onDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.32)',
    '--color-toggle-thumb': onDark ? '#ffffff' : '#ffffff',
    '--color-btn-primary-text': isDarkColour(accent) ? '#ffffff' : '#101014',
  };
}

const IDENTITY_VARS: Record<keyof IdentityColours, string> = {
  protocolRest: '--color-protocol-rest',
  protocolGraphql: '--color-protocol-graphql',
  protocolWebsocket: '--color-protocol-websocket',
  protocolSse: '--color-protocol-sse',
  protocolSocketio: '--color-protocol-socketio',
  protocolMqtt: '--color-protocol-mqtt',
  protocolGrpc: '--color-protocol-grpc',
  protocolSoap: '--color-protocol-soap',
  protocolAi: '--color-protocol-ai',
  protocolMcp: '--color-protocol-mcp',
  methodGet: '--color-method-get',
  methodPost: '--color-method-post',
  methodPut: '--color-method-put',
  methodPatch: '--color-method-patch',
  methodDelete: '--color-method-delete',
  methodHead: '--color-method-head',
  methodOptions: '--color-method-options',
};

export const IDENTITY_KEYS = Object.keys(IDENTITY_VARS) as (keyof IdentityColours)[];

/** Human labels for the identity list, in the order the settings page shows them. */
export const IDENTITY_META: Record<keyof IdentityColours, string> = {
  protocolRest: 'REST', protocolGraphql: 'GraphQL', protocolWebsocket: 'WebSocket',
  protocolSse: 'SSE', protocolSocketio: 'Socket.IO', protocolMqtt: 'MQTT',
  protocolGrpc: 'gRPC', protocolSoap: 'SOAP', protocolAi: 'AI', protocolMcp: 'MCP',
  methodGet: 'GET', methodPost: 'POST', methodPut: 'PUT', methodPatch: 'PATCH',
  methodDelete: 'DELETE', methodHead: 'HEAD', methodOptions: 'OPTIONS',
};

/**
 * The whole `:root` block for one palette in one mode.
 *
 * Order matters and is the order of increasing specificity of intent: derived
 * chrome, then identity if the theme asked for it, then named overrides, which
 * win because somebody typed them.
 */
export function paletteCss(palette: AppPalette, mode: 'dark' | 'light'): string {
  const vars = cssVariables(mode === 'dark' ? palette.dark : palette.light);

  for (const key of IDENTITY_KEYS) {
    const value = palette.identity?.[key];
    if (value) vars[IDENTITY_VARS[key]] = value;
  }
  for (const [name, value] of Object.entries(palette.overrides ?? {})) {
    if (/^--[\w-]+$/.test(name)) vars[name] = value;
  }

  const body = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `:root {\n${body}\n}`;
}

/** A light half for a theme that only authored a dark one. */
export function deriveLightSeeds(dark: AppSeeds): AppSeeds {
  const out = {} as AppSeeds;
  for (const key of SEED_KEYS) {
    out[key] = flipForOtherGround(dark[key], true);
  }
  /*
    The two grounds are inverted rather than flipped hue-wise: a light theme's
    panel has to be *darker* than its surface, which is the opposite of the
    dark case, and running each through the generic flip independently loses
    that relationship about half the time.
  */
  out.surface = flipForOtherGround(dark.surface, true);
  out.ground = mix(out.surface, dark.text, 0.94);
  out.inputBg = out.surface;
  out.inputText = out.text;
  return out;
}
