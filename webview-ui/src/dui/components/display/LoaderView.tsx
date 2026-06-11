export type LoaderVariant = 'spinner' | 'dots' | 'skeleton' | 'pulse' | 'progress-bar';
export type LoaderSize = 'sm' | 'md' | 'lg';

export interface LoaderViewProps {
  variant?: LoaderVariant;
  size?: LoaderSize;
  accentColor?: string;
  label?: string;
  fullscreen?: boolean;
  progress?: number; // 0–100 for progress-bar only
  className?: string;
}

const SPINNER_SIZE: Record<LoaderSize, number> = { sm: 16, md: 24, lg: 36 };
const LABEL_SIZE: Record<LoaderSize, string> = { sm: '10px', md: '11px', lg: '12px' };

function Spinner({ size, accent }: { size: LoaderSize; accent: string }) {
  const s = SPINNER_SIZE[size];
  return (
    <span
      className="animate-spin"
      style={{
        display: 'inline-block',
        width: s,
        height: s,
        borderRadius: '50%',
        border: `2px solid color-mix(in srgb, ${accent} 20%, transparent)`,
        borderTopColor: accent,
        flexShrink: 0,
      }}
    />
  );
}

function Dots({ size, accent }: { size: LoaderSize; accent: string }) {
  const d = size === 'sm' ? 6 : size === 'md' ? 8 : 10;
  return (
    <div style={{ display: 'flex', gap: d / 2, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="animate-bounce"
          style={{
            display: 'inline-block',
            width: d,
            height: d,
            borderRadius: '50%',
            background: accent,
            animationDelay: `${i * 120}ms`,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

function Skeleton({ size }: { size: LoaderSize }) {
  const heights = size === 'sm' ? [10, 10, 6] : size === 'md' ? [12, 12, 8] : [14, 14, 10];
  const widths = ['100%', '80%', '60%'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: heights[0] * 0.75, width: '100%' }}>
      {heights.map((h, i) => (
        <span
          key={i}
          className="animate-pulse"
          style={{
            display: 'block',
            height: h,
            width: widths[i],
            borderRadius: 4,
            background: 'var(--color-loader-track)',
          }}
        />
      ))}
    </div>
  );
}

function Pulse({ size, accent }: { size: LoaderSize; accent: string }) {
  const s = SPINNER_SIZE[size];
  return (
    <span
      className="animate-pulse"
      style={{
        display: 'inline-block',
        width: s,
        height: s,
        borderRadius: '50%',
        background: `color-mix(in srgb, ${accent} 40%, transparent)`,
        flexShrink: 0,
      }}
    />
  );
}

function ProgressBar({ size, accent, progress = 0 }: { size: LoaderSize; accent: string; progress?: number }) {
  const h = size === 'sm' ? 3 : size === 'md' ? 4 : 6;
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div style={{
      width: '100%',
      height: h,
      borderRadius: 999,
      background: `color-mix(in srgb, ${accent} 15%, transparent)`,
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        borderRadius: 999,
        background: accent,
        transition: 'width 300ms ease',
      }} />
    </div>
  );
}

export function LoaderView({
  variant = 'spinner',
  size = 'md',
  accentColor,
  label,
  fullscreen = false,
  progress,
  className = '',
}: LoaderViewProps) {
  const accent = accentColor || 'var(--color-loader-accent)';

  const inner = (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: variant === 'progress-bar' ? 'column' : 'row',
        alignItems: 'center',
        gap: '8px',
        width: variant === 'skeleton' || variant === 'progress-bar' ? '100%' : 'auto',
      }}
    >
      {variant === 'spinner'      && <Spinner size={size} accent={accent} />}
      {variant === 'dots'         && <Dots size={size} accent={accent} />}
      {variant === 'skeleton'     && <Skeleton size={size} />}
      {variant === 'pulse'        && <Pulse size={size} accent={accent} />}
      {variant === 'progress-bar' && <ProgressBar size={size} accent={accent} progress={progress} />}
      {label && variant !== 'skeleton' && (
        <span style={{ fontSize: LABEL_SIZE[size], color: 'var(--color-text-muted)' }}>{label}</span>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)', zIndex: 900,
      }}>
        {inner}
      </div>
    );
  }

  return inner;
}
