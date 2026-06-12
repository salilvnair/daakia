import type { CSSProperties } from 'react';
import { SparkleIcon, SpinnerIcon } from '../../../icons';
import type { DuiSize, DuiRadius, DuiWidth, DuiFontStyle } from '../../core/DuiTypes';
import { useButtonBase } from '../../core/ButtonBase';
import { useDui, resolveBorderRadius } from '../../core/DuiContext';
import './AIButtonView.css';

export type AIButtonAction = 'generate' | 'fuzz' | 'explain' | 'fix' | 'ask' | 'suggest';

export interface AIButtonViewProps {
  action?: AIButtonAction;
  label?: string;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Falls back to DuiProvider size when omitted. */
  size?: DuiSize;
  /** Shorthand for size="sm" — kept for backwards compat. */
  compact?: boolean;
  accentColor?: string;
  className?: string;
  // ─── DUI container props ───────────────────────────────────────────────────
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  color?: string;
  fontStyle?: DuiFontStyle;
}

const ACTION_LABEL: Record<AIButtonAction, string> = {
  generate: 'Generate',
  fuzz:     'Fuzz',
  explain:  'Explain',
  fix:      'Fix',
  ask:      'Ask AI',
  suggest:  'Suggest',
};

export function AIButtonView({
  action = 'ask',
  label,
  onClick,
  loading = false,
  disabled = false,
  size,
  compact = false,
  accentColor,
  className = '',
  width,
  borderRadius,
  color,
  fontStyle,
}: AIButtonViewProps) {
  const ctx = useDui();
  // `compact` maps to 'sm'; explicit `size` wins over compact
  const resolvedSize: DuiSize | undefined = size ?? (compact ? 'sm' : undefined);
  const base = useButtonBase(resolvedSize, { width, borderRadius, color, fontStyle });
  const accent = accentColor || ctx.defaultColor || 'var(--color-protocol-ai)';
  const displayLabel = label ?? ACTION_LABEL[action];
  const resolvedRadius = resolveBorderRadius(borderRadius ?? ctx.borderRadius, '5px');

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`dui_ai-button ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: base.gap,
        height: base.height,
        width: base.width !== 'auto' ? base.width : undefined,
        paddingLeft: base.paddingX,
        paddingRight: base.paddingX,
        borderRadius: resolvedRadius,
        border: accentColor ? `1px solid color-mix(in srgb, ${accentColor} 35%, transparent)` : '1px solid var(--color-aibtn-border)',
        background: accentColor ? `color-mix(in srgb, ${accentColor} 10%, transparent)` : 'var(--color-aibtn-bg)',
        color: base.color || (accentColor ? accentColor : 'var(--color-aibtn-text)'),
        fontSize: base.fontSize,
        fontWeight: 600,
        fontStyle: base.fontStyle,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        letterSpacing: '0.01em',
        fontFamily: 'inherit',
        '--dui-aibtn-hover-bg': accentColor
          ? `color-mix(in srgb, ${accentColor} 18%, transparent)`
          : 'var(--color-aibtn-bg-hover)',
        '--dui-aibtn-hover-border': accentColor
          ? `color-mix(in srgb, ${accentColor} 55%, transparent)`
          : 'color-mix(in srgb, var(--color-aibtn-text) 55%, transparent)',
      } as CSSProperties}
    >
      {loading
        ? <SpinnerIcon size={base.iconSize} style={{ flexShrink: 0 }} />
        : <SparkleIcon size={base.iconSize} style={{ flexShrink: 0 }} />
      }
      {loading ? 'Thinking…' : displayLabel}
    </button>
  );
}
