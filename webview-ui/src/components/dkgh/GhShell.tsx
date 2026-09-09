/**
 * The furniture the first-run screens share.
 *
 * Every piece here is a dui component with dkgh's accent passed in — nothing in
 * this file draws its own card, note or command block. What remains is layout
 * and the accent, which is the part that genuinely belongs to this tab.
 *
 * They exist as one file because the three screens are one screen in three
 * states, and three copies of a centred column with a mark and a title is how
 * they drift apart: one gains a heading size, another keeps the old padding,
 * and what should read as one place reads as three.
 */
import type { ReactNode } from 'react';
import { ButtonView, CalloutView, CodeBlockView, EmptyStateView } from '@salilvnair/dui';
import { ACCENT } from './types';

/**
 * A centred column: the dui empty state on top, everything else under it.
 *
 * The lede and the options are children rather than props because these screens
 * carry real markup — commands, paths, a platform switch — and flattening that
 * into a message string would cost the formatting that makes it readable.
 */
export function GhEmpty({ icon, title, titleColor, children }: {
  icon: ReactNode;
  title: string;
  titleColor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto px-6 py-8 flex flex-col items-center" style={{ maxWidth: 700 }}>
        <EmptyStateView
          variant="medallion"
          accentColor={titleColor ?? ACCENT}
          icon={icon}
          title={title}
          compact
        />
        {children}
      </div>
    </div>
  );
}

/** The sentence under the title. Narrow enough to read, centred to match. */
export function GhLede({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11.5px] text-center m-0 mb-4"
       style={{ color: 'var(--color-text-muted)', maxWidth: '54ch', lineHeight: 1.65 }}>
      {children}
    </p>
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
  return <CodeBlockView code={text} language="bash" fill showCopyButton accentColor={ACCENT} />;
}

/**
 * A note that is worth saying and not worth blocking on.
 *
 * `title` is the part a reader takes at a glance; the body is what they read
 * when the title turned out to be about them.
 */
export function GhNote({ title, tone, children }: {
  title: string;
  tone?: 'warn' | 'error';
  children: ReactNode;
}) {
  const variant = tone === 'error' ? 'danger' : tone === 'warn' ? 'warning' : 'info';
  return (
    <CalloutView variant={variant} title={title} style={{ margin: 0, width: '100%' }}>
      {children}
    </CalloutView>
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
