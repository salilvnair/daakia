/**
 * Settings → Appearance: fonts, editor text, and how big each part of Daakia is.
 *
 * Most of Daakia's sizes are pixels written into its components, so there is
 * no one base font size to turn up. Each region is scaled with CSS `zoom`
 * instead — text, icons and spacing together, the way the browser's own zoom
 * does it — and each region on its own: a bigger rail need not mean a bigger
 * request editor.
 *
 * Regions, not the whole page: a menu opened at the pointer inside a zoomed
 * page lands at the pointer times the zoom. So the scaled regions are ones
 * that do not position things at pointer coordinates themselves, and menus
 * scale their rows rather than their box (see index.css).
 *
 * Saved two ways, like the theme: localStorage so the first frame is already
 * right, and a pref in daakia.db so it outlives a cleared webview.
 */
import { create } from 'zustand';
import { useUiStateStore } from './ui-state-store';

export type ZoomRegion = 'rail' | 'tabs' | 'sidebar' | 'sideRail' | 'menus' | 'modals' | 'content';

export const ZOOM_REGIONS: { id: ZoomRegion; label: string; description: string }[] = [
  { id: 'rail', label: 'Protocol rail', description: 'The icons down the left edge: REST, GraphQL, SOAP, Scratchpads…' },
  { id: 'tabs', label: 'Tab bar', description: 'The open tabs along the top.' },
  { id: 'sidebar', label: 'Side panel', description: 'Collections, History, Environments, Scratchpads — the panel on the right.' },
  { id: 'sideRail', label: 'Side panel icons', description: 'The icon strip beside the side panel.' },
  { id: 'content', label: 'Main area', description: 'The request, the response, Settings, and everything else in the middle.' },
  { id: 'menus', label: 'Menus', description: 'Right-click menus and dropdown lists.' },
  { id: 'modals', label: 'Dialogs', description: 'Windows that open over everything: New Collection, Import, the AI tools, confirmations.' },
];

export const ZOOM_MIN = 70;
export const ZOOM_MAX = 160;

export interface Appearance {
  /** '' = the editor's own font. */
  editorFontFamily: string;
  /** 0 = each editor keeps its own size. */
  editorFontSize: number;
  /** 0 = automatic; otherwise a multiple of the font size. */
  editorLineHeight: number;
  editorLigatures: boolean;
  /** '' = Daakia's (Inter, then the editor's UI font). */
  uiFontFamily: string;
  /** '' = Daakia's (JetBrains Mono, then Fira Code). Used for URLs, paths and code outside an editor. */
  monoFontFamily: string;
  /** Percent, 100 = as designed. */
  zoom: Record<ZoomRegion, number>;
}

export const DEFAULT_APPEARANCE: Appearance = {
  editorFontFamily: '',
  editorFontSize: 0,
  editorLineHeight: 0,
  editorLigatures: false,
  uiFontFamily: '',
  monoFontFamily: '',
  zoom: { rail: 100, tabs: 100, sidebar: 100, sideRail: 100, menus: 100, modals: 100, content: 100 },
};

const KEY = 'daakia-appearance';
const PREF = 'appearance';

const clampZoom = (n: unknown) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v)) : 100;
};

/** Whatever was stored, as an Appearance — a missing or mangled field falls back rather than failing. */
export function normalizeAppearance(raw: unknown): Appearance {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Appearance>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
  const size = Number(r.editorFontSize);
  const line = Number(r.editorLineHeight);
  const zoom = { ...DEFAULT_APPEARANCE.zoom };
  for (const k of Object.keys(zoom) as ZoomRegion[]) {
    if (r.zoom && k in r.zoom) zoom[k] = clampZoom((r.zoom as Record<string, unknown>)[k]);
  }
  return {
    editorFontFamily: str(r.editorFontFamily),
    editorFontSize: Number.isFinite(size) && size >= 8 && size <= 40 ? Math.round(size) : 0,
    editorLineHeight: Number.isFinite(line) && line >= 1 && line <= 3 ? Math.round(line * 10) / 10 : 0,
    editorLigatures: r.editorLigatures === true,
    uiFontFamily: str(r.uiFontFamily),
    monoFontFamily: str(r.monoFontFamily),
    zoom,
  };
}

