import './StageView.css';

/**
 * StageView — stage status indicators for multi-step processes.
 *
 * Three variants:
 *   StageCheck  — completed step (green check ring, static)
 *   StageSpin   — active / in-progress step (rotating spinner ring)
 *   StagePulse  — pending / waiting step (pulsing dot, draws attention without spinning)
 *
 * All three accept the same base props for consistency.
 */

export interface StageViewBaseProps {
  /** Step label shown to the right of the indicator */
  label?: string;
  /** Sub-label / description shown below label */
  sublabel?: string;
  /** Override accent color */
  color?: string;
  /** Ring / icon size in px (default 20) */
  size?: number;
  /** Text size in px (default 12) */
  textSize?: number;
  className?: string;
}

// ─── StageCheck ───────────────────────────────────────────────────────────────

export function StageCheck({ label, sublabel, color, size = 20, textSize = 12, className = '' }: StageViewBaseProps) {
  const c = color ?? 'var(--color-stage-check)';
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const strokeW = size <= 16 ? 1.5 : 2;
  const checkScale = size / 20;

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx={cx} cy={cy} r={r} stroke={c} strokeWidth={strokeW} fill={`color-mix(in srgb, ${c} 10%, transparent)`} />
        {/* checkmark */}
        <path
          d={`M ${cx - 4 * checkScale} ${cy} l ${2.5 * checkScale} ${2.5 * checkScale} l ${5 * checkScale} ${-5 * checkScale}`}
          stroke={c}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {(label || sublabel) && (
        <div>
          {label && <div style={{ fontSize: textSize, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.35 }}>{label}</div>}
          {sublabel && <div style={{ fontSize: textSize - 1, color: 'var(--color-text-muted)', marginTop: 1, lineHeight: 1.3 }}>{sublabel}</div>}
        </div>
      )}
    </div>
  );
}

// ─── StageSpin ────────────────────────────────────────────────────────────────

export function StageSpin({ label, sublabel, color, size = 20, textSize = 12, className = '' }: StageViewBaseProps) {
  const c = color ?? 'var(--color-stage-spin)';
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const strokeW = size <= 16 ? 1.5 : 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        style={{ flexShrink: 0, marginTop: 1, animation: 'dui_stage-spin 0.9s linear infinite', transformOrigin: 'center' }}
      >
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} stroke={`color-mix(in srgb, ${c} 20%, transparent)`} strokeWidth={strokeW} />
        {/* Arc — 270° visible */}
        <circle
          cx={cx} cy={cy} r={r}
          stroke={c}
          strokeWidth={strokeW}
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeLinecap="round"
          style={{ transformOrigin: 'center' }}
        />
      </svg>
      {(label || sublabel) && (
        <div>
          {label && <div style={{ fontSize: textSize, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.35 }}>{label}</div>}
          {sublabel && <div style={{ fontSize: textSize - 1, color: 'var(--color-text-muted)', marginTop: 1, lineHeight: 1.3 }}>{sublabel}</div>}
        </div>
      )}
    </div>
  );
}

// ─── StagePulse ───────────────────────────────────────────────────────────────

export function StagePulse({ label, sublabel, color, size = 20, textSize = 12, className = '' }: StageViewBaseProps) {
  const c = color ?? 'var(--color-stage-pulse)';
  const cx = size / 2;
  const cy = size / 2;
  const dotR = size / 2 - 6;
  const ringR = size / 2 - 2;
  const strokeW = size <= 16 ? 1.5 : 2;

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ flexShrink: 0, marginTop: 1, overflow: 'visible' }}>
        {/* Outer ring — pulses */}
        <circle
          cx={cx} cy={cy} r={ringR}
          stroke={c}
          strokeWidth={strokeW}
          fill="none"
          opacity={0.25}
          style={{ animation: 'dui_stage-pulse-ring 1.6s ease-out infinite' }}
        />
        {/* Inner dot */}
        <circle
          cx={cx} cy={cy} r={dotR}
          fill={c}
          style={{ animation: 'dui_stage-pulse-dot 1.6s ease-out infinite' }}
        />
      </svg>
      {(label || sublabel) && (
        <div>
          {label && <div style={{ fontSize: textSize, fontWeight: 500, color: 'var(--color-text-muted)', lineHeight: 1.35 }}>{label}</div>}
          {sublabel && <div style={{ fontSize: textSize - 1, color: 'var(--color-text-muted)', marginTop: 1, lineHeight: 1.3 }}>{sublabel}</div>}
        </div>
      )}
    </div>
  );
}
