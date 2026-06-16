import { forwardRef, useState, type TextareaHTMLAttributes } from 'react';
import type { DuiSize, DuiRadius, DuiWidth } from '../../core/DuiTypes';
import { useInputBase } from '../../core/InputBase';

export interface MultilineInputViewProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: 'default' | DuiSize;
  rounded?: boolean;
  accentColor?: string;
  error?: boolean;
  /** Number of visible rows (default: 4) */
  rows?: number;
  /** Allow manual resize: 'none' | 'vertical' | 'both' (default: 'none') */
  resize?: 'none' | 'vertical' | 'both';
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
}

export const MultilineInputView = forwardRef<HTMLTextAreaElement, MultilineInputViewProps>(
  function MultilineInputView(
    {
      size = 'default',
      rounded = true,
      accentColor,
      error = false,
      rows = 4,
      resize = 'none',
      style,
      className = '',
      onFocus,
      onBlur,
      width,
      borderRadius,
      ...rest
    },
    ref
  ) {
    const [focused, setFocused] = useState(false);
    const base = useInputBase(size === 'default' ? undefined : size, { width, borderRadius });
    const accent = accentColor || 'var(--color-primary)';
    const radius = rounded ? base.borderRadius : '0px';

    const borderColor = error
      ? 'var(--color-error)'
      : focused
      ? accent
      : 'var(--color-input-border)';

    return (
      <textarea
        ref={ref}
        rows={rows}
        style={{
          width: base.width !== 'auto' ? base.width : '100%',
          padding: `${parseInt(base.paddingX) > 0 ? '8px' : '6px'} ${base.paddingX}`,
          fontSize: base.fontSize,
          fontFamily: 'inherit',
          borderRadius: radius,
          border: `1px solid ${borderColor}`,
          background: 'var(--color-input-bg)',
          color: 'var(--color-text-primary)',
          outline: 'none',
          resize,
          transition: 'border-color 140ms, box-shadow 140ms',
          boxShadow: focused ? `0 0 0 2px color-mix(in srgb, ${accent} 20%, transparent)` : 'none',
          lineHeight: 1.5,
          ...style,
        }}
        className={className}
        onFocus={e => { setFocused(true); onFocus?.(e); }}
        onBlur={e => { setFocused(false); onBlur?.(e); }}
        {...rest}
      />
    );
  }
);
