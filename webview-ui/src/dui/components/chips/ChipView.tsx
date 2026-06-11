import type { CSSProperties } from 'react';

export interface ChipViewProps {
  label: string;
  /** CSS variable or raw color value — drives text, border, and auto-derived bg */
  color?: string;
  /** Override background explicitly instead of deriving from color */
  bg?: string;
  size?: 'xs' | 'sm' | 'md';
  /** true = rounded-full (default), false = 4px corners */
  rounded?: boolean;
  onClick?: () => void;
  /** Filled background instead of translucent */
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}

const SIZE: Record<string, { height: string; px: string; fontSize: string }> = {
  xs: { height: '16px', px: '5px',  fontSize: '9px'  },
  sm: { height: '18px', px: '7px',  fontSize: '10px' },
  md: { height: '20px', px: '9px',  fontSize: '11px' },
};

export function ChipView({
  label,
  color,
  bg,
  size = 'sm',
  rounded = true,
  onClick,
  active = false,
  className = '',
  style,
}: ChipViewProps) {
  const { height, px, fontSize } = SIZE[size] ?? SIZE.sm;
  const accent = color || 'var(--color-primary)';
  const borderRadius = rounded ? '9999px' : '4px';

  const background = active
    ? accent
    : (bg || `color-mix(in srgb, ${accent} 12%, transparent)`);
  const textColor = active ? '#fff' : accent;
  const borderColor = `color-mix(in srgb, ${accent} 30%, transparent)`;

  return (
    <span
      className={`inline-flex items-center font-semibold tracking-wide select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        height,
        paddingLeft: px,
        paddingRight: px,
        fontSize,
        borderRadius,
        background,
        color: textColor,
        border: `1px solid ${borderColor}`,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        transition: 'all 120ms ease',
        ...style,
      }}
      onClick={onClick}
    >
      {label}
    </span>
  );
}
