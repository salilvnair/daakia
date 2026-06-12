import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import type { DuiSize, DuiRadius, DuiWidth, DuiFontStyle } from '../../core/DuiTypes';
import { useInputBase } from '../../core/InputBase';
import { EyeIcon, EyeOffIcon } from '../../../icons';

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
  /** Icon rendered inside the left edge (alias: prefixIcon) */
  iconLeft?: ReactNode;
  /** Icon rendered inside the right edge (alias: suffixIcon). Ignored when masked=true. */
  iconRight?: ReactNode;
  /** Alias for iconLeft */
  prefixIcon?: ReactNode;
  /** Alias for iconRight. Ignored when masked=true. */
  suffixIcon?: ReactNode;
  /** When true, value is hidden (type=password) with an eye toggle button on the right */
  masked?: boolean;
  /** Custom icons for the masked toggle. Defaults to EyeOffIcon (hidden) / EyeIcon (shown). */
  maskIcon?: { hidden?: ReactNode; shown?: ReactNode };
  // ─── DUI container props ────────────────────────────────────────────────────
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  /** Text color override */
  color?: string;
  fontStyle?: DuiFontStyle;
}

export const TextInputView = forwardRef<HTMLInputElement, TextInputViewProps>(
  function TextInputView(
    { size = 'default', rounded = true, accentColor, error = false,
      iconLeft, iconRight, prefixIcon, suffixIcon,
      masked = false, maskIcon,
      style, className = '', onFocus, onBlur, type,
      width, borderRadius, color, fontStyle,
      ...rest },
    ref
  ) {
    const [focused, setFocused] = useState(false);
    const [showMasked, setShowMasked] = useState(false);
    const base = useInputBase(size === 'default' ? undefined : size, { width, borderRadius, color, fontStyle });
    const accent = accentColor || 'var(--color-primary)';
    const radius = rounded ? base.borderRadius : '0px';

    const effectiveLeft = prefixIcon ?? iconLeft;
    const effectiveRight = masked ? null : (suffixIcon ?? iconRight);

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

    const inputType = masked ? (showMasked ? 'text' : 'password') : (type ?? 'text');

    const toggleIcon = showMasked
      ? (maskIcon?.shown ?? <EyeIcon size={14} />)
      : (maskIcon?.hidden ?? <EyeOffIcon size={14} />);

    return (
      <div style={containerStyle} className={className}>
        {effectiveLeft && (
          <span style={{ paddingLeft: base.paddingX, display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {effectiveLeft}
          </span>
        )}
        <input
          ref={ref}
          type={inputType}
          style={{
            flex: 1,
            height: '100%',
            paddingLeft: effectiveLeft ? '6px' : base.paddingX,
            paddingRight: (masked || effectiveRight) ? '6px' : base.paddingX,
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
        {effectiveRight && (
          <span style={{ paddingRight: base.paddingX, display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {effectiveRight}
          </span>
        )}
        {masked && (
          <button
            type="button"
            onClick={() => setShowMasked(s => !s)}
            style={{
              paddingRight: base.paddingX,
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = '')}
            title={showMasked ? 'Hide value' : 'Show value'}
          >
            {toggleIcon}
          </button>
        )}
      </div>
    );
  }
);
