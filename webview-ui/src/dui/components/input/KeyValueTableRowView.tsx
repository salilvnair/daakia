import { useState, useRef, useEffect, useCallback } from 'react';
import type { DuiSize } from '../../core/DuiTypes';
import { TextInputView } from './TextInputView';
import { HTTP_REQUEST_HEADERS, SENSITIVE_HEADERS, HEADER_VALUE_SUGGESTIONS } from '../../../components/shared/controls/http-headers';
import { CheckCircleFilledIcon, LockIcon, TrashIcon } from '../../../icons';

export interface KeyValueTableRowViewProps {
  rowKey: string;
  value: string;
  description?: string;
  /** Enabled state. Pass undefined to hide the toggle (use with readOnly for pinned rows). */
  enabled?: boolean;
  /** Read-only pinned mode: lock icon, dashed border, no editing */
  readOnly?: boolean;
  /** Explicitly mask the value with an eye toggle */
  masked?: boolean;
  /** Auto-mask when rowKey matches SENSITIVE_HEADERS */
  maskSensitive?: boolean;
  /** Show trash icon on hover */
  deletable?: boolean;
  showDescription?: boolean;
  placeholder?: { key?: string; value?: string };
  /** HTTP header key/value autocomplete — editable mode only */
  autocompleteKeys?: boolean;
  size?: DuiSize;
  accentColor?: string;
  onKeyChange?: (val: string) => void;
  onValueChange?: (val: string) => void;
  onDescriptionChange?: (val: string) => void;
  onEnabledChange?: (enabled: boolean) => void;
  onRemove?: () => void;
}

const DROP_CLS = 'absolute top-full left-0 z-50 w-full max-h-[200px] overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-md shadow-lg mt-0.5';
const dropItemCls = (active: boolean) =>
  `w-full text-left px-3 py-2 text-[13px] text-[var(--color-text-primary)] cursor-pointer transition-colors ${active ? 'bg-[var(--color-surface-hover)]' : 'hover:bg-[var(--color-surface-hover)]'}`;

