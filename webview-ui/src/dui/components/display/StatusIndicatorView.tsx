export type StatusState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
export type StatusSize = 'sm' | 'md' | 'lg';

export interface StatusIndicatorViewProps {
  status: StatusState;
  label?: string;
  showLabel?: boolean;
  size?: StatusSize;
  className?: string;
}

const STATUS_COLOR: Record<StatusState, string> = {
  idle:         'var(--color-text-muted)',
  connecting:   'var(--color-warning)',
  connected:    'var(--color-success)',
  disconnected: 'var(--color-text-muted)',
  error:        'var(--color-error)',
};

const STATUS_LABEL: Record<StatusState, string> = {
  idle:         'Idle',
  connecting:   'Connecting',
  connected:    'Connected',
  disconnected: 'Disconnected',
  error:        'Error',
};

const DOT_SIZE: Record<StatusSize, number> = { sm: 6, md: 8, lg: 10 };
const FONT_SIZE: Record<StatusSize, string> = { sm: '10px', md: '11px', lg: '12px' };

export function StatusIndicatorView({
  status,
  label,
  showLabel = true,
  size = 'md',
  className = '',
}: StatusIndicatorViewProps) {
  const color = STATUS_COLOR[status];
  const dot = DOT_SIZE[size];
  const font = FONT_SIZE[size];
  const displayLabel = label ?? STATUS_LABEL[status];
  const isPulsing = status === 'connecting' || status === 'connected';

  return (
    <div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: size === 'sm' ? '5px' : '6px' }}
    >
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {/* Pulse ring — only when connecting/connected */}
        {isPulsing && (
          <span
            className="animate-ping"
            style={{
              position: 'absolute',
              width: dot + 4,
              height: dot + 4,
              borderRadius: '50%',
              background: color,
              opacity: 0.35,
            }}
          />
        )}
        {/* Dot */}
        <span style={{ width: dot, height: dot, borderRadius: '50%', background: color, flexShrink: 0, position: 'relative' }} />
      </span>
      {showLabel && (
        <span style={{ fontSize: font, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          {displayLabel}
        </span>
      )}
    </div>
  );
}
