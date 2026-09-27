/**
 * The pieces the four Loggers boards are built from, drawn once.
 *
 * The catalogue, Add loggers, Add patterns and Scan the repository share a
 * header band, a tab strip, a LEVEL pill, a hole drawn as a teal pill, a note
 * with an info icon, a checkbox with a purple tick and a footer with a purple
 * button — and each of those had drifted into four slightly different
 * versions of itself, none of them the board's. Here each is the board's,
 * measured off it: heights, paddings, radii and font sizes are the drawn
 * ones, so a screen built from these reads the same as the picture.
 *
 * The colours come from `loggers-tone.ts`, which maps the boards' neutrals to
 * theme tokens; nothing here names a hex.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ButtonView, SelectInputView, type ButtonViewProps } from '@salilvnair/dui';
import { templateParts } from './logger-pattern';
import { LEVEL_COLOR } from './logger-catalogue';
import { ChevronDownIcon, CloseIcon, InfoCircleIcon } from '../../icons';
import { LOGGERS, LOGGERS_INK, HOLE } from './tone';
import {
  EDGE, CARD, TEXT, LABEL, QUIET, NOTE_ICON, PICKED, HEAD_BAND, HOLE_FILL, tint,
} from './loggers-tone';

// ── The header band ──────────────────────────────────────────────────────────

/**
 * A dialog's header: a purple icon, the title at 14/600, the subtitle on the
 * SAME line at 12 muted — the board reads it as one sentence, "Add loggers so
 * the catalogue lists them before they ever fire" — and whatever the dialog
 * keeps on the right. The band fades from purple at the top to nothing.
 */
export function DialogHead({ icon, title, subtitle, right, onClose, height = 46, padX = 16 }: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClose?: () => void;
  height?: number;
  padX?: number;
}) {
  return (
    <div className="flex items-center shrink-0"
         style={{ gap: 10, height, padding: `0 ${padX}px`, borderBottom: `1px solid ${EDGE}`, background: HEAD_BAND }}>
      <span className="inline-flex shrink-0">{icon}</span>
      <span className="shrink-0" style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{title}</span>
      {subtitle && <span className="truncate min-w-0" style={{ fontSize: 12, color: QUIET }}>{subtitle}</span>}
      <div className="flex-1" />
      {right}
      {onClose && (
        <button type="button" aria-label="Close" title="Close" onClick={onClose}
                className="inline-flex items-center justify-center shrink-0 cursor-pointer"
                style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'none', color: LABEL, padding: 0 }}>
          <CloseIcon size={15} />
        </button>
      )}
    </div>
  );
}

// ── The tab strip ────────────────────────────────────────────────────────────

/**
 * The boards' source switcher: tabs, not a segmented control. The chosen one
 * is a purple-edged tab with its bottom edge open onto the rule below it, so
 * it reads as the front of what follows; the others are plain text.
 */
