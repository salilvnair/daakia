import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import type { DuiSize, DuiRadius, DuiWidth, DuiFontStyle } from '../../core/DuiTypes';
import { useInputBase } from '../../core/InputBase';

/** `'default'` is kept for backwards-compat and resolves to context size. */
export type TextInputSize = 'default' | DuiSize;

export interface TextInputViewProps extends InputHTMLAttributes<HTMLInputElement> {
  size?: TextInputSize;
  /** true = token border-radius (default), false = 0px square */
  rounded?: boolean;
  /** Override focus border / ring color (CSS var or raw) */
  accentColor?: string;
  /** Red border state */
  error?: boolean;
  /** Element rendered inside the left edge */
  iconLeft?: ReactNode;
  /** Element rendered inside the right edge */
  iconRight?: ReactNode;
  // ─── DUI container props ────────────────────────────────────────────────────
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  /** Text color override */
  color?: string;
  fontStyle?: DuiFontStyle;
}

export const TextInputView = forwardRef<HTMLInputElement, TextInputViewProps>(
  function TextInputView(
    { size = 'default', rounded = true, accentColor, error = false, iconLeft, iconRight,
      style, className = '', onFocus, onBlur,
      width, borderRadius, color, fontStyle,
      ...rest },
    ref
  ) {
    const [focused, setFocused] = useState(false);
    const base = useInputBase(size === 'default' ? undefined : size, { width, borderRadius, color, fontStyle });
    const accent = accentColor || 'var(--color-primary)';
    const radius = rounded ? base.borderRadius : '0px';

    const borderColor = error
      ? 'var(--color-error)'
      : focused
      ? accent
      : 'var(--color-input-border)';

    const containerStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      height: base.height,
      width: base.width !== 'auto' ? base.width : undefined,
      borderRadius: radius,
      border: `1px solid ${borderColor}`,
      background: 'var(--color-input-bg)',
      transition: 'border-color 140ms, box-shadow 140ms',
      boxShadow: focused ? `0 0 0 2px color-mix(in srgb, ${accent} 20%, transparent)` : 'none',
      overflow: 'hidden',
      ...style,
    };

    return (
      <div style={containerStyle} className={className}>
        {iconLeft && (
          <span style={{ paddingLeft: base.paddingX, display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          style={{
            flex: 1,
            height: '100%',
            paddingLeft: iconLeft ? '6px' : base.paddingX,
            paddingRight: iconRight ? '6px' : base.paddingX,
            fontSize: base.fontSize,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: base.color || 'var(--color-text-primary)',
            fontStyle: base.fontStyle,
            minWidth: 0,
            fontFamily: 'inherit',
          }}
          onFocus={e => { setFocused(true); onFocus?.(e); }}
          onBlur={e => { setFocused(false); onBlur?.(e); }}
          {...rest}
        />
        {iconRight && (
          <span style={{ paddingRight: base.paddingX, display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {iconRight}
          </span>
        )}
      </div>
    );
  }
);
