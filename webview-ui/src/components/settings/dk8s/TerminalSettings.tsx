/**
 * Settings → Dk8s → Terminal.
 *
 * Laid out the way the rest of this settings page is: a card per decision,
 * with room to say what the decision means. A switch whose consequence has to
 * be guessed is a switch nobody touches, and the ones here have real
 * consequences — a shell that opens on arrival, a key that ends it.
 *
 * ── The theme half ──
 *
 * Six built-in palettes, however many imported ones, an order you set by
 * dragging, and a cap of six on what reaches the swatch strip inside the
 * terminal. The cap is on SELECTION rather than on storage, because the strip
 * is a row you choose from by looking and that stops working somewhere around
 * seven — past it the row is a legend you have to read. Collect as many as you
 * like; choose which six are within reach.
 *
 * ── Where a theme actually applies ──
 *
 * Here, not in the pod. These colours become the palette xterm renders with in
 * this panel — the pod emits ANSI codes and this side decides what colour a
 * code is. The one thing that reaches the container is the LS_COLORS line at
 * the bottom of this page, which is a shell variable in that one session.
 */
import { useState } from 'react';
import {
  SortableView, CheckboxView, ToggleSwitchView, SliderView,
  SegmentedControlView, ButtonView, BadgeChipView, IconSize,
  serializeTerminalThemes, type SortableRow,
} from '@salilvnair/dui';
import {
  PaletteIcon, FolderImportIcon, FolderExportIcon, TrashIcon, CopyIcon,
  CheckIcon, RefreshIcon, TerminalIcon, TypeIcon,
} from '../../../icons';
import {
  useDk8sTerminalStore, MAX_SELECTED, DEFAULT_PREFS,
} from '../../../store/dk8s-terminal-store';
import { ACCENT, OK, WARN, MUTED, BAD } from '../../k8s/tone';

/** The two verbs, in the colours collections already gives them. */
const IMPORT = 'var(--color-accent)';
const EXPORT = 'var(--color-warning)';
import { softPrimary } from '../../k8s/button-style';
import { ConfirmDialog } from '../../shared/modals/ConfirmDialog';
import { ThemePreview } from './ThemePreview';
import { ThemeImportModal } from './ThemeImportModal';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/*
  Two grounds to preview against, neither of them the panel's.

  The terminal takes the panel's own background, so on a dark panel the preview
  could only ever show the dark half — which is exactly the half nobody needs
  convincing about. These are stand-ins for "a dark panel" and "a light panel",
  so both halves of a theme can be looked at without changing the app's theme
  to check.
*/
const GROUND = { dark: '#16161c', light: '#f7f7f5' } as const;
type Ground = keyof typeof GROUND;

/** Stacks that exist on an ordinary machine, each falling back to the next. */
const FONTS = [
  { label: 'System', value: MONO },
  { label: 'Consolas', value: 'Consolas, ui-monospace, monospace' },
  { label: 'Cascadia', value: "'Cascadia Code', 'Cascadia Mono', ui-monospace, monospace" },
  { label: 'Courier', value: "'Courier New', Courier, monospace" },
];

/**
 * A measure on the PROSE, not on the page.
 *
 * The cards span the panel, the way every other settings screen's do — a
 * column of cards floating in the left two thirds of a wide window reads as a
 * layout that gave up. What does need a limit is the reading: a description
 * set the full width of a maximised window is a line nobody finishes, so the
 * sentence gets a measure and the card does not.
 */
const PROSE = '86ch';

