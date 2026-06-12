import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { SpinnerIcon } from '../../../icons';
import type { DuiSize, DuiWidth, DuiRadius, DuiFontStyle } from '../../core/DuiTypes';
import { useButtonBase } from '../../core/ButtonBase';
import './ButtonView.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
/** `'default'` is kept for backwards-compat and resolves to context size. */
export type ButtonSize = 'default' | DuiSize;

export interface ButtonViewProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** true = token border-radius (default), false = 0px (square) */
  rounded?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  /** Override accent color for primary/focus ring */
  accentColor?: string;
  /** Alias for children — shown as button label text */
  label?: string;
  // ─── DUI container props (override DuiProvider defaults) ─────────────────
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  /** Text color override */
  color?: string;
  /** Primary/accent color (alias for accentColor with context-level support) */
  defaultColor?: string;
  /** Color for active/focus ring state */
  activeColor?: string;
  fontStyle?: DuiFontStyle;
}

export function ButtonView({
  variant = 'secondary',
  size = 'default',
  rounded = true,
  iconLeft,
  iconRight,
  loading = false,
  accentColor,
  label,
  children,
  disabled,
  style,
  className = '',
  width,
  borderRadius,
  color,
  defaultColor,
  activeColor,
  fontStyle,
  ...rest
}: ButtonViewProps) {
  const base = useButtonBase(
    size === 'default' ? undefined : size,
    { width, borderRadius, color, defaultColor, activeColor, fontStyle }
  );
  const accent = accentColor || base.defaultColor || 'var(--color-btn-primary-bg)';
  const radius = rounded ? base.borderRadius : '0px';
  const isDisabled = disabled || loading;

  const variantStyle: CSSProperties = (() => {
    switch (variant) {
      case 'primary':
        return { color: base.color || 'var(--color-btn-primary-text, #fff)', border: '1px solid transparent' };
      case 'danger':
        return { color: base.color || 'var(--color-btn-danger-text, #fff)', border: '1px solid transparent' };
      case 'ghost':
        return { color: base.color || 'var(--color-text-secondary)', border: '1px solid transparent' };
      default: // secondary
        return { color: base.color || 'var(--color-text-primary)', border: '1px solid var(--color-btn-secondary-border)' };
    }
  })();

  const accentVars: CSSProperties = variant === 'primary' ? {
    '--dui-btn-bg': accent,
    '--dui-btn-hover-bg': (accentColor || base.defaultColor)
      ? `color-mix(in srgb, ${accent} 80%, black)`
      : 'var(--color-btn-primary-hover)',
  } as CSSProperties : {};

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`dui_button dui_button--${variant} inline-flex items-center justify-center font-medium cursor-pointer select-none ${className}`}
      style={{
        height: base.height,
        width: base.width !== 'auto' ? base.width : undefined,
        paddingLeft: base.paddingX,
        paddingRight: base.paddingX,
        fontSize: base.fontSize,
        gap: base.gap,
        borderRadius: radius,
        fontStyle: base.fontStyle,
        opacity: isDisabled ? 0.5 : 1,
        ...accentVars,
        ...variantStyle,
        ...style,
      }}
      {...rest}
    >
      {loading ? <SpinnerIcon size={base.iconSize} /> : iconLeft}
      {label ?? children}
      {!loading && iconRight}
    </button>
  );
}