export function BoardTabs<T extends string>({ value, onChange, options, height = 32, padX = 13 }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  height?: number;
  padX?: number;
}) {
  return (
    <div role="tablist" className="flex" style={{ gap: 2 }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className="inline-flex items-center cursor-pointer"
            style={{
              gap: 7, height, padding: `0 ${padX}px`, fontSize: 12.5,
              border: on ? `1px solid ${LOGGERS}` : '1px solid transparent',
              borderBottomColor: 'transparent',
              borderRadius: '7px 7px 0 0',
              background: on ? PICKED : 'none',
              color: on ? TEXT : LABEL,
              fontWeight: on ? 600 : 400,
            }}
          >
            {o.icon && <span className="inline-flex" style={{ color: on ? LOGGERS : 'currentColor' }}>{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── A checkbox ───────────────────────────────────────────────────────────────

/**
 * The boards' checkbox: the platform's own, ticked in purple, with the label
 * beside it at the size and shade the board gives that particular label —
 * "Select all" in text colour, the qualifiers beside it quieter.
 */
export function Tick({ checked, onChange, label, color = TEXT, accent = LOGGERS, fontSize = 12, disabled,
  indeterminate, ariaLabel, title, style }: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label?: ReactNode;
  color?: string;
  accent?: string;
  fontSize?: number;
  disabled?: boolean;
  indeterminate?: boolean;
  ariaLabel?: string;
  title?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  const box = (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      title={label === undefined ? title : undefined}
      onChange={e => onChange?.(e.target.checked)}
      onClick={e => e.stopPropagation()}
      style={{ accentColor: accent, margin: 0, width: 13, height: 13, cursor: disabled ? 'default' : 'pointer', flexShrink: 0 }}
    />
  );
  if (label === undefined) return box;
  return (
    <label title={title} className="inline-flex items-center shrink-0"
           style={{ gap: 7, fontSize, color, cursor: disabled ? 'default' : 'pointer', ...style }}>
      {box}
      {label}
    </label>
  );
}

// ── LEVEL ────────────────────────────────────────────────────────────────────

/** A level as the boards draw it: bold, in its colour, on a 16% fill of it — grey on 20% for DEBUG. */
export function LevelPill({ level, small }: { level?: string; small?: boolean }) {
  if (!level) return <span style={{ fontSize: 11, color: QUIET }}>&mdash;</span>;
  const lv = level.toUpperCase();
  const color = LEVEL_COLOR[lv] ?? QUIET;
  const quiet = color === QUIET;
  return (
    <span className="inline-block whitespace-nowrap"
          style={{
            padding: small ? '1px 6px' : '1px 7px', borderRadius: 4,
            fontSize: small ? 10 : 10.5, fontWeight: 700, lineHeight: 1.5,
            color, background: tint(color, quiet ? 20 : 16),
          }}>
      {lv}
    </span>
  );
}

// ── Labels and notes ─────────────────────────────────────────────────────────

/** A section's name: PASTE LOGGER CALLS, WHAT THAT MATCHES, WHERE THEY ARE. */
export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className="shrink-0"
          style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: LABEL, ...style }}>
      {children}
    </span>
  );
}

/** A column heading row's type: 10.5 (or 10) bold, spaced, muted. */
export const HEAD_TYPE: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: QUIET };

/**
 * The boards' explanatory note: an info icon in the note teal, the text at
 * 11.5 on a 1.6 line, a bordered card. `code` inside it is set in mono at
 * text colour, the way the board sets `@Slf4j`.
 */
export function NoteBox({ children, background = CARD, style }: {
  children: ReactNode; background?: string; style?: CSSProperties;
}) {
  return (
    <div className="flex items-start shrink-0"
         style={{ gap: 9, padding: '10px 12px', border: `1px solid ${EDGE}`, borderRadius: 8, background, ...style }}>
      <span className="inline-flex shrink-0" style={{ marginTop: 2 }}>
        <InfoCircleIcon size={14} color={NOTE_ICON} />
      </span>
      <div style={{ fontSize: 11.5, lineHeight: 1.6, color: LABEL }}>{children}</div>
    </div>
  );
}

/** A name set in mono at text colour inside a note: `@Slf4j`, `{}`. */
export function Code({ children }: { children: ReactNode }) {
  return <span className="font-mono" style={{ color: TEXT }}>{children}</span>;
}

// ── A template with its holes as pills ───────────────────────────────────────

/**
 * A message pattern as Add patterns and Scan the repository draw it: the
 * fixed words, and each hole as its name on a teal pill — `reqId`, not
 * `{reqId}` — because on those boards the hole is a field about to be made,
 * and the pill is the field. (The catalogue draws `{orderId}` in plain teal;
 * that is `PatternTemplate`.)
 */
export function HolePills({ template, dim, padX = 5 }: { template: string; dim?: boolean; padX?: number }) {
  return (
    <>
      {templateParts(template).map((part, i) => (part.hole
        ? (
          <span key={i}
                style={{
                  padding: `0 ${padX}px`, borderRadius: 4,
                  color: dim ? QUIET : HOLE, background: dim ? tint(QUIET, 20) : HOLE_FILL,
                }}>
            {part.text}
          </span>
        )
        : <span key={i} style={{ color: dim ? QUIET : TEXT }}>{part.text}</span>
      ))}
    </>
  );
}

