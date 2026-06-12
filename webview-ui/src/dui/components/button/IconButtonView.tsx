import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import type { DuiRadius } from '../../core/DuiTypes';
import { useDui, resolveBorderRadius } from '../../core/DuiContext';
import './IconButtonView.css';

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
  // ─── DUI container props ─────────────────────────────────────────────────
  borderRadius?: DuiRadius | number;
  /** Text/icon color override */
  color?: string;
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
  borderRadius,
  color,
  ...rest
}: IconButtonViewProps) {
  const ctx = useDui();
  const dim = SIZE_PX[size] ?? SIZE_PX.default;
  const accent = accentColor || ctx.defaultColor || 'var(--color-primary)';
  const activeClr = activeColor || ctx.activeColor || accent;
  const resolvedRadius = rounded
    ? resolveBorderRadius(borderRadius ?? ctx.borderRadius, '4px')
    : '0px';
  const resolvedColor = color || ctx.color;

  const baseBg = variant === 'filled'
    ? (active ? activeClr : `color-mix(in srgb, ${accent} 12%, transparent)`)
    : (active ? `color-mix(in srgb, ${activeClr} 14%, transparent)` : 'transparent');

  const baseColor = variant === 'filled'
    ? (active ? 'var(--color-btn-primary-text, white)' : (resolvedColor || accent))
    : (active ? activeClr : (resolvedColor || (accentColor ? accent : 'var(--color-text-muted)')));

  const baseStyle: CSSProperties = {
    width: dim,
    height: dim,
    minWidth: dim,
    borderRadius: resolvedRadius,
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    '--dui-icon-bg': baseBg,
    '--dui-icon-color': baseColor,
    '--dui-hover-bg': active
      ? `color-mix(in srgb, ${activeClr} 20%, transparent)`
      : 'var(--color-iconbtn-bg-hover, var(--color-surface-hover))',
    '--dui-hover-color': active ? activeClr : 'var(--color-text-primary)',
    ...style,
  } as CSSProperties;

  return (
    <button
      type="button"
      title={tooltip}
      disabled={disabled}
      className={`dui_icon-button transition-all ${className}`}
      style={baseStyle}
      {...rest}
    >
      {icon}
    </button>
  );
}
