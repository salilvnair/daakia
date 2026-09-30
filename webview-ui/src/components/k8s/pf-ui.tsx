/**
 * The port-forwarding screens' own small parts, drawn to the plan's mocks:
 * 24px buttons (plain, dk8s, stop), the state pill, the role chip, the
 * section heading with its rule, and the ticked line the dialogs use.
 * One file so the Ports tab, the dialogs and the Forwards panel cannot drift.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { PortRole } from '../../store/dk8s-port-forward-store';

export const PF = {
  dk: 'var(--color-dk8s)',
  ok: 'var(--color-success)',
  er: 'var(--color-error)',
  wa: 'var(--color-warning)',
  mu: 'var(--color-text-muted)',
  tx: 'var(--color-text-primary)',
  bd: 'var(--color-surface-border)',
  panel: 'var(--color-panel)',
  el: 'var(--color-elevated, var(--color-surface-hover))',
  well: 'var(--color-input-bg, var(--color-bg, #141414))',
  mono: 'var(--font-mono, "JetBrains Mono", ui-monospace, monospace)',
};
export const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

type Tone = 'plain' | 'dk' | 'stop' | 'solid' | 'danger' | 'ghost';
const TONE: Record<Tone, React.CSSProperties> = {
  plain: { color: PF.tx, background: PF.el, borderColor: PF.bd },
  ghost: { color: PF.tx, background: 'transparent', borderColor: PF.bd },
  dk: { color: PF.dk, background: tint(PF.dk, 12), borderColor: tint(PF.dk, 45), fontWeight: 600 },
  stop: { color: PF.er, background: tint(PF.er, 10), borderColor: tint(PF.er, 40) },
  solid: { color: 'var(--color-dk8s-ink, #0b1a1e)', background: PF.dk, borderColor: 'transparent', fontWeight: 700 },
  danger: { color: '#1b0b0a', background: PF.er, borderColor: 'transparent', fontWeight: 700 },
};

export function PfButton({ tone = 'plain', icon, children, style, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone; icon?: ReactNode;
}) {
  return (
    <button type="button" {...rest}
            className="pf-btn inline-flex items-center shrink-0 cursor-pointer disabled:cursor-not-allowed"
            style={{
              gap: 5, height: 24, padding: '0 10px', borderRadius: 6, border: '1px solid', fontSize: 11.5,
              whiteSpace: 'nowrap', opacity: rest.disabled ? 0.45 : 1, ...TONE[tone], ...style,
            }}>
      {icon}{children}
    </button>
  );
}

export function StatePill({ tone, children }: { tone: 'ok' | 'wa' | 'er' | 'dk' | 'mu'; children: ReactNode }) {
  const c = { ok: PF.ok, wa: PF.wa, er: PF.er, dk: PF.dk, mu: PF.mu }[tone];
  return (
    <span className="shrink-0" style={{ fontSize: 10.5, padding: '1px 8px', borderRadius: 99, whiteSpace: 'nowrap', color: c, background: tint(c, 14) }}>
      {children}
    </span>
  );
}

export const ROLE: Record<Exclude<PortRole, ''>, { label: string; color: string }> = {
  http: { label: 'HTTP API', color: PF.dk },
  actuator: { label: 'actuator', color: PF.ok },
  debug: { label: 'JVM debug', color: 'var(--color-dk8s-loggers, #b995f5)' },
  grpc: { label: 'gRPC', color: PF.dk },
  metrics: { label: 'metrics', color: PF.ok },
  postgres: { label: 'Postgres', color: PF.wa },
  mysql: { label: 'MySQL', color: PF.wa },
  redis: { label: 'Redis', color: PF.wa },
  mongo: { label: 'MongoDB', color: PF.wa },
  kafka: { label: 'Kafka', color: PF.wa },
  amqp: { label: 'AMQP', color: PF.wa },
  mqtt: { label: 'MQTT', color: PF.wa },
};

/** The role a port was guessed to play — or the Service type, in plain grey. */
export function RoleChip({ role, text }: { role?: PortRole; text?: string }) {
  const r = role ? ROLE[role] : undefined;
  const color = r?.color ?? PF.mu;
  return (
    <span className="justify-self-start" style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 4, color, background: r ? tint(color, 14) : PF.el }}>
      {text ?? r?.label ?? 'port'}
    </span>
  );
}

export function PfHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center" style={{ gap: 8, fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: PF.mu }}>
      {children}<span className="flex-1" style={{ height: 1, background: PF.bd }} />
    </div>
  );
}

/** A ticked line in a dialog: a safety that is on, and says so. */
export function PfCheck({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <span aria-hidden style={{ width: 14, height: 14, borderRadius: 3, background: PF.dk, flexShrink: 0, display: 'grid', placeItems: 'center', color: 'var(--color-dk8s-ink, #0b1a1e)', fontSize: 10, fontWeight: 800 }}>✓</span>
      <span>{children}</span>
    </div>
  );
}

export function PfBar({ tone, children }: { tone: 'er' | 'wa'; children: ReactNode }) {
  const c = tone === 'er' ? PF.er : PF.wa;
  return (
    <div style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12, color: PF.tx, background: tint(c, tone === 'er' ? 12 : 11), border: `1px solid ${tint(c, tone === 'er' ? 40 : 38)}` }}>
      {children}
    </div>
  );
}
