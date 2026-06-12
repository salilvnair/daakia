import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon } from '../../../icons';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * @deprecated Prefer ContextMenuItem for new submenus — kept for TabBar backward-compat.
 */
export interface ContextMenuSubItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  iconColor?: string;
  checked?: boolean;
  disabled?: boolean;
}

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  iconColor?: string;
  danger?: boolean;
  separator?: boolean;
  disabled?: boolean;
  shortcut?: string;
  /** Submenu items — renders a flyout panel on hover. Max 10 items recommended. */
  submenu?: ContextMenuItem[];
  /** Whether this item is checked (shows a ✓ checkmark) */
  checked?: boolean;
  /**
   * When true the parent context menu stays open after a sub-item is selected.
   * Use for multiselect submenus (e.g. protocol filter). Default: false.
   */
  keepOpenOnSelect?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onSelect: (id: string, subId?: string) => void;
  onClose: () => void;
}

// ─── Submenu Flyout ───────────────────────────────────────────────────────────

interface SubmenuProps {
  items: ContextMenuItem[];
  anchorRect: DOMRect;
  onSelect: (subId: string) => void;
  /** Called after selection to close the entire context menu (unless keepOpenOnSelect) */
  onCloseAll: () => void;
  keepOpenOnSelect?: boolean;
}

