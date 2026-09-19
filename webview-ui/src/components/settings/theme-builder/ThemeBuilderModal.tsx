import { useMemo, useRef, useState } from 'react';
import { ModalView, ButtonView, TextInputView, ColorPickerView, BadgeChipView } from '@salilvnair/dui';
import { deriveLightAnsi, type TerminalAnsi } from '@salilvnair/dui';
import { PaletteIcon, TerminalIcon, RefreshIcon, FolderImportIcon } from '../../../icons';
import {
  fieldsFor, idFromLabel, draftToApp, draftToTerminal,
  type DraftPalette, type ThemeKind,
} from './fields';
import { deriveLightSeeds, type AppSeeds } from '../../../services/theme/palette';
import { parseAppThemes } from '../../../services/theme/palette-file';
import { parseTerminalThemes } from '@salilvnair/dui';
import { contrast } from '../../../services/theme/colour';
import { MISSING_COLOUR } from '../../../services/theme/preview-ground';
import { AppThemePreview, TerminalThemePreview } from './previews';

/**
 * One builder, both kinds of theme.
 *
 * ── What it is for ──
 *
 * Until now a theme could only arrive by import, which means "I want this
 * one shade different" was answered with "edit some JSON and import it
 * again". Every colour either kind has is here with a picker on it, the
 * preview is live, and Save puts it in the same list an imported one lands
 * in.
 *
 * ── Why it does not edit in place ──
 *
 * It works on a copy and hands it back on Save. Cancel is then genuinely
 * cancel rather than an undo that has to be implemented, and the thing you
 * are looking at while you pick colours is a preview rather than the app
 * repainting under your cursor forty times.
 */
