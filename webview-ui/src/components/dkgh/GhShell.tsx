/**
 * The furniture the first-run screens share.
 *
 * It is the mock's own, class for class: `.empty` with its `.mark`, `.t` and
 * `.p`, the `.note` panel, the `.actions` row, and `.btn` for the buttons in
 * it. Nothing here draws a card of its own or reaches for a dui component that
 * would bring a second set of paddings with it — the screens before the board
 * are the first thing anybody sees, and they should look like the tab they are
 * the front door to.
 *
 * They exist as one file because the three screens are one screen in three
 * states, and three copies of a centred column with a mark and a title is how
 * they drift apart: one gains a heading size, another keeps the old padding,
 * and what should read as one place reads as three.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { postMsg } from '../../vscode';
import { Ico, type IcoName } from './GhIcons';

/**
 * dkgh's palette, where a dialog cannot carry it.
 *
 * `ModalView` portals to the body and does not put its `className` on the card,
 * so nothing rendered inside one has `.dkgh` above it — and every rule in
 * `dkgh.css` is scoped under `.dkgh`. Unstyled, the buttons come out as bare
 * text and the icons at their natural size, which is roughly a thumbnail.
 *
 * `display: contents` is what makes this free: the element stays in the tree so
 * descendant selectors match and the custom properties inherit, but it lays out
 * nothing of its own, so the dialog's own flexbox is untouched.
 */
export function Dk({ children }: { children: ReactNode }) {
  return <span className="dkgh" style={{ display: 'contents' }}>{children}</span>;
}

/**
 * A centred column: the mark, the title, and everything the screen adds.
 *
 * The lede and the options are children rather than props because these screens
 * carry real markup — commands, paths, a platform switch — and flattening that
 * into a message string would cost the formatting that makes it readable.
 */
export function GhEmpty({ icon, title, children }: {
  /** A glyph from dkgh's own sprite, so it is the weight the mock drew. */
  icon: IcoName;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty" style={{ flex: 1, overflowY: 'auto' }}>
      <div className="mark"><Ico name={icon} /></div>
      <div className="t">{title}</div>
      {children}
    </div>
  );
}

/** The sentence under the title. Narrow enough to read, centred to match. */
export function GhLede({ children }: { children: ReactNode }) {
  return <div className="p">{children}</div>;
}

/**
 * A command to run, with a copy — never a button that runs it.
 *
 * Installing software and authenticating are the reader's actions, not ours. A
 * one-click "do it for me" here would be running an installer, or driving a
 * credential flow, on somebody's behalf.
 */
export function GhCommand({ text, prompt = '>' }: { text: string; prompt?: string }) {
  return (
    <div className="cmd">
      <span className="p">{prompt}</span>
      {text}
      <span className="sp" />
      <CopyWord text={text} />
    </div>
  );
}

/** `copy`, and then `copied` for a moment — the mock's word, doing its job. */
export function CopyWord({ text, label = 'copy' }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      className="copy"
      onClick={e => {
        navigator.clipboard?.writeText(text);
        const el = e.currentTarget;
        el.textContent = 'copied';
        el.classList.add('done');
        window.setTimeout(() => {
          el.textContent = label;
          el.classList.remove('done');
        }, 1400);
      }}
    >
      {label}
    </button>
  );
}

/**
 * A note that is worth saying and not worth blocking on.
 *
 * `title` is the part a reader takes at a glance; the body is what they read
 * when the title turned out to be about them. A tone only moves the icon and
 * the rule beside it — the panel stays the mock's, because a warning that
 * redraws itself as a different kind of box reads as a different kind of
 * screen.
 */
export function GhNote({ title, icon = 'lock', tone, style, children }: {
  title?: string;
  icon?: IcoName;
  tone?: 'warn' | 'error';
  /** The mock draws one note at the foot of a screen; a dialog stacks them. */
  style?: CSSProperties;
  children: ReactNode;
}) {
  const colour = tone === 'error' ? 'var(--dk-red)'
    : tone === 'warn' ? 'var(--dk-amber)'
    : undefined;
  return (
    <div
      className="note"
      style={{
        ...(colour ? { borderColor: `color-mix(in srgb, ${colour} 45%, transparent)` } : null),
        ...style,
      }}
    >
      <Ico name={tone ? 'warn' : icon} style={colour ? { color: colour } : undefined} />
      <div>
        {title && <b>{title}.</b>}{title ? ' ' : ''}{children}
      </div>
    </div>
  );
}

/**
 * One of the mock's `.opt` cards: a heading, an optional command, a note.
 *
 * `pick` is the route the screen is recommending, and it is the only one the
 * accent is spent on — a list where three of four cards are lit is a list with
 * no recommendation in it.
 */
export function GhOption({ title, icon, tag, pick, command, action, note, children }: {
  title: ReactNode;
  icon?: IcoName;
  tag?: string;
  pick?: boolean;
  command?: string;
  /** A button in the heading row, where the mock puts `Use this`. */
  action?: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`opt${pick ? ' pick' : ''}`}>
      <div className="oh">
        {icon && <Ico name={icon} style={{ color: pick ? 'var(--dk-gh)' : 'var(--dk-muted)' }} />}
        {title}
        {tag && <span className="tag">{tag}</span>}
        <span className="sp" />
        {action}
      </div>
      {command && <GhCommand text={command} prompt="$" />}
      {children}
      {note && <div className="sub">{note}</div>}
    </div>
  );
}

/** A column of `.opt` cards at the mock's own width. */
export function GhOptions({ children, columns = 1 }: {
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <div className="opts" style={{ gridTemplateColumns: columns === 1 ? '1fr' : undefined }}>
      {children}
    </div>
  );
}

/** The row of actions at the bottom of an empty state. */
export function GhActions({ children }: { children: ReactNode }) {
  return <div className="actions">{children}</div>;
}

/** The one action the screen is actually asking for. */
export function GhPrimary({ children, onClick, icon, disabled }: {
  children: ReactNode;
  onClick?: () => void;
  icon?: IcoName;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="btn go" onClick={onClick} disabled={disabled}>
      {icon && <Ico name={icon} />}{children}
    </button>
  );
}

/** Everything else in that row. */
export function GhButton({ children, onClick, icon, disabled, title }: {
  children: ReactNode;
  onClick?: () => void;
  icon?: IcoName;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button type="button" className="btn" onClick={onClick} disabled={disabled} title={title}>
      {icon && <Ico name={icon} />}{children}
    </button>
  );
}

/**
 * "Open a terminal here", and what happens when there is not one.
 *
 * The three screens that offer this all show a command and ask the reader to
 * run it — installing software and authenticating are their actions, not ours.
 * What it must not do is nothing, which is what it did: the webview posted
 * `terminal:open` and neither the extension host nor the browser router had
 * ever heard of that message, so the button had been inert everywhere since it
 * was written.
 */
export function GhTerminalButton() {
  const [said, setSaid] = useState('');

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type !== 'dkgh:terminal:result') return;
      setSaid(msg.ok ? '' : String(msg.error ?? 'No terminal here.'));
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => { setSaid(''); postMsg({ type: 'dkgh:terminal' }); }}
      >
        <Ico name="term" />Open a terminal here
      </button>
      {said && <span className="sub" style={{ color: 'var(--dk-amber)' }}>{said}</span>}
    </>
  );
}
