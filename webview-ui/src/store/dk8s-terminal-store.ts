/**
 * What the pod terminal looks like and how it behaves.
 *
 * Separate from the pod store for the same reason the AI store is: this
 * outlives every pod. A palette and a font size are preferences about how you
 * read, not properties of a cluster, and folding them into the pod store would
 * throw them away on every selection.
 *
 * ── Where this lives, and why not the host ──
 *
 * In the webview's own `localStorage`, which in a VS Code webview is scoped to
 * the panel and survives reloads. That is the whole storage surface: no file
 * is written, no path crosses to the extension, and an imported theme never
 * becomes something on disk. A preference about colours does not deserve a
 * filesystem API, and every one avoided is one that cannot be pointed
 * somewhere it should not go.
 *
 * ── Everything read back is re-validated ──
 *
 * `localStorage` is not a trusted store. It is per-origin, it is editable by
 * anything that can run in this context, and it survives an upgrade that
 * changed what a theme means. So what comes out of it goes through the same
 * parser an imported file does — see `parseTerminalThemes` in dui, which is
 * where the reasoning about why that matters lives.
 */
import { create } from 'zustand';
import {
  TERMINAL_PALETTES, parseTerminalThemes, MAX_THEMES_STORED,
  type TerminalPalette,
} from '@salilvnair/dui';

/**
 * Six on the strip, however many are stored.
 *
 * The picker is a row of swatches you choose from by looking, and that stops
 * being true somewhere around seven — past it the row is a legend you have to
 * read. Storing more is fine and useful; showing more is not, so the cap is on
 * what is *selected* rather than on what is kept.
 */
export const MAX_SELECTED = 6;

const KEY = 'dk8s.terminal.v1';

export interface TerminalPrefs {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  cursorBlink: boolean;
  cursorStyle: 'block' | 'bar' | 'underline';
  scrollback: number;
  /** Selecting text puts it on the clipboard, the way a real terminal does. */
  copyOnSelect: boolean;
  /**
   * Send an LS_COLORS override when a shell opens.
   *
   * GNU coreutils paints world-writable and sticky directories black on green,
   * and in a container — where /tmp, /config and every mounted volume are
   * world-writable — that is most of a listing highlighted like an alarm. On
   * by default, and a setting because it IS a real warning and someone
   * auditing permissions may want it back.
   */
  tidyLsColors: boolean;
  /** Reopen the shell when the tab is opened, rather than waiting for a click. */
  openOnArrival: boolean;
  /** Escape ends the shell. Off leaves Escape to the shell and to going back. */
  escapeCloses: boolean;
}

export const DEFAULT_PREFS: TerminalPrefs = {
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  lineHeight: 1.25,
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 10_000,
  copyOnSelect: false,
  tidyLsColors: true,
  openOnArrival: true,
  escapeCloses: true,
};

/**
 * Bounds on every numeric preference.
 *
 * Not paranoia about the user — they came from a slider. They are about what
 * comes back out of storage, where a scrollback of 50,000,000 is one edit away
 * and would allocate until the panel died.
 */
const LIMITS = {
  fontSize: [8, 24] as const,
  lineHeight: [1, 2] as const,
  scrollback: [1_000, 50_000] as const,
};

function clamp(n: unknown, [lo, hi]: readonly [number, number], fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

/**
 * A font stack, checked the way a colour is.
 *
 * It reaches CSS as `font-family`, so the same reasoning applies: allow the
 * characters a font stack is written with and nothing else. A semicolon or a
 * brace here would be a way to end the declaration and start another one.
 */
const FONT_STACK = /^[a-zA-Z0-9 ,'"_-]{1,200}$/;

function prefsOf(raw: unknown): TerminalPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFS };
  const o = raw as Record<string, unknown>;
  const family = typeof o.fontFamily === 'string' && FONT_STACK.test(o.fontFamily)
    ? o.fontFamily : DEFAULT_PREFS.fontFamily;
  const style = o.cursorStyle;
  return {
    fontSize: clamp(o.fontSize, LIMITS.fontSize, DEFAULT_PREFS.fontSize),
    fontFamily: family,
    lineHeight: clamp(o.lineHeight, LIMITS.lineHeight, DEFAULT_PREFS.lineHeight),
    cursorBlink: o.cursorBlink !== false,
    cursorStyle: style === 'bar' || style === 'underline' ? style : 'block',
    scrollback: Math.round(clamp(o.scrollback, LIMITS.scrollback, DEFAULT_PREFS.scrollback)),
    copyOnSelect: o.copyOnSelect === true,
    tidyLsColors: o.tidyLsColors !== false,
    openOnArrival: o.openOnArrival !== false,
    escapeCloses: o.escapeCloses !== false,
  };
}

