import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DropdownArrowIcon } from '../../../icons';
import './SelectInputView.css';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  isHeader?: boolean;
}

export type SelectInputSize = 'xs' | 'default' | 'sm' | 'md' | 'lg' | 'xl';

export interface SelectInputViewProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  size?: SelectInputSize;
  /** true = 4px radius (default), false = 0px */
  rounded?: boolean;
  placeholder?: string;
  accentColor?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  width?: string | number;
}

const SIZE: Record<SelectInputSize, { h: string; px: string; text: string; itemPy: string; itemText: string }> = {
  xs:      { h: '20px', px: '6px',  text: '10px', itemPy: '3px',  itemText: '10px' },
  default: { h: '26px', px: '10px', text: '11px', itemPy: '5px',  itemText: '11px' },
  sm:      { h: '22px', px: '8px',  text: '10px', itemPy: '4px',  itemText: '10px' },
  md:      { h: '28px', px: '10px', text: '11px', itemPy: '6px',  itemText: '11px' },
  lg:      { h: '32px', px: '12px', text: '12px', itemPy: '7px',  itemText: '12px' },
  xl:      { h: '36px', px: '12px', text: '13px', itemPy: '9px',  itemText: '13px' },
};

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
}: SelectInputViewProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { h, px, text, itemPy, itemText } = SIZE[size] ?? SIZE.default;
  const accent = accentColor || 'var(--color-primary)';
  const radius = rounded ? '4px' : '0px';
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
      style={{ width }}
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
          gap: '6px',
          width: '100%',
          height: h,
          paddingLeft: px,
          paddingRight: px,
          fontSize: text,
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
        {selected?.icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{selected.icon}</span>}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected?.color }}>
          {selected?.label ?? placeholder ?? value}
        </span>
        <DropdownArrowIcon
          size={10}
          style={{ flexShrink: 0, transition: 'transform 140ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', color: open ? accent : 'var(--color-text-muted)' }}
        />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
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
          {options.map((opt, i) => opt.isHeader ? (
            <div key={`${opt.value}-${i}`} style={{ padding: '6px 10px 3px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', userSelect: 'none' }}>
              {opt.label}
            </div>
          ) : (
            <div
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              onClick={() => handleSelect(opt.value)}
              className={`dui_select__option${opt.value === value ? ' dui_select__option--selected' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: `${itemPy} 10px`,
                borderRadius: rounded ? '5px' : '0px',
                fontSize: itemText,
                fontWeight: 500,
                color: opt.value === value ? (accentColor || 'var(--color-primary-light)') : (opt.color || 'var(--color-text-secondary)'),
                background: opt.value === value ? `color-mix(in srgb, ${accent} 15%, transparent)` : 'transparent',
                cursor: 'pointer',
                transition: 'background 100ms, color 100ms',
              }}
            >
              {opt.icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{opt.icon}</span>}
              <span>{opt.label}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
