/**
 * The handful of controls the Follow boards repeat on every screen.
 *
 * The boards draw three buttons and one segmented track, over and over: an
 * outlined button with no fill, a filled teal one for the one thing a screen
 * is for, a pill, and a track of plain buttons with the chosen one filled.
 * `ButtonView` is every one of them underneath — its focus ring, its pressed
 * state, its disabled look — sized and painted to the board here, once, so
 * the Window's "Only the failing ones" and the rail's "Add as column" cannot
 * come out two pixels apart.
 *
 * Heights are passed rather than taken from a DUI size, because the boards
 * use 23, 24, 26 and 27 and a row of siblings has to agree with itself, not
 * with the nearest preset.
 */
import { useRef } from 'react';
import { ButtonView, CheckboxView, type ButtonViewProps } from '@salilvnair/dui';
import { FOLLOW, FOLLOW_INK, CHECK, FIELD_KEY, FIELD_VALUE, tint } from './follow-tone';

type Btn = Omit<ButtonViewProps, 'variant' | 'size'> & {
  /** Height in px. */
  h?: number;
  /** Label size in px. */
  fs?: number;
};

/**
 * Outlined, no fill: a hairline in the surface border, secondary text.
 *
 * `tone` makes it the teal outline — the Follow on a card that is not the
 * selected one, "Open the three pods in a split".
 */
export function LineButton({ h = 24, fs = 11, tone, style, ...rest }: Btn & { tone?: string }) {
  return (
    <ButtonView
      variant="ghost" size="sm" accentColor={tone ?? FOLLOW}
      style={{
        height: h, padding: '0 10px', fontSize: fs, fontWeight: 400, borderRadius: 6,
        border: `1px solid ${tone ?? 'var(--color-surface-border)'}`,
        color: tone ?? 'var(--color-text-secondary)',
        ...style,
      }}
      {...rest}
    />
  );
}

/** Filled teal, dark label, semibold — the one action a board is built around. */
export function FillButton({ h = 24, fs = 11, style, ...rest }: Btn) {
  return (
    <ButtonView
      variant="primary" size="sm" accentColor={FOLLOW}
      style={{
        height: h, padding: '0 10px', fontSize: fs, fontWeight: 600, borderRadius: 6,
        border: 'none', color: FOLLOW_INK,
        ...style,
      }}
      {...rest}
    />
  );
}

/** A rounded pill: teal-tinted with a teal edge when on, a hairline when off. */
export function PillButton({ on, h = 23, fs = 11, style, ...rest }: Btn & { on: boolean }) {
  return (
    <ButtonView
      variant="ghost" size="sm" accentColor={FOLLOW}
      style={{
        height: h, padding: '0 9px', fontSize: fs, fontWeight: 400, borderRadius: 999,
        border: `1px solid ${on ? FOLLOW : 'var(--color-surface-border)'}`,
        background: on ? tint(FOLLOW, 10) : 'transparent',
        color: on ? FOLLOW : 'var(--color-text-secondary)',
        ...style,
      }}
      {...rest}
    />
  );
}

/**
 * The boards' segmented track: a 2px well, plain buttons, the chosen one filled.
 *
 * `grow` spreads the buttons across the track (Fields, Determinants); without
 * it they sit at their own width (the Window's range).
 */
export function SegTrack<V extends string>({ options, value, onChange, h = 25, grow, well }: {
  options: { value: V; label: React.ReactNode; title?: string }[];
  value: V;
  onChange: (v: V) => void;
  h?: number;
  grow?: boolean;
  /** The well's colour — the page's own ground by default. */
  well?: string;
}) {
  return (
    <div role="radiogroup" className="flex" style={{ gap: 2, padding: 2, borderRadius: 7, background: well ?? 'var(--color-panel)' }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <ButtonView
            key={o.value} role="radio" aria-checked={on} title={o.title}
            variant={on ? 'primary' : 'ghost'} size="sm" accentColor={FOLLOW}
            onClick={() => onChange(o.value)}
            style={{
              flexGrow: grow ? 1 : undefined, height: h, padding: '0 9px', fontSize: 11,
              fontWeight: on ? 600 : 400, borderRadius: 5, border: 'none',
              color: on ? FOLLOW_INK : 'var(--color-text-secondary)',
            }}
          >
            {o.label}
          </ButtonView>
        );
      })}
    </div>
  );
}

