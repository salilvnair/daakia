import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from '../../../icons';
import type { DuiSize } from '../../core/DuiTypes';
import { useButtonBase } from '../../core/ButtonBase';
import './SplitButtonView.css';

export interface SplitButtonViewItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  iconColor?: string;
  shortcut?: string;
  dividerBefore?: boolean;
  onClick: () => void;
}

export type SplitButtonViewVariant = 'primary' | 'secondary' | 'danger';

export interface SplitButtonViewProps {
  label: string;
  icon?: React.ReactNode;
  variant?: SplitButtonViewVariant;
  items: SplitButtonViewItem[];
  onClick: () => void;
  disabled?: boolean;
  /** Falls back to DuiProvider size when omitted. */
  size?: DuiSize;
  accentColor?: string;
}

export function SplitButtonView({
  label,
  icon,
  variant = 'primary',
  items,
  onClick,
  disabled = false,
  size = 'md',
  accentColor,
}: SplitButtonViewProps) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const btnRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, minWidth: 0 });

  const base = useButtonBase(size);
  const bg = accentColor
    ? accentColor
    : variant === 'danger'
      ? 'var(--color-error)'
      : variant === 'primary'
        ? 'var(--color-primary)'
        : 'var(--color-surface-hover)';

  const textColor = variant === 'secondary' ? 'var(--color-text-primary)' : variant === 'danger' ? 'var(--color-btn-danger-text, #fff)' : 'var(--color-btn-primary-text, #fff)';
  const h = parseInt(base.height, 10);
  const fs = base.fontSize;
  const dividerBg = variant === 'secondary' ? 'var(--color-surface-border)' : 'rgba(255,255,255,0.22)';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setFocusIdx(-1); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const goUp = window.innerHeight - rect.bottom < 200 && rect.top > 200;
    setMenuPos({ top: goUp ? rect.top - 200 : rect.bottom + 4, left: rect.left, minWidth: rect.width });
  }, [open]);

  const handleItem = useCallback((item: SplitButtonViewItem) => {
    item.onClick(); setOpen(false); setFocusIdx(-1);
  }, []);

  const handleMenuKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setFocusIdx(i => (i + 1) % items.length); break;
      case 'ArrowUp':   e.preventDefault(); setFocusIdx(i => (i - 1 + items.length) % items.length); break;
      case 'Enter': case ' ':
        e.preventDefault();
        if (focusIdx >= 0) handleItem(items[focusIdx]);
        break;
      case 'Escape': setOpen(false); setFocusIdx(-1); break;
    }
  };

  return (
    <>
      <div
        ref={btnRef}
        style={{
          display: 'inline-flex', alignItems: 'center', height: h,
          borderRadius: 6, overflow: 'hidden',
          background: bg, opacity: disabled ? 0.5 : 1,
          border: variant === 'secondary' ? '1px solid var(--color-surface-border)' : 'none',
          pointerEvents: disabled ? 'none' : 'auto',
          userSelect: 'none', cursor: 'pointer',
          // Hover overlay color inherited by inner buttons via CSS var
          '--dui-split-hover-bg': variant === 'secondary' ? 'var(--color-surface-active)' : 'rgba(0,0,0,0.1)',
        } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={onClick}
          className="dui_split-button__main"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: '100%', padding: '0 16px',
            fontSize: fs, fontWeight: 500, cursor: 'pointer',
            border: 'none',
            color: textColor, fontFamily: 'inherit',
          }}
        >
          {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
          {label}
        </button>

        <div style={{ width: 1, height: '60%', background: dividerBg }} />

        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="dui_split-button__chevron"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', padding: '0 8px',
            cursor: 'pointer', border: 'none',
            color: textColor,
          }}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <ChevronDownIcon size={10} />
        </button>
      </div>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed', zIndex: 9999,
            top: menuPos.top, left: menuPos.left, minWidth: menuPos.minWidth,
            borderRadius: 8, border: '1px solid var(--color-elevated-border)',
            background: 'var(--color-elevated)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
          onKeyDown={handleMenuKey}
          tabIndex={-1}
        >
          {items.map((item, idx) => (
            <div key={item.id}>
              {item.dividerBefore && <div style={{ height: 1, background: 'var(--color-surface-border)' }} />}
              <button
                type="button"
                onClick={() => handleItem(item)}
                className="dui_split-button__menu-item"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', fontSize: 12, textAlign: 'left',
                  cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                  background: idx === focusIdx ? 'var(--color-item-hover-bg)' : 'transparent',
                  color: 'var(--color-text-primary)',
                }}
              >
                {item.icon && (
                  <span style={{ display: 'flex', alignItems: 'center', width: 16, color: item.iconColor || 'var(--color-text-muted)' }}>{item.icon}</span>
                )}
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.shortcut && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace' }}>
                    {item.shortcut}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
