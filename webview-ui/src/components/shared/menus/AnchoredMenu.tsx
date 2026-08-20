/**
 * AnchoredMenu — a popup that is anchored to a trigger element, portalled to <body>,
 * and always kept inside the viewport.
 *
 * Why this exists (two bugs it is the fix for):
 *
 *  1. CLIPPING / STACKING. Every protocol's "AI tools ⋮" menu was an `absolute` child of
 *     the URL-bar row. An absolutely-positioned element is still clipped by any ancestor
 *     with `overflow: hidden`, and its z-index only competes inside its own stacking
 *     context — so the menu rendered *behind* neighbouring panels and was invisible in
 *     every protocol except WebSocket, whose row happened not to clip. Portalling to
 *     <body> with `position: fixed` removes it from that ancestor chain entirely, so no
 *     amount of overflow or z-index elsewhere can hide it.
 *
 *  2. OFF-SCREEN POPUPS. Popups anchored near the bottom of the window (e.g. the Git Sync
 *     icon at the foot of the rail) were positioned with a HARD-CODED height estimate and
 *     clamped against that. When the real content was taller than the guess, the bottom
 *     was cut off. This measures the rendered element and repositions from the real box,
 *     flipping above the trigger when there isn't room below.
 *
 * Placement: preferred side first, opposite side if it doesn't fit, then clamped so the
 * menu can never leave the viewport. Measurement runs in useLayoutEffect, before paint,
 * so the menu never visibly jumps.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const VIEWPORT_MARGIN = 8;
const GAP = 4;

export type MenuSide = 'bottom' | 'top' | 'left' | 'right';
export type MenuAlign = 'start' | 'end';

interface AnchoredMenuProps {
  /** The trigger. Its bounding box is what the menu positions against. */
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Preferred side; flips to the opposite side when there isn't room. Default 'bottom'. */
  side?: MenuSide;
  /** Which edge to line up with the anchor on the cross axis. Default 'end' (right/bottom aligned). */
  align?: MenuAlign;
  minWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Set false to keep the menu open on outside clicks (rare). */
  closeOnOutsideClick?: boolean;
}

export function AnchoredMenu({
  anchorRef, open, onClose, children,
  side = 'bottom', align = 'end', minWidth = 200, className = '', style,
  closeOnOutsideClick = true,
}: AnchoredMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position from the REAL rendered size, not a guess. Runs before paint.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    const place = () => {
      const a = anchor.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let top: number;
      let left: number;

      if (side === 'bottom' || side === 'top') {
        const fitsBelow = a.bottom + GAP + m.height <= vh - VIEWPORT_MARGIN;
        const fitsAbove = a.top - GAP - m.height >= VIEWPORT_MARGIN;
        const goUp = side === 'top' ? (fitsAbove || !fitsBelow) : (!fitsBelow && fitsAbove);
        top = goUp ? a.top - GAP - m.height : a.bottom + GAP;
        left = align === 'end' ? a.right - m.width : a.left;
      } else {
        const fitsRight = a.right + GAP + m.width <= vw - VIEWPORT_MARGIN;
        const fitsLeft = a.left - GAP - m.width >= VIEWPORT_MARGIN;
        const goLeft = side === 'left' ? (fitsLeft || !fitsRight) : (!fitsRight && fitsLeft);
        left = goLeft ? a.left - GAP - m.width : a.right + GAP;
        top = align === 'end' ? a.bottom - m.height : a.top;
      }

      // Final clamp — covers the case where the menu is taller/wider than the viewport
      // itself, which no amount of flipping can solve.
      top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - m.height - VIEWPORT_MARGIN));
      left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - m.width - VIEWPORT_MARGIN));
      setPos({ top, left });
    };

    place();
    // Content can grow after the first paint (async data, images) — re-place when it does.
    const ro = new ResizeObserver(place);
    ro.observe(menu);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, side, align, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!closeOnOutsideClick) return;
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;   // let the trigger toggle itself
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef, closeOnOutsideClick]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      className={`rounded-xl border shadow-2xl overflow-hidden ${className}`}
      style={{
        position: 'fixed',
        // Rendered off-screen for the very first frame so it can be measured without
        // flashing at the wrong place; useLayoutEffect fills `pos` in before paint.
        top: pos ? pos.top : -9999,
        left: pos ? pos.left : -9999,
        minWidth,
        zIndex: 10050,
        backgroundColor: 'var(--color-panel)',
        borderColor: 'var(--color-surface-border)',
        ...style,
      }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