export function ThemeBuilderModal({ kind, initial, taken, onSave, onClose }: {
  kind: ThemeKind;
  /** The palette to start from — a copy is edited, never this. */
  initial: DraftPalette;
  /** Ids already in use, so a new one does not collide. */
  taken: string[];
  onSave: (palette: DraftPalette) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DraftPalette>(() => ({
    ...initial,
    dark: { ...initial.dark },
    light: { ...initial.light },
  }));
  const [half, setHalf] = useState<'dark' | 'light'>('dark');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fields = fieldsFor(kind);

  /**
   * Start from a file instead of from a built-in.
   *
   * The other way in — New from this — starts from a theme you already have,
   * which is no help when the one you want is a file somebody sent you and
   * you want to change two colours in it before keeping it. It loads into
   * the draft rather than into the library: nothing is stored until Save, so
   * opening a file to look at it is not the same as collecting it.
   *
   * The name comes with it, and so does the id — so importing a theme you
   * already have and saving it updates that one rather than leaving two
   * entries that differ invisibly.
   */
  const importInto = async (file: File) => {
    setError(null);
    const text = await file.text();

    if (kind === 'app') {
      const parsed = parseAppThemes(text);
      if (!parsed.ok) { setError(parsed.error); return; }
      const [first] = parsed.palettes;
      setDraft({
        id: first.id, label: first.label, swatch: first.swatch,
        dark: { ...first.dark }, light: { ...first.light },
        lightDerived: first.lightDerived,
      });
      if (parsed.palettes.length > 1) {
        setError(`That file has ${parsed.palettes.length} themes — opened the first. `
          + 'Import from the Theme page to take them all.');
      }
      return;
    }

    const parsed = parseTerminalThemes(text);
    if (!parsed.ok) { setError(parsed.error); return; }
    const [first] = parsed.themes;
    setDraft({
      id: first.id, label: first.label, swatch: first.swatch,
      dark: { ...first.dark }, light: { ...first.light },
      lightDerived: first.lightDerived,
    });
    if (parsed.themes.length > 1) {
      setError(`That file has ${parsed.themes.length} themes — opened the first. `
        + 'Import from the Terminal page to take them all.');
    }
  };

  const groups = useMemo(() => {
    const out = new Map<string, typeof fields>();
    for (const f of fields) out.set(f.group, [...(out.get(f.group) ?? []), f]);
    return [...out.entries()];
  }, [fields]);

  const set = (key: string, value: string) => {
    setDraft(d => ({
      ...d,
      [half]: { ...d[half], [key]: value },
      /*
        Editing the light half means it is no longer derived — somebody has
        had an opinion about it, and the badge saying "computed rather than
        designed" would be a lie from then on.
      */
      ...(half === 'light' ? { lightDerived: false } : {}),
      ...(key === 'accent' || key === 'foreground' ? { swatch: value } : {}),
    }));
  };

  const deriveLight = () => {
    setDraft(d => ({
      ...d,
      light: kind === 'app'
        ? deriveLightSeeds(d.dark as unknown as AppSeeds) as unknown as Record<string, string>
        : deriveLightAnsi(d.dark as unknown as TerminalAnsi) as unknown as Record<string, string>,
      lightDerived: true,
    }));
    setHalf('light');
  };

  const save = () => {
    const label = draft.label.trim() || 'My theme';
    /* A new theme gets an id from its name; an existing one keeps the id it
       already has, so editing a theme replaces it rather than cloning it. */
    const id = taken.includes(draft.id) ? draft.id : idFromLabel(label, taken);
    onSave({ ...draft, id, label });
  };

  const colours = draft[half];

  return (
    <ModalView
      open
      onClose={onClose}
      title={kind === 'app' ? 'Theme builder' : 'Terminal theme builder'}
      headerIcon={kind === 'app' ? <PaletteIcon size={15} /> : <TerminalIcon size={15} />}
      size="xl"
      footerLeft={draft.lightDerived
        ? (
          <span className="text-[10px]" style={{ color: 'var(--color-warning)' }}>
            The light half was computed — open it and change anything to make it yours.
          </span>
        )
        : undefined}
      footerRight={
        <span className="flex gap-2">
          <ButtonView size="sm" variant="secondary" onClick={onClose}>Cancel</ButtonView>
          <ButtonView size="sm" variant="primary" onClick={save}>Save theme</ButtonView>
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        {/* ── Name and half ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <TextInputView
            value={draft.label}
            onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            placeholder="Name this theme"
            size="md"
            style={{ width: 260 }}
          />
          <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--color-input-bg)' }}>
            {(['dark', 'light'] as const).map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setHalf(h)}
                className="text-[11px] px-2.5 py-1 rounded-md cursor-pointer"
                style={{
                  color: half === h ? 'var(--color-btn-primary-text)' : 'var(--color-text-muted)',
                  background: half === h ? 'var(--color-primary)' : 'transparent',
                }}
              >
                {h === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
          <ButtonView size="sm" variant="secondary" iconLeft={<RefreshIcon size={12} />} onClick={deriveLight}>
            Derive light from dark
          </ButtonView>
          <ButtonView size="sm" variant="secondary" iconLeft={<FolderImportIcon size={12} />}
            onClick={() => fileRef.current?.click()}>
            Start from a file
          </ButtonView>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void importInto(f); e.target.value = ''; }}
          />
          {kind === 'app' && <Legibility colours={colours} />}
        </div>

        {error && (
          <p className="text-[11px]" style={{ color: 'var(--color-warning)' }}>{error}</p>
        )}

        {/* ── Live preview ── */}
        {kind === 'app'
          ? <AppThemePreview colours={colours} />
          : <TerminalThemePreview colours={colours} />}

        {/* ── Every colour, with a picker ── */}
        <div className="flex flex-col gap-3">
          {groups.map(([group, items]) => (
            <div key={group}>
              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {group}
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(196px, 1fr))' }}>
                {items.map(f => (
                  <div
                    key={f.key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}
                  >
                    <ColorPickerView
                      value={colours[f.key] ?? MISSING_COLOUR}
                      onChange={v => set(f.key, v)}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="text-[11.5px] truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {f.label}
                      </div>
                      {f.hint && (
                        <div className="text-[9.5px] truncate" style={{ color: 'var(--color-text-muted)' }} title={f.hint}>
                          {f.hint}
                        </div>
                      )}
                    </div>
                    <code className="ml-auto text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
                      {(colours[f.key] ?? '').replace(/^#/, '')}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalView>
  );
}

/**
 * Body text on its own surface, live while you pick.
 *
 * The one number that turns "I like this colour" into "I can read this
 * screen", and the moment to show it is while the colour is being chosen
 * rather than after the theme has been saved and worn.
 */
function Legibility({ colours }: { colours: Record<string, string> }) {
  const pairs: [string, string][] = [['text', 'surface'], ['inputText', 'inputBg']];
  const worst = Math.min(...pairs.map(([fg, bg]) => contrast(colours[fg] ?? '#000', colours[bg] ?? '#fff')));
  const ok = worst >= 4.5;
  return (
    <BadgeChipView tone={ok ? 'success' : 'warning'} size="xs">
      {ok ? `readable ${worst.toFixed(1)}:1` : `low contrast ${worst.toFixed(1)}:1`}
    </BadgeChipView>
  );
}

export { draftToApp, draftToTerminal };
