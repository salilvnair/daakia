/**
 * The bits of typography the settings help text needs.
 *
 * Every explanation on this page had grown into one long muted paragraph with
 * `<code>` spans that rendered at the same weight and colour as the prose
 * around them. Nothing was scannable: the tokens you actually have to type
 * were invisible inside the sentence explaining them, and a reader looking for
 * one fact had to read the whole block to find out it was not there.
 *
 * So the same content gets structure instead of more words — a lead sentence,
 * then discrete points, with the things you type set apart from the prose that
 * describes them. A token is accented because it is substituted; a literal is
 * neutral because it is typed as-is. That distinction is the one a reader
 * needs most here and it costs nothing to encode.
 */
import React from 'react';

/** Where the k8s surface's accent lives. Matches the rest of the tab. */
const ACCENT = 'var(--color-dk8s)';

const chip: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: '0.94em',
  padding: '0.5px 4px',
  borderRadius: 3,
  whiteSpace: 'nowrap',
};

/**
 * A literal: something typed exactly as written — a path, a flag, a filename.
 */
export function Lit({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      ...chip,
      background: 'color-mix(in srgb, var(--color-text-muted) 12%, transparent)',
      border: '1px solid color-mix(in srgb, var(--color-text-muted) 18%, transparent)',
      color: 'var(--color-text-secondary)',
    }}>
      {children}
    </code>
  );
}

/**
 * A token: something replaced before use.
 *
 * Accented rather than neutral, because the difference between a name that is
 * substituted and a name that is typed is the single thing most likely to be
 * got wrong in a path template, and prose saying so is weaker than showing it.
 */
export function Tok({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      ...chip,
      background: `color-mix(in srgb, ${ACCENT} 13%, transparent)`,
      border: `1px solid color-mix(in srgb, ${ACCENT} 28%, transparent)`,
      color: ACCENT,
    }}>
      {children}
    </code>
  );
}

/**
 * Help text: a lead line, then points.
 *
 * The points are a list rather than sentences joined by semicolons, so a
 * reader can stop at the one that answers their question. `lead` alone is
 * fine — plenty of fields need one line and nothing more.
 */
export function Hint({ lead, points }: {
  lead?: React.ReactNode;
  points?: React.ReactNode[];
}) {
  return (
    <div className="flex flex-col gap-1" style={{ maxWidth: '84ch' }}>
      {lead && (
        <span className="text-[11px] leading-[1.55]"
              style={{ color: 'var(--color-text-secondary)' }}>
          {lead}
        </span>
      )}
      {!!points?.length && (
        <ul className="flex flex-col gap-[3px] m-0 p-0" style={{ listStyle: 'none' }}>
          {points.map((p, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10.5px] leading-[1.5]"
                style={{ color: 'var(--color-text-muted)' }}>
              {/* A rule rather than a bullet: it lines the points up without
                  adding a glyph to read. */}
              <span aria-hidden style={{
                width: 5, height: 1, marginTop: 8, flexShrink: 0,
                background: `color-mix(in srgb, ${ACCENT} 55%, transparent)`,
              }} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The reasoning behind a setting, folded away.
 *
 * Why a control exists is worth keeping and is not worth reading twice. Open
 * it once, understand the setting, and never see it again — as opposed to a
 * paragraph that is equally long every time you come back to change a path.
 */
export function Why({ children, label = 'Why this exists' }: {
  children: React.ReactNode; label?: string;
}) {
  return (
    <details className="group" style={{ maxWidth: '84ch' }}>
      <summary
        className="cursor-pointer text-[10px] uppercase tracking-wider select-none
                   list-none inline-flex items-center gap-1 w-fit"
        style={{ color: `color-mix(in srgb, ${ACCENT} 75%, var(--color-text-muted))` }}
      >
        <span aria-hidden className="transition-transform group-open:rotate-90"
              style={{ display: 'inline-block', fontSize: 8 }}>
          &#9654;
        </span>
        {label}
      </summary>
      <div className="text-[10.5px] leading-[1.55] mt-1 pl-2"
           style={{
             color: 'var(--color-text-muted)',
             borderLeft: `1px solid color-mix(in srgb, ${ACCENT} 25%, transparent)`,
           }}>
        {children}
      </div>
    </details>
  );
}