/**
 * A checkbox and its words, the words clickable too — "One timeline".
 *
 * `CheckboxView`'s own label is a size smaller than the boards set theirs, so
 * the words are drawn here at the board's size and colour beside a bare box.
 * Both the box and the row call `onChange` with the same `!checked`, so a
 * click on the box that bubbles to the row still toggles once.
 */
export function CheckLabel({ checked, onChange, children, fs = 11.5, title }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  fs?: number;
  title?: string;
}) {
  return (
    <span role="presentation" title={title} onClick={() => onChange(!checked)}
          className="inline-flex items-center select-none"
          style={{ gap: 7, cursor: 'pointer', fontSize: fs, color: 'var(--color-text-secondary)' }}>
      <CheckboxView checked={checked} onChange={onChange} size="sm" accentColor={CHECK} />
      {children}
    </span>
  );
}

/**
 * A logger call as the boards draw it — the format string in the editor's
 * string colour, the arguments after it in its variable colour — and still a
 * field you type in.
 *
 * A textarea cannot colour its own text, so the colours are a copy of the
 * text drawn underneath it, in the same font at the same padding, and the
 * textarea's own letters are transparent over them; only its caret and its
 * selection show. Anything that is not a call (a regex, a pasted line) is
 * drawn plain by leaving `paint` off.
 */
export function CallEditor({ value, onChange, placeholder, rows = 2, paint = true }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  paint?: boolean;
}) {
  const under = useRef<HTMLPreElement>(null);
  const text: React.CSSProperties = {
    ...mono, fontSize: 11.5, lineHeight: '18px', padding: '9px 11px', margin: 0,
    whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: 'none',
  };
  const painted = paint && !!value;
  return (
    <div className="relative" style={{ border: '1px solid var(--color-surface-border)', borderRadius: 7, background: 'var(--color-panel)' }}>
      {painted && (
        <pre ref={under} aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none"
             style={{ ...text, color: 'var(--color-text-primary)' }}>
          {paintCall(value)}{'\n'}
        </pre>
      )}
      <textarea
        value={value} placeholder={placeholder} rows={rows} spellCheck={false}
        onChange={e => onChange(e.target.value)}
        onScroll={e => { if (under.current) under.current.scrollTop = e.currentTarget.scrollTop; }}
        className="relative block w-full resize-y"
        style={{
          ...text, background: 'transparent', outline: 'none',
          color: painted ? 'transparent' : 'var(--color-text-primary)', caretColor: 'var(--color-text-primary)',
        }}
      />
    </div>
  );
}

/** `log.info("settling batch {}", batchId)` → the string and the arguments coloured. */
function paintCall(src: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts = src.split(/("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)/);
  let afterString = false;
  parts.forEach((p, i) => {
    if (!p) return;
    if (i % 2 === 1) {
      out.push(<span key={i} style={{ color: FIELD_VALUE }}>{p}</span>);
      afterString = true;
      return;
    }
    if (!afterString) { out.push(<span key={i}>{p}</span>); return; }
    p.split(/([A-Za-z_$][\w$.]*)/).forEach((q, j) => {
      if (q) out.push(<span key={`${i}.${j}`} style={j % 2 === 1 ? { color: FIELD_KEY } : undefined}>{q}</span>);
    });
  });
  return out;
}

/** "HITS BY POD", "WHERE THESE CAME FROM" — the boards' section label. */
export const railLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
};

/** A table's column head: the same, a size down. */
export const headLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
};

export const mono: React.CSSProperties = { fontFamily: 'var(--font-mono, ui-monospace, Consolas, monospace)' };
