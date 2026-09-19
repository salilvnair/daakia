/**
 * Which palette the app is wearing, and the ones you have collected.
 *
 * ── Where this lives ──
 *
 * In the webview's own `localStorage`, which in a VS Code webview is scoped
 * to the panel and survives reloads. That is the whole storage surface: no
 * file is written, no path crosses to the extension, and an imported theme
 * never becomes something on disk. The terminal palettes made the same call
 * for the same reason — a preference about colours does not deserve a
 * filesystem API, and every one avoided is one that cannot be pointed
 * somewhere it should not go.
 *
 * ── Everything read back is re-validated ──
 *
 * `localStorage` is not a trusted store. What comes out of it goes through
 * the same parser an imported file does; see palette-file.ts.
 *
 * ── One theme for the app, not one per workspace ──
 *
 * The terminal's is app-wide and nobody has asked otherwise. A theme that
 * changed when you switched workspace would read as a bug the first three
 * times it happened. Easy to add later, hard to take away.
 */
import { create } from 'zustand';
import { BUILT_IN_PALETTES, type AppPalette } from '../services/theme/palette';
import { parseAppThemes, MAX_THEMES_STORED } from '../services/theme/palette-file';
import { applyPalette } from '../services/theme/apply';

const KEY = 'daakia.theme.v1';

/** The dark/light choice, which is a separate question from which palette. */
export type ThemeMode = 'dark' | 'light' | 'system';

interface Stored {
  /** Imported ones. The built-ins are code, not data. */
  custom: AppPalette[];
  /** Which palette is worn. */
  selected: string;
  /** Ids the reader has hidden, built-ins included. */
  hidden: string[];
}

interface AppThemeState {
  custom: AppPalette[];
  selected: string;
  hidden: string[];
  /** Built-ins then imported, minus anything hidden. */
  palettes: () => AppPalette[];
  /** The one being worn, or the first built-in if it has gone. */
  current: () => AppPalette;
  select: (id: string) => void;
  add: (palettes: AppPalette[]) => { added: number; error?: string };
  remove: (id: string) => void;
  setHidden: (id: string, hidden: boolean) => void;
  /** Repaint in the given mode — called when dark/light changes too. */
  repaint: (mode: 'dark' | 'light') => void;
}

function read(): Stored {
  const empty: Stored = { custom: [], selected: BUILT_IN_PALETTES[0].id, hidden: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const themes = parseAppThemes(parsed.custom ?? []);
    return {
      custom: themes.ok ? themes.palettes : [],
      selected: typeof parsed.selected === 'string' ? parsed.selected : empty.selected,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter(h => typeof h === 'string') : [],
    };
  } catch {
    /* A store that cannot be read is a store that gets replaced, not one that
       takes the app down with it. */
    return empty;
  }
}

function write(s: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* private window, or full. Not worth failing a colour change over. */ }
}

/** The dark/light half to paint, resolving `system` against the OS. */
export function resolveMode(choice: ThemeMode): 'dark' | 'light' {
  if (choice !== 'system') return choice;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const initial = read();

export const useAppThemeStore = create<AppThemeState>((set, get) => ({
  custom: initial.custom,
  selected: initial.selected,
  hidden: initial.hidden,

  palettes: () => {
    const { custom, hidden } = get();
    const all = [...BUILT_IN_PALETTES, ...custom];
    return all.filter(p => !hidden.includes(p.id));
  },

  current: () => {
    const { selected } = get();
    const all = [...BUILT_IN_PALETTES, ...get().custom];
    return all.find(p => p.id === selected) ?? BUILT_IN_PALETTES[0];
  },

  select: (id) => {
    set({ selected: id });
    const { custom, hidden } = get();
    write({ custom, selected: id, hidden });
  },

  add: (palettes) => {
    const { custom, hidden, selected } = get();
    /*
      An id that already exists replaces rather than duplicates. Re-importing
      a file you edited is the common case, and ending up with two "Tokyo
      Night" entries that differ invisibly is the worst possible answer.
    */
    const byId = new Map(custom.map(p => [p.id, p]));
    let added = 0;
    for (const p of palettes) {
      if (BUILT_IN_PALETTES.some(b => b.id === p.id)) continue;
      byId.set(p.id, p);
      added++;
    }
    const next = [...byId.values()];
    if (next.length > MAX_THEMES_STORED) {
      return { added: 0, error: `That would take you past ${MAX_THEMES_STORED} stored themes.` };
    }
    set({ custom: next });
    write({ custom: next, selected, hidden });
    return { added };
  },

  remove: (id) => {
    const { custom, hidden } = get();
    const next = custom.filter(p => p.id !== id);
    const selected = get().selected === id ? BUILT_IN_PALETTES[0].id : get().selected;
    set({ custom: next, selected });
    write({ custom: next, selected, hidden });
  },

  setHidden: (id, isHidden) => {
    const { custom, selected } = get();
    const hidden = isHidden
      ? [...new Set([...get().hidden, id])]
      : get().hidden.filter(h => h !== id);
    set({ hidden });
    write({ custom, selected, hidden });
  },

  repaint: (mode) => {
    const palette = get().current();
    /*
      The first built-in is Daakia's own palette restated as seeds, so
      painting it would write sixty variables that say exactly what the
      stylesheet already says. Clearing instead leaves one source of truth.
    */
    applyPalette(palette.id === BUILT_IN_PALETTES[0].id ? null : palette, mode);
  },
}));
