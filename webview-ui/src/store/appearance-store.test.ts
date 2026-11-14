/**
 * Settings → Appearance: what is stored, what reaches the page, and what
 * reaches every Monaco editor.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../vscode', () => ({ postMsg: () => {} }));

/* A stand-in Monaco: editors that record what was asked of them. */
const fake = vi.hoisted(() => {
  type Ed = { opts: Record<string, unknown>; updateOptions(o: Record<string, unknown>): void; getRawOptions(): Record<string, unknown>; onDidDispose(cb: () => void): void };
  const editors: Ed[] = [];
  let onCreate: ((e: Ed) => void) | null = null;
  const make = (opts: Record<string, unknown>): Ed => {
    const ed: Ed = {
      opts: { ...opts },
      updateOptions(o) { Object.assign(this.opts, o); },
      getRawOptions() { return { ...this.opts }; },
      onDidDispose() {},
    };
    editors.push(ed);
    onCreate?.(ed);
    return ed;
  };
  return {
    make,
    monaco: {
      editor: {
        onDidCreateEditor: (cb: (e: Ed) => void) => { onCreate = cb; },
        getEditors: () => editors,
        remeasureFonts: () => {},
      },
    },
  };
});
vi.mock('@salilvnair/dui/monaco-setup', () => ({ monaco: fake.monaco }));

import {
  useAppearanceStore, normalizeAppearance, cssFontStack, applyAppearanceToDOM, DEFAULT_APPEARANCE,
} from './appearance-store';
import { editorOverrides, installEditorAppearance } from '../services/appearance/editor-appearance';

beforeEach(() => {
  localStorage.clear();
  useAppearanceStore.getState().reset();
});

describe('what is stored', () => {
  it('a missing or mangled field falls back instead of breaking the rest', () => {
    const a = normalizeAppearance({ editorFontSize: 'huge', editorLineHeight: 9, zoom: { rail: 400, tabs: 'x', sidebar: 125 } });
    expect(a.editorFontSize).toBe(0);
    expect(a.editorLineHeight).toBe(0);
    expect(a.zoom).toMatchObject({ rail: 160, tabs: 100, sidebar: 125, menus: 100 });
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it('a change is saved where the next launch reads it first', () => {
    useAppearanceStore.getState().setZoom('rail', 130);
    expect(JSON.parse(localStorage.getItem('daakia-appearance')!).zoom.rail).toBe(130);
  });

  it('reset can take back one part and leave the others', () => {
    const s = useAppearanceStore.getState();
    s.set({ editorFontSize: 18, uiFontFamily: 'Segoe UI' });
    s.setZoom('tabs', 120);
    useAppearanceStore.getState().reset('editor');
    const a = useAppearanceStore.getState();
    expect(a.editorFontSize).toBe(0);
    expect(a.uiFontFamily).toBe('Segoe UI');
    expect(a.zoom.tabs).toBe(120);
  });
});

describe('what reaches the page', () => {
  it('quotes family names with spaces, and leaves generic ones bare', () => {
    expect(cssFontStack('Segoe UI, system-ui')).toBe('"Segoe UI", system-ui');
    expect(cssFontStack("'JetBrains Mono'")).toBe('"JetBrains Mono"');
  });

  it('each region gets its own zoom; a default font leaves the stylesheet in charge', () => {
    const root = document.createElement('div');
    applyAppearanceToDOM({ ...DEFAULT_APPEARANCE, zoom: { ...DEFAULT_APPEARANCE.zoom, sidebar: 120 }, uiFontFamily: 'Roboto' }, root);
    expect(root.style.getPropertyValue('--dk-zoom-sidebar')).toBe('1.2');
    expect(root.style.getPropertyValue('--dk-zoom-rail')).toBe('1');
    expect(root.style.getPropertyValue('--font-sans')).toMatch(/^Roboto, /);
    applyAppearanceToDOM(DEFAULT_APPEARANCE, root);
    expect(root.style.getPropertyValue('--font-sans')).toBe('');
  });
});

describe('every editor', () => {
  it('only what was set is overridden', () => {
    expect(editorOverrides(DEFAULT_APPEARANCE)).toEqual({});
    expect(editorOverrides({ ...DEFAULT_APPEARANCE, editorFontSize: 16, editorLineHeight: 1.5 })).toEqual({ fontSize: 16, lineHeight: 1.5 });
  });

  it('wins over what the component asks for, and gives each editor its own size back when cleared', () => {
    installEditorAppearance();
    const small = fake.make({ fontSize: 11, fontFamily: 'Menlo' });
    const big = fake.make({ fontSize: 13, fontFamily: 'Menlo' });

    useAppearanceStore.getState().set({ editorFontSize: 18 });
    expect(small.opts.fontSize).toBe(18);
    expect(big.opts.fontSize).toBe(18);

    /* dui re-sends its own options on every render; the setting still holds. */
    small.updateOptions({ fontSize: 11, fontFamily: 'Menlo' });
    expect(small.opts.fontSize).toBe(18);

    useAppearanceStore.getState().set({ editorFontSize: 0 });
    expect(small.opts.fontSize).toBe(11);
    expect(big.opts.fontSize).toBe(13);
  });
});
