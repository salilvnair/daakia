import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  iconColor?: string;
  danger?: boolean;
  separator?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function ContextMenu({ items, position, onSelect, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      // Handle shortcut keys - map display labels to actual key values
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

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[220px] py-1.5 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-xl animate-[fadeSlideIn_100ms_ease-out]"
      style={{ top: position.y, left: position.x }}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="my-1 border-t border-[var(--color-surface-border)]" />
        ) : (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => { onSelect(item.id); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-left cursor-pointer transition-colors ${
              item.danger
                ? 'text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]'
                : item.disabled
                  ? 'text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
                  : 'text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]'
            }`}
          >
            {item.icon && <span className="w-4 h-4 flex items-center justify-center shrink-0" style={{ color: item.iconColor || 'var(--color-text-muted)' }}>{item.icon}</span>}
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
