import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

export type IconButtonSize = 'default' | 'sm' | 'md' | 'lg' | 'xl';
export type IconButtonVariant = 'ghost' | 'filled';

export interface IconButtonViewProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  size?: IconButtonSize;
  /** true = 4px radius (default), false = 0px */
  rounded?: boolean;
  tooltip?: string;
  variant?: IconButtonVariant;
  /** Override accent color */
  accentColor?: string;
  /** Color when active=true */
  activeColor?: string;
  /** Shows active state */
  active?: boolean;
}

const SIZE_PX: Record<IconButtonSize, string> = {
  default: '26px',
  sm:      '22px',
  md:      '28px',
  lg:      '32px',
  xl:      '36px',
};

export function IconButtonView({
  icon,
  size = 'default',
  rounded = true,
  tooltip,
  variant = 'ghost',
  accentColor,
  activeColor,
  active = false,
  disabled,
  style,
  className = '',
  ...rest
}: IconButtonViewProps) {
  const dim = SIZE_PX[size] ?? SIZE_PX.default;
  const accent = accentColor || 'var(--color-primary)';
  const activeClr = activeColor || accent;
  const radius = rounded ? '4px' : '0px';

  const baseStyle: CSSProperties = {
    width: dim,
    height: dim,
    minWidth: dim,
    borderRadius: radius,
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    transition: 'all 120ms ease',
    opacity: disabled ? 0.45 : 1,
    ...(variant === 'filled'
      ? { background: active ? activeClr : `color-mix(in srgb, ${accent} 12%, transparent)`, color: active ? 'var(--color-btn-primary-text, white)' : accent }
      // Ghost: when accentColor explicitly provided, show it in resting state — otherwise muted
      : { background: active ? `color-mix(in srgb, ${activeClr} 14%, transparent)` : 'transparent', color: active ? activeClr : (accentColor ? accent : 'var(--color-text-muted)') }),
    ...style,
  };

  return (
    <button
      type="button"
      title={tooltip}
      disabled={disabled}
      className={`transition-all ${className}`}
      style={baseStyle}
      onMouseEnter={e => {
        if (disabled) return;
        const el = e.currentTarget;
        el.style.background = active
          ? `color-mix(in srgb, ${activeClr} 20%, transparent)`
          : 'var(--color-iconbtn-bg-hover, var(--color-surface-hover))';
        el.style.color = active ? activeClr : 'var(--color-text-primary)';
      }}
      onMouseLeave={e => {
        if (disabled) return;
        const el = e.currentTarget;
        if (variant === 'filled') {
          el.style.background = active ? activeClr : `color-mix(in srgb, ${accent} 12%, transparent)`;
          el.style.color = active ? 'var(--color-btn-primary-text, white)' : accent;
        } else {
          el.style.background = active ? `color-mix(in srgb, ${activeClr} 14%, transparent)` : 'transparent';
          el.style.color = active ? activeClr : (accentColor ? accent : 'var(--color-text-muted)');
        }
      }}
      {...rest}
    >
      {icon}
    </button>
  );
}
