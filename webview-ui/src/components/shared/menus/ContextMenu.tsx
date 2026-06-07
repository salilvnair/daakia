import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon } from '../../../icons';

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
  /** Submenu items — renders a flyout panel on hover */
  submenu?: ContextMenuSubItem[];
  /** Whether this item is checked (shows a ✓ checkmark) */
  checked?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onSelect: (id: string, subId?: string) => void;
  onClose: () => void;
}

// ─── Submenu Flyout ───────────────────────────────────────────────────────────

interface SubmenuProps {
  items: ContextMenuSubItem[];
  anchorRect: DOMRect;
  onSelect: (subId: string) => void;
}

function SubmenuFlyout({ items, anchorRect, onSelect }: SubmenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Position: right side of anchor button, aligned to its top
  const left = anchorRect.right + 4;
  const top = anchorRect.top;

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) {
      ref.current.style.left = `${anchorRect.left - rect.width - 4}px`;
    }
    if (rect.bottom > vh) {
      ref.current.style.top = `${vh - rect.height - 8}px`;
    }
  }, [anchorRect]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[10000] min-w-[180px] py-1.5 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-2xl animate-[fadeSlideIn_80ms_ease-out]"
      style={{ top, left }}
      onMouseDown={e => e.stopPropagation()}
    >
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={(e) => { e.stopPropagation(); onSelect(item.id); }}
          className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-left cursor-pointer transition-colors ${
            item.disabled
              ? 'text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
              : 'text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]'
          }`}
        >
          {/* Checkmark column — visible colored tick when selected */}
          <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
            {item.checked ? (
              <CheckIcon size={11} strokeWidth={3} style={{ color: '#22c55e' }} />
            ) : null}
          </span>
          {item.icon && (
            <span className="w-4 h-4 flex items-center justify-center shrink-0" style={{ color: item.iconColor || 'var(--color-text-muted)' }}>
              {item.icon}
            </span>
          )}
          <span className="flex-1">{item.label}</span>
        </button>
      ))}
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
        // Check if click is inside an open submenu flyout (rendered in portal)
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

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (rect.right > vw) {
        menuRef.current.style.left = `${position.x - rect.width}px`;
      }
      if (rect.bottom > vh) {
        menuRef.current.style.top = `${position.y - rect.height}px`;
      }
    }
  }, [position]);

  const handleSubmenuItemSelect = (itemId: string, subId: string) => {
    onSelect(itemId, subId);
    // For submenus, keep context menu open (filter is multiselect)
    // Only close if the item explicitly has no submenu — handled by item type
  };

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[220px] py-1.5 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-xl animate-[fadeSlideIn_100ms_ease-out]"
      style={{ top: position.y, left: position.x }}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="my-1 border-t border-[var(--color-surface-border)]" />
        ) : item.submenu ? (
          /* Submenu trigger item */
          <div
            key={item.id}
            className={`relative flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] cursor-pointer transition-colors select-none ${
              item.disabled
                ? 'text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]'
            } ${openSubmenuId === item.id ? 'bg-[var(--color-item-hover-bg)]' : ''}`}
            onMouseEnter={(e) => {
              if (item.disabled) return;
              setOpenSubmenuId(item.id);
              setSubmenuAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
            }}
            onMouseLeave={() => {
              // Keep submenu open while hovering — it has its own close logic
            }}
          >
            {item.checked !== undefined && (
              <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                {item.checked ? <CheckIcon size={11} strokeWidth={3} style={{ color: '#22c55e' }} /> : null}
              </span>
            )}
            {item.icon && (
              <span className="w-4 h-4 flex items-center justify-center shrink-0" style={{ color: item.iconColor || 'var(--color-text-muted)' }}>
                {item.icon}
              </span>
            )}
            <span className="flex-1">{item.label}</span>
            {/* Submenu arrow */}
            <span className="text-[10px] text-[var(--color-text-muted)] ml-1">▶</span>

            {/* Submenu flyout — rendered inline as overlay positioned absolutely */}
            {openSubmenuId === item.id && submenuAnchor && (
              <SubmenuFlyout
                items={item.submenu}
                anchorRect={submenuAnchor}
                onSelect={(subId) => handleSubmenuItemSelect(item.id, subId)}
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
              if (item.submenu) return;
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
                {item.checked ? <CheckIcon size={11} strokeWidth={3} style={{ color: '#22c55e' }} /> : null}
              </span>
            )}
            {item.icon && (
              <span className="w-4 h-4 flex items-center justify-center shrink-0" style={{ color: item.iconColor || 'var(--color-text-muted)' }}>
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
