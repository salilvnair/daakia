import { SparkleIcon, SpinnerIcon } from '../../../icons';

export type AIButtonAction = 'generate' | 'fuzz' | 'explain' | 'fix' | 'ask' | 'suggest';

export interface AIButtonViewProps {
  action?: AIButtonAction;
  label?: string;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  accentColor?: string;
  className?: string;
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
  compact = false,
  accentColor,
  className = '',
}: AIButtonViewProps) {
  const accent = accentColor || 'var(--color-protocol-ai)';
  const displayLabel = label ?? ACTION_LABEL[action];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? '3px' : '5px',
        height: compact ? '22px' : '26px',
        padding: compact ? '0 8px' : '0 10px',
        borderRadius: '5px',
        border: accentColor ? `1px solid color-mix(in srgb, ${accentColor} 35%, transparent)` : '1px solid var(--color-aibtn-border)',
        background: accentColor ? `color-mix(in srgb, ${accentColor} 10%, transparent)` : 'var(--color-aibtn-bg)',
        color: accentColor ? accentColor : 'var(--color-aibtn-text)',
        fontSize: compact ? '10px' : '11px',
        fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 120ms, border-color 120ms',
        letterSpacing: '0.01em',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        if (!disabled && !loading) {
          (e.currentTarget as HTMLElement).style.background = accentColor
            ? `color-mix(in srgb, ${accentColor} 18%, transparent)`
            : 'var(--color-aibtn-bg-hover)';
          (e.currentTarget as HTMLElement).style.borderColor = accentColor
            ? `color-mix(in srgb, ${accentColor} 55%, transparent)`
            : 'color-mix(in srgb, var(--color-aibtn-text) 55%, transparent)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = accentColor
          ? `color-mix(in srgb, ${accentColor} 10%, transparent)`
          : 'var(--color-aibtn-bg)';
        (e.currentTarget as HTMLElement).style.borderColor = accentColor
          ? `color-mix(in srgb, ${accentColor} 35%, transparent)`
          : 'var(--color-aibtn-border)';
      }}
    >
      {loading
        ? <SpinnerIcon size={compact ? 10 : 12} style={{ flexShrink: 0 }} />
        : <SparkleIcon size={compact ? 10 : 12} style={{ flexShrink: 0 }} />
      }
      {loading ? 'Thinking…' : displayLabel}
    </button>
  );
}
