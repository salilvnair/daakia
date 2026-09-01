/**
 * Press and hold, as a way into selection.
 *
 * Selecting pods meant finding the checkbox above the list, turning the mode
 * on, and only then going back to the card you were already looking at. The
 * gesture every file manager and photo library uses says the same thing in one
 * motion: hold the thing you want, and you are selecting.
 *
 * ── What makes it not fire by accident ──
 *
 * A press that moves is a scroll or a drag, not a hold, so movement past a few
 * pixels cancels it. And a hold that fires has to swallow the click that
 * follows it, or letting go would immediately open the pod you just selected —
 * the pointer sequence ends in a `click` whether or not you meant one.
 */
import { useCallback, useEffect, useRef } from 'react';

/** Long enough not to catch an ordinary click, short enough to feel deliberate. */
export const LONG_PRESS_MS = 450;

/** Past this the press is a scroll or a drag. Generous, for touch. */
const MOVE_TOLERANCE = 10;

export interface LongPress {
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
  };
  /**
   * Whether the click now arriving was the tail of a long press.
   *
   * Call it first in the click handler and return when it is true. Reading it
   * clears it, so one hold swallows exactly one click.
   */
  consumed: () => boolean;
}

export function useLongPress(onLongPress: () => void): LongPress {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  // Held in a ref so the handlers stay stable across renders — a pod card
  // re-renders on every usage sample, and rebuilding these each time would
  // hand every row a new listener several times a second.
  const cb = useRef(onLongPress);
  cb.current = onLongPress;

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  // A component unmounting mid-press must not leave a timer that fires into
  // a store update for a row that is gone.
  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Primary button only: a right-click has its own menu, and a middle-click
    // is not a press.
    if (e.button !== 0) return;
    fired.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    timer.current = window.setTimeout(() => {
      timer.current = null;
      fired.current = true;
      cb.current();
    }, LONG_PRESS_MS);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const from = origin.current;
    if (!from || timer.current === null) return;
    if (Math.abs(e.clientX - from.x) > MOVE_TOLERANCE
      || Math.abs(e.clientY - from.y) > MOVE_TOLERANCE) cancel();
  }, [cancel]);

  const consumed = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
    },
    consumed,
  };
}