interface Stored {
  custom?: unknown;
  order?: unknown;
  selected?: unknown;
  active?: unknown;
  prefs?: unknown;
}

const BUILT_IN_IDS = TERMINAL_PALETTES.map(t => t.id);

function read(): {
  custom: TerminalPalette[]; order: string[]; selected: string[];
  active: string; prefs: TerminalPrefs;
} {
  const blank = {
    custom: [], order: [...BUILT_IN_IDS], selected: [...BUILT_IN_IDS].slice(0, MAX_SELECTED),
    active: BUILT_IN_IDS[0], prefs: { ...DEFAULT_PREFS },
  };
  let s: Stored;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank;
    s = JSON.parse(raw) as Stored;
  } catch {
    // Private mode, a quota error, or something that is not JSON any more.
    return blank;
  }

  // Re-validated, not trusted — see the note at the top of the file.
  let custom: TerminalPalette[] = [];
  if (Array.isArray(s.custom) && s.custom.length) {
    const parsed = parseTerminalThemes(s.custom);
    if (parsed.ok) custom = parsed.themes.filter(t => !BUILT_IN_IDS.includes(t.id));
  }

  const known = new Set([...BUILT_IN_IDS, ...custom.map(t => t.id)]);
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && known.has(x)) : [];

  // Anything stored but unordered goes to the end, so a theme is never
  // invisible because an older build did not know to list it.
  const order = [...new Set(strings(s.order))];
  for (const id of known) if (!order.includes(id)) order.push(id);

  let selected = [...new Set(strings(s.selected))].slice(0, MAX_SELECTED);
  if (!selected.length) selected = order.slice(0, MAX_SELECTED);

  const active = typeof s.active === 'string' && known.has(s.active) ? s.active : selected[0];

  return { custom, order, selected, active, prefs: prefsOf(s.prefs) };
}

export interface Dk8sTerminalState {
  custom: TerminalPalette[];
  /** Display order across built-ins and custom themes alike. */
  order: string[];
  /** The ids on the swatch strip, at most `MAX_SELECTED`. */
  selected: string[];
  active: string;
  prefs: TerminalPrefs;

  /** Every theme, in `order`. */
  themes: () => TerminalPalette[];
  /** The ones on the strip, in `order`. */
  strip: () => TerminalPalette[];
  theme: (id?: string) => TerminalPalette;
  isBuiltIn: (id: string) => boolean;

  setActive: (id: string) => void;
  toggleSelected: (id: string) => { ok: boolean; reason?: string };
  reorder: (from: number, to: number) => void;
  /** Returns what happened, so the caller can say it rather than guess. */
  importThemes: (input: unknown) => { ok: boolean; added: number; replaced: number; error?: string };
  removeTheme: (id: string) => void;
  setPref: <K extends keyof TerminalPrefs>(key: K, value: TerminalPrefs[K]) => void;
  resetPrefs: () => void;
}

function persist(s: Dk8sTerminalState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      custom: s.custom, order: s.order, selected: s.selected,
      active: s.active, prefs: s.prefs,
    }));
  } catch {
    /*
      Storage can be full or unavailable, and that is not worth an error.

      Everything here is a preference with a working default; the session keeps
      the choice in memory either way, and the only loss is that it does not
      survive a reload. Interrupting someone to say so would be louder than the
      problem.
    */
  }
}

