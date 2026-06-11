export type StatsTrend = 'up' | 'down' | 'neutral';

export interface StatsCardViewProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: React.ReactNode;
  unit?: string;
  trend?: StatsTrend;
  trendValue?: string;
  accentColor?: string;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function StatsCardView({
  label,
  value,
  subValue,
  icon,
  unit,
  trend,
  trendValue,
  accentColor,
  compact = false,
  className = '',
  style,
}: StatsCardViewProps) {
  const accent = accentColor || 'var(--color-primary)';
  const trendColor = trend === 'up' ? 'var(--color-statscard-trend-up)' : trend === 'down' ? 'var(--color-statscard-trend-down)' : 'var(--color-text-muted)';
  const trendChar = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  return (
    <div
      className={className}
      style={{
        background: accentColor ? `color-mix(in srgb, ${accentColor} 8%, var(--color-surface))` : 'var(--color-statscard-bg)',
        border: accentColor ? `1px solid color-mix(in srgb, ${accentColor} 20%, transparent)` : '1px solid var(--color-statscard-border)',
        borderRadius: '8px',
        padding: compact ? '10px 12px' : '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? '4px' : '6px',
        minWidth: compact ? 100 : 130,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        {icon && (
          <span style={{ color: accent, opacity: 0.7 }}>{icon}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: compact ? '18px' : '22px', fontWeight: 700, color: accent, lineHeight: 1 }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 500 }}>{unit}</span>
        )}
      </div>

      {(subValue || (trend && trendValue)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {subValue && (
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{subValue}</span>
          )}
          {trend && trendValue && (
            <span style={{ fontSize: '10px', color: trendColor, fontWeight: 600 }}>
              {trendChar} {trendValue}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
