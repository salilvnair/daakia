import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DropdownArrowIcon, CheckIcon, SearchIcon } from '../../../icons';
import type { DuiSize, DuiRadius, DuiWidth, DuiFontStyle } from '../../core/DuiTypes';
import { useInputBase } from '../../core/InputBase';
import { useDui } from '../../core/DuiContext';
import './SelectTextInputView.css';

export interface SelectTextOption {
  value: string;
  label: string;
  /** Accent color for this option — e.g. HTTP methods */
  color?: string;
}

export interface SelectTextInputViewProps {
  selectValue: string;
  selectOptions: SelectTextOption[];
  onSelectChange: (value: string) => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  placeholder?: string;
  /** Falls back to DuiProvider size when omitted. */
  size?: DuiSize;
  disabled?: boolean;
  /** Accent border color on focus */
  accentColor?: string;
  /** Override the select section width in px */
  selectWidth?: number;
  /** URL / text autocomplete suggestions */
  suggestions?: string[];
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  // ─── DUI container props ──────────────────────────────────────────────────
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  color?: string;
  fontStyle?: DuiFontStyle;
  className?: string;
}

/** Select section width per size — sized to fit longest HTTP method label ("OPTIONS") */
const SELECT_WIDTH: Record<DuiSize, number> = {
  xxs: 44, xs: 52, sm: 64, md: 80, lg: 96, xl: 112, xxl: 128, xxxl: 148,
};

