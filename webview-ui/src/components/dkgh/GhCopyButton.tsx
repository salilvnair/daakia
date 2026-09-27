/**
 * A copy that says it happened.
 *
 * Copying puts something on a clipboard nobody can see. A button that looks
 * identical before and after is a button people press twice, then check
 * somewhere else to find out whether it worked — so this swaps to a green tick
 * for a second and a half, popping in and drawing itself.
 *
 * **The same answer every copy in Daakia gives** — the shared tick
 * (`shared/CopyTick`), so a copy here looks like a copy anywhere else.
 *
 * A failed write says so instead of quietly doing nothing: a clipboard can be
 * refused — no permission, no secure context, a headless run — and "nothing
 * visible happened" is indistinguishable from a bug.
 */
import { Ico, type IcoName } from './GhIcons';
import { useCopyTick, CopyGlyph } from '../shared/CopyTick';

export function GhCopyButton({ text, icon = 'copy', className = 'btn', children, title }: {
  /** Built when pressed, not on every render — some of these are whole issues. */
  text: () => string;
  icon?: IcoName;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const { copied, flash } = useCopyTick();
  const { copied: failed, flash: flashFailed } = useCopyTick();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      flash();
    } catch {
      flashFailed();
    }
  };

  return (
    <button
      type="button"
      className={className}
      title={failed ? 'The clipboard refused it' : title}
      onClick={copy}
    >
      {failed ? <Ico name="warn" style={{ color: 'var(--dk-red)' }} />
        : copied || icon === 'copy' ? <CopyGlyph copied={copied} size={12} />
        : <Ico name={icon} />}
      {failed ? 'Could not copy' : children}
    </button>
  );
}
