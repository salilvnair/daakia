import type { CSSProperties } from 'react';
import type { DuiSize } from '../../core/DuiTypes';
import { useChipBase } from '../../core/ChipBase';

/** `'xs'` is a sub-sm alias kept for dense protocol badges. */
export type ChipViewSize = 'xs' | DuiSize;

export interface ChipViewProps {
  label: string;
  /** CSS variable or raw color value — drives text, border, and auto-derived bg */
  color?: string;
  /** Override background explicitly instead of deriving from color */
  bg?: string;
  /** Size — falls back to DuiProvider context when omitted (resolves to 'sm' equivalent). */
  size?: ChipViewSize;
  /** true = rounded-full (default), false = token border-radius */
  rounded?: boolean;
  onClick?: () => void;
  /** Filled background instead of translucent */
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}

const XS = { height: '16px', px: '5px', fontSize: '9px' };

export function ChipView({
  label,
  color,
  bg,
  size,
  rounded = true,
  onClick,
  active = false,
  className = '',
  style,
}: ChipViewProps) {
  // 'xs' bypasses the size system — it's a fixed sub-sm preset for dense badges.
  const isXs = size === 'xs';
  // For DuiSize values (sm/md/lg/xl) or undefined (inherits from context), use the base hook.
  const base = useChipBase(isXs ? 'sm' : (size as DuiSize | undefined));
  const { height, px, fontSize } = isXs
    ? XS
    : { height: base.height, px: base.paddingX, fontSize: base.fontSize };

  const accent = color || 'var(--color-primary)';
  const borderRadius = rounded ? '9999px' : '4px';

  const background = active
    ? accent
    : (bg || `color-mix(in srgb, ${accent} 12%, transparent)`);
  const textColor = active ? 'var(--color-chip-active-text)' : accent;
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