// ── A picker ─────────────────────────────────────────────────────────────────

/**
 * A select drawn the way the boards draw one: "Level  any ⌄" — the name in
 * text colour, the value muted, a small chevron — on a card-coloured control.
 *
 * The drawing is ours and the behaviour is dui's: a `SelectInputView` sits
 * exactly over it, transparent, so the click, the keyboard and the menu (which
 * it portals to the body, out from under the transparency) are the library's,
 * and only the face is the board's. Focus lights the edge purple, which is the
 * one thing the transparent control cannot show for itself.
 */
export function Picker({ lead, icon, value, options, onChange, display, mono, height = 28, fill = CARD,
  fontSize = 12, radius = 6, menuMinWidth, title, maxWidth }: {
  lead?: string;
  icon?: ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  /** What the face says for the value, when it differs from the menu's label. */
  display?: string;
  mono?: boolean;
  height?: number;
  fill?: string;
  fontSize?: number;
  radius?: number;
  menuMinWidth?: number;
  title?: string;
  maxWidth?: number;
}) {
  const [focus, setFocus] = useState(false);
  const shown = display ?? options.find(o => o.value === value)?.label ?? value;
  return (
    <span className="relative inline-flex shrink-0 min-w-0" title={title} style={{ maxWidth }}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}>
      <span aria-hidden className="inline-flex items-center min-w-0"
            style={{
              gap: 6, height, padding: '0 10px', fontSize, color: TEXT, background: fill,
              border: `1px solid ${focus ? LOGGERS : EDGE}`, borderRadius: radius, whiteSpace: 'nowrap',
            }}>
        {icon && <span className="inline-flex shrink-0">{icon}</span>}
        {lead && <span className="shrink-0">{lead}</span>}
        <span className={`truncate min-w-0${mono ? ' font-mono' : ''}`} style={{ color: lead ? QUIET : TEXT }}>{shown}</span>
        <ChevronDownIcon size={11} color={QUIET} className="shrink-0" />
      </span>
      <SelectInputView
        value={value}
        onChange={onChange}
        options={options}
        size="md"
        accentColor={LOGGERS}
        menuMinWidth={menuMinWidth}
        width="100%"
        style={{ position: 'absolute', inset: 0, opacity: 0 }}
      />
    </span>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────

type Tone = 'plain' | 'quiet' | 'primary';

/**
 * The boards' three buttons, as one `ButtonView` with the board's measure:
 *
 *   plain    an edge, no fill, text colour       — Show in Logs, Cancel
 *   quiet    the same, in the label shade        — Copy patterns, All on
 *   primary  filled purple, dark ink, semibold   — Add loggers, Add 4 patterns
 *
 * `h` is the height the board gives it in that place: 24 in a row of row
 * actions, 28 in a toolbar, 30 in a footer — and a footer's corners are 7.
 */
export function BoardButton({ tone = 'plain', h = 24, fill, style, children, ...rest }: Omit<ButtonViewProps, 'variant' | 'size'> & {
  tone?: Tone; h?: number; fill?: string;
}) {
  const footer = h >= 30;
  const base: CSSProperties = {
    height: h,
    padding: `0 ${tone === 'primary' ? (footer ? 16 : 12) : footer ? 14 : 10}px`,
    fontSize: footer ? 12.5 : h >= 28 ? 12 : 11.5,
    borderRadius: footer ? 7 : 6,
    gap: 6,
    fontWeight: tone === 'primary' ? 600 : 400,
    ...(tone === 'primary'
      ? { background: LOGGERS, border: 'none', color: LOGGERS_INK }
      : { background: fill ?? 'none', border: `1px solid ${EDGE}`, color: tone === 'quiet' ? LABEL : TEXT }),
  };
  return (
    <ButtonView variant={tone === 'primary' ? 'primary' : 'secondary'} accentColor={LOGGERS}
                style={{ ...base, ...style }} {...rest}>
      {children}
    </ButtonView>
  );
}
