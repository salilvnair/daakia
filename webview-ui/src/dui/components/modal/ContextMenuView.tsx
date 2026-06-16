import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRightIcon } from '../../../icons';
import './ContextMenuView.css';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  children?: ContextMenuItem[];
  onClick?: () => void;
}

export type ContextMenuWidth = 'auto' | 'sm' | 'md' | 'lg' | number;

export interface ContextMenuViewProps {
  items: ContextMenuItem[];
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  width?: ContextMenuWidth;
  rounded?: boolean;
  matchAnchorWidth?: boolean;
  position?: { x: number; y: number };
  align?: 'auto' | 'left' | 'right';
}

const WIDTH_MAP: Record<string, string> = { auto: 'max-content', sm: '140px', md: '180px', lg: '220px' };

function resolveWidth(w: ContextMenuWidth | undefined): string {
  if (!w || w === 'auto') return 'max-content';
  if (typeof w === 'number') return `${w}px`;
  return WIDTH_MAP[w] || 'max-content';
}

// ─── MenuList — manages which sibling submenu is open ────────────────────────

function MenuList({
  items,
  onClose,
  rounded,
}: {
  items: ContextMenuItem[];
  onClose: () => void;
  rounded: boolean;
}) {
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  return (
    <>
      {items.map(item => (
        <MenuItemRow
          key={item.id}
          item={item}
          onClose={onClose}
          rounded={rounded}
          activeSubId={activeSubId}
          onSubOpen={setActiveSubId}
        />
      ))}
    </>
  );
}

// ─── Recursive menu item row ──────────────────────────────────────────────────

