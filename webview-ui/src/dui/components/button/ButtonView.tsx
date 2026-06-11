import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { SpinnerIcon } from '../../../icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'default' | 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonViewProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** true = 4px radius (default), false = 0px (square) */
  rounded?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  /** Override accent color for primary/focus ring */
  accentColor?: string;
  /** Alias for children — shown as button label text */
  label?: string;
}

const SIZE_CLS: Record<ButtonSize, { h: string; px: string; text: string; gap: string }> = {
  default: { h: '26px', px: '10px', text: '11px', gap: '5px' },
  sm:      { h: '22px', px: '8px',  text: '10px', gap: '4px' },
  md:      { h: '28px', px: '10px', text: '11px', gap: '5px' },
  lg:      { h: '32px', px: '12px', text: '12px', gap: '6px' },
  xl:      { h: '36px', px: '16px', text: '13px', gap: '6px' },
};

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
  const { h, px, text, gap } = SIZE_CLS[size] ?? SIZE_CLS.default;
  const accent = accentColor || 'var(--color-btn-primary-bg)';
  const radius = rounded ? '4px' : '0px';
  const isDisabled = disabled || loading;

  const variantStyle: CSSProperties = (() => {
    switch (variant) {
      case 'primary':
        return { background: accent, color: '#fff', border: '1px solid transparent' };
      case 'danger':
        return { background: 'var(--color-btn-danger-bg)', color: '#fff', border: '1px solid transparent' };
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
        height: h,
        paddingLeft: px,
        paddingRight: px,
        fontSize: text,
        gap,
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
      {loading ? <SpinnerIcon size={11} /> : iconLeft}
      {label ?? children}
      {!loading && iconRight}
    </button>
  );
}
