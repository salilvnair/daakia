import { SparkleIcon } from '../../../icons';

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

function LoadingSpinner({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0 }}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="22 6"
      />
    </svg>
  );
}

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
        border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)`,
        background: `color-mix(in srgb, ${accent} 10%, transparent)`,
        color: accent,
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
          (e.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${accent} 18%, transparent)`;
          (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${accent} 55%, transparent)`;
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${accent} 10%, transparent)`;
        (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${accent} 35%, transparent)`;
      }}
    >
      {loading
        ? <LoadingSpinner size={compact ? 10 : 12} />
        : <SparkleIcon size={compact ? 10 : 12} style={{ flexShrink: 0 }} />
      }
      {loading ? 'Thinking…' : displayLabel}
    </button>
  );
}