function readLocal(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeAppearance(JSON.parse(raw)) : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** A family as CSS wants it: names with spaces quoted, generic keywords left bare. */
export function cssFontStack(family: string): string {
  const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-monospace', 'ui-sans-serif', 'ui-serif', '-apple-system']);
  return family
    .split(',')
    .map(f => f.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
    .map(f => (GENERIC.has(f) || !/\s/.test(f) ? f : `"${f}"`))
    .join(', ');
}

const UI_FALLBACK = 'var(--vscode-font-family, system-ui, -apple-system, sans-serif)';
const MONO_FALLBACK = 'var(--vscode-editor-font-family, monospace)';

/** Put an Appearance on the page: zoom per region and the two UI font stacks, as custom properties. */
export function applyAppearanceToDOM(a: Appearance, root: HTMLElement = document.documentElement): void {
  for (const r of ZOOM_REGIONS) root.style.setProperty(`--dk-zoom-${r.id}`, String(a.zoom[r.id] / 100));
  /* A dialog's height cap is in vh, which zoom enlarges too; index.css re-caps it only while dialogs are zoomed. */
  root.toggleAttribute('data-dk-modals-zoomed', a.zoom.modals !== 100);
  if (a.uiFontFamily) root.style.setProperty('--font-sans', `${cssFontStack(a.uiFontFamily)}, ${UI_FALLBACK}`);
  else root.style.removeProperty('--font-sans');
  if (a.monoFontFamily) root.style.setProperty('--font-mono', `${cssFontStack(a.monoFontFamily)}, ${MONO_FALLBACK}`);
  else root.style.removeProperty('--font-mono');
}

interface AppearanceState extends Appearance {
  set: (patch: Partial<Omit<Appearance, 'zoom'>>) => void;
  setZoom: (region: ZoomRegion, percent: number) => void;
  reset: (part?: 'editor' | 'fonts' | 'sizes') => void;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => {
  const save = (next: Appearance) => {
    const json = JSON.stringify(next);
    try { localStorage.setItem(KEY, json); } catch { /* private window: the pref still has it */ }
    useUiStateStore.getState().setPref(PREF, json);
    applyAppearanceToDOM(next);
  };
  const current = (): Appearance => {
    const { set: _s, setZoom: _z, reset: _r, ...a } = get();
    return a;
  };

  return {
    ...readLocal(),

    set: (patch) => {
      const next = normalizeAppearance({ ...current(), ...patch });
      set(next);
      save(next);
    },

    setZoom: (region, percent) => {
      const next = normalizeAppearance({ ...current(), zoom: { ...get().zoom, [region]: percent } });
      set(next);
      save(next);
    },

    reset: (part) => {
      const d = DEFAULT_APPEARANCE;
      const cur = current();
      const next: Appearance =
        part === 'editor' ? { ...cur, editorFontFamily: d.editorFontFamily, editorFontSize: d.editorFontSize, editorLineHeight: d.editorLineHeight, editorLigatures: d.editorLigatures }
        : part === 'fonts' ? { ...cur, uiFontFamily: d.uiFontFamily, monoFontFamily: d.monoFontFamily }
        : part === 'sizes' ? { ...cur, zoom: { ...d.zoom } }
        : { ...d, zoom: { ...d.zoom } };
      set(next);
      save(next);
    },
  };
});

/*
  The pref in daakia.db wins over localStorage once it arrives: it is the copy
  that survives a reinstall, and the one another window may have just written.
*/
let lastPref: string | undefined;
useUiStateStore.subscribe(s => {
  const raw = s.prefs[PREF];
  if (!raw || raw === lastPref) return;
  lastPref = raw;
  try {
    const next = normalizeAppearance(JSON.parse(raw));
    if (JSON.stringify(next) === JSON.stringify(normalizeAppearance(useAppearanceStore.getState()))) return;
    useAppearanceStore.setState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    applyAppearanceToDOM(next);
  } catch { /* a mangled pref leaves what is on screen alone */ }
});

/** The first frame, before React: called from main.tsx. */
export function applyStoredAppearance(): void {
  applyAppearanceToDOM(normalizeAppearance(useAppearanceStore.getState()));
}
