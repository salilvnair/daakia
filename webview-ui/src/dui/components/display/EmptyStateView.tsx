export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateViewProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: EmptyStateAction;
  accentColor?: string;
  compact?: boolean;
  className?: string;
}

export function EmptyStateView({
  icon,
  title,
  message,
  action,
  accentColor,
  compact = false,
  className = '',
}: EmptyStateViewProps) {
  const accent = accentColor || 'var(--color-primary)';

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? '20px 16px' : '40px 24px',
        gap: compact ? '8px' : '12px',
        textAlign: 'center',
        width: '100%',
      }}
    >
      {icon && (
        <div style={{
          color: 'var(--color-text-muted)',
          opacity: 0.5,
          marginBottom: compact ? 0 : '4px',
        }}>
          {icon}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '4px' : '6px' }}>
        <span style={{
          fontSize: compact ? '12px' : '13px',
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
        }}>
          {title}
        </span>
        {message && (
          <span style={{
            fontSize: compact ? '11px' : '12px',
            color: 'var(--color-text-muted)',
            lineHeight: 1.5,
            maxWidth: '320px',
          }}>
            {message}
          </span>
        )}
      </div>

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            marginTop: '4px',
            padding: '5px 14px',
            height: '26px',
            fontSize: '11px',
            fontWeight: 500,
            borderRadius: '5px',
            border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`,
            background: `color-mix(in srgb, ${accent} 10%, transparent)`,
            color: accent,
            cursor: 'pointer',
            transition: 'background 120ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = `color-mix(in srgb, ${accent} 18%, transparent)`)}
          onMouseLeave={e => (e.currentTarget.style.background = `color-mix(in srgb, ${accent} 10%, transparent)`)}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
