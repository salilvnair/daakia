/**
 * A copy that says it happened.
 *
 * Copying puts something on a clipboard nobody can see. A button that looks
 * identical before and after is a button people press twice, then check
 * somewhere else to find out whether it worked — so this swaps to a green tick
 * for two seconds and pops as it does.
 *
 * **The same answer the code fences already give.** `MarkdownView`'s own copy
 * does exactly this, and dkgh styles it with `dkgh-pop` — reusing that
 * animation rather than inventing a second one means every copy in the tab
 * behaves the same way.
 *
 * A failed write says so instead of quietly doing nothing: a clipboard can be
 * refused — no permission, no secure context, a headless run — and "nothing
 * visible happened" is indistinguishable from a bug.
 */
import { useEffect, useRef, useState } from 'react';
import { Ico, type IcoName } from './GhIcons';

type Said = 'idle' | 'done' | 'failed';

/** How long the tick stays up. Long enough to read, short enough not to nag. */
const HOLD = 2000;

export function GhCopyButton({ text, icon = 'copy', className = 'btn', children, title }: {
  /** Built when pressed, not on every render — some of these are whole issues. */
  text: () => string;
  icon?: IcoName;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const [said, setSaid] = useState<Said>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /* A press while the tick is up restarts it rather than leaving a stale
     timer to clear a tick that belongs to the second press. */
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text());
      setSaid('done');
    } catch {
      setSaid('failed');
    }
    timer.current = setTimeout(() => setSaid('idle'), HOLD);
  };

  return (
    <button
      type="button"
      className={`${className}${said === 'done' ? ' copied' : ''}`}
      title={said === 'failed' ? 'The clipboard refused it' : title}
      onClick={copy}
    >
      <Ico
        name={said === 'done' ? 'check' : said === 'failed' ? 'warn' : icon}
        className={said === 'done' ? 'popped' : undefined}
        style={said === 'done' ? { color: 'var(--dk-green)' }
          : said === 'failed' ? { color: 'var(--dk-red)' }
          : undefined}
      />
      {said === 'done' ? 'Copied' : said === 'failed' ? 'Could not copy' : children}
    </button>
  );
}