function Group({ icon, label, hint, children }: {
  icon?: React.ReactNode; label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 mt-1">
        {icon}
        <span className="text-[9.5px] uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
      </div>
      {hint && (
        <span className="text-[11px] leading-relaxed -mt-1"
              style={{ color: 'var(--color-text-muted)', maxWidth: '72ch' }}>
          {hint}
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * One setting, in a card.
 *
 * The same shape the switches on this page already use — label, a sentence of
 * consequence, the control on the right — so a terminal setting does not read
 * as a different kind of thing from a cluster setting.
 */
function Row({ label, description, control }: {
  label: string; description?: string; control: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-6 px-4 py-3.5 rounded-lg"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      <span className="flex flex-col gap-1.5 flex-1 min-w-0">
        <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {label}
        </span>
        {description && (
          <span className="text-[11.5px] leading-relaxed"
                style={{ color: 'var(--color-text-secondary)', maxWidth: PROSE }}>
            {description}
          </span>
        )}
      </span>
      <span className="flex items-center shrink-0" style={{ paddingTop: 2 }}>{control}</span>
    </div>
  );
}

export function TerminalSettings() {
  const s = useDk8sTerminalStore();
  const [importing, setImporting] = useState(false);
  const [refused, setRefused] = useState<string>();
  const [copied, setCopied] = useState<string>();
  /*
    Both destructive actions ask first, and neither asks in the abstract.

    A theme lives in this browser's storage and nowhere else, so deleting one
    is the only copy unless it was exported — which is worth saying in the
    dialog rather than leaving the reader to remember.
  */
  const [deleting, setDeleting] = useState<string>();
  const [resetting, setResetting] = useState(false);
  /*
    Which ground the previews are drawn on.

    A preview only against the panel's own background can never answer "what
    does this look like in light mode", which is the question a theme with a
    derived light half most needs answered.
  */
  const [ground, setGround] = useState<Ground>('dark');

  const themes = s.themes();
  const bg = GROUND[ground];

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(what);
    window.setTimeout(() => setCopied(undefined), 1600);
  };

  const rows: SortableRow[] = themes.map(t => {
    const on = s.selected.includes(t.id);
    const active = s.active === t.id;
    const builtIn = s.isBuiltIn(t.id);
    return {
      id: t.id,
      node: (
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
          style={{
            background: active ? 'var(--color-surface-hover)' : 'var(--color-surface)',
            border: `1px solid ${active ? `${ACCENT}66` : 'var(--color-surface-border)'}`,
          }}
        >
          {/* Checked means "on the strip". Unchecked keeps the theme and puts
              it out of reach, which is the point of storing more than six. */}
          <CheckboxView
            checked={on}
            size="sm"
            accentColor={ACCENT}
            onChange={() => {
              const r = s.toggleSelected(t.id);
              setRefused(r.ok ? undefined : r.reason);
            }}
          />

          <button
            type="button"
            onClick={() => s.setActive(t.id)}
            title={`Use ${t.label}`}
            className="flex items-center gap-2.5 border-none bg-transparent p-0 cursor-pointer text-left"
            style={{ width: 260, flexShrink: 0 }}
          >
            <span style={{
              width: 14, height: 14, borderRadius: 4, background: t.swatch, flexShrink: 0,
              boxShadow: `0 0 0 1px var(--color-surface-border)`,
            }} />
            <span className="text-[12.5px] truncate"
                  style={{
                    color: active ? ACCENT : 'var(--color-text-primary)',
                    fontWeight: active ? 600 : 500,
                  }}>
              {t.label}
            </span>
            {active && <BadgeChipView tone={ACCENT} size="xs">in use</BadgeChipView>}
            {/* Where the theme came from. "custom" only made sense against an
                unlabelled majority; naming both halves is what makes either
                label mean anything. */}
            <BadgeChipView tone={builtIn ? MUTED : OK} size="xs">
              {builtIn ? 'system' : 'custom'}
            </BadgeChipView>
            {/* Every theme now has both halves. This says which of them was
                designed and which was computed — "dark only" used to mean the
                dark colours were being used on a light panel, which was a bug
                rather than a property worth labelling. */}
            {t.lightDerived && (
              <BadgeChipView tone={WARN} size="xs">light auto</BadgeChipView>
            )}
          </button>

          <ThemePreview
            palette={t} background={bg} rows={2}
            style={{ flex: 1, minWidth: 0, padding: '5px 8px' }}
          />

          <IconBtn label={`Copy ${t.label} as JSON`}
                   onClick={() => copy(serializeTerminalThemes([t]), t.id)}>
            {copied === t.id
              ? <CheckIcon size={IconSize.item} color={OK} />
              : <CopyIcon size={IconSize.item} />}
          </IconBtn>
          {/* Offered for built-ins too. Six palettes nobody uses are still six
              rows to read past — what differs is that a built-in comes back
              with Reset, which the confirmation says. */}
          <IconBtn label={builtIn ? `Hide ${t.label}` : `Delete ${t.label}`} tone={BAD}
                   onClick={() => setDeleting(t.id)}>
            <TrashIcon size={IconSize.item} />
          </IconBtn>
        </div>
      ),
    };
  });

  const customCount = s.custom.length;
  // Named, not counted: "2 themes will be deleted" does not tell you whether
  // the one you care about is among them.
  const customNames = s.custom.map(t => t.label).join(', ');

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      {/* ── Page heading, matching the sections beside it ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <TerminalIcon size={16} color={ACCENT} />
          <span className="text-[14px]"
                style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            Terminal
          </span>
        </div>
        <span className="text-[11.5px] leading-relaxed"
              style={{ color: 'var(--color-text-muted)', maxWidth: '72ch' }}>
          How the shell inside a pod looks and behaves. Colours are applied here, in
          this panel — the pod sends ANSI codes and this side decides what each one
          is painted as. Nothing but the <code>ls</code> setting at the bottom reaches
          the container.
        </span>
      </div>

      {/* ── Theme ─────────────────────────────────────────────────────── */}
      <Group
        icon={<PaletteIcon size={12} color="var(--color-text-muted)" />}
        label="theme"
        hint={`Drag to reorder. Check up to ${MAX_SELECTED} to put on the terminal's swatch `
          + 'strip; the rest stay stored here. Click a name to use it.'}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>
              <b style={{ color: 'var(--color-text-primary)' }}>{s.selected.length}</b>
              {` of ${MAX_SELECTED} on the strip`}
            </span>
            <BadgeChipView tone={MUTED} size="xs">{themes.length} stored</BadgeChipView>

            <span className="flex-1" />

            {/* Coloured by what each one does to the collection, not
                decoratively: green makes something, cyan brings something in,
                blue sends something out. Three grey buttons in a row made the
                reader read all three to find the one they wanted. */}
            {/* Import and Export only — Add was a second door into the same
                dialog, and the dialog already says "paste it, drop a file, or
                describe one". The colours are the ones collections use for the
                same two verbs, so import means the same thing in both places. */}
            <ButtonView label="Import" size="sm" variant="secondary"
                        accentColor={IMPORT} color={IMPORT}
                        style={softPrimary(IMPORT, true)}
                        iconLeft={<FolderImportIcon size={IconSize.action} />}
                        onClick={() => setImporting(true)} />
            <ButtonView
              label={copied === 'all' ? 'Copied' : 'Export all'}
              size="sm" variant="secondary"
              accentColor={copied === 'all' ? OK : EXPORT}
              color={copied === 'all' ? OK : EXPORT}
              style={softPrimary(copied === 'all' ? OK : EXPORT, true)}
              iconLeft={copied === 'all'
                ? <CheckIcon size={IconSize.action} />
                : <FolderExportIcon size={IconSize.action} />}
              onClick={() => copy(serializeTerminalThemes(themes), 'all')}
            />
          </div>

          {/* Why a click did nothing, said where the click was. */}
          {refused && (
            <span className="text-[11px]" style={{ color: WARN }}>{refused}</span>
          )}

          <div className="flex flex-col gap-1.5">
            <SortableView
              rows={rows}
              accentColor={ACCENT}
              onReorder={(from, to) => s.reorder(from, to)}
              rowClassName="dk8s-theme-row"
            />
          </div>

          <div className="flex flex-col gap-2 mt-1">
            <div className="flex items-center gap-2">
              <span className="text-[9.5px] uppercase tracking-wider"
                    style={{ color: 'var(--color-text-muted)' }}>
                {s.theme().label}, on a {ground} panel
              </span>
              <span className="flex-1" />
              {/* The toggle drives every preview on the page, including the
                  small ones in the rows — comparing six themes on one ground
                  is the comparison worth making. */}
              <SegmentedControlView
                size="sm" accentColor={ACCENT}
                options={[{ label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }]}
                value={ground}
                onChange={v => setGround(v as Ground)}
              />
            </div>
            <ThemePreview palette={s.theme()} background={bg} />
            {s.theme().lightDerived && ground === 'light' && (
              <span className="text-[10.5px] leading-relaxed"
                    style={{ color: WARN, maxWidth: PROSE }}>
                This theme did not ship a light variant, so this one was computed from its
                dark colours — legible rather than designed. Import a theme with a
                <code className="font-mono"> light </code> block to replace it.
              </span>
            )}
          </div>
        </div>
      </Group>

      {/* ── Text ──────────────────────────────────────────────────────── */}
      <Group icon={<TypeIcon size={12} color="var(--color-text-muted)" />} label="text">
        <Row
          label="Font size"
          description={`${s.prefs.fontSize} pixels.`}
          control={
            <SliderView value={s.prefs.fontSize} min={8} max={24} step={1} width={180}
                        accentColor={ACCENT} size="sm"
                        onChange={v => s.setPref('fontSize', v)} />
          }
        />
        <Row
          label="Line height"
          description={`${s.prefs.lineHeight.toFixed(2)}× the font size. Looser is easier `
            + 'to scan; tighter fits more of a log on screen.'}
          control={
            <SliderView value={s.prefs.lineHeight} min={1} max={2} step={0.05} width={180}
                        accentColor={ACCENT} size="sm"
                        onChange={v => s.setPref('lineHeight', v)} />
          }
        />
        <Row
          label="Font"
          description="Each is a stack — if the first is not installed the next one is used."
          control={
            <SegmentedControlView
              size="sm" accentColor={ACCENT}
              options={FONTS.map(f => ({ label: f.label, value: f.value }))}
              value={s.prefs.fontFamily}
              onChange={v => s.setPref('fontFamily', String(v))}
            />
          }
        />
      </Group>

      {/* ── Cursor ────────────────────────────────────────────────────── */}
      <Group label="cursor">
        <Row
          label="Shape"
          control={
            <SegmentedControlView
              size="sm" accentColor={ACCENT}
              options={[
                { label: 'Block', value: 'block' },
                { label: 'Bar', value: 'bar' },
                { label: 'Underline', value: 'underline' },
              ]}
              value={s.prefs.cursorStyle}
              onChange={v => s.setPref('cursorStyle', v as 'block' | 'bar' | 'underline')}
            />
          }
        />
        <Row
          label="Blink"
          control={
            <ToggleSwitchView checked={s.prefs.cursorBlink} size="sm" accentColor={ACCENT}
                              onChange={v => s.setPref('cursorBlink', v)} />
          }
        />
      </Group>

      {/* ── Behaviour ─────────────────────────────────────────────────── */}
      <Group label="behaviour"
             hint="Two of these change what a keystroke does, so they are worth reading.">
        <Row
          label="Scrollback"
          description={`${s.prefs.scrollback.toLocaleString()} lines kept above the screen. `
            + 'A find across a container blows past a thousand instantly, and the top of '
            + 'the output is usually the part that said what went wrong.'}
          control={
            <SliderView value={s.prefs.scrollback} min={1000} max={50000} step={1000} width={180}
                        accentColor={ACCENT} size="sm"
                        onChange={v => s.setPref('scrollback', v)} />
          }
        />
        <Row
          label="Open the shell on arrival"
          description="The Terminal tab connects as soon as you open it. Off puts a button
                       there instead, which is what you want if opening a shell in this
                       cluster is something you would rather do deliberately."
          control={
            <ToggleSwitchView checked={s.prefs.openOnArrival} size="sm" accentColor={ACCENT}
                              onChange={v => s.setPref('openOnArrival', v)} />
          }
        />
        <Row
          label="Escape ends the shell"
          description="Escape closes the terminal the way it closes an opened file. Ctrl-[ is
                       Escape on every terminal and still reaches the shell either way, so
                       vi and less lose nothing. Off leaves Escape to go back to the pod list."
          control={
            <ToggleSwitchView checked={s.prefs.escapeCloses} size="sm" accentColor={ACCENT}
                              onChange={v => s.setPref('escapeCloses', v)} />
          }
        />
        <Row
          label="Copy on select"
          description="Selecting text puts it on the clipboard, the way a terminal usually
                       does. Off by default because this one lives inside an editor, where
                       selecting does not."
          control={
            <ToggleSwitchView checked={s.prefs.copyOnSelect} size="sm" accentColor={ACCENT}
                              onChange={v => s.setPref('copyOnSelect', v)} />
          }
        />
        <Row
          label="Tone down ls colours"
          description="GNU coreutils paints world-writable and sticky directories black on
                       green as a warning. In a container — where /tmp, /config and every
                       mounted volume are world-writable — that is most of a listing lit up
                       like an alarm. On, dk8s sets LS_COLORS for those three cases when a
                       shell opens; every other colour keeps its default. Off restores it,
                       which is what you want when auditing permissions."
          control={
            <ToggleSwitchView checked={s.prefs.tidyLsColors} size="sm" accentColor={ACCENT}
                              onChange={v => s.setPref('tidyLsColors', v)} />
          }
        />
      </Group>

      {/*
        Right, red, and larger than the controls it undoes.

        It is the only action on this page that throws work away — every other
        control here changes one thing and can be changed back by hand. Sitting
        at the left in the same weight as a font-size slider, it read as one
        more setting; on the right in the destructive colour it reads as what
        it is. It still asks before doing anything.
      */}
      <div className="flex justify-end pt-1">
        <ButtonView
          label="Reset everything to defaults" size="sm" variant="secondary"
          iconLeft={<RefreshIcon size={IconSize.inline} />}
          accentColor={BAD} color={BAD} style={softPrimary(BAD, true)}
          onClick={() => setResetting(true)}
        />
      </div>

      {importing && <ThemeImportModal onClose={() => setImporting(false)} />}

      {deleting && (
        <ConfirmDialog
          danger
          title={s.isBuiltIn(deleting)
            ? `Hide ${s.theme(deleting).label}?`
            : `Delete ${s.theme(deleting).label}?`}
          message={
            (s.isBuiltIn(deleting)
              ? `${s.theme(deleting).label} ships with dk8s, so hiding it takes it out of `
                + 'this list without losing it — "Reset everything to defaults" brings every '
                + 'built-in back.'
              : `${s.theme(deleting).label} is stored in this browser and nowhere else, so `
                + 'this is the only copy unless you exported it. Deleting it cannot be undone.')
            + (s.active === deleting
              ? ' It is also the theme in use — the terminal will fall back to another one.'
              : '')
          }
          confirmLabel={s.isBuiltIn(deleting) ? 'Hide' : 'Delete'}
          onConfirm={() => { s.removeTheme(deleting); setDeleting(undefined); }}
          onCancel={() => setDeleting(undefined)}
        />
      )}

      {resetting && (
        <ConfirmDialog
          danger
          title="Reset the terminal to defaults?"
          message={
            'Font, cursor, scrollback and behaviour all go back to their defaults, every '
            + 'built-in theme comes back in its original order — including any you have '
            + 'hidden — and Tokyo Night becomes the one in use.'
            + (customCount
              ? ` ${customCount} imported theme${customCount === 1 ? '' : 's'} `
                + `(${customNames}) will be deleted — they live in this browser and nowhere `
                + 'else, so this is the only copy unless you exported them. Export them first '
                + 'if you want them back.'
              : ' The built-in themes cannot be lost, so nothing here is unrecoverable.')
          }
          confirmLabel={customCount ? `Reset and delete ${customCount}` : 'Reset'}
          onConfirm={() => { s.resetAll(); setResetting(false); }}
          onCancel={() => setResetting(false)}
        />
      )}
    </div>
  );
}

function IconBtn({ label, onClick, tone, children }: {
  label: string; onClick: () => void; tone?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button" title={label} aria-label={label} onClick={onClick}
      className="flex items-center justify-center rounded shrink-0"
      style={{
        width: 26, height: 24, cursor: 'pointer',
        color: tone ?? 'var(--color-text-muted)',
        background: 'transparent', border: 'none',
      }}
    >{children}</button>
  );
}
