/**
 * The furniture the three first-run screens share.
 *
 * Pulled out because they are one screen in three states, and three copies of
 * a centred column with a mark and a title is how they drift apart — one gains
 * a heading size, another keeps the old padding, and what should read as one
 * place reads as three.
 */
import type { ReactNode } from 'react';
import { ButtonView, CopyButtonView } from '@salilvnair/dui';
import { ACCENT } from './types';

/** A centred column with a mark, a title and one sentence. */
export function GhEmpty({ icon, title, titleColor, children }: {
  icon: ReactNode;
  title: string;
  titleColor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto px-6 py-8 flex flex-col items-center" style={{ maxWidth: 700 }}>
        <div className="mb-3" style={{ color: 'var(--color-text-muted)', opacity: 0.55 }}>{icon}</div>
        <h2 className="text-[16px] font-bold m-0 mb-1.5 text-center"
            style={{ color: titleColor ?? 'var(--color-text-primary)' }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** The sentence under the title. Centred, and narrow enough to read. */
export function GhLede({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11.5px] text-center m-0 mb-4"
       style={{ color: 'var(--color-text-muted)', maxWidth: '54ch', lineHeight: 1.65 }}>
      {children}
    </p>
  );
}

/**
 * One install or sign-in route.
 *
 * `tag` marks the recommended one. `note` is what a person needs to decide
 * between this and the one beside it — not what the command does, which the
 * command already says.
 */
export function GhOption({ title, tag, command, note, action, recommended }: {
  title: string;
  tag?: string;
  command?: string;
  note?: ReactNode;
  action?: ReactNode;
  recommended?: boolean;
}) {
  return (
    <div className="rounded-xl border p-3 flex flex-col gap-2"
         style={{
           borderColor: recommended
             ? `color-mix(in srgb, ${ACCENT} 50%, transparent)`
             : 'var(--color-surface-border)',
           backgroundColor: recommended
             ? `color-mix(in srgb, ${ACCENT} 7%, transparent)`
             : 'var(--color-surface)',
         }}>
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
        {tag && (
          <span className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 16%, transparent)` }}>
            {tag}
          </span>
        )}
        <span className="flex-1" />
        {action}
      </div>
      {command && <GhCommand text={command} />}
      {note && (
        <div className="text-[10px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.55 }}>{note}</div>
      )}
    </div>
  );
}

/**
 * A command to run, with a copy button — never a button that runs it.
 *
 * Installing software and authenticating are the user's actions, not ours. A
 * one-click "do it for me" here would be running an installer, or driving a
 * credential flow, on somebody's behalf.
 */
export function GhCommand({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
         style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
      <span style={{ color: 'var(--color-success)', fontFamily: 'monospace', fontSize: 10.5 }}>&gt;</span>
      <code className="flex-1 text-[10.5px]"
            style={{ color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>
        {text}
      </code>
      <CopyButtonView text={text} />
    </div>
  );
}

/** A note that is worth saying and not worth blocking on. */
export function GhNote({ icon, tone, children }: {
  icon: ReactNode;
  tone?: 'warn' | 'error';
  children: ReactNode;
}) {
  const border = tone === 'error' ? 'var(--color-error)'
    : tone === 'warn' ? 'var(--color-warning)'
    : 'var(--color-surface-border)';
  return (
    <div className="rounded-lg border px-3 py-2 flex items-start gap-2.5 w-full"
         style={{
           borderColor: tone ? `color-mix(in srgb, ${border} 40%, transparent)` : border,
           backgroundColor: tone ? `color-mix(in srgb, ${border} 7%, transparent)` : 'var(--color-surface)',
         }}>
      <span className="flex-shrink-0 mt-0.5" style={{ color: tone ? border : 'var(--color-text-muted)' }}>{icon}</span>
      <div className="text-[10.5px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.65 }}>{children}</div>
    </div>
  );
}

/** The row of actions at the bottom of an empty state. */
export function GhActions({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 justify-center flex-wrap mt-4">{children}</div>;
}

export function GhPrimary({ children, onClick, iconLeft }: {
  children: ReactNode; onClick?: () => void; iconLeft?: ReactNode;
}) {
  return (
    <ButtonView size="md" variant="primary" accentColor={ACCENT} iconLeft={iconLeft} onClick={onClick}>
      {children}
    </ButtonView>
  );
}