export const useDk8sTerminalStore = create<Dk8sTerminalState>((set, get) => ({
  ...read(),

  themes: () => {
    const { order, custom } = get();
    const all = [...TERMINAL_PALETTES, ...custom];
    return order.map(id => all.find(t => t.id === id)).filter((t): t is TerminalPalette => !!t);
  },

  strip: () => get().themes().filter(t => get().selected.includes(t.id)),

  theme: (id) => {
    const want = id ?? get().active;
    return get().themes().find(t => t.id === want) ?? TERMINAL_PALETTES[0];
  },

  isBuiltIn: (id) => BUILT_IN_IDS.includes(id),

  setActive: (id) => set(s => {
    if (!s.themes().some(t => t.id === id)) return s;
    const next = { ...s, active: id };
    persist(next);
    return next;
  }),

  toggleSelected: (id) => {
    const s = get();
    const on = s.selected.includes(id);
    if (!on && s.selected.length >= MAX_SELECTED) {
      return {
        ok: false,
        reason: `The strip holds ${MAX_SELECTED}. Uncheck one to make room.`,
      };
    }
    /*
      The active theme cannot be unchecked out from under itself.

      Unchecking it would leave the terminal painted in a theme with no swatch
      to change it back with — the strip is the only control, so removing the
      current one from the strip is removing the way out.
    */
    if (on && id === s.active) {
      return { ok: false, reason: 'This is the theme in use. Pick another one first.' };
    }
    if (on && s.selected.length === 1) {
      return { ok: false, reason: 'At least one theme has to be on the strip.' };
    }
    set(st => {
      const next = {
        ...st,
        selected: on ? st.selected.filter(x => x !== id) : [...st.selected, id],
      };
      persist(next);
      return next;
    });
    return { ok: true };
  },

  reorder: (from, to) => set(s => {
    if (from === to || from < 0 || to < 0 || from >= s.order.length || to >= s.order.length) return s;
    const order = [...s.order];
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    const next = { ...s, order };
    persist(next);
    return next;
  }),

  importThemes: (input) => {
    const parsed = parseTerminalThemes(input);
    if (!parsed.ok) return { ok: false, added: 0, replaced: 0, error: parsed.error };

    const s = get();
    /*
      A built-in's id is not available to an import.

      Letting a file overwrite "tokyo" would mean the six themes everyone can
      be told to look for are not the same six on every machine, and there
      would be no way to get the original back short of clearing storage. An
      import that wants to be a variant can say so in its own id.
    */
    const clashes = parsed.themes.filter(t => BUILT_IN_IDS.includes(t.id));
    if (clashes.length) {
      return {
        ok: false, added: 0, replaced: 0,
        error: `"${clashes[0].id}" is a built-in theme. Give the imported one a different id.`,
      };
    }

    const byId = new Map(s.custom.map(t => [t.id, t]));
    let added = 0; let replaced = 0;
    for (const t of parsed.themes) {
      if (byId.has(t.id)) replaced++; else added++;
      byId.set(t.id, t);
    }
    const custom = [...byId.values()];
    if (custom.length + BUILT_IN_IDS.length > MAX_THEMES_STORED) {
      return {
        ok: false, added: 0, replaced: 0,
        error: `That would store ${custom.length + BUILT_IN_IDS.length} themes; `
          + `the limit is ${MAX_THEMES_STORED}.`,
      };
    }

    set(st => {
      const order = [...st.order];
      for (const t of parsed.themes) if (!order.includes(t.id)) order.push(t.id);
      const next = { ...st, custom, order };
      persist(next);
      return next;
    });
    return { ok: true, added, replaced };
  },

  removeTheme: (id) => set(s => {
    if (BUILT_IN_IDS.includes(id)) return s;
    const custom = s.custom.filter(t => t.id !== id);
    const order = s.order.filter(x => x !== id);
    let selected = s.selected.filter(x => x !== id);
    if (!selected.length) selected = order.slice(0, 1);
    const active = s.active === id ? selected[0] : s.active;
    const next = { ...s, custom, order, selected, active };
    persist(next);
    return next;
  }),

  setPref: (key, value) => set(s => {
    // Back through the same validator the stored blob goes through, so a
    // control with a bug cannot write a preference storage would reject.
    const next = { ...s, prefs: prefsOf({ ...s.prefs, [key]: value }) };
    persist(next);
    return next;
  }),

  resetPrefs: () => set(s => {
    const next = { ...s, prefs: { ...DEFAULT_PREFS } };
    persist(next);
    return next;
  }),
}));
