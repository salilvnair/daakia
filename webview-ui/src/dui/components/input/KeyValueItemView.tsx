import { useState } from 'react';
import { TrashIcon, DragHandleIcon, EyeIcon, EyeOffIcon, CheckCircleFilledIcon } from '../../../icons';
import type { DuiSize } from '../../core/DuiTypes';
import { useInputBase } from '../../core/InputBase';
import './KeyValueItemView.css';

export interface KeyValueItemViewProps {
  enabled?: boolean;
  onToggleEnabled?: () => void;
  keyValue: string;
  onKeyChange: (k: string) => void;
  value: string;
  onValueChange: (v: string) => void;
  description?: string;
  onDescriptionChange?: (d: string) => void;
  onDelete?: () => void;
  placeholder?: { key?: string; value?: string; description?: string };
  masked?: boolean;
  accentColor?: string;
  /** Falls back to DuiProvider size when omitted. */
  size?: DuiSize;
  draggable?: boolean;
  readOnly?: boolean;
  className?: string;
}

export function KeyValueItemView({
  enabled = true,
  onToggleEnabled,
  keyValue,
  onKeyChange,
  value,
  onValueChange,
  description,
  onDescriptionChange,
  onDelete,
  placeholder,
  masked = false,
  accentColor,
  size,
  draggable = false,
  readOnly = false,
  className = '',
}: KeyValueItemViewProps) {
  const [showValue, setShowValue] = useState(false);
  const [keyFocused, setKeyFocused] = useState(false);
  const [valFocused, setValFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);

  const base = useInputBase(size);
  const accent = accentColor || 'var(--color-primary)';

  const hasDesc = onDescriptionChange !== undefined;
  const hasDrag = draggable;

  const inputBase: React.CSSProperties = {
    width: '100%',
    height: base.height,
    paddingLeft: base.paddingX,
    paddingRight: base.paddingX,
    fontSize: base.fontSize,
    borderRadius: base.borderRadius,
    background: 'var(--color-input-bg)',
    border: '1px solid var(--color-input-border)',
    color: enabled ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
    outline: 'none',
    fontFamily: 'inherit',
    opacity: enabled ? 1 : 0.55,
    transition: 'border-color 120ms, box-shadow 120ms',
    boxSizing: 'border-box',
  };

  const focusedStyle = (focused: boolean): React.CSSProperties =>
    focused
      ? {
          borderColor: accent,
          boxShadow: `0 0 0 2px color-mix(in srgb, ${accent} 16%, transparent)`,
        }
      : {};

  // Grid columns: [drag?] [toggle?] [key] [value] [desc?] [delete?]
  const cols = [
    hasDrag && '20px',
    onToggleEnabled && '32px',
    '1fr',
    '1fr',
    hasDesc && '1fr',
    onDelete && '32px',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={`group ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        gap: '8px',
        alignItems: 'center',
        minHeight: base.height,
        opacity: enabled ? 1 : 0.65,
        transition: 'opacity 120ms',
      }}
    >
      {/* Drag handle */}
      {hasDrag && (
        <span
          style={{
            color: 'var(--color-text-muted)',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0,
          }}
          className="group-hover:opacity-100 transition-opacity"
        >
          <DragHandleIcon size={12} />
        </span>
      )}

      {/* Enable toggle — circle icon matching KeyValueTable */}
      {onToggleEnabled && (
        <button
          type="button"
          onClick={onToggleEnabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: '2px',
            background: 'transparent',
            border: 'none',
            flexShrink: 0,
          }}
          title={enabled ? 'Disable row' : 'Enable row'}
        >
          <CheckCircleFilledIcon size={16} checked={enabled} />
        </button>
      )}

      {/* Key input */}
      <input
        value={keyValue}
        onChange={e => !readOnly && onKeyChange(e.target.value)}
        placeholder={placeholder?.key ?? 'Key'}
        readOnly={readOnly}
        onFocus={() => setKeyFocused(true)}
        onBlur={() => setKeyFocused(false)}
        style={{ ...inputBase, ...focusedStyle(keyFocused) }}
      />

      {/* Value input (with optional mask) */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type={masked && !showValue ? 'password' : 'text'}
          value={value}
          onChange={e => !readOnly && onValueChange(e.target.value)}
          placeholder={placeholder?.value ?? 'Value'}
          readOnly={readOnly}
          onFocus={() => setValFocused(true)}
          onBlur={() => setValFocused(false)}
          style={{ ...inputBase, ...focusedStyle(valFocused), paddingRight: masked ? '26px' : '10px' }}
        />
        {masked && (
          <button
            type="button"
            onClick={() => setShowValue(v => !v)}
            style={{
              position: 'absolute',
              right: '6px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              padding: '1px',
              background: 'transparent',
              border: 'none',
            }}
          >
            {showValue ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
          </button>
        )}
      </div>

      {/* Description input */}
      {onDescriptionChange !== undefined && (
        <input
          value={description ?? ''}
          onChange={e => onDescriptionChange(e.target.value)}
          placeholder={placeholder?.description ?? 'Description'}
          readOnly={readOnly}
          onFocus={() => setDescFocused(true)}
          onBlur={() => setDescFocused(false)}
          style={{ ...inputBase, ...focusedStyle(descFocused) }}
        />
      )}

      {/* Delete button */}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            padding: '2px',
            flexShrink: 0,
            border: 'none',
            background: 'transparent',
            opacity: 0,
            transition: 'color 120ms, opacity 120ms',
          }}
          className="dui_kv-item__delete group-hover:opacity-100"
          title="Remove row"
        >
          <TrashIcon size={13} />
        </button>
      )}
    </div>
  );
}
