import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DropdownArrowIcon } from '../../../icons';
import type { DuiSize, DuiRadius, DuiWidth } from '../../core/DuiTypes';
import { useSelectBase } from '../../core/SelectBase';
import './SelectInputView.css';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  isHeader?: boolean;
  /** Colored pill chip rendered before the label — { label: 'TS', color: 'var(--color-primary)' } */
  badge?: { label: string; color: string };
}

/** Backward-compatible size alias — accepts all DuiSize values plus legacy "default" (maps to "md"). */
export type SelectInputSize = DuiSize | 'default';

export interface SelectInputViewProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  size?: SelectInputSize;
  /** true = size-derived radius (default), false = 0px */
  rounded?: boolean;
  placeholder?: string;
  accentColor?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  width?: string | number;
  borderRadius?: DuiRadius | number;
}

function resolveSelectSize(size: SelectInputSize): DuiSize {
  return size === 'default' ? 'md' : size;
}

function BadgeChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: '8px',
        fontWeight: 700,
        padding: '1px 4px',
        borderRadius: '3px',
        lineHeight: 1,
        flexShrink: 0,
        letterSpacing: '0.03em',
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
    >
      {label}
    </span>
  );
}

export function SelectInputView({
  options,
  value,
  onChange,
  size = 'default',
  rounded = true,
  placeholder,
  accentColor,
  disabled = false,
  className = '',
  style,
  width,
  borderRadius,
}: SelectInputViewProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const duiSize = resolveSelectSize(size);
  const base = useSelectBase(duiSize, { borderRadius });

  const accent = accentColor || 'var(--color-primary)';
  const radius = rounded ? base.borderRadius : '0px';
  const selected = options.find(o => o.value === value && !o.isHeader);

  // Portal positioning
  useEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    const position = () => {
      const r = trigger.getBoundingClientRect();
      menu.style.minWidth = r.width + 'px';
      menu.style.left = r.left + 'px';
      const menuH = menu.scrollHeight || 200;
      const spaceBelow = window.innerHeight - r.bottom;
      if (spaceBelow < menuH + 12 && r.top > menuH + 12) {
        menu.style.top = (r.top - menuH - 4) + 'px';
      } else {
        menu.style.top = (r.bottom + 4) + 'px';
      }
    };
    position();
    const raf = requestAnimationFrame(position);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback((v: string) => {
    onChange(v);
    setOpen(false);
  }, [onChange]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); }
      return;
    }
    const idx = options.filter(o => !o.isHeader).findIndex(o => o.value === value);
    const items = options.filter(o => !o.isHeader);
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); handleSelect(items[(idx + 1) % items.length].value); break;
      case 'ArrowUp':   e.preventDefault(); handleSelect(items[(idx - 1 + items.length) % items.length].value); break;
      case 'Escape':    setOpen(false); break;
    }
  };

  const borderColor = open || focused ? accent : 'var(--color-input-border)';
  const boxShadow = (open || focused) ? `0 0 0 2px color-mix(in srgb, ${accent} 20%, transparent)` : 'none';

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width, ...style }}
      onKeyDown={handleKey}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: base.gap,
          width: '100%',
          height: base.height,
          paddingLeft: base.paddingX,
          paddingRight: base.paddingX,
          fontSize: base.fontSize,
          background: 'var(--color-input-bg)',
          border: `1px solid ${borderColor}`,
          borderRadius: radius,
          color: selected ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          cursor: disabled ? 'default' : 'pointer',
          transition: 'border-color 140ms, box-shadow 140ms',
          boxShadow,
          opacity: disabled ? 0.5 : 1,
          fontFamily: 'inherit',
          fontWeight: 500,
          textAlign: 'left',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {/* Badge chip takes priority over icon in trigger */}
        {selected?.badge && !selected?.icon && (
          <BadgeChip label={selected.badge.label} color={selected.badge.color} />
        )}
        {selected?.icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{selected.icon}</span>}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected?.color }}>
          {selected?.label ?? placeholder ?? value}
        </span>
        <DropdownArrowIcon
          size={base.iconSize - 2}
          style={{ flexShrink: 0, transition: 'transform 140ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', color: open ? accent : 'var(--color-text-muted)' }}
        />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="dui_select__menu"
          style={{
            position: 'fixed',
            zIndex: 99999,
            minWidth: '100%',
            width: 'max-content',
            maxHeight: 'min(380px, 70vh)',
            overflowY: 'auto',
            background: 'var(--color-surface-bg, var(--color-elevated))',
            border: `1px solid var(--color-surface-border)`,
            borderRadius: rounded ? '7px' : '0px',
            padding: '4px',
            boxShadow: '0 12px 40px rgba(0,0,0,.35)',
            '--dui-select-accent': accent,
          } as React.CSSProperties}
        >
          {options.map((opt, i) => {
            if (opt.isHeader) {
              return (
                <div key={`${opt.value}-${i}`}>
                  {/* Auto-divider before every group header except the first */}
                  {i > 0 && (
                    <div style={{ height: '1px', background: 'var(--color-surface-border)', margin: '3px 4px' }} />
                  )}
                  <div style={{ padding: `5px ${base.paddingX} 3px`, fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', userSelect: 'none' }}>
                    {opt.label}
                  </div>
                </div>
              );
            }
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                onClick={() => handleSelect(opt.value)}
                className={`dui_select__option${opt.value === value ? ' dui_select__option--selected' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: base.gap,
                  padding: `${base.itemPy} ${base.paddingX}`,
                  borderRadius: rounded ? '5px' : '0px',
                  fontSize: base.fontSize,
                  fontWeight: 500,
                  color: opt.value === value ? (accentColor || 'var(--color-primary-light)') : (opt.color || 'var(--color-text-secondary)'),
                  cursor: 'pointer',
                }}
              >
                {opt.badge && !opt.icon && (
                  <BadgeChip label={opt.badge.label} color={opt.badge.color} />
                )}
                {opt.icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{opt.icon}</span>}
                <span>{opt.label}</span>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
