/**
 * Settings → Appearance → Editor, applied to every Monaco editor in the app.
 *
 * Not through `CodeEditor`'s props: twenty-odd screens (the AI modals,
 * GraphQL) use dui's `EditorView` directly, and dui pushes its own
 * `fontFamily`/`fontSize` into the editor on every render. So each editor's
 * `updateOptions` is wrapped once, when Monaco creates it, to lay the user's
 * choices over whatever its component asked for — then and on every later
 * update. What the component asked for is remembered, so turning a setting
 * back off gives each editor its own size again rather than leaving the last
 * override behind.
 */
import { monaco } from '@salilvnair/dui/monaco-setup';
import { cssFontStack, useAppearanceStore, type Appearance } from '../../store/appearance-store';

type Options = Record<string, unknown>;
type Editor = { updateOptions(o: Options): void; getRawOptions(): Options; onDidDispose(cb: () => void): unknown };

/** The options a setting can override — the ones each editor's own value is kept for. */
const OWNED = ['fontFamily', 'fontSize', 'lineHeight', 'fontLigatures'] as const;

export function editorOverrides(a: Pick<Appearance, 'editorFontFamily' | 'editorFontSize' | 'editorLineHeight' | 'editorLigatures'>): Options {
  const o: Options = {};
  if (a.editorFontFamily) o.fontFamily = `${cssFontStack(a.editorFontFamily)}, monospace`;
  if (a.editorFontSize) o.fontSize = a.editorFontSize;
  /* Monaco reads a value under 8 as a multiple of the font size. */
  if (a.editorLineHeight) o.lineHeight = a.editorLineHeight;
  if (a.editorLigatures) o.fontLigatures = true;
  return o;
}

const own = new Map<Editor, { base: Options; apply: (o: Options) => void }>();
let current: Options = editorOverrides(useAppearanceStore.getState());

function adopt(ed: Editor) {
  if (own.has(ed)) return;
  const raw = ed.getRawOptions();
  const base: Options = { fontLigatures: false, lineHeight: 0 };
  for (const k of OWNED) if (raw[k] !== undefined) base[k] = raw[k];
  const apply = ed.updateOptions.bind(ed);
  ed.updateOptions = (o: Options) => {
    for (const k of OWNED) if (o && o[k] !== undefined) base[k] = o[k];
    apply({ ...o, ...current });
  };
  own.set(ed, { base, apply });
  ed.onDidDispose(() => own.delete(ed));
  if (Object.keys(current).length) apply(current);
}

function reapply() {
  for (const { base, apply } of own.values()) apply({ ...base, ...current });
}

let installed = false;
export function installEditorAppearance(): void {
  if (installed) return;
  installed = true;
  monaco.editor.onDidCreateEditor(ed => adopt(ed as unknown as Editor));
  for (const ed of monaco.editor.getEditors()) adopt(ed as unknown as Editor);

  let lastFamily = useAppearanceStore.getState().editorFontFamily;
  useAppearanceStore.subscribe(s => {
    const next = editorOverrides(s);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    current = next;
    reapply();
    /* Monaco caches glyph widths per font; a new family measured with the old
       widths puts the cursor between letters. Measure again once it has loaded. */
    if (s.editorFontFamily !== lastFamily) {
      lastFamily = s.editorFontFamily;
      void document.fonts?.ready.then(() => monaco.editor.remeasureFonts());
    }
  });
}
