import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { SpinnerIcon } from '../../../icons';
import type { DuiSize } from '../../core/DuiTypes';
import { useButtonBase } from '../../core/ButtonBase';

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
  ...rest
}: ButtonViewProps) {
  const base = useButtonBase(size === 'default' ? undefined : size);
  const accent = accentColor || 'var(--color-btn-primary-bg)';
  const radius = rounded ? base.borderRadius : '0px';
  const isDisabled = disabled || loading;

  const variantStyle: CSSProperties = (() => {
    switch (variant) {
      case 'primary':
        return { background: accent, color: 'var(--color-btn-primary-text, #fff)', border: '1px solid transparent' };
      case 'danger':
        return { background: 'var(--color-btn-danger-bg)', color: 'var(--color-btn-danger-text, #fff)', border: '1px solid transparent' };
      case 'ghost':
        return { background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid transparent' };
      default: // secondary
        return { background: 'var(--color-btn-secondary-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--color-btn-secondary-border)' };
    }
  })();

  const handleEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled) return;
    const el = e.currentTarget;
    if (variant === 'primary') el.style.background = accentColor ? `color-mix(in srgb, ${accentColor} 80%, #000)` : 'var(--color-btn-primary-hover)';
    else if (variant === 'danger') el.style.filter = 'brightness(1.1)';
    else if (variant === 'ghost') { el.style.background = 'var(--color-btn-ghost-hover)'; el.style.color = 'var(--color-text-primary)'; }
    else { el.style.background = 'var(--color-btn-secondary-hover)'; }
  };

  const handleLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled) return;
    const el = e.currentTarget;
    if (variant === 'primary') el.style.background = accent;
    else if (variant === 'danger') el.style.filter = '';
    else if (variant === 'ghost') { el.style.background = 'transparent'; el.style.color = 'var(--color-text-secondary)'; }
    else { el.style.background = 'var(--color-btn-secondary-bg)'; }
  };

  const handleDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled) return;
    const el = e.currentTarget;
    if (variant === 'primary') el.style.background = accentColor ? `color-mix(in srgb, ${accentColor} 80%, #000)` : 'var(--color-btn-primary-hover)';
    else if (variant === 'danger') el.style.filter = 'brightness(0.92)';
    (rest.onMouseDown as ((e: React.MouseEvent<HTMLButtonElement>) => void) | undefined)?.(e);
  };

  const handleUp = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled) return;
    const el = e.currentTarget;
    if (variant === 'danger') el.style.filter = 'brightness(1.1)';
    (rest.onMouseUp as ((e: React.MouseEvent<HTMLButtonElement>) => void) | undefined)?.(e);
  };

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`inline-flex items-center justify-center font-medium cursor-pointer transition-colors select-none ${className}`}
      style={{
        height: base.height,
        paddingLeft: base.paddingX,
        paddingRight: base.paddingX,
        fontSize: base.fontSize,
        gap: base.gap,
        borderRadius: radius,
        opacity: isDisabled ? 0.5 : 1,
        ...variantStyle,
        ...style,
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onMouseDown={handleDown}
      onMouseUp={handleUp}
      {...rest}
    >
      {loading ? <SpinnerIcon size={base.iconSize} /> : iconLeft}
      {label ?? children}
      {!loading && iconRight}
    </button>
  );
}