export function KeyValueTableRowView({
  rowKey,
  value,
  description = '',
  enabled,
  readOnly = false,
  masked = false,
  maskSensitive = false,
  deletable = false,
  showDescription = false,
  placeholder,
  autocompleteKeys = false,
  size,
  onKeyChange,
  onValueChange,
  onDescriptionChange,
  onEnabledChange,
  onRemove,
}: KeyValueTableRowViewProps) {
  const [keyFocused, setKeyFocused] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [keyHighlight, setKeyHighlight] = useState(-1);
  const [valueFocused, setValueFocused] = useState(false);
  const [valueFilterText, setValueFilterText] = useState('');
  const [valueHighlight, setValueHighlight] = useState(-1);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const valueDropdownRef = useRef<HTMLDivElement>(null);

  const isMasked = masked || (maskSensitive && SENSITIVE_HEADERS.includes(rowKey.toLowerCase()));

  const hvs = HEADER_VALUE_SUGGESTIONS as Record<string, string[]>;

  const keySuggestions = autocompleteKeys && !readOnly && keyFocused
    ? HTTP_REQUEST_HEADERS.filter(h =>
        h.toLowerCase().includes((filterText || rowKey).toLowerCase()) &&
        h.toLowerCase() !== rowKey.toLowerCase()
      ).slice(0, 8)
    : [];

  const valueSuggestions = autocompleteKeys && !readOnly && valueFocused && rowKey
    ? (hvs[rowKey.toLowerCase()] || []).filter(v =>
        v.toLowerCase().includes((valueFilterText || value).toLowerCase()) &&
        v.toLowerCase() !== value.toLowerCase()
      ).slice(0, 8)
    : [];

  const showKeyDrop = keyFocused && keySuggestions.length > 0;
  const showValDrop = valueFocused && valueSuggestions.length > 0;

  useEffect(() => {
    if (!showKeyDrop) return;
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          keyInputRef.current && !keyInputRef.current.contains(e.target as Node)) {
        setKeyFocused(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showKeyDrop]);

  useEffect(() => {
    if (!showValDrop) return;
    const h = (e: MouseEvent) => {
      if (valueDropdownRef.current && !valueDropdownRef.current.contains(e.target as Node) &&
          valueInputRef.current && !valueInputRef.current.contains(e.target as Node)) {
        setValueFocused(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showValDrop]);

  const selectKey = useCallback((header: string) => {
    onKeyChange?.(header);
    setKeyFocused(false);
    setFilterText('');
    setKeyHighlight(-1);
  }, [onKeyChange]);

  const selectVal = useCallback((val: string) => {
    onValueChange?.(val);
    setValueFocused(false);
    setValueFilterText('');
    setValueHighlight(-1);
  }, [onValueChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, which: 'key' | 'val') => {
    const isKey = which === 'key';
    const visible = isKey ? showKeyDrop : showValDrop;
    const suggs = isKey ? keySuggestions : valueSuggestions;
    const hi = isKey ? keyHighlight : valueHighlight;
    const setHi = isKey ? setKeyHighlight : setValueHighlight;
    const select = isKey ? selectKey : selectVal;
    const setFoc = isKey ? setKeyFocused : setValueFocused;
    if (!visible) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(p => (p + 1) % suggs.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(p => p <= 0 ? suggs.length - 1 : p - 1); }
    else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); select(suggs[hi]); }
    else if (e.key === 'Escape') { setFoc(false); setHi(-1); }
  }, [showKeyDrop, showValDrop, keySuggestions, valueSuggestions, keyHighlight, valueHighlight, selectKey, selectVal]);

  const gridCls = showDescription
    ? 'grid-cols-[32px_1fr_1fr_1fr_32px]'
    : 'grid-cols-[32px_1fr_1fr_32px]';

  const pinnedInputStyle: React.CSSProperties = {
    border: '1px dashed var(--color-input-border)',
    background: 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)',
    boxShadow: 'none',
  };

  return (
    <div
      className={`grid ${gridCls} gap-2 px-1 group ${!readOnly && enabled === false ? 'opacity-50' : ''}`}
      style={readOnly ? {
        borderRadius: '6px',
        border: '1px dashed color-mix(in srgb, var(--color-text-primary) 15%, transparent)',
        padding: '4px 4px',
        background: 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)',
        margin: '2px 0',
      } : undefined}
    >
      {/* Left: lock icon (readOnly) or enable toggle (editable) */}
      <div className="flex items-center justify-center">
        {readOnly ? (
          <LockIcon size={13} style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
        ) : enabled !== undefined ? (
          <button
            type="button"
            onClick={() => onEnabledChange?.(!enabled)}
            className="cursor-pointer p-0.5"
            title={enabled ? 'Disable' : 'Enable'}
          >
            {enabled
              ? <CheckCircleFilledIcon size={16} checked className="text-[var(--color-success)]" />
              : <CheckCircleFilledIcon size={16} checked={false} />}
          </button>
        ) : null}
      </div>

      {/* Key */}
      <div className="relative">
        <TextInputView
          ref={keyInputRef}
          value={rowKey}
          readOnly={readOnly}
          placeholder={readOnly ? undefined : (placeholder?.key ?? 'Key')}
          size={size}
          style={{ width: '100%', ...(readOnly ? pinnedInputStyle : {}) }}
          color={readOnly ? 'var(--color-text-secondary)' : undefined}
          onChange={e => { onKeyChange?.(e.target.value); setFilterText(e.target.value); setKeyHighlight(-1); }}
          onFocus={() => { setKeyFocused(true); setFilterText(rowKey); setKeyHighlight(-1); }}
          onBlur={() => setTimeout(() => { setKeyFocused(false); setKeyHighlight(-1); }, 150)}
          onKeyDown={e => handleKeyDown(e, 'key')}
          tabIndex={readOnly ? -1 : undefined}
        />
        {showKeyDrop && (
          <div ref={dropdownRef} className={DROP_CLS}>
            {keySuggestions.map((h, i) => (
              <button
                key={h}
                type="button"
                className={dropItemCls(i === keyHighlight)}
                onMouseDown={e => { e.preventDefault(); selectKey(h); }}
                onMouseEnter={() => setKeyHighlight(i)}
              >{h}</button>
            ))}
          </div>
        )}
      </div>

      {/* Value */}
      <div className="relative">
        <TextInputView
          ref={valueInputRef}
          value={value}
          readOnly={readOnly}
          placeholder={readOnly ? undefined : (placeholder?.value ?? 'Value')}
          size={size}
          masked={isMasked}
          style={{ width: '100%', ...(readOnly ? pinnedInputStyle : {}) }}
          color={readOnly ? 'var(--color-text-secondary)' : undefined}
          onChange={e => { onValueChange?.(e.target.value); setValueFilterText(e.target.value); setValueHighlight(-1); }}
          onFocus={() => { setValueFocused(true); setValueFilterText(value); setValueHighlight(-1); }}
          onBlur={() => setTimeout(() => { setValueFocused(false); setValueHighlight(-1); }, 150)}
          onKeyDown={e => handleKeyDown(e, 'val')}
          tabIndex={readOnly ? -1 : undefined}
        />
        {showValDrop && (
          <div ref={valueDropdownRef} className={DROP_CLS}>
            {valueSuggestions.map((v, i) => (
              <button
                key={v}
                type="button"
                className={dropItemCls(i === valueHighlight)}
                onMouseDown={e => { e.preventDefault(); selectVal(v); }}
                onMouseEnter={() => setValueHighlight(i)}
              >{v}</button>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      {showDescription && (
        <TextInputView
          value={description}
          readOnly={readOnly}
          placeholder={readOnly ? undefined : 'Description'}
          size={size}
          style={{ width: '100%', ...(readOnly ? pinnedInputStyle : {}) }}
          color={readOnly ? 'var(--color-text-muted)' : 'var(--color-text-secondary)'}
          onChange={e => onDescriptionChange?.(e.target.value)}
          tabIndex={readOnly ? -1 : undefined}
        />
      )}

      {/* Delete */}
      <div className="flex items-center justify-center">
        {deletable && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-all"
            title="Remove"
          >
            <TrashIcon size={14} />
          </button>
        ) : (
          <div className="w-6 h-6" />
        )}
      </div>
    </div>
  );
}
