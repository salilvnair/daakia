import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from '../../../icons';

export interface SplitButtonItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  iconColor?: string;
  shortcut?: string;
  dividerBefore?: boolean;
  onClick: () => void;
}

interface SplitButtonProps {
  label: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  items: SplitButtonItem[];
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function SplitButton({
  label,
  icon,
  variant = 'primary',
  items,
  onClick,
  disabled = false,
  size = 'md',
}: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const btnRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setFocusIdx(-1);
        return;
      }
      // Handle shortcut keys when dropdown is open
      const key = e.key.toLowerCase();
      for (const item of items) {
        if (item.shortcut && item.shortcut.toLowerCase() === key) {
          e.preventDefault();
          item.onClick();
          setOpen(false);
          setFocusIdx(-1);
          return;
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, items]);

  // Position dropdown
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; minWidth: number }>({ top: 0, left: 0, minWidth: 0 });

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = 200; // estimate
    const goUp = spaceBelow < menuHeight && rect.top > menuHeight;
    setMenuPos({
      top: goUp ? rect.top - menuHeight : rect.bottom + 4,
      left: rect.left,
      minWidth: rect.width,
    });
  }, [open]);

  const handleItemClick = useCallback((item: SplitButtonItem) => {
    item.onClick();
    setOpen(false);
    setFocusIdx(-1);
  }, []);

  const handleChevronKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setFocusIdx(0);
    }
  };

  const handleMenuKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIdx(i => (i + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIdx(i => (i - 1 + items.length) % items.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusIdx >= 0 && focusIdx < items.length) {
          handleItemClick(items[focusIdx]);
        }
        break;
      case 'Escape':
        setOpen(false);
        setFocusIdx(-1);
        break;
    }
  };

  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const sizeClasses = size === 'sm' ? 'h-[28px] text-[12px]' : 'h-[36px] text-[13px]';

  const baseClasses = isDanger
    ? 'bg-[var(--color-error)] text-white'
    : isPrimary
      ? 'bg-[var(--color-primary)] text-white'
      : 'bg-[var(--color-surface-hover)] text-[var(--color-text-primary)] border border-[var(--color-surface-border)]';

  const hoverClasses = isDanger
    ? 'hover:brightness-110'
    : isPrimary
      ? 'hover:bg-[var(--color-primary-dark)]'
      : 'hover:bg-[var(--color-surface-hover)]';

  const disabledClasses = disabled ? 'opacity-50 pointer-events-none' : '';

  const dividerColor = (isPrimary || isDanger)
    ? 'bg-white/20'
    : 'bg-[var(--color-surface-border)]';

  return (
    <>
      <div
        ref={btnRef}
        className={`inline-flex items-center rounded-md overflow-hidden ${sizeClasses} ${baseClasses} ${disabledClasses} select-none`}
      >
        {/* Primary action area */}
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={`flex items-center gap-1.5 h-full px-4 font-medium cursor-pointer transition-colors ${hoverClasses} active:bg-[var(--color-primary-dark)]`}
        >
          {icon && <span className="flex items-center">{icon}</span>}
          <span>{label}</span>
        </button>

        {/* Divider */}
        <div className={`w-px h-[60%] ${dividerColor}`} />

        {/* Chevron area */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          onKeyDown={handleChevronKey}
          disabled={disabled}
          className={`flex items-center justify-center h-full px-2 cursor-pointer transition-colors ${hoverClasses}`}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <ChevronDownIcon size={10} />
        </button>
      </div>

      {/* Dropdown portal */}
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] rounded-lg bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-xl animate-[fadeSlideIn_150ms_ease-out] overflow-hidden"
          style={{ top: menuPos.top, left: menuPos.left, minWidth: menuPos.minWidth }}
          onKeyDown={handleMenuKey}
          tabIndex={-1}
        >
          {items.map((item, idx) => (
            <div key={item.id}>
              {item.dividerBefore && (
                <div className="h-px bg-[var(--color-surface-border)]" />
              )}
              <button
                type="button"
                onClick={() => handleItemClick(item)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] text-left cursor-pointer transition-colors ${
                  idx === focusIdx
                    ? 'bg-[var(--color-item-hover-bg)] text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]'
                }`}
              >
                {item.icon && (
                  <span className="flex items-center w-4 h-4" style={{ color: item.iconColor || 'var(--color-text-muted)' }}>{item.icon}</span>
                )}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded px-1.5 py-0.5 font-mono">
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
