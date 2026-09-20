/**
 * The filter panel's surface and rows, borrowed wholesale from dui's menu.
 *
 * ── Why this file exists ──
 *
 * The filter popup was built as its own surface: `--color-surface`, 11.5px
 * text at weight 400, rows padded 4px, no icons. Beside dui's context menu —
 * which is what every other popup in this app is — it read as a dialog somebody
 * forgot to finish. The menu is brighter, roomier and has a coloured icon on
 * every row, and the difference is not taste: an elevated surface says "this is
 * on top of the panel", and an icon is the fastest thing on a row to recognise.
 *
 * So the numbers here are **copied from `ContextMenuView`, not approximated**:
 * the same `--color-elevated` ground, the same 8px radius, the same two-part
 * shadow, the same `8px 10px` rows at 12px/500, the same 14px icon column, the
 * same 1px separators. Anything the menu does that this panel also does should
 * look identical, because a reader cannot tell two surfaces apart by intent —
 * only by pixels.
 *
 * ── Why the class name comes from dui ──
 *
 * `dui_ctx-menu__item` carries the hover treatment — surface-hover ground, text
 * lifted to primary, and the red variant for a destructive row. Re-implementing
 * it here would be the second copy of a rule I would then have to keep in step,
 * which is the mistake this file was written to undo. The stylesheet arrives
 * with `ContextMenuView`, which this sidebar already imports.
 */
import type { CSSProperties } from 'react';

/** The menu's own ground, border, radius and shadow. */
export const MENU_SURFACE: CSSProperties = {
  background: 'var(--color-elevated, var(--color-surface-bg))',
  border: '1px solid var(--color-surface-border)',
  borderRadius: 8,
  boxShadow: '0 12px 40px rgba(0,0,0,.35), 0 0 0 1px var(--color-panel-border, rgba(255,255,255,.04))',
  animation: 'dui_menu-in 120ms ease-out',
};

/** One row: the geometry and weight every dui menu item has. */
export const MENU_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 10px',
  borderRadius: 5,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  color: 'var(--color-text-secondary)',
  userSelect: 'none',
  border: 'none',
  background: 'transparent',
  width: '100%',
  textAlign: 'left',
};

/** The fixed column an icon sits in, so labels line up whether or not one is set. */
export const ICON_SLOT: CSSProperties = {
  width: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

/** The menu's own shortcut/count text. */
export const MENU_HINT: CSSProperties = {
  fontSize: 10,
  color: 'var(--color-text-muted)',
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
};

export function MenuSeparator() {
  return <div style={{ height: 1, background: 'var(--color-surface-border)', margin: '4px 0' }} />;
}

/**
 * A section heading.
 *
 * The menu has no equivalent — it separates groups with a rule and nothing
 * else — but this panel has five kinds of facet and an unlabelled group of
 * ticks would be a guessing game. It is deliberately quieter than a row: an
 * icon in the same 14px column so the labels below line up under it, and
 * muted uppercase text that reads as furniture rather than as a choice.
 */
export function SectionHeading({ icon, label, right }: {
  icon?: React.ReactNode;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-1 text-[9.5px] uppercase tracking-wider"
         style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>
      {!!icon && <span style={ICON_SLOT}>{icon}</span>}
      <span className="flex-1">{label}</span>
      {right}
    </div>
  );
}
