/**
 * Settings → Appearance: editor text, the interface's fonts, and the size of
 * each part of the window. Everything applies as it is changed; there is no
 * Save.
 *
 * Fonts are tiles drawn in their own face, so the choice is made by looking
 * rather than by name, and a face this computer does not have says so. Sizes
 * are steppers — any value, not a list someone else picked — with the common
 * ones a chip away.
 */
import { useState, type ReactNode } from 'react';
import { StepperInputView, ToggleSwitchView, TextInputView } from '@salilvnair/dui';
import { CodeEditor } from '../shared/editors/CodeEditor';
import {
  useAppearanceStore, ZOOM_REGIONS, ZOOM_MIN, ZOOM_MAX, DEFAULT_APPEARANCE, cssFontStack, type ZoomRegion,
} from '../../store/appearance-store';
import {
  CodeBracketsIcon, TypeIcon, TextSizeIcon, SidebarLeftIcon, ColumnsIcon, SidebarRightIcon,
  LayoutGridIcon, DocumentIcon, MoreHorizontalIcon, PanelMaximizeIcon, CheckIcon, UndoIcon,
} from '../../icons';
import './appearance-settings.css';

/* ── fonts ─────────────────────────────────────────────────────────────── */

interface FontChoice { value: string; label: string; probe?: string }

