import { useState, useRef, useEffect, useCallback } from 'react';
import { HTTP_REQUEST_HEADERS, SENSITIVE_HEADERS, HEADER_VALUE_SUGGESTIONS } from './http-headers';
import { ConfirmDialog } from '../modals/ConfirmDialog';
import { TrashIcon, BulkEditIcon, PlusIcon, CheckCircleFilledIcon, EyeIcon, EyeOffIcon } from '../../../icons';

export interface KeyValueRow {
  id: string;
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
  /** For form-data: 'text' or 'file' */
  type?: 'text' | 'file';
  /** For form-data file uploads: file names */
  files?: string[];
}

interface Props {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  showDescription?: boolean;
  placeholder?: { key?: string; value?: string };
  className?: string;
  /** Show autocomplete suggestions for key field */
  autocompleteKeys?: boolean;
  /** Mask sensitive values (e.g. Authorization) */
  maskSensitive?: boolean;
  /** Hide the built-in toolbar (when parent manages it) */
  hideToolbar?: boolean;
  /** Left-side label (e.g. "Query Parameters", "Header List") */
  label?: string;
  /** Accent color for + Row divider (defaults to indigo/primary) */
  accentColor?: string;
}

export function KeyValueTable({
  rows,
  onChange,
  showDescription = false,
  placeholder,
  className = '',
  autocompleteKeys = false,
  maskSensitive = false,
  hideToolbar = false,
  label,
  accentColor,
}: Props) {
  const updateRow = (idx: number, field: keyof KeyValueRow, value: string | boolean) => {
    const updated = [...rows];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  const addRow = () => {
    onChange([...rows, { id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true }]);
  };

  const insertRowAt = (idx: number) => {
    const newRow = { id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true };
    const updated = [...rows];
    updated.splice(idx, 0, newRow);
    onChange(updated);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) {
      // Reset last row instead of removing
      onChange([{ id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true }]);
      return;
    }
    onChange(rows.filter((_, i) => i !== idx));
  };

  // Auto-add empty row at end when last row has content
  const lastRow = rows[rows.length - 1];
  const needsEmptyRow = !lastRow || lastRow.key || lastRow.value;

  // Bulk edit mode
  const [bulkEdit, setBulkEdit] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const bulkTextRef = useRef('');

  const toBulkText = () => {
    return rows
      .filter(r => r.key || r.value)
      .map(r => `${!r.enabled ? '# ' : ''}${r.key}: ${r.value}`)
      .join('\n');
  };

  const fromBulkText = (text: string) => {
    const parsed = text.split('\n').map(line => {
      const disabled = line.startsWith('# ');
      const clean = disabled ? line.slice(2) : line;
      const colonIdx = clean.indexOf(':');
      const key = colonIdx >= 0 ? clean.slice(0, colonIdx).trim() : clean.trim();
      const value = colonIdx >= 0 ? clean.slice(colonIdx + 1).trim() : '';
      return { id: crypto.randomUUID(), key, value, description: '', enabled: !disabled };
    }).filter(r => r.key || r.value);
    if (parsed.length === 0) {
      onChange([{ id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true }]);
    } else {
      onChange(parsed);
    }
  };

  const handleClearAll = () => {
    onChange([{ id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true }]);
    setShowClearConfirm(false);
    setBulkEdit(false);
  };

  return (
    <div className={`text-[13px] ${className}`}>
      {/* Toolbar: label left, icons right */}
      {!hideToolbar && (
      <div className="flex items-center justify-between mb-2 px-1">
        {label && (
          <span className="text-[12px] text-[var(--color-text-muted)] font-medium">{label}</span>
        )}
        {!label && <div />}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { if (rows.some(r => r.key || r.value)) setShowClearConfirm(true); }}
            className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${
              rows.some(r => r.key || r.value)
                ? 'text-[var(--color-text-muted)] hover:text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)]'
                : 'text-[var(--color-text-muted)] opacity-30 cursor-default'
            }`}
            title="Clear all"
          >
            <TrashIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() => { if (bulkEdit) fromBulkText(bulkTextRef.current); setBulkEdit(!bulkEdit); }}
            className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${
              bulkEdit
                ? 'bg-[rgba(99,102,241,0.12)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)]'
            }`}
            style={bulkEdit && accentColor ? { color: accentColor } : bulkEdit ? { color: 'var(--color-primary)' } : undefined}
            title="Bulk edit"
          >
            <BulkEditIcon size={14} />
          </button>
          <button
            type="button"
            onClick={addRow}
            className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[rgba(99,102,241,0.08)] cursor-pointer transition-colors"
            style={{ '--hover-color': accentColor || 'var(--color-primary)' } as React.CSSProperties}
            title="Add new row"
            onMouseEnter={e => (e.currentTarget.style.color = accentColor || 'var(--color-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = '')}
          >
            <PlusIcon size={14} />
          </button>
        </div>
      </div>
      )}

      {bulkEdit ? (
        <BulkEditArea defaultValue={toBulkText()} onChangeRef={bulkTextRef} accentColor={accentColor} />
      ) : (
        <>
          {/* Header */}
          <div className={`grid ${showDescription ? 'grid-cols-[32px_1fr_1fr_1fr_32px]' : 'grid-cols-[32px_1fr_1fr_32px]'} gap-2 px-1 mb-1.5 items-center`}>
            <div />
            <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">Key</div>
            <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">Value</div>
            {showDescription && (
              <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">Description</div>
            )}
            <div />
          </div>

          {/* Rows */}
          <div className="flex flex-col gap-0">
            {rows.map((row, idx) => {
              return (
                <div key={row.id}>
                  <div className="py-1">
                    <KeyValueRow
                      row={row}
                      idx={idx}
                      showDescription={showDescription}
                      placeholder={placeholder}
                      autocompleteKeys={autocompleteKeys}
                      maskSensitive={maskSensitive}
                      onUpdate={updateRow}
                      onRemove={removeRow}
                    />
                  </div>
                  <InsertRowDivider onInsert={() => insertRowAt(idx + 1)} accentColor={accentColor} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Clear All confirm */}
      {showClearConfirm && (
        <ConfirmDialog
          title="Clear All?"
          message="All entries will be permanently deleted. This cannot be undone."
          confirmLabel="Clear All"
          danger
          onConfirm={handleClearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}

// ─── Bulk Edit Textarea ───

function BulkEditArea({ defaultValue, onChangeRef, accentColor }: { defaultValue: string; onChangeRef: React.MutableRefObject<string>; accentColor?: string }) {
  const [text, setText] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  onChangeRef.current = text;

  const highlight = accentColor || 'var(--color-primary)';

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-[var(--color-text-muted)] px-1">
        Entries are separated by newline. Keys and values are separated by <code style={{ color: highlight }}>:</code>. Prepend <code style={{ color: highlight }}>#</code> to disable a row.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full min-h-[160px] px-3 py-2.5 rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[13px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none resize-y"
        style={focused ? { borderColor: highlight } : undefined}
        placeholder={`Content-Type: application/json\nAuthorization: Bearer token123\n# X-Debug: true`}
        spellCheck={false}
      />
    </div>
  );
}

// ─── Single Row Component ───

interface RowProps {
  row: KeyValueRow;
  idx: number;
  showDescription: boolean;
  placeholder?: { key?: string; value?: string };
  autocompleteKeys: boolean;
  maskSensitive: boolean;
  onUpdate: (idx: number, field: keyof KeyValueRow, value: string | boolean) => void;
  onRemove: (idx: number) => void;
}

function KeyValueRow({ row, idx, showDescription, placeholder, autocompleteKeys, maskSensitive, onUpdate, onRemove }: RowProps) {
  const [keyFocused, setKeyFocused] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [valueFocused, setValueFocused] = useState(false);
  const [valueFilterText, setValueFilterText] = useState('');
  const [keyHighlight, setKeyHighlight] = useState(-1);
  const [valueHighlight, setValueHighlight] = useState(-1);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const valueDropdownRef = useRef<HTMLDivElement>(null);

  const isSensitive = maskSensitive && SENSITIVE_HEADERS.includes(row.key.toLowerCase());

  // Filter autocomplete suggestions
  const suggestions = autocompleteKeys && keyFocused
    ? HTTP_REQUEST_HEADERS.filter(h =>
        h.toLowerCase().includes((filterText || row.key).toLowerCase()) &&
        h.toLowerCase() !== row.key.toLowerCase()
      ).slice(0, 8)
    : [];

  // Value autocomplete suggestions based on current key
  const valueSuggestions = autocompleteKeys && valueFocused && row.key
    ? (HEADER_VALUE_SUGGESTIONS[row.key.toLowerCase()] || []).filter(v =>
        v.toLowerCase().includes((valueFilterText || row.value).toLowerCase()) &&
        v.toLowerCase() !== row.value.toLowerCase()
      ).slice(0, 8)
    : [];

  const showDropdown = keyFocused && suggestions.length > 0;
  const showValueDropdown = valueFocused && valueSuggestions.length > 0;

  // Close dropdown on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          keyInputRef.current && !keyInputRef.current.contains(e.target as Node)) {
        setKeyFocused(false);
      }
    };
    if (showDropdown) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showDropdown]);

  // Close value dropdown on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (valueDropdownRef.current && !valueDropdownRef.current.contains(e.target as Node) &&
          valueInputRef.current && !valueInputRef.current.contains(e.target as Node)) {
        setValueFocused(false);
      }
    };
    if (showValueDropdown) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showValueDropdown]);

  const selectSuggestion = useCallback((header: string) => {
    onUpdate(idx, 'key', header);
    setKeyFocused(false);
    setFilterText('');
    setKeyHighlight(-1);
  }, [idx, onUpdate]);

  const selectValueSuggestion = useCallback((val: string) => {
    onUpdate(idx, 'value', val);
    setValueFocused(false);
    setValueFilterText('');
    setValueHighlight(-1);
  }, [idx, onUpdate]);

  const handleKeyInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setKeyHighlight(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setKeyHighlight(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && keyHighlight >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[keyHighlight]);
    } else if (e.key === 'Escape') {
      setKeyFocused(false);
      setKeyHighlight(-1);
    }
  }, [showDropdown, suggestions, keyHighlight, selectSuggestion]);

  const handleValueInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showValueDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setValueHighlight(prev => (prev + 1) % valueSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setValueHighlight(prev => (prev <= 0 ? valueSuggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && valueHighlight >= 0) {
      e.preventDefault();
      selectValueSuggestion(valueSuggestions[valueHighlight]);
    } else if (e.key === 'Escape') {
      setValueFocused(false);
      setValueHighlight(-1);
    }
  }, [showValueDropdown, valueSuggestions, valueHighlight, selectValueSuggestion]);

  return (
    <div className={`grid ${showDescription ? 'grid-cols-[32px_1fr_1fr_1fr_32px]' : 'grid-cols-[32px_1fr_1fr_32px]'} gap-2 px-1 group ${!row.enabled ? 'opacity-50' : ''}`}>
      {/* Enable/Disable toggle (circle icon) */}
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={() => onUpdate(idx, 'enabled', !row.enabled)}
          className="cursor-pointer p-0.5"
          title={row.enabled ? 'Disable' : 'Enable'}
        >
          {row.enabled ? (
            <CheckCircleFilledIcon size={16} checked className="text-[var(--color-success)]" />
          ) : (
            <CheckCircleFilledIcon size={16} checked={false} />
          )}
        </button>
      </div>

      {/* Key field with autocomplete */}
      <div className="relative">
        <input
          ref={keyInputRef}
          type="text"
          value={row.key}
          onChange={(e) => {
            onUpdate(idx, 'key', e.target.value);
            setFilterText(e.target.value);
            setKeyHighlight(-1);
          }}
          onFocus={() => { setKeyFocused(true); setFilterText(row.key); setKeyHighlight(-1); }}
          onBlur={() => setTimeout(() => { setKeyFocused(false); setKeyHighlight(-1); }, 150)}
          onKeyDown={handleKeyInputKeyDown}
          placeholder={placeholder?.key || 'Key'}
          className="w-full px-2.5 py-1 rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] text-[12px] h-[28px]"
        />
        {/* Autocomplete dropdown */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 z-50 w-full max-h-[200px] overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-md shadow-lg mt-0.5"
          >
            {suggestions.map((header, i) => (
              <button
                key={header}
                type="button"
                className={`w-full text-left px-3 py-2 text-[13px] text-[var(--color-text-primary)] cursor-pointer transition-colors ${i === keyHighlight ? 'bg-[var(--color-surface-hover)]' : 'hover:bg-[var(--color-surface-hover)]'}`}
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(header); }}
                onMouseEnter={() => setKeyHighlight(i)}
              >
                {header}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Value field (with optional masking + autocomplete) */}
      <div className="relative">
        <input
          ref={valueInputRef}
          type={isSensitive && !showValue ? 'password' : 'text'}
          value={row.value}
          onChange={(e) => { onUpdate(idx, 'value', e.target.value); setValueFilterText(e.target.value); setValueHighlight(-1); }}
          onFocus={() => { setValueFocused(true); setValueFilterText(row.value); setValueHighlight(-1); }}
          onBlur={() => setTimeout(() => { setValueFocused(false); setValueHighlight(-1); }, 150)}
          onKeyDown={handleValueInputKeyDown}
          placeholder={placeholder?.value || 'Value'}
          className="w-full px-2.5 py-1 rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] text-[12px] h-[28px]"
        />
        {/* Value autocomplete dropdown */}
        {showValueDropdown && (
          <div
            ref={valueDropdownRef}
            className="absolute top-full left-0 z-50 w-full max-h-[200px] overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-md shadow-lg mt-0.5"
          >
            {valueSuggestions.map((val, i) => (
              <button
                key={val}
                type="button"
                className={`w-full text-left px-3 py-2 text-[13px] text-[var(--color-text-primary)] cursor-pointer transition-colors ${i === valueHighlight ? 'bg-[var(--color-surface-hover)]' : 'hover:bg-[var(--color-surface-hover)]'}`}
                onMouseDown={(e) => { e.preventDefault(); selectValueSuggestion(val); }}
                onMouseEnter={() => setValueHighlight(i)}
              >
                {val}
              </button>
            ))}
          </div>
        )}
        {isSensitive && (
          <button
            type="button"
            onClick={() => setShowValue(!showValue)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
            title={showValue ? 'Hide value' : 'Show value'}
          >
            {showValue ? (
              <EyeIcon size={14} />
            ) : (
              <EyeOffIcon size={14} />
            )}
          </button>
        )}
      </div>

      {/* Description field */}
      {showDescription && (
        <div>
          <input
            type="text"
            value={row.description || ''}
            onChange={(e) => onUpdate(idx, 'description', e.target.value)}
            placeholder="Description"
            className="w-full px-2.5 py-1 rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] text-[12px] h-[28px]"
          />
        </div>
      )}

      {/* Actions: delete */}
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={() => onRemove(idx)}
          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-[#ef4444] cursor-pointer transition-all"
          title="Remove"
        >
          <TrashIcon size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Insert Row Divider (Jupyter-style hover button) ───

export function InsertRowDivider({ onInsert, alwaysVisible = false, accentColor }: { onInsert: () => void; alwaysVisible?: boolean; accentColor?: string }) {
  const color = accentColor || 'rgb(99,102,241)';
  return (
    <div className={`group/divider relative h-[14px] flex items-center justify-center transition-opacity duration-150 ${alwaysVisible ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}>
      {/* Line */}
      <div className="absolute inset-x-4 top-1/2 h-px transition-colors" style={{ backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)` }} />
      {/* Button */}
      <button
        type="button"
        onClick={onInsert}
        className="relative z-10 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition-all"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
          color: color,
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        }}
        title="Insert row"
      >
        <PlusIcon size={10} />
        Row
      </button>
    </div>
  );
}
