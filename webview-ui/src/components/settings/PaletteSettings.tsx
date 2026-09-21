import { useMemo, useRef, useState } from 'react';
import { ButtonView, BadgeChipView, SortableView, type SortableRow } from '@salilvnair/dui';
import {
  PaletteIcon, FolderImportIcon, FolderExportIcon, TrashIcon, EyeIcon, EyeOffIcon, PencilIcon,
  CopyIcon, CheckIcon,
} from '../../icons';
import { useAppThemeStore } from '../../store/app-theme-store';
import {
  BUILT_IN_PALETTES, cssVariables, SEED_META, SEED_KEYS,
  type AppPalette, type AppSeeds,
} from '../../services/theme/palette';
import { parseAppThemes, serializeThemes } from '../../services/theme/palette-file';
import { seedsFromHost, hostThemeAvailable } from '../../services/theme/vscode-seed';
import { ThemeBuilderModal } from './theme-builder/ThemeBuilderModal';
import { appToDraft, draftToApp, type DraftPalette } from './theme-builder/fields';
import { contrast } from '../../services/theme/colour';

/**
 * Settings → Theme → the palette half.
 *
 * ── The preview is a request ──
 *
 * A row of swatches tells you a theme has a blue in it and nothing about
 * whether you can read a header value in it. The preview is a real request —
 * method pill, URL bar, a header row, a response line — drawn from the
 * candidate's own variables without applying anything, so "try it" costs
 * nothing and "put it back" is not a thing you have to do.
 *
 * ── Why the cards render from cssVariables ──
 *
 * The same function that paints the app. A preview drawn from the seeds by
 * hand would be a second interpretation of what a theme means, and the first
 * time the two disagreed the preview would be the liar.
 */

const MODES = ['dark', 'light'] as const;
type Half = typeof MODES[number];