const EDITOR_FONTS: FontChoice[] = [
  { value: '', label: 'Default', probe: 'Menlo, Monaco, Courier New, monospace' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
  { value: 'Fira Code', label: 'Fira Code' },
  { value: 'Cascadia Code', label: 'Cascadia Code' },
  { value: 'Consolas', label: 'Consolas' },
  { value: 'Menlo', label: 'Menlo' },
  { value: 'SF Mono', label: 'SF Mono' },
  { value: 'Source Code Pro', label: 'Source Code Pro' },
  { value: 'Courier New', label: 'Courier New' },
];

const UI_FONTS: FontChoice[] = [
  { value: '', label: 'Default', probe: 'Inter, system-ui, -apple-system, sans-serif' },
  { value: 'system-ui', label: 'System' },
  { value: 'Segoe UI', label: 'Segoe UI' },
  { value: '-apple-system, SF Pro Text', label: 'SF Pro' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Helvetica Neue, Helvetica', label: 'Helvetica' },
  { value: 'Arial', label: 'Arial' },
];

const MONO_FONTS: FontChoice[] = [
  { value: '', label: 'Default', probe: 'JetBrains Mono, Fira Code, monospace' },
  ...EDITOR_FONTS.filter(f => f.value && f.value !== 'JetBrains Mono'),
];

const GENERIC = new Set(['system-ui', '-apple-system', 'monospace', 'sans-serif', 'serif']);

/**
 * Whether this computer can draw a family. A face that is not installed falls
 * back, and the fallback measures the same as the fallback alone — for both
 * of two very different fallbacks, which a real face never does.
 */
const availability = new Map<string, boolean>();
function isInstalled(family: string): boolean {
  const first = family.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  if (!first || GENERIC.has(first)) return true;
  const hit = availability.get(first);
  if (hit !== undefined) return hit;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return true;
  const text = 'mmmmmmmmmmlli1WQ@#';
  const width = (font: string) => { ctx.font = `32px ${font}`; return ctx.measureText(text).width; };
  const ok = ['monospace', 'serif'].some(base => width(`"${first}", ${base}`) !== width(base));
  availability.set(first, ok);
  return ok;
}

function FontTiles({ value, choices, mono, accent, onChange }: {
  value: string;
  choices: FontChoice[];
  mono: boolean;
  accent: string;
  onChange: (family: string) => void;
}) {
  const known = choices.some(c => c.value === value);
  const [customOpen, setCustomOpen] = useState(!known);
  const [draft, setDraft] = useState(known ? '' : value);
  const commit = () => { const f = draft.trim(); if (f && f !== value) onChange(f); };
  const fallback = mono ? 'monospace' : 'sans-serif';

  return (
    <div className="dk-ap-fontpick" style={{ ['--ap-accent' as string]: accent }}>
      <div className="dk-ap-fonts" role="radiogroup">
        {choices.map(c => {
          const on = !customOpen && c.value === value;
          const family = c.value || c.probe || '';
          /* Default is a stack that always ends in something drawable. */
          const installed = !c.value || isInstalled(family);
          return (
            <button
              key={c.label}
              type="button"
              role="radio"
              aria-checked={on}
              className={`dk-ap-font${on ? ' is-on' : ''}${installed ? '' : ' is-missing'}`}
              onClick={() => { setCustomOpen(false); onChange(c.value); }}
              title={installed ? c.label : `${c.label} is not installed on this computer`}
            >
              <span className="dk-ap-font__sample" style={{ fontFamily: `${cssFontStack(family)}, ${fallback}` }}>
                {mono ? '{ }=>' : 'Aa'}
              </span>
              <span className="dk-ap-font__name">{c.label}</span>
              {!installed && <span className="dk-ap-font__note">not installed</span>}
              {on && <span className="dk-ap-font__check"><CheckIcon size={11} /></span>}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={customOpen}
          className={`dk-ap-font dk-ap-font--custom${customOpen ? ' is-on' : ''}`}
          onClick={() => { setCustomOpen(true); setDraft(known ? '' : value); }}
        >
          <span className="dk-ap-font__sample">Abc</span>
          <span className="dk-ap-font__name">Custom</span>
          {customOpen && <span className="dk-ap-font__check"><CheckIcon size={11} /></span>}
        </button>
      </div>
      {customOpen && (
        <div className="dk-ap-custom">
          <TextInputView
            value={draft}
            placeholder={mono ? 'Any installed font, e.g. Iosevka, IBM Plex Mono' : 'Any installed font, e.g. IBM Plex Sans'}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
            width="fw"
          />
          <span className="dk-ap-custom__hint">
            {draft.trim() && !isInstalled(draft) ? `"${draft.trim().split(',')[0]}" is not installed here; the default is used instead.` : 'Press Enter to use it. A list of families works too.'}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── pieces ────────────────────────────────────────────────────────────── */

function Chip({ on, onClick, children, accent }: { on: boolean; onClick: () => void; children: ReactNode; accent?: string }) {
  return (
    <button
      type="button"
      className={`dk-ap-chip${on ? ' is-on' : ''}`}
      style={accent ? { ['--ap-accent' as string]: accent } : undefined}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Card({ icon, accent, title, description, onReset, children }: {
  icon: ReactNode;
  accent: string;
  title: string;
  description: string;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="dk-ap-card" style={{ ['--ap-accent' as string]: accent }}>
      <header className="dk-ap-card__head">
        <span className="dk-ap-tile">{icon}</span>
        <div className="dk-ap-card__titles">
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        {onReset && (
          <button type="button" className="dk-ap-reset" onClick={onReset}>
            <UndoIcon size={12} /> Reset
          </button>
        )}
      </header>
      <div className="dk-ap-card__body">{children}</div>
    </section>
  );
}

function Field({ label, value, children }: { label: string; value?: ReactNode; children: ReactNode }) {
  return (
    <div className="dk-ap-field">
      <div className="dk-ap-field__label">
        <span>{label}</span>
        {value !== undefined && <span className="dk-ap-field__value">{value}</span>}
      </div>
      {children}
    </div>
  );
}

/* ── sizes ─────────────────────────────────────────────────────────────── */

const REGION_LOOK: Record<ZoomRegion, { icon: ReactNode; accent: string }> = {
  rail: { icon: <SidebarLeftIcon size={15} />, accent: 'var(--color-primary)' },
  tabs: { icon: <ColumnsIcon size={15} />, accent: 'var(--color-info)' },
  sidebar: { icon: <SidebarRightIcon size={15} />, accent: 'var(--color-sidebar-collections)' },
  sideRail: { icon: <LayoutGridIcon size={15} />, accent: 'var(--color-protocol-graphql)' },
  content: { icon: <DocumentIcon size={15} />, accent: 'var(--color-success)' },
  menus: { icon: <MoreHorizontalIcon size={15} />, accent: 'var(--color-warning)' },
  modals: { icon: <PanelMaximizeIcon size={15} />, accent: 'var(--color-protocol-soap)' },
};

const PRESETS = [90, 100, 110, 125, 140];

function RegionTile({ id, label, description }: { id: ZoomRegion; label: string; description: string }) {
  const value = useAppearanceStore(s => s.zoom[id]);
  const setZoom = useAppearanceStore(s => s.setZoom);
  const look = REGION_LOOK[id];
  return (
    <div className={`dk-ap-region${value !== 100 ? ' is-changed' : ''}`} style={{ ['--ap-accent' as string]: look.accent }}>
      <div className="dk-ap-region__top">
        <span className="dk-ap-tile dk-ap-tile--sm">{look.icon}</span>
        <span className="dk-ap-region__name">{label}</span>
        <span className="dk-ap-region__pct">{value}%</span>
      </div>
      <p className="dk-ap-region__desc">{description}</p>
      <div className="dk-ap-region__controls">
        <StepperInputView value={value} onChange={(v) => setZoom(id, v)} min={ZOOM_MIN} max={ZOOM_MAX} step={5} size="sm" />
        <div className="dk-ap-chips">
          {PRESETS.map(p => <Chip key={p} on={value === p} onClick={() => setZoom(id, p)}>{p}</Chip>)}
        </div>
      </div>
    </div>
  );
}

/* ── the page ──────────────────────────────────────────────────────────── */

const SAMPLE = `const order = { id: "ord_8f21", qty: 2, paid: true };
if (order.qty >= 2 && order.id !== "") {
  const total = items.map(i => i.price * i.qty);
}
`;

const OWN_SIZE = 13;
const AUTO_LINE = 1.4;

export function AppearanceSettings() {
  const a = useAppearanceStore();
  const editorChanged = !!(a.editorFontFamily || a.editorFontSize || a.editorLineHeight || a.editorLigatures);
  const fontsChanged = !!(a.uiFontFamily || a.monoFontFamily);
  const sizesChanged = ZOOM_REGIONS.some(r => a.zoom[r.id] !== DEFAULT_APPEARANCE.zoom[r.id]);
  const previewSummary = [
    a.editorFontFamily ? a.editorFontFamily.split(',')[0] : 'Default font',
    a.editorFontSize ? `${a.editorFontSize}px` : 'own size',
    a.editorLineHeight ? `${a.editorLineHeight}×` : 'auto lines',
  ].join(' · ');

  return (
    <div className="dk-ap">
      <div className="dk-ap-top">
        <button
          type="button"
          className="dk-ap-reset dk-ap-reset--strong"
          onClick={() => a.reset()}
          disabled={!(editorChanged || fontsChanged || sizesChanged)}
          title="Put every font and size back to Daakia's own"
        >
          <UndoIcon size={12} /> Reset everything
        </button>
      </div>

      <Card
        icon={<CodeBracketsIcon size={16} />}
        accent="var(--color-info)"
        title="Editor"
        description="Every code editor: request and response bodies, scripts, scratchpads, GraphQL and the AI tools."
        onReset={editorChanged ? () => a.reset('editor') : undefined}
      >
        <div className="dk-ap-editor">
          <div className="dk-ap-editor__controls">
            <Field label="Font">
              <FontTiles value={a.editorFontFamily} choices={EDITOR_FONTS} mono accent="var(--color-info)" onChange={(f) => a.set({ editorFontFamily: f })} />
            </Field>

            <div className="dk-ap-pair">
              <Field label="Font size" value={a.editorFontSize ? `${a.editorFontSize} px` : 'each editor’s own'}>
                <div className="dk-ap-inline">
                  <StepperInputView value={a.editorFontSize || OWN_SIZE} onChange={(v) => a.set({ editorFontSize: v })} min={8} max={40} step={1} size="sm" />
                  <Chip on={!a.editorFontSize} onClick={() => a.set({ editorFontSize: 0 })} accent="var(--color-info)">Each editor’s own</Chip>
                </div>
              </Field>
              <Field label="Line height" value={a.editorLineHeight ? `${a.editorLineHeight}×` : 'automatic'}>
                <div className="dk-ap-inline">
                  <StepperInputView
                    value={a.editorLineHeight || AUTO_LINE}
                    onChange={(v) => a.set({ editorLineHeight: Math.round(v * 10) / 10 })}
                    min={1} max={3} step={0.1} size="sm"
                  />
                  <Chip on={!a.editorLineHeight} onClick={() => a.set({ editorLineHeight: 0 })} accent="var(--color-info)">Automatic</Chip>
                </div>
              </Field>
            </div>

            <div className="dk-ap-toggle">
              <div>
                <span className="dk-ap-toggle__label">Font ligatures</span>
                <span className="dk-ap-toggle__desc">Draw <code>=&gt;</code> <code>!=</code> <code>&gt;=</code> as single glyphs, in fonts that have them.</span>
              </div>
              <ToggleSwitchView checked={a.editorLigatures} onChange={(v) => a.set({ editorLigatures: v })} accentColor="var(--color-info)" />
            </div>
          </div>

          <div className="dk-ap-preview">
            <div className="dk-ap-preview__head">
              <span>Preview</span>
              <span className="dk-ap-preview__summary">{previewSummary}</span>
            </div>
            <CodeEditor value={SAMPLE} language="javascript" readOnly wordWrap height="150px" />
          </div>
        </div>
      </Card>

      <Card
        icon={<TypeIcon size={16} />}
        accent="var(--color-scratchpad)"
        title="Interface fonts"
        description="The text around the editors."
        onReset={fontsChanged ? () => a.reset('fonts') : undefined}
      >
        <Field label="Interface font" value="menus, labels, buttons, panels">
          <FontTiles value={a.uiFontFamily} choices={UI_FONTS} mono={false} accent="var(--color-scratchpad)" onChange={(f) => a.set({ uiFontFamily: f })} />
        </Field>
        <Field label="Monospace font" value="URLs, paths, headers outside an editor">
          <FontTiles value={a.monoFontFamily} choices={MONO_FONTS} mono accent="var(--color-scratchpad)" onChange={(f) => a.set({ monoFontFamily: f })} />
        </Field>
      </Card>

      <Card
        icon={<TextSizeIcon size={16} />}
        accent="var(--color-success)"
        title="Sizes"
        description="Each part of the window scales on its own — text, icons and spacing together. 100% is as designed."
        onReset={sizesChanged ? () => a.reset('sizes') : undefined}
      >
        <div className="dk-ap-regions">
          {ZOOM_REGIONS.map(r => <RegionTile key={r.id} {...r} />)}
        </div>
      </Card>
    </div>
  );
}