export function SelectTextInputView({
  selectValue,
  selectOptions,
  onSelectChange,
  inputValue,
  onInputChange,
  placeholder = 'Enter URL or paste text',
  size,
  disabled = false,
  accentColor,
  selectWidth,
  suggestions = [],
  onKeyDown,
  width,
  borderRadius,
  color,
  fontStyle,
  className = '',
}: SelectTextInputViewProps) {
  const ctx = useDui();
  const resolvedSize: DuiSize = size ?? ctx.size;
  const base = useInputBase(size, { width, borderRadius, color, fontStyle });
  const selWidth = selectWidth ?? SELECT_WIDTH[resolvedSize];
  const accent = accentColor ?? 'var(--color-primary)';

  const [methodOpen, setMethodOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [methodDropPos, setMethodDropPos] = useState({ top: 0, left: 0, width: 0 });
  const [suggDropPos, setSuggDropPos] = useState({ top: 0, left: 0, width: 0 });

  const selectedOpt = selectOptions.find(o => o.value === selectValue);
  const selectColor = selectedOpt?.color ?? 'var(--color-text-primary)';

  // ── Filtered suggestions ──────────────────────────────────────────────────

  const filteredSuggestions = useMemo(() => {
    if (!inputValue.trim() || !suggestions.length) return [];
    const lower = inputValue.toLowerCase();
    return suggestions.filter(s => s.toLowerCase().includes(lower) && s !== inputValue).slice(0, 8);
  }, [inputValue, suggestions]);

  // ── Method dropdown ────────────────────────────────────────────────────────

  const openMethodDropdown = () => {
    if (disabled) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMethodDropPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 120) });
    setMethodOpen(v => !v);
  };

  useEffect(() => {
    if (!methodOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-stiv-method]') && !t.closest('[data-stiv-trigger]')) setMethodOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [methodOpen]);

  // ── Suggestions dropdown ────────────────────────────────────────────────────

  useEffect(() => {
    if (filteredSuggestions.length > 0 && focused) {
      const el = wrapperRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setSuggDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
      setShowSuggestions(true);
      setHighlightedIdx(-1);
    } else {
      setShowSuggestions(false);
    }
  }, [filteredSuggestions, focused]);

  const handleSuggestionSelect = (val: string) => {
    onInputChange(val);
    setShowSuggestions(false);
    setHighlightedIdx(-1);
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIdx(i => Math.min(i + 1, filteredSuggestions.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlightedIdx(i => Math.max(i - 1, -1)); return; }
      if (e.key === 'Enter' && highlightedIdx >= 0) { e.preventDefault(); handleSuggestionSelect(filteredSuggestions[highlightedIdx]); return; }
      if (e.key === 'Escape')    { setShowSuggestions(false); setHighlightedIdx(-1); return; }
    }
    onKeyDown?.(e);
  };

  const borderColor = focused || methodOpen ? accent : 'var(--color-input-border)';

  return (
    <>
      <div
        ref={wrapperRef}
        className={className}
        style={{
          display: 'flex',
          height: base.height,
          width: base.width,
          border: `1px solid ${borderColor}`,
          borderRadius: base.borderRadius,
          background: 'var(--color-input-bg)',
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 120ms',
          overflow: 'visible',
          position: 'relative',
        }}
      >
        {/* Select trigger */}
        <div
          ref={triggerRef}
          data-stiv-trigger
          onClick={openMethodDropdown}
          className={`dui_select-text__trigger${disabled ? ' dui_select-text__trigger--disabled' : ''}`}
          style={{
            display: 'flex', alignItems: 'center', gap: base.gap,
            padding: `0 ${base.paddingX}`,
            width: selWidth,
            flexShrink: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
            userSelect: 'none',
            color: selectColor,
            fontWeight: 700,
            fontSize: base.fontSize,
            letterSpacing: '0.02em',
            borderRadius: `calc(${base.borderRadius} - 1px) 0 0 calc(${base.borderRadius} - 1px)`,
          }}
        >
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedOpt?.label ?? selectValue}
          </span>
          <DropdownArrowIcon
            size={base.iconSize - 2}
            style={{
              flexShrink: 0,
              color: 'var(--color-text-muted)',
              transform: methodOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
            }}
          />
        </div>

        {/* Divider */}
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-input-border)', flexShrink: 0, margin: '4px 0' }} />

        {/* URL text input */}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={e => onInputChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={handleInputKeyDown}
          style={{
            flex: 1, height: '100%', padding: `0 ${base.paddingX}`,
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: base.fontSize,
            color: base.color ?? 'var(--color-text-primary)',
            fontFamily: 'inherit',
            fontStyle: base.fontStyle,
          }}
        />
      </div>

      {/* Method dropdown portal */}
      {methodOpen && createPortal(
        <div
          data-stiv-method
          style={{
            position: 'fixed', top: methodDropPos.top, left: methodDropPos.left,
            minWidth: methodDropPos.width,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
            zIndex: 9999, padding: 3, overflow: 'hidden',
          }}
        >
          {selectOptions.map(opt => {
            const isSelected = opt.value === selectValue;
            return (
              <div
                key={opt.value}
                onMouseDown={e => { e.preventDefault(); onSelectChange(opt.value); setMethodOpen(false); }}
                className={`dui_select-text__option${isSelected ? ' dui_select-text__option--selected' : ''}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: `6px ${base.paddingX}`,
                  borderRadius: 5, cursor: 'pointer',
                  fontSize: base.fontSize, fontWeight: isSelected ? 700 : 500,
                  color: opt.color ?? 'var(--color-text-primary)',
                  background: isSelected ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                }}
              >
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isSelected && <CheckIcon size={base.iconSize - 2} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>,
        document.body
      )}

      {/* Suggestions autocomplete portal */}
      {showSuggestions && filteredSuggestions.length > 0 && createPortal(
        <div
          data-stiv-suggestions
          style={{
            position: 'fixed', top: suggDropPos.top, left: suggDropPos.left, width: suggDropPos.width,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
            zIndex: 9998, padding: 3, overflow: 'hidden',
          }}
        >
          <div style={{ padding: `4px ${base.paddingX} 6px`, borderBottom: '1px solid var(--color-surface-border)' }}>
            <p style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
              Suggestions
            </p>
          </div>
          {filteredSuggestions.map((s, i) => (
            <div
              key={s}
              onMouseDown={e => { e.preventDefault(); handleSuggestionSelect(s); }}
              onMouseEnter={() => setHighlightedIdx(i)}
              onMouseLeave={() => setHighlightedIdx(-1)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: `6px ${base.paddingX}`,
                borderRadius: 5, cursor: 'pointer',
                fontSize: base.fontSize,
                color: 'var(--color-text-primary)',
                background: i === highlightedIdx
                  ? `color-mix(in srgb, ${accent} 10%, transparent)`
                  : 'transparent',
                transition: 'background 80ms',
              }}
            >
              <SearchIcon size={base.iconSize - 2} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                {s}
              </span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
