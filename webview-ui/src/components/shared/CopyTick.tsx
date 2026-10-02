/**
 * What every copy in Daakia does when it has copied: the copy glyph turns
 * into a green tick that pops in and draws itself, for a second and a half,
 * then turns back.
 *
 * One look everywhere, instead of a "copied" word in one place, "Copied!" in
 * another and nothing at all in a third. dui's own CopyButtonView already
 * swaps to a tick; the same animation reaches it from index.css
 * (`.dk-copy-tick`, and its selector for dui's button), so the two match.
 *
 *   const { copied, flash } = useCopyTick();
 *   <button onClick={() => { void copyText(value); flash(); }}>
 *     <CopyGlyph copied={copied} />
 *   </button>
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from '../../icons';

/** How long the tick stays. */
export const COPY_TICK_MS = 1500;

export function useCopyTick(ms = COPY_TICK_MS): { copied: boolean; flash: () => void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback(() => {
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), ms);
  }, [ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { copied, flash };
}

/** The copy glyph, or — just after a copy — the green tick in its place. */
export function CopyGlyph({ copied, size = 14, color }: { copied: boolean; size?: number; color?: string }) {
  return copied
    ? (
      <span className="dk-copy-tick inline-flex" style={{ color: 'var(--color-success)' }} role="status" aria-label="Copied">
        <CheckIcon size={size} strokeWidth={2.6} />
      </span>
    )
    : <CopyIcon size={size} color={color} />;
}
