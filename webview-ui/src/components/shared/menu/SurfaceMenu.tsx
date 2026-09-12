/**
 * Right-click, and get a menu about the thing you right-clicked.
 *
 * The webview's own menu offers Copy and Select All, which is everything a
 * browser has to say about a page it knows nothing about. Daakia knows: a URL
 * bar, a header row, a body editor and a response pane all have obvious verbs,
 * and none of them are Select All.
 *
 * **One listener per panel, and a data attribute per place.** A panel spreads
 * `onContextMenu` on its root and marks its parts — `data-menu="url"`,
 * `data-menu="kv"` — and this walks up from the event target to the nearest
 * mark. Adding a menu somewhere new is adding an attribute, not threading a
 * handler down through the tree, which is what keeps this from turning into a
 * prop on every component in the app.
 *
 * The nearest mark wins, and everything above it is available as `ancestors` —
 * so a row inside a table inside a request panel can offer the row's verbs and
 * still know which panel it is in.
 *
 * **A text selection is left alone.** If something is selected, the reader is
 * after Copy, and the browser does that better than we can.
 */
import { useCallback, useState } from 'react';
import { ContextMenuView, type ContextMenuItem } from '@salilvnair/dui';

/**
 * The colours a menu icon can wear, by what the verb does.
 *
 * These are the app's `--color-ctx-*` tokens — the same set the tab bar picks
 * its Rename cyan and its Pin amber out of — so a colour means one thing
 * everywhere and both themes are already accounted for.
 *
 * They must not be a panel's own local palette: the menu is portalled to the
 * body, so tokens declared on a panel's root do not reach it and every icon
 * comes out the default grey.
 */
export const MENU = {
  /** Look at it, without changing it. */
  read: 'var(--color-ctx-rename)',
  /** Take a copy of something. */
  copy: 'var(--color-ctx-duplicate)',
  /** Fix something in place. */
  pin: 'var(--color-ctx-pin)',
  /** Destroys, clears, or excludes. */
  destroy: 'var(--color-ctx-close)',
  /** Confirms, adds, or creates. */
  make: 'var(--color-ctx-close-saved)',
  /** Narrows or filters what is on screen. */
  narrow: 'var(--color-ctx-close-batch)',
  /** Housekeeping, and the rows that should not compete. */
  quiet: 'var(--color-text-muted)',
} as const;

/** What was right-clicked. */
export interface Surface {
  /** The `data-menu` value on the nearest marked element. */
  kind: string;
  el: HTMLElement;
  /** Every other `data-*` on it — a row index, a field name, an id. */
  data: DOMStringMap;
  /** The marks above this one, nearest first. */
  ancestors: string[];
  /** The element the pointer was actually over. */
  target: HTMLElement;
}

/** A separator, which every menu wants and nobody wants to spell out. */
export function sep(id: string): ContextMenuItem {
  return { id, label: '', separator: true };
}

/** Copy, silently — the menu closing is the acknowledgement. */
export function copyText(text: string): void {
  navigator.clipboard?.writeText(text);
}

interface Placed { x: number; y: number; items: ContextMenuItem[] }

/**
 * The handler and the menu, for a panel to spread onto its root.
 *
 * `build` returns the items for a surface, or `undefined` to let the browser
 * keep its own menu — which is the right answer for anything this app has
 * nothing better to say about.
 */
export function useSurfaceMenu(
  build: (surface: Surface, event: React.MouseEvent) => ContextMenuItem[] | undefined,
) {
  const [placed, setPlaced] = useState<Placed | undefined>();

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!window.getSelection()?.isCollapsed) return;
    /*
      Handlers nest: a panel hangs one over its whole tree and the app hangs one
      over every panel, so a right-click on a header row reaches both. The inner
      one runs first and has already decided; the outer one steps back rather
      than replacing its menu a frame later.
    */
    if (e.defaultPrevented) return;

    const surface = surfaceAt(e.target as HTMLElement);
    if (!surface) return;

    const items = build(surface, e);
    if (!items || items.length === 0) return;

    e.preventDefault();
    setPlaced({ x: e.clientX, y: e.clientY, items });
  }, [build]);

  const node = (
    <ContextMenuView
      open={!!placed}
      anchorEl={null}
      position={placed ? { x: placed.x, y: placed.y } : undefined}
      onClose={() => setPlaced(undefined)}
      items={placed?.items ?? []}
      /* `auto` is `max-content`: as wide as the longest label, so nothing is
         ever cut and nothing is padded out to a guessed number. */
      width="auto"
    />
  );

  return { onContextMenu, node };
}

/** The nearest marked element, and the chain of marks above it. */
export function surfaceAt(target: HTMLElement): Surface | undefined {
  const el = target.closest<HTMLElement>('[data-menu]');
  if (!el) return undefined;

  const ancestors: string[] = [];
  let up = el.parentElement?.closest<HTMLElement>('[data-menu]') ?? null;
  while (up) {
    if (up.dataset.menu) ancestors.push(up.dataset.menu);
    up = up.parentElement?.closest<HTMLElement>('[data-menu]') ?? null;
  }

  return { kind: el.dataset.menu ?? '', el, data: el.dataset, ancestors, target };
}
