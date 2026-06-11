import type { CSSProperties } from 'react';
import { CheckIcon } from '../../../icons';

export type CheckboxSize = 'sm' | 'md' | 'lg';

export interface CheckboxViewProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  size?: CheckboxSize;
  accentColor?: string;
  label?: string;
  className?: string;
}

const SIZES: Record<CheckboxSize, { box: number; icon: number; font: string }> = {
  sm: { box: 14, icon: 9,  font: '11px' },
  md: { box: 16, icon: 11, font: '12px' },
  lg: { box: 18, icon: 13, font: '13px' },
};

export function CheckboxView({
  checked,
  onChange,
  disabled = false,
  indeterminate = false,
  size = 'md',
  accentColor,
  label,
  className = '',
}: CheckboxViewProps) {
  const accent = accentColor || 'var(--color-primary)';
  const { box, icon, font } = SIZES[size];
  const isActive = checked || indeterminate;

  const boxStyle: CSSProperties = {
    width: box,
    height: box,
    borderRadius: 3,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 120ms, border-color 120ms',
    border: isActive
      ? 'none'
      : `1.5px solid color-mix(in srgb, var(--color-text-primary) 28%, transparent)`,
    background: isActive ? accent : 'transparent',
    opacity: disabled ? 0.5 : 1,
  };

  const box_ = (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      style={boxStyle}
      className={className}
    >
      {indeterminate ? (
        <span style={{ width: icon - 2, height: 2, background: 'var(--color-surface)', borderRadius: 1 }} />
      ) : checked ? (
        <CheckIcon size={icon} style={{ color: 'var(--color-surface)', strokeWidth: 3 }} />
      ) : null}
    </button>
  );

  if (!label) return box_;

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: disabled ? 'not-allowed' : 'pointer' }}
      onClick={() => !disabled && onChange?.(!checked)}
    >
      {box_}
      <span style={{ fontSize: font, color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-secondary)', userSelect: 'none' }}>
        {label}
      </span>
    </div>
  );
}
