import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DropdownArrowIcon, CheckIcon } from '../../../icons';

export interface SelectTextOption {
  value: string;
  label: string;
  /** Accent color for this option — e.g. HTTP methods */
  color?: string;
}

export type SelectTextInputSize = 'sm' | 'md' | 'lg';

export interface SelectTextInputViewProps {
  selectValue: string;
  selectOptions: SelectTextOption[];
  onSelectChange: (value: string) => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  placeholder?: string;
  size?: SelectTextInputSize;
  disabled?: boolean;
  /** Accent border color on focus */
  accentColor?: string;
  /** Override the select section width in px */
  selectWidth?: number;
  className?: string;
}

const SIZES: Record<SelectTextInputSize, { height: number; fontSize: number; inputFont: number; arrowSize: number }> = {
  sm: { height: 26, fontSize: 11, inputFont: 11, arrowSize: 8  },
  md: { height: 34, fontSize: 12, inputFont: 12, arrowSize: 10 },
  lg: { height: 40, fontSize: 13, inputFont: 13, arrowSize: 11 },
};

export function SelectTextInputView({
  selectValue,
  selectOptions,
  onSelectChange,
  inputValue,
  onInputChange,
  placeholder = 'Enter URL or paste text',
  size = 'md',
  disabled = false,
  accentColor,
  selectWidth,
  className = '',
}: SelectTextInputViewProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const dims = SIZES[size];
  const selWidth = selectWidth ?? (size === 'sm' ? 72 : size === 'lg' ? 106 : 88);
  const accent = accentColor ?? 'var(--color-primary)';

  const selectedOpt = selectOptions.find(o => o.value === selectValue);
  const selectColor = selectedOpt?.color ?? 'var(--color-text-primary)';

  const openDropdown = () => {
    if (disabled) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 120) });
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-stiv-dropdown]') && !t.closest('[data-stiv-trigger]')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const borderColor = focused || open
    ? accent
    : 'var(--color-input-border)';

  return (
    <>
      <div
        className={className}
        style={{
          display: 'flex',
          height: dims.height,
          width: '100%',
          border: `1px solid ${borderColor}`,
          borderRadius: 6,
          background: 'var(--color-input-bg)',
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 120ms',
          overflow: 'visible',
          position: 'relative',
        }}
      >
        {/* Select trigger section */}
        <div
          ref={triggerRef}
          data-stiv-trigger
          onClick={openDropdown}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: `0 ${size === 'sm' ? 7 : 10}px`,
            width: selWidth,
            flexShrink: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
            userSelect: 'none',
            color: selectColor,
            fontWeight: 700,
            fontSize: dims.fontSize,
            letterSpacing: '0.02em',
            borderRadius: '5px 0 0 5px',
            transition: 'background 100ms',
          }}
          onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedOpt?.label ?? selectValue}
          </span>
          <DropdownArrowIcon
            size={dims.arrowSize}
            style={{
              flexShrink: 0,
              color: 'var(--color-text-muted)',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
            }}
          />
        </div>

        {/* Vertical divider */}
        <div style={{
          width: 1,
          alignSelf: 'stretch',
          background: 'var(--color-input-border)',
          flexShrink: 0,
          margin: '4px 0',
        }} />

        {/* Text input */}
        <input
          value={inputValue}
          onChange={e => onInputChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1, height: '100%', padding: `0 ${size === 'sm' ? 8 : 12}px`,
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: dims.inputFont, color: 'var(--color-text-primary)',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Dropdown portal */}
      {open && createPortal(
        <div
          data-stiv-dropdown
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            minWidth: dropPos.width,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
            zIndex: 9999,
            padding: 3,
            overflow: 'hidden',
          }}
        >
          {selectOptions.map(opt => {
            const isSelected = opt.value === selectValue;
            return (
              <div
                key={opt.value}
                onMouseDown={e => {
                  e.preventDefault();
                  onSelectChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: `${size === 'sm' ? '4px 8px' : '6px 10px'}`,
                  borderRadius: 5, cursor: 'pointer',
                  fontSize: dims.fontSize, fontWeight: isSelected ? 700 : 500,
                  color: opt.color ?? 'var(--color-text-primary)',
                  background: isSelected
                    ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)'
                    : 'transparent',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'; }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isSelected && <CheckIcon size={11} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