function MenuItemRow({
  item,
  onClose,
  rounded,
  activeSubId,
  onSubOpen,
}: {
  item: ContextMenuItem;
  onClose: () => void;
  rounded: boolean;
  activeSubId: string | null;
  onSubOpen: (id: string | null) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

  if (item.separator) {
    return <div style={{ height: '1px', background: 'var(--color-surface-border)', margin: '4px 0' }} />;
  }

  const hasSubmenu = !!(item.children && item.children.length > 0);
  const danger = item.danger;
  const isOpen = hasSubmenu && activeSubId === item.id;

  // Hovering a row: open its submenu (closes any sibling), or close any open sibling if no submenu
  const handleRowEnter = () => {
    onSubOpen(hasSubmenu ? item.id : null);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.disabled) return;
    if (hasSubmenu) { onSubOpen(item.id); return; }
    item.onClick?.();
    onClose();
  };

  // Position submenu portal after it mounts — start hidden, reveal after placement
  useEffect(() => {
    if (!isOpen || !rowRef.current || !subRef.current) return;
    const sub = subRef.current;
    sub.style.visibility = 'hidden';

    const raf = requestAnimationFrame(() => {
      if (!rowRef.current || !subRef.current) return;
      const row = rowRef.current.getBoundingClientRect();
      sub.style.top = `${row.top - 4}px`;
      sub.style.left = `${row.right + 4}px`;

      const subRect = sub.getBoundingClientRect();
      if (subRect.right > window.innerWidth - 8) {
        sub.style.left = `${row.left - subRect.width - 4}px`;
      }
      if (subRect.bottom > window.innerHeight - 8) {
        sub.style.top = `${window.innerHeight - subRect.height - 8}px`;
      }
      sub.style.visibility = 'visible';
    });

    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  return (
    <div
      ref={rowRef}
      onMouseEnter={handleRowEnter}
      style={{ position: 'relative' }}
    >
      <div
        onClick={handleClick}
        className={`dui_ctx-menu__item${danger ? ' dui_ctx-menu__item--danger' : ''}${item.disabled ? ' dui_ctx-menu__item--disabled' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 10px',
          borderRadius: rounded ? '5px' : '0px',
          fontSize: '12px',
          fontWeight: 500,
          cursor: item.disabled ? 'default' : 'pointer',
          opacity: item.disabled ? 0.45 : 1,
          color: danger ? 'var(--color-error)' : 'var(--color-text-secondary)',
          userSelect: 'none',
        }}
      >
        {item.icon && (
          <span style={{ width: '14px', display: 'flex', alignItems: 'center', flexShrink: 0, color: danger ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
            {item.icon}
          </span>
        )}
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
        {item.shortcut && !hasSubmenu && (
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginLeft: '12px', flexShrink: 0 }}>{item.shortcut}</span>
        )}
        {hasSubmenu && <ChevronRightIcon size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginLeft: '8px' }} />}
      </div>

      {/* Recursive submenu — portalled; each level has its own sibling-coordination state via MenuList */}
      {hasSubmenu && isOpen && createPortal(
        <div
          ref={subRef}
          data-dui-ctx-menu="true"
          style={{
            position: 'fixed',
            visibility: 'hidden',
            zIndex: 99999,
            background: 'var(--color-elevated, var(--color-surface-bg))',
            border: '1px solid var(--color-surface-border)',
            borderRadius: rounded ? '7px' : '0px',
            padding: '4px',
            minWidth: '160px',
            width: 'max-content',
            boxShadow: '0 12px 40px rgba(0,0,0,.35)',
          }}
        >
          <MenuList items={item.children!} onClose={onClose} rounded={rounded} />
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function ContextMenuView({
  items,
  anchorEl,
  open,
  onClose,
  width = 'auto',
  rounded = true,
  matchAnchorWidth = false,
  position,
  align = 'auto',
}: ContextMenuViewProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click — not on any DUI menu portal element
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (menuRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      if (target.closest?.('[data-dui-ctx-menu]')) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, anchorEl, onClose]);

  // Escape + shortcut keys
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      const key = e.key.toUpperCase();
      const matched = items.find(item => {
        if (item.disabled || item.separator || !item.shortcut || !item.onClick) return false;
        if (item.shortcut === '⌫') return e.key === 'Backspace' || e.key === 'Delete';
        return item.shortcut.toUpperCase() === key;
      });
      if (matched) { e.preventDefault(); matched.onClick!(); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, items]);

  // Position the menu
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const menu = menuRef.current;
    const place = () => {
      const menuW = menu.scrollWidth;
      const menuH = menu.scrollHeight;

      let left: number, top: number;
      let anchorTop = 0;

      if (position) {
        left = position.x;
        top = position.y;
        anchorTop = position.y;
      } else if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        if (align === 'right') {
          left = r.right - menuW;
        } else if (align === 'left') {
          left = r.left;
        } else {
          left = r.left + menuW <= window.innerWidth - 8 ? r.left : r.right - menuW;
        }
        top = r.bottom + 4;
        anchorTop = r.top;
        if (matchAnchorWidth) menu.style.width = r.width + 'px';
      } else {
        return;
      }

      if (left + menuW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuW - 8);
      if (left < 8) left = 8;
      if (top + menuH > window.innerHeight - 8) top = Math.max(8, anchorTop - menuH - 4);

      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [open, anchorEl, position, matchAnchorWidth, align]);

  if (!open) return null;

  const resolvedWidth = resolveWidth(width);

  return createPortal(
    <div
      ref={menuRef}
      data-dui-ctx-menu="true"
      style={{
        position: 'fixed',
        zIndex: 99998,
        width: resolvedWidth,
        minWidth: '140px',
        background: 'var(--color-elevated, var(--color-surface-bg))',
        border: '1px solid var(--color-surface-border)',
        borderRadius: rounded ? '8px' : '0px',
        padding: '4px',
        boxShadow: '0 12px 40px rgba(0,0,0,.35), 0 0 0 1px var(--color-panel-border, rgba(255,255,255,.04))',
        animation: 'dui_menu-in 120ms ease-out',
      }}
    >
      <MenuList items={items} onClose={onClose} rounded={rounded} />
    </div>,
    document.body
  );
}