function SubmenuFlyout({ items, anchorRect, onSelect, onCloseAll, keepOpenOnSelect }: SubmenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [openNestedId, setOpenNestedId] = useState<string | null>(null);
  const [nestedAnchor, setNestedAnchor] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const anchorMidX = anchorRect.left + anchorRect.width / 2;
    const preferLeft = anchorMidX > vw / 2;

    let left: number;
    if (preferLeft) {
      left = anchorRect.left - rect.width - 4;
      if (left < 4) left = anchorRect.right + 4;
    } else {
      left = anchorRect.right + 4;
      if (left + rect.width > vw) left = Math.max(4, anchorRect.left - rect.width - 4);
    }
    left = Math.max(4, Math.min(left, vw - rect.width - 4));

    let top = anchorRect.top;
    if (top + rect.height > vh) top = Math.max(4, vh - rect.height - 4);

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';
  }, [anchorRect]);

  return createPortal(
    <div
      ref={ref}
      data-submenu-flyout="true"
      className="fixed z-[10000] min-w-[210px] py-1.5 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-2xl animate-[fadeSlideIn_80ms_ease-out]"
      style={{ top: anchorRect.top, left: -9999, visibility: 'hidden' }}
      onMouseDown={e => e.stopPropagation()}
    >
      {items.map(item =>
        item.separator ? (
          <div key={item.id} className="my-1 border-t border-[var(--color-surface-border)]" />
        ) : item.submenu ? (
          /* Nested submenu trigger inside flyout */
          <div
            key={item.id}
            className={`relative flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] cursor-pointer transition-colors select-none ${
              item.disabled
                ? 'text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]'
            } ${openNestedId === item.id ? 'bg-[var(--color-item-hover-bg)]' : ''}`}
            onMouseEnter={e => {
              if (item.disabled) return;
              setOpenNestedId(item.id);
              setNestedAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
            }}
          >
            {/* Checkmark column */}
            <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
              {item.checked ? <CheckIcon size={11} strokeWidth={3} style={{ color: 'var(--color-success)' }} /> : null}
            </span>
            {item.icon && (
              <span className="w-4 h-4 flex items-center justify-center shrink-0"
                style={{ color: item.iconColor || 'var(--color-text-muted)' }}>
                {item.icon}
              </span>
            )}
            <span className="flex-1">{item.label}</span>
            <span className="text-[10px] text-[var(--color-text-muted)] ml-1">▶</span>
            {openNestedId === item.id && nestedAnchor && (
              <SubmenuFlyout
                items={item.submenu}
                anchorRect={nestedAnchor}
                onSelect={subId => onSelect(subId)}
                onCloseAll={onCloseAll}
                keepOpenOnSelect={keepOpenOnSelect}
              />
            )}
          </div>
        ) : (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={e => {
              e.stopPropagation();
              if (item.disabled) return;
              onSelect(item.id);
              if (!keepOpenOnSelect) onCloseAll();
            }}
            onMouseEnter={() => setOpenNestedId(null)}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-left cursor-pointer transition-colors ${
              item.danger
                ? 'text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]'
                : item.disabled
                  ? 'text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
                  : 'text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]'
            }`}
          >
            <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
              {item.checked ? <CheckIcon size={11} strokeWidth={3} style={{ color: 'var(--color-success)' }} /> : null}
            </span>
            {item.icon && (
              <span className="w-4 h-4 flex items-center justify-center shrink-0"
                style={{ color: item.iconColor || 'var(--color-text-muted)' }}>
                {item.icon}
              </span>
            )}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded px-1.5 py-0.5 font-mono ml-2">
                {item.shortcut}
              </span>
            )}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

// ─── Main Context Menu ────────────────────────────────────────────────────────

export function ContextMenu({ items, position, onSelect, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const [submenuAnchor, setSubmenuAnchor] = useState<DOMRect | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Don't close if the click is inside an open submenu flyout (portal)
        const flyouts = document.querySelectorAll('[data-submenu-flyout]');
        for (const f of flyouts) {
          if (f.contains(e.target as Node)) return;
        }
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      const key = e.key.toLowerCase();
      const shortcutKeyMap: Record<string, string> = { 'del': 'backspace', '⌫': 'backspace', 'esc': 'escape', 'enter': 'enter' };
      for (const item of items) {
        if (!item.shortcut || item.disabled || item.separator) continue;
        const mapped = shortcutKeyMap[item.shortcut.toLowerCase()] || item.shortcut.toLowerCase();
        if (mapped === key) {
          e.preventDefault();
          onSelect(item.id);
          onClose();
          return;
        }
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, onSelect, items]);

  /**
   * Smart viewport-aware positioning — runs synchronously before paint.
   * Prefer opening downward; only flip upward if there is genuinely MORE space
   * above than below (prevents menus near the top from incorrectly opening upward).
   */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: shift left if the menu overflows the right edge
    let x = position.x;
    if (x + rect.width > vw) {
      x = Math.max(4, position.x - rect.width);
    }

    // Vertical: compare available space above vs below the click point
    const spaceBelow = vh - position.y;
    const spaceAbove = position.y;
    let y = position.y;

    if (rect.height > spaceBelow && spaceAbove > spaceBelow) {
      // Not enough room below AND more room above — open upward
      y = Math.max(4, position.y - rect.height);
    } else {
      // Open downward — clamp so the bottom doesn't bleed off-screen
      y = Math.min(position.y, vh - rect.height - 4);
      y = Math.max(4, y);
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.visibility = 'visible';
  }, [position]);

  const handleSubmenuItemSelect = (itemId: string, subId: string) => {
    onSelect(itemId, subId);
  };

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[220px] py-1.5 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-xl animate-[fadeSlideIn_100ms_ease-out]"
      style={{ top: position.y, left: position.x, visibility: 'hidden' }}
    >
      {items.map(item =>
        item.separator ? (
          <div key={item.id} className="my-1 border-t border-[var(--color-surface-border)]" />
        ) : item.submenu ? (
          /* Submenu trigger */
          <div
            key={item.id}
            className={`relative flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] cursor-pointer transition-colors select-none ${
              item.disabled
                ? 'text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]'
            } ${openSubmenuId === item.id ? 'bg-[var(--color-item-hover-bg)]' : ''}`}
            onMouseEnter={e => {
              if (item.disabled) return;
              setOpenSubmenuId(item.id);
              setSubmenuAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
            }}
            onMouseLeave={() => {
              // Intentionally empty — submenu stays open until user hovers another item
            }}
          >
            {item.icon && (
              <span className="w-4 h-4 flex items-center justify-center shrink-0"
                style={{ color: item.iconColor || 'var(--color-text-muted)' }}>
                {item.icon}
              </span>
            )}
            <span className="flex-1">{item.label}</span>
            {/* Submenu arrow — flips based on preferred direction */}
            <span className="text-[10px] text-[var(--color-text-muted)] ml-1">▶</span>

            {openSubmenuId === item.id && submenuAnchor && (
              <SubmenuFlyout
                items={item.submenu}
                anchorRect={submenuAnchor}
                onSelect={subId => handleSubmenuItemSelect(item.id, subId)}
                onCloseAll={onClose}
                keepOpenOnSelect={item.keepOpenOnSelect}
              />
            )}
          </div>
        ) : (
          /* Regular item */
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              onSelect(item.id);
              onClose();
            }}
            onMouseEnter={() => setOpenSubmenuId(null)}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-left cursor-pointer transition-colors ${
              item.danger
                ? 'text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]'
                : item.disabled
                  ? 'text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
                  : 'text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]'
            }`}
          >
            {item.checked !== undefined && (
              <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                {item.checked ? <CheckIcon size={11} strokeWidth={3} style={{ color: 'var(--color-success)' }} /> : null}
              </span>
            )}
            {item.icon && (
              <span className="w-4 h-4 flex items-center justify-center shrink-0"
                style={{ color: item.iconColor || 'var(--color-text-muted)' }}>
                {item.icon}
              </span>
            )}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded px-1.5 py-0.5 font-mono">
                {item.shortcut}
              </span>
            )}
          </button>
        )
      )}
    </div>,
    document.body
  );
}
