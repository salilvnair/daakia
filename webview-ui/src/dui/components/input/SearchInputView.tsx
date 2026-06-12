import type { ReactNode, InputHTMLAttributes, CSSProperties } from 'react';
import type { DuiSize } from '../../core/DuiTypes';
import { useInputBase } from '../../core/InputBase';

export interface SearchInputViewProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'prefix'> {
  value: string;
  onChange: (value: string) => void;
  /** Node shown left inside the bar (e.g. SearchIcon) */
  prefix?: ReactNode;
  /** Node shown right inside the bar (e.g. clear button) */
  suffix?: ReactNode;
  /** Falls back to DuiProvider size when omitted. */
  size?: DuiSize;
  /** Raw height override in px — prefer `size` for token-aligned sizing. */
  height?: number;
  style?: CSSProperties;
  className?: string;
}

export function SearchInputView({
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  size,
  height,
  style,
  className = '',
  ...rest
}: SearchInputViewProps) {
  const base = useInputBase(size);
  const resolvedHeight = height ?? parseInt(base.height, 10);
  return (
    <div
      className={className}
      style={{
        height: resolvedHeight,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        borderRadius: base.borderRadius,
        border: '1px solid var(--color-input-border)',
        background: 'var(--color-input-bg)',
        paddingLeft: 8,
        paddingRight: suffix ? 4 : 8,
        transition: 'border-color 120ms',
        ...style,
      }}
    >
      {prefix && (
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: 'var(--color-text-muted)' }}>
          {prefix}
        </span>
      )}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: base.fontSize,
          color: 'var(--color-text-primary)',
          fontFamily: 'inherit',
        }}
        {...rest}
      />
      {suffix && (
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: 'var(--color-text-muted)' }}>
          {suffix}
        </span>
      )}
    </div>
  );
}
