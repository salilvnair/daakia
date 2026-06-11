import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRightIcon } from '../../../icons';

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
  /** When true, menu matches the anchorEl width (e.g. for Save As use case) */
  matchAnchorWidth?: boolean;
  /** Position override for context menus triggered at a specific coordinate */
  position?: { x: number; y: number };
}

const WIDTH_MAP: Record<string, string> = { auto: 'max-content', sm: '140px', md: '180px', lg: '220px' };

function resolveWidth(w: ContextMenuWidth | undefined): string {
  if (!w || w === 'auto') return 'max-content';
  if (typeof w === 'number') return `${w}px`;
  return WIDTH_MAP[w] || 'max-content';
}

// ─── Recursive submenu item ───────────────────────────────────────────────────

function MenuItemRow({ item, onClose, rounded, accentColor }: { item: ContextMenuItem; onClose: () => void; rounded: boolean; accentColor?: string }) {
  const [subOpen, setSubOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

  if (item.separator) {
    return <div style={{ height: '1px', background: 'var(--color-surface-border)', margin: '4px 0' }} />;
  }

  const handleClick = () => {
    if (item.disabled || item.children?.length) return;
    item.onClick?.();
    onClose();
  };

  const hasSubmenu = item.children && item.children.length > 0;
  const danger = item.danger;

  useEffect(() => {
    if (!subOpen || !rowRef.current || !subRef.current) return;
    const row = rowRef.current.getBoundingClientRect();
    const sub = subRef.current;
    sub.style.top = `${row.top - 4}px`;
    sub.style.left = `${row.right + 4}px`;
    const subRect = sub.getBoundingClientRect();
    if (subRect.right > window.innerWidth - 8) {
      sub.style.left = `${row.left - subRect.width - 4}px`;
    }
    if (subRect.bottom > window.innerHeight - 8) {
      sub.style.top = `${row.bottom - subRect.height + 4}px`;
    }
  }, [subOpen]);

  return (
    <div
      ref={rowRef}
      onMouseEnter={() => hasSubmenu && setSubOpen(true)}
      onMouseLeave={() => hasSubmenu && setSubOpen(false)}
      style={{ position: 'relative' }}
    >
      <div
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
          borderRadius: rounded ? '5px' : '0px',
          fontSize: '12px',
          fontWeight: 500,
          cursor: item.disabled ? 'default' : 'pointer',
          opacity: item.disabled ? 0.45 : 1,
          color: danger ? 'var(--color-error)' : 'var(--color-text-secondary)',
          transition: 'all 100ms',
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          if (item.disabled) return;
          const el = e.currentTarget as HTMLElement;
          el.style.background = danger ? `color-mix(in srgb, var(--color-error) 10%, transparent)` : 'var(--color-surface-hover)';
          el.style.color = danger ? 'var(--color-error)' : 'var(--color-text-primary)';
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = 'transparent';
          el.style.color = danger ? 'var(--color-error)' : 'var(--color-text-secondary)';
        }}
      >
        {item.icon && (
          <span style={{ width: '14px', display: 'flex', alignItems: 'center', flexShrink: 0, color: danger ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
            {item.icon}
          </span>
        )}
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.shortcut && (
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginLeft: '12px', flexShrink: 0 }}>{item.shortcut}</span>
        )}
        {hasSubmenu && <ChevronRightIcon size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />}
      </div>

      {/* Recursive submenu */}
      {hasSubmenu && subOpen && createPortal(
        <div
          ref={subRef}
          style={{
            position: 'fixed',
            zIndex: 99999,
            background: 'var(--color-elevated, var(--color-surface-bg))',
            border: '1px solid var(--color-surface-border)',
            borderRadius: rounded ? '7px' : '0px',
            padding: '4px',
            minWidth: '160px',
            boxShadow: '0 12px 40px rgba(0,0,0,.35)',
          }}
        >
          {item.children!.map(child => (
            <MenuItemRow key={child.id} item={child} onClose={onClose} rounded={rounded} />
          ))}
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
}: ContextMenuViewProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (anchorEl?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, anchorEl, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Position the menu
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const menu = menuRef.current;
    const place = () => {
      const menuW = menu.scrollWidth;
      const menuH = menu.scrollHeight;

      let left: number, top: number;

      if (position) {
        left = position.x;
        top = position.y;
      } else if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        left = r.left;
        top = r.bottom + 4;
        if (matchAnchorWidth) menu.style.width = r.width + 'px';
      } else {
        return;
      }

      // Flip if off-screen
      if (left + menuW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuW - 8);
      if (top + menuH > window.innerHeight - 8) top = Math.max(8, (position?.y ?? (anchorEl?.getBoundingClientRect().top ?? 0)) - menuH - 4);

      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    };
    place();
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open, anchorEl, position, matchAnchorWidth]);

  if (!open) return null;

  const resolvedWidth = resolveWidth(width);

  return createPortal(
    <div
      ref={menuRef}
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
        animation: 'dui-menu-in 120ms ease-out',
      }}
    >
      <style>{`@keyframes dui-menu-in { from { opacity: 0; transform: translateY(-4px) scale(.97); } to { opacity: 1; transform: none; } }`}</style>
      {items.map(item => (
        <MenuItemRow key={item.id} item={item} onClose={onClose} rounded={rounded} />
      ))}
    </div>,
    document.body
  );
}