export function PaletteSettings({ mode }: { mode: Half }) {
  const store = useAppThemeStore();
  const [half, setHalf] = useState<Half>(mode);
  const [preview, setPreview] = useState<AppPalette | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Which row's copy button has just been pressed, so the tick lands on that
     row rather than on all of them. */
  const [copied, setCopied] = useState<string | null>(null);
  /* The palette the builder is open on, or null. A copy is edited — see the
     modal — so holding the original here is safe. */
  const [building, setBuilding] = useState<DraftPalette | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const palettes = store.palettes();
  const current = store.current();
  const shown = preview ?? current;

  const hostAvailable = useMemo(() => hostThemeAvailable(), []);

  const choose = (p: AppPalette) => {
    store.select(p.id);
    store.repaint(half);
    setPreview(null);
  };

  const importFile = async (file: File) => {
    setError(null);
    const parsed = parseAppThemes(await file.text());
    if (!parsed.ok) { setError(parsed.error); return; }
    const result = store.add(parsed.palettes);
    if (result.error) { setError(result.error); return; }
    setError(result.added === 0 ? 'Those are already here.' : null);
  };

  const copy = async (palettes: AppPalette[], what: string) => {
    try {
      await navigator.clipboard.writeText(serializeThemes(palettes));
      setCopied(what);
      setTimeout(() => setCopied(c => (c === what ? null : c)), 1600);
    } catch { setError('Could not reach the clipboard.'); }
  };

  const exportAll = () => copy(store.custom.length > 0 ? store.custom : [current], 'all');

  const matchEditor = () => {
    const seeds = seedsFromHost();
    if (!seeds) { setError('There is no editor theme to read here.'); return; }
    const palette: AppPalette = {
      id: 'vscode-match',
      label: 'My editor',
      swatch: seeds.accent,
      dark: seeds,
      light: seeds,
      /*
        Both halves are what the host is showing right now, because that is
        the only half it has. Switching Daakia to the other one while VS Code
        stays where it is would be a theme matching nothing.
      */
      lightDerived: true,
    };
    store.add([palette]);
    store.select(palette.id);
    store.repaint(half);
    setPreview(null);
  };

  const cardRows: SortableRow[] = palettes.map(p => ({
    id: p.id,
    node: (
      <PaletteCard
        palette={p}
        half={half}
        active={p.id === current.id}
        copied={copied === p.id}
        onHover={() => setPreview(p)}
        onLeave={() => setPreview(null)}
        onClick={() => choose(p)}
        onEdit={() => setBuilding(appToDraft(p))}
        onCopy={() => void copy([p], p.id)}
        onHide={p.id === BUILT_IN_PALETTES[0].id ? undefined : () => store.setHidden(p.id, true)}
        onRemove={p.builtIn ? undefined : () => store.remove(p.id)}
      />
    ),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <PaletteIcon size={15} style={{ color: 'var(--color-accent)' }} />
        <h3 className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Palette</h3>
        <BadgeChipView tone="muted" size="xs">{palettes.length} available</BadgeChipView>
        <div className="ml-auto flex items-center gap-2">
          {MODES.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setHalf(m)}
              className="text-[11px] px-2 py-1 rounded-md cursor-pointer"
              style={{
                color: half === m ? 'var(--color-accent)' : 'var(--color-text-muted)',
                background: half === m ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent',
              }}
            >
              {m === 'dark' ? 'Dark half' : 'Light half'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        Thirteen colours decide everything else. Hover a palette to try it here, click to wear it,
        drag to reorder.
      </p>

      {/*
        Drag to reorder, the way the terminal's theme list does.

        SortableView renders a fragment of row wrappers and leaves the
        container to the caller, so the cards keep wrapping across the page
        instead of becoming a single tall column.
      */}
      <div className="flex gap-3 flex-wrap">
        <SortableView
          rows={cardRows}
          accentColor="var(--color-accent)"
          onReorder={(from, to) => store.reorder(from, to)}
          /*
            The row wrapper stays a real box rather than `display: contents`.

            Contents made the cards lay out beautifully and gave the drag
            handle and the drop indicator nothing to be positioned against —
            a wrapper with no box cannot anchor an absolutely-positioned
            child. As a plain block it becomes a flex item of the wrapping
            container, sized by the card inside it, which is the same layout
            and a handle that lands where it is aimed.
          */
          rowClassName="dk-palette-row"
        />
      </div>

      {store.hidden.length > 0 && (
        <button
          type="button"
          className="text-[11px] self-start cursor-pointer"
          style={{ color: 'var(--color-text-muted)' }}
          onClick={() => store.hidden.forEach(id => store.setHidden(id, false))}
        >
          <EyeIcon size={12} /> Show {store.hidden.length} hidden
        </button>
      )}

      {/* ── The preview ── */}
      <RequestPreview palette={shown} half={half} isPreview={!!preview} />

      {/* ── Import, export, match ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <ButtonView size="sm" variant="primary" iconLeft={<PaletteIcon size={13} />}
          onClick={() => setBuilding(appToDraft(current))}>
          New from this
        </ButtonView>
        <ButtonView size="sm" variant="secondary" iconLeft={<FolderImportIcon size={13} />}
          onClick={() => fileRef.current?.click()}>
          Import
        </ButtonView>
        <ButtonView size="sm" variant="secondary" iconLeft={<FolderExportIcon size={13} />} onClick={exportAll}>
          {copied === 'all' ? 'Copied' : 'Export all'}
        </ButtonView>
        {hostAvailable && (
          <ButtonView size="sm" variant="secondary" onClick={matchEditor}>
            Match my editor
          </ButtonView>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }}
        />
      </div>

      {error && (
        <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>
      )}

      {building && (
        <ThemeBuilderModal
          kind="app"
          initial={building}
          taken={store.custom.map(p => p.id)}
          onClose={() => setBuilding(null)}
          onSave={draft => {
            const palette = draftToApp(draft);
            store.add([palette]);
            store.select(palette.id);
            store.repaint(half);
            setBuilding(null);
            setPreview(null);
          }}
        />
      )}

      {/*
        Rewritten because somebody had to ask what it meant.

        The old version described the implementation — localStorage, no file
        written, nothing crossing to the extension host — which is true and
        answers a question nobody was asking. What a reader needs is the
        consequence: these do not travel, so keep a copy, and here is exactly
        how far the colours reach.
      */}
      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        Themes you make or import are kept in Daakia&rsquo;s database and travel with
        <strong> Git Sync</strong>. Use <strong>Export all</strong> or a card&rsquo;s copy button to
        hand one to somebody directly.
        The colours reach Daakia&rsquo;s panel; VS Code&rsquo;s own title bar, activity bar and
        status bar keep their own theme.
      </p>
    </div>
  );
}

// ── One card ────────────────────────────────────────────────────────────────

function PaletteCard({
  palette, half, active, copied, onHover, onLeave, onClick, onEdit, onCopy, onHide, onRemove,
}: {
  palette: AppPalette;
  half: Half;
  active: boolean;
  copied: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onHide?: () => void;
  onRemove?: () => void;
}) {
  const seeds = palette[half];
  const derived = half === 'light' && palette.lightDerived;

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="rounded-xl border-2 overflow-hidden w-[168px] cursor-pointer transition-all group"
      style={{
        borderColor: active ? 'var(--color-accent)' : 'var(--color-surface-border)',
        background: 'var(--color-surface)',
      }}
      onClick={onClick}
    >
      {/* The palette drawn in its own colours, not in the app's. */}
      <div style={{ background: seeds.ground, padding: 8 }}>
        <div style={{ background: seeds.surface, border: `1px solid ${seeds.border}`, borderRadius: 6, padding: 7 }}>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ width: 22, height: 7, borderRadius: 3, background: seeds.accent }} />
            <span style={{ flex: 1, height: 7, borderRadius: 3, background: seeds.inputBg, border: `1px solid ${seeds.inputBorder}` }} />
          </div>
          <div style={{ height: 5, width: '80%', borderRadius: 3, background: seeds.text, opacity: 0.85, marginBottom: 4 }} />
          <div style={{ height: 5, width: '55%', borderRadius: 3, background: seeds.muted }} />
          <div style={{ display: 'flex', gap: 3, marginTop: 7 }}>
            {[seeds.success, seeds.warning, seeds.error, seeds.info].map(c => (
              <span key={c} style={{ width: 11, height: 5, borderRadius: 2, background: c }} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <span className="text-[12px] font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
          {palette.label}
        </span>
        {derived && (
          <span
            className="text-[9px]"
            style={{ color: 'var(--color-warning)' }}
            title="This light half was computed from the dark one — legible rather than designed."
          >
            derived
          </span>
        )}
        {/* Hidden until the card is hovered, except while the copy tick is
            showing — a confirmation that fades with the pointer is one
            nobody sees. */}
        <span
          className={`ml-auto flex items-center gap-1 transition-opacity${
            copied ? '' : ' opacity-0 group-hover:opacity-100'}`}
        >
          <button
            type="button"
            title={palette.builtIn ? 'Start a new theme from this one' : 'Edit'}
            onClick={e => { e.stopPropagation(); onEdit(); }}
            style={{ color: 'var(--color-text-muted)' }}
          >
            <PencilIcon size={12} />
          </button>
          {/* This one theme, as a file — so sharing a palette is not "export
              everything and delete the ones they did not ask for". */}
          <button
            type="button"
            title="Copy this theme"
            onClick={e => { e.stopPropagation(); onCopy(); }}
            style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}
          >
            {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          </button>
          {onHide && (
            <button type="button" title="Hide" onClick={e => { e.stopPropagation(); onHide(); }}
              style={{ color: 'var(--color-text-muted)' }}>
              <EyeOffIcon size={12} />
            </button>
          )}
          {onRemove && (
            <button type="button" title="Delete" onClick={e => { e.stopPropagation(); onRemove(); }}
              style={{ color: 'var(--color-error)' }}>
              <TrashIcon size={12} />
            </button>
          )}
        </span>
        {active && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />}
      </div>
    </div>
  );
}

// ── The preview ─────────────────────────────────────────────────────────────

/**
 * A request, drawn in the candidate's variables.
 *
 * Built from `cssVariables` — the same function that paints the app — set on
 * a wrapper, so everything inside inherits them. Drawing it from the seeds by
 * hand would be a second opinion about what a theme means, and the preview
 * would be the one that was wrong.
 */
function RequestPreview({ palette, half, isPreview }: {
  palette: AppPalette; half: Half; isPreview: boolean;
}) {
  const seeds = palette[half];
  const vars = useMemo(() => cssVariables(seeds), [seeds]);
  const style = Object.fromEntries(Object.entries(vars)) as React.CSSProperties;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {isPreview ? `Trying ${palette.label}` : palette.label}
        </span>
        <Legibility seeds={seeds} />
      </div>

      <div
        style={{
          ...style,
          background: 'var(--color-panel)',
          border: '1px solid var(--color-surface-border)',
          borderRadius: 10,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
        }}
      >
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
            color: 'var(--color-method-post, #f59e0b)',
            background: 'color-mix(in srgb, var(--color-method-post, #f59e0b) 14%, transparent)',
          }}>POST</span>
          <span style={{
            flex: 1, fontSize: 11, padding: '4px 9px', borderRadius: 6,
            fontFamily: 'var(--font-mono, monospace)',
            background: 'var(--color-input-bg)',
            border: '1px solid var(--color-input-border)',
            color: 'var(--color-input-text, var(--color-text-primary))',
          }}>
            https://api.example.com/orders
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '4px 11px', borderRadius: 6,
            background: 'var(--color-primary)', color: 'var(--color-btn-primary-text)',
          }}>Send</span>
        </div>

        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-surface-border)',
          borderRadius: 7, padding: '7px 9px',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          <div style={{ display: 'flex', gap: 8, fontSize: 10.5, fontFamily: 'var(--font-mono, monospace)' }}>
            <span style={{ color: 'var(--color-text-primary)', width: 96 }}>Authorization</span>
            <span style={{ color: 'var(--color-var-pill-text, #c084fc)' }}>{'{{bearer-token}}'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 10.5, fontFamily: 'var(--font-mono, monospace)' }}>
            <span style={{ color: 'var(--color-text-muted)', width: 96 }}>Content-Type</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>application/json</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 10.5 }}>
          <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>200 OK</span>
          <span style={{ color: 'var(--color-warning)' }}>404</span>
          <span style={{ color: 'var(--color-error)' }}>500</span>
          <span style={{ color: 'var(--color-info)' }}>info</span>
          <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)' }}>142 ms · 1.2 KB</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The one number worth showing: is body text readable on its own surface.
 *
 * Not decoration. A palette copied from somewhere else is exactly where an
 * unreadable pairing comes from, and 4.5:1 is the line where it stops being
 * a matter of taste.
 */
function Legibility({ seeds }: { seeds: AppSeeds }) {
  const pairs: [keyof AppSeeds, keyof AppSeeds][] = [['text', 'surface'], ['inputText', 'inputBg']];
  const worst = Math.min(...pairs.map(([fg, bg]) => contrast(seeds[fg], seeds[bg])));
  const ok = worst >= 4.5;
  return (
    <span
      className="text-[10px]"
      style={{ color: ok ? 'var(--color-success)' : 'var(--color-warning)' }}
      title={pairs.map(([fg, bg]) =>
        `${SEED_META[fg].label} on ${SEED_META[bg].label}: ${contrast(seeds[fg], seeds[bg]).toFixed(1)}:1`).join('\n')}
    >
      {ok ? 'readable' : `low contrast ${worst.toFixed(1)}:1`}
    </span>
  );
}

/** Exported for the tests, which is also the shortest description of a theme. */
export const SEED_ORDER = SEED_KEYS;
