import type { CSSProperties } from 'react';

export type ToggleSwitchSize = 'sm' | 'md' | 'lg';

export interface ToggleSwitchViewProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: ToggleSwitchSize;
  accentColor?: string;
  label?: string;
  labelPosition?: 'left' | 'right';
  className?: string;
}

const SIZES: Record<ToggleSwitchSize, { trackW: number; trackH: number; thumb: number; font: string }> = {
  sm: { trackW: 28, trackH: 16, thumb: 12, font: '11px' },
  md: { trackW: 36, trackH: 20, thumb: 16, font: '12px' },
  lg: { trackW: 44, trackH: 24, thumb: 20, font: '13px' },
};

export function ToggleSwitchView({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  accentColor,
  label,
  labelPosition = 'right',
  className = '',
}: ToggleSwitchViewProps) {
  const accent = accentColor || 'var(--color-toggle-on)';
  const { trackW, trackH, thumb, font } = SIZES[size];
  const thumbLeft = checked ? `calc(${trackW}px - ${thumb + 2}px)` : '2px';

  const trackStyle: CSSProperties = {
    position: 'relative',
    width: trackW,
    height: trackH,
    borderRadius: 999,
    flexShrink: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 160ms, border-color 160ms',
    ...(disabled
      ? {
          background: 'transparent',
          border: '1.5px dashed var(--color-text-muted)',
          opacity: 0.5,
        }
      : checked
      ? {
          background: accent,
          border: '1.5px solid transparent',
        }
      : {
          background: 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)',
          border: '1.5px solid color-mix(in srgb, var(--color-text-primary) 20%, transparent)',
        }),
  };

  const thumbStyle: CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: thumbLeft,
    transform: 'translateY(-50%)',
    width: thumb,
    height: thumb,
    borderRadius: '50%',
    background: disabled ? 'var(--color-text-muted)' : 'var(--color-toggle-thumb)',
    transition: 'left 160ms',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    pointerEvents: 'none',
  };

  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={trackStyle}
      className={className}
    >
      <span style={thumbStyle} />
    </button>
  );

  if (!label) return toggle;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {labelPosition === 'left' && (
        <span style={{ fontSize: font, color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)', userSelect: 'none' }}>
          {label}
        </span>
      )}
      {toggle}
      {labelPosition === 'right' && (
        <span style={{ fontSize: font, color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)', userSelect: 'none' }}>
          {label}
        </span>
      )}
    </div>
  );
}
