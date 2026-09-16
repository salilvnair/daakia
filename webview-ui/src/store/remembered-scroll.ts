/**
 * A scroll position that survives leaving the page.
 *
 * Settings pages are long, and the reason you are on one is usually a single
 * control two thirds of the way down. Switching to another section and back —
 * or closing the tab and reopening it — used to put you at the top, so every
 * return trip was the same hunt through the same page.
 *
 * ── Why restoring is not one line ──
 *
 * `el.scrollTop = remembered` on mount is right only if the page is already
 * its final height, and these pages are not: the PV page waits on a config
 * from the host, the command pages on an audit, and a page that grows after
 * the assignment leaves the scroll where a shorter page ended. So the target
 * is re-applied across a short settling window, and abandoned the moment the
 * reader scrolls — a page that fights the wheel is worse than one that forgets.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useUiStateStore } from './ui-state-store';

/** How long a page is given to reach its final height, in ms. */
export const SETTLE_MS = 700;
/** How often the target is re-applied inside that window, in ms. */
export const SETTLE_EVERY = 100;
/** Quiet time before a new position is written down, in ms. */
export const WRITE_AFTER = 250;

/**
 * Where to actually scroll to, given what the element can offer.
 *
 * Clamped rather than assigned blind: a remembered position from a page that
 * has since shrunk — a filter applied, a section collapsed — would otherwise
 * be silently truncated by the browser and then written back as the new
 * position, losing the original.
 */
export function restoreTarget(
  remembered: number, scrollHeight: number, clientHeight: number,
): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  return Math.min(Math.max(0, remembered), max);
}

/** Whether a restore actually landed, within a pixel of rounding. */
export function landed(target: number, actual: number): boolean {
  return Math.abs(target - actual) <= 1;
}

/**
 * Remember where this key was scrolled to, and go back there.
 *
 * Returns a ref callback for the scrolling element. The key is what the
 * position belongs to — a settings section, not the panel — so each page keeps
 * its own place rather than sharing one.
 */
export function useRememberedScroll(key: string) {
  const el = useRef<HTMLElement | null>(null);
  /* True while this is doing the scrolling, so the `scroll` events it causes
     are not mistaken for the reader's and written back. */
  const restoring = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /*
    The last position this section was actually at.

    Kept here rather than read back from the element on the way out. The
    scrolling element is shared between sections, and by the time a cleanup
    runs React has already rendered the section being switched to — so a short
    page has made the browser clamp `scrollTop` to 0, and reading it then
    writes that 0 over the position the switch was supposed to preserve.
  */
  const lastTop = useRef<number | undefined>(undefined);

  const attach = useCallback((node: HTMLElement | null) => {
    el.current = node;
  }, []);

  /* Restoring. Re-run on key, because switching section reuses the element. */
  useEffect(() => {
    if (!key) return;
    const node = el.current;
    if (!node) return;

    const remembered = useUiStateStore.getState().getScroll(key);

    /*
      A section with nothing remembered still has to be put at the top.

      The scrolling element is shared between sections, so switching pages
      without touching it leaves the new page scrolled to wherever the old one
      was — which reads as a page that opens halfway down for no reason.
    */
    if (!remembered) {
      node.scrollTop = 0;
      return;
    }

    restoring.current = true;
    let stop = false;
    const give_up = () => { stop = true; restoring.current = false; };

    /* The reader's own scroll ends this immediately: a page that keeps
       yanking itself back is worse than one that forgot. */
    node.addEventListener('wheel', give_up, { passive: true, once: true });
    node.addEventListener('touchstart', give_up, { passive: true, once: true });
    node.addEventListener('keydown', give_up, { once: true });

    const started = Date.now();
    const tick = () => {
      if (stop || !el.current) return;
      const target = restoreTarget(remembered, el.current.scrollHeight, el.current.clientHeight);
      if (!landed(target, el.current.scrollTop)) el.current.scrollTop = target;
      if (Date.now() - started < SETTLE_MS) {
        timer = setTimeout(tick, SETTLE_EVERY);
      } else {
        restoring.current = false;
      }
    };
    let timer = setTimeout(tick, 0);

    return () => {
      clearTimeout(timer);
      give_up();
      node.removeEventListener('wheel', give_up);
      node.removeEventListener('touchstart', give_up);
      node.removeEventListener('keydown', give_up);
    };
  }, [key]);

  /* Writing it down. Debounced, because a wheel gesture is a hundred events
     and each one would be a store update every subscriber re-renders for. */
  useEffect(() => {
    const node = el.current;
    if (!node || !key) return;

    const onScroll = () => {
      if (restoring.current) return;
      const top = el.current?.scrollTop ?? 0;
      lastTop.current = top;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        useUiStateStore.getState().setScroll(key, top);
      }, WRITE_AFTER);
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', onScroll);
      if (writeTimer.current) clearTimeout(writeTimer.current);
      /* Leaving counts as stopping: the last position before a section switch
         is exactly the one worth keeping, and the debounce may not have
         fired. From the ref, never from the element — see `lastTop`. */
      if (lastTop.current !== undefined) {
        useUiStateStore.getState().setScroll(key, lastTop.current);
      }
      lastTop.current = undefined;
    };
  }, [key]);

  return attach;
}
