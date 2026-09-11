/**
 * Dragging a card across the board.
 *
 * ── Why not HTML5 drag-and-drop ──
 *
 * Because it did not work, and because even where it works it looks wrong.
 *
 * It did not work: `dragstart` never called `dataTransfer.setData`, and a drag
 * that sets nothing is a drag several engines refuse to begin. The card had
 * `draggable` on it and `cursor: grab` under the pointer, and pressing and
 * moving did nothing at all.
 *
 * It looks wrong even when it runs: the browser takes its own screenshot of
 * the element, fades it to its own opacity, moves it on its own schedule and
 * gives you no say in any of it. There is no way to make that feel like the
 * state-machine editor's nodes, which is the bar the rest of this app is
 * already at.
 *
 * So this is pointer events. The card follows the cursor exactly — one
 * `transform` per pointer event, no transition while moving, which is the only
 * way a dragged thing feels attached to the hand — and lands with a short
 * animation into the column it was dropped on.
 *
 * ── A drag is not a click ──
 *
 * The same press does both: a click opens the issue, a press-and-move moves
 * it. Nothing is a drag until the pointer has travelled `THRESHOLD` pixels, and
 * once it has, the click that follows is swallowed. Otherwise every move would
 * also open the issue it just moved.
 *
 * ── Landing ──
 *
 * On release the ghost is not simply removed. It is given the position of the
 * column it was dropped on and `LAND_MS` to travel there, and the move is only
 * reported once it arrives — so the card is seen to go where the board is
 * about to say it went, rather than vanishing here and reappearing there.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardIssue } from './board-types';

/** How far the pointer must travel before a press becomes a drag. */
export const THRESHOLD = 4;
/** How long the ghost takes to reach the column it was dropped on. */
export const LAND_MS = 190;

export interface Drag {
  issue: BoardIssue;
  /** Top-left of the ghost, in viewport pixels. */
  x: number;
  y: number;
  /** The card's own size, so the ghost is the same card and not a thumbnail. */
  w: number;
  h: number;
  /** The column under the pointer, if any. */
  over?: string;
  /** True once the pointer is up and the ghost is travelling. */
  landing?: boolean;
}

/** Which column a point is over — the DOM already knows, so ask it. */
export function columnAt(x: number, y: number): string | undefined {
  const el = document.elementFromPoint(x, y);
  const col = el?.closest('[data-col]');
  return col?.getAttribute('data-col') ?? undefined;
}

/**
 * Where a ghost dropped on `column` should land: the foot of that column.
 *
 * `z` for the same reason the drag itself needs it — see `zoomOf`. Every
 * number here comes from `getBoundingClientRect`, which is measured, and goes
 * into a `transform`, which is laid out.
 */
export function landingRect(
  column: string, h: number, z: number,
): { x: number; y: number } | undefined {
  const col = document.querySelector(`[data-col="${cssEscape(column)}"]`);
  if (!col) return undefined;
  const r = col.getBoundingClientRect();
  const cards = col.querySelectorAll('.kcard');
  const last = cards[cards.length - 1]?.getBoundingClientRect();
  /* Under the last card if there is one, under the heading if there is not —
     which is where the board is about to draw it either way. */
  const top = last ? last.bottom + 7 : r.top + 34;
  return { x: r.left / z, y: Math.min(top, r.bottom - h * z) / z };
}

/**
 * How much the page is scaled between what is measured and what is laid out.
 *
 * A VS Code webview runs at the editor's own zoom, and the board is inside a
 * pane that can be scaled again. `getBoundingClientRect()` and `clientX` are
 * both in *visual* pixels; `width` and `translate3d` are in *layout* pixels.
 * Mixing the two is what made the dragged card come out smaller than the card
 * it came from and sit up and to the left of the cursor holding it.
 *
 * `offsetWidth` is the same box in layout pixels, so their ratio is the
 * factor, and 1 on a page that is not scaled at all.
 */
export function zoomOf(el: HTMLElement): number {
  const measured = el.getBoundingClientRect().width;
  const laid = el.offsetWidth;
  return laid > 0 && measured > 0 ? measured / laid : 1;
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

export function useCardDrag(onDrop: (issue: BoardIssue, column: string) => void) {
  const [drag, setDrag] = useState<Drag | undefined>();
  /* Read by the card's own onClick. A drag ends with a click event the browser
     fires anyway, and opening the issue somebody just moved is not what they
     asked for. */
  const dragged = useRef(false);
  const live = useRef<Drag | undefined>(undefined);

  useEffect(() => {
    document.body.classList.toggle('dkgh-dragging', !!drag && !drag.landing);
    return () => document.body.classList.remove('dkgh-dragging');
  }, [drag]);

  const start = useCallback((issue: BoardIssue, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const card = el.getBoundingClientRect();
    const z = zoomOf(el);
    const from = { x: e.clientX, y: e.clientY };
    /* Where inside the card the pointer took hold, so the ghost stays under
       the same corner of the card rather than jumping to the cursor. */
    const grip = { x: from.x - card.left, y: from.y - card.top };
    /* The card's own box in layout pixels — the ghost is the same card at the
       same size, not a scaled copy of it. */
    const size = { w: el.offsetWidth, h: el.offsetHeight };
    let started = false;
    dragged.current = false;

    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientX - from.x) + Math.abs(ev.clientY - from.y) < THRESHOLD) return;
        started = true;
        dragged.current = true;
      }
      ev.preventDefault();
      const next: Drag = {
        issue,
        x: (ev.clientX - grip.x) / z,
        y: (ev.clientY - grip.y) / z,
        w: size.w,
        h: size.h,
        over: columnAt(ev.clientX, ev.clientY),
      };
      live.current = next;
      setDrag(next);
    };

    const done = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);

      const d = live.current;
      live.current = undefined;
      if (!started || !d) { setDrag(undefined); return; }

      const to = d.over;
      if (!to) { setDrag(undefined); return; }

      const rect = landingRect(to, d.h, z);
      setDrag({ ...d, landing: true, ...(rect ?? {}) });
      window.setTimeout(() => {
        setDrag(undefined);
        onDrop(issue, to);
      }, LAND_MS);
    };

    const cancel = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      live.current = undefined;
      setDrag(undefined);
    };

    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') cancel(); };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
  }, [onDrop]);

  return { drag, start, dragged };
}
