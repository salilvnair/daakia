/**
 * A panel that drops out of a control and is not cut off by anything.
 *
 * ── What goes wrong without this ──
 *
 * The obvious way to build a dropdown is `position: absolute` inside the thing
 * it belongs to. That works until the thing it belongs to is narrower than the
 * panel, or scrolls, or hides its overflow — and in this tab it is all three.
 * The metadata rail is 268px wide with `overflow-y: auto`; a 340px picker
 * inside it was clipped at the rail's edge **and** pushed a horizontal
 * scrollbar across the bottom of the pane. A comment card is `overflow:
 * hidden`, so a menu inside one lost its last two rows.
 *
 * `z-index` fixes none of that. An ancestor's overflow clips a descendant
 * whatever its stacking order, and content wider than its container is what
 * makes a scrollbar regardless of how it is painted.
 *
 * So the panel is portalled out and positioned `fixed` against the control's
 * own rectangle. Fixed leaves every ancestor's overflow behind, and being out
 * of the flow it cannot make anything scroll.
 *
 * ── Into `.dkgh`, not into `document.body` ──
 *
 * The palette lives on the tab's root, and so does the editor's zoom. A panel
 * in the body would come out unstyled, and in a zoomed webview, the wrong size
 * — see `zoomOf` for why the coordinates are divided.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { zoomOf } from './card-drag';

export interface DropPlace { top: number; left: number }

/**
 * Where to put the panel, and when to put it away.
 *
 * Returns the ref to hang on the panel and the coordinates to give it. The
 * caller owns `open`; this only decides where and listens for the three ways
 * out that every dropdown in this tab shares — pointer-down elsewhere, Escape,
 * and the page moving under it.
 */
export function useDropPanel(
  open: boolean,
  onClose: () => void,
  anchor: React.RefObject<HTMLElement | null>,
  align: 'left' | 'right' = 'right',
) {
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<DropPlace | undefined>();

  const place = useCallback(() => {
    const a = anchor.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const host = a.closest('.dkgh') as HTMLElement | null;
    const z = host ? zoomOf(host) : 1;
    const w = panel.current?.offsetWidth ?? 260;
    const h = panel.current?.offsetHeight ?? 280;

    /* Below when there is room, above when there is not, and never off either
       side — which is the case the rail hits, being narrower than the panel. */
    const below = r.bottom + 4 + h * z <= window.innerHeight;
    const top = below ? r.bottom + 4 : Math.max(4, r.top - 4 - h * z);
    const wanted = align === 'right' ? r.right - w * z : r.left;
    const left = Math.max(4, Math.min(wanted, window.innerWidth - w * z - 4));
    setAt({ top: top / z, left: left / z });
  }, [anchor, align]);

  /* Before paint, so the panel is never seen at its off-screen parking spot. */
  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) { setAt(undefined); return; }
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchor.current?.contains(t) || panel.current?.contains(t)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    /* `true`, so it catches the pane's own scroller and not just the window. */
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open, onClose, place, anchor]);

  return { panel, at };
}

/**
 * Render into the `.dkgh` above this element, or in place if there is none.
 *
 * The fallback is for a host that renders one of these outside the tab: a
 * portal with no target throws, and a panel drawn in the wrong place is worse
 * than a portal and better than a blank screen.
 */
export function dropPortal(from: Element | null, node: ReactNode): ReactNode {
  const host = from?.closest('.dkgh');
  return host ? createPortal(node, host) : node;
}

/** The inline style a dropped panel needs, parked off-screen until placed. */
export function dropStyle(at: DropPlace | undefined): React.CSSProperties {
  return { top: at?.top ?? -9999, left: at?.left ?? -9999 };
}
