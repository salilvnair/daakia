import { useEffect, useRef, useState } from 'react';

/**
 * True only once a wait has lasted long enough to be worth explaining.
 *
 * A placeholder that appears and vanishes inside half a second is worse than
 * no placeholder at all: the eye registers the movement, the layout jumps, and
 * the reader learns nothing — the work was already done by the time they could
 * focus on the words. Worse when two of them run back to back, which reads as
 * the screen breaking twice.
 *
 * So: wait quietly first. If the answer arrives before the threshold, nothing
 * was ever drawn and there is nothing to flash. If it does not, the wait is a
 * real one and the placeholder has earned its place — at which point it should
 * say what is being waited for, not spin.
 *
 * The second half matters as much as the first. Once shown, a placeholder stays
 * up for `minMs` even if the answer lands immediately after, because a
 * placeholder that flashes off is exactly the artefact this hook exists to
 * remove; showing it and yanking it merely moves the flicker later.
 */
export function useSettledWait(
  waiting: boolean,
  { delayMs = 450, minMs = 350 }: { delayMs?: number; minMs?: number } = {},
): boolean {
  const [show, setShow] = useState(false);
  /** When it went up, so `minMs` is measured from the right moment. */
  const shownAt = useRef(0);

  useEffect(() => {
    let timer: number | undefined;

    if (waiting) {
      if (!show) {
        timer = window.setTimeout(() => {
          shownAt.current = Date.now();
          setShow(true);
        }, delayMs);
      }
    } else if (show) {
      const held = Date.now() - shownAt.current;
      if (held >= minMs) setShow(false);
      else timer = window.setTimeout(() => setShow(false), minMs - held);
    }

    return () => { if (timer) window.clearTimeout(timer); };
  }, [waiting, show, delayMs, minMs]);

  return show;
}
