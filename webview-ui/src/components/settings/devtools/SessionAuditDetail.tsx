/**
 * Rendering for a realtime session audit record.
 *
 * A session answers different questions from a request — not "what came back"
 * but "did it connect, for how long, how much moved each way, and why did it
 * end" — so it gets its own layout rather than being forced into the request
 * one. Outcome first, then traffic, because a session that carried nothing is
 * the common complaint and should be visible without scrolling.
 */
import type { ReactNode } from 'react';

export interface SessionAuditRecord {
  kind: 'session';
  protocol: string;
  connection: {
    protocol: string;
    url: string;
    details: Record<string, string>;
    openedAt?: string;
    neverOpened: boolean;
  };
  outcome: { state: 'closed' | 'failed' | 'abandoned'; summary: string; code?: string; reason?: string; errors?: string[] };
  traffic: {
    received: number; sent: number;
    bytesReceived: number; bytesSent: number;
    channels?: Record<string, number>;
    idleMs?: number;
  };
  duration: { totalMs: number; connectedMs?: number; humanized: string };
  routing: { proxied: boolean; route: string; warning?: string };
  settings: Record<string, unknown>;
}

const bytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

const OUTCOME: Record<string, { label: string; color: string }> = {
  closed:    { label: 'CLOSED',    color: 'var(--color-method-get)' },
  failed:    { label: 'FAILED',    color: 'var(--color-error)' },
  abandoned: { label: 'LEFT OPEN', color: 'var(--color-warning)' },
};

function Field({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[10.5px] font-mono" style={{ color: color ?? 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );
}

function Section({ title, children, accent }: { title: string; children: ReactNode; accent?: string }) {
  return (
    <div className="flex flex-col gap-1.5 p-2.5 rounded-md"
         style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
                  borderLeft: `2px solid ${accent ?? 'var(--color-surface-border)'}` }}>
      <span className="text-[9.5px] font-semibold uppercase tracking-wider"
            style={{ color: accent ?? 'var(--color-text-muted)' }}>{title}</span>
      {children}
    </div>
  );
}

/** A bar showing which way the traffic actually went. */
function Flow({ received, sent }: { received: number; sent: number }) {
  const total = received + sent;
  if (total === 0) {
    return (
      <p className="text-[10.5px] m-0" style={{ color: 'var(--color-warning)' }}>
        No messages in either direction.
      </p>
    );
  }
  const inPct = (received / total) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-1.5 rounded overflow-hidden" style={{ background: 'var(--color-surface-hover)' }}>
        <div style={{ width: `${inPct}%`, background: 'var(--color-method-get)' }} />
        <div style={{ width: `${100 - inPct}%`, background: 'var(--color-method-post)' }} />
      </div>
      <div className="flex gap-3 text-[10px] font-mono">
        <span style={{ color: 'var(--color-method-get)' }}>↓ {received} received</span>
        <span style={{ color: 'var(--color-method-post)' }}>↑ {sent} sent</span>
      </div>
    </div>
  );
}

export function SessionAuditDetail({ record }: { record: SessionAuditRecord }) {
  const { connection: conn, outcome, traffic, duration, routing, settings } = record;
  const state = OUTCOME[outcome.state] ?? OUTCOME.closed;
  const channels = Object.entries(traffic.channels ?? {});

  return (
    <div className="flex flex-col gap-2">
      {/* What happened, before how */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{ color: 'var(--color-text-secondary)', background: 'var(--color-surface-hover)' }}>
          {conn.protocol}
        </span>
        <span className="text-[11px] font-mono text-[var(--color-text-primary)] break-all flex-1" style={{ minWidth: 200 }}>
          {conn.url}
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded font-mono"
              style={{ color: state.color, background: `color-mix(in srgb, ${state.color} 12%, transparent)` }}>
          {state.label}
        </span>
        <span className="text-[10.5px] font-mono text-[var(--color-text-muted)]">
          {duration.humanized}
        </span>
      </div>

      <Section title="Outcome" accent={outcome.state === 'closed' ? undefined : state.color}>
        <div className="flex gap-x-4 gap-y-0.5 flex-wrap">
          <Field label="result" value={outcome.summary} color={outcome.state === 'closed' ? undefined : state.color} />
          {outcome.code && <Field label="close code" value={outcome.code} />}
          {outcome.reason && <Field label="reason" value={outcome.reason} />}
        </div>
        {conn.neverOpened && (
          <p className="text-[10.5px] m-0" style={{ color: 'var(--color-error)' }}>
            The connection never opened — nothing was sent or received.
          </p>
        )}
        {outcome.errors?.map((e, i) => (
          <p key={i} className="text-[10.5px] m-0 font-mono" style={{ color: 'var(--color-error)' }}>{e}</p>
        ))}
      </Section>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Section title="Traffic">
          <Flow received={traffic.received} sent={traffic.sent} />
          <div className="flex gap-x-4 gap-y-0.5 flex-wrap mt-1">
            <Field label="in" value={bytes(traffic.bytesReceived)} />
            <Field label="out" value={bytes(traffic.bytesSent)} />
            {traffic.idleMs !== undefined && traffic.idleMs > 1000 && (
              <Field label="idle before close" value={`${(traffic.idleMs / 1000).toFixed(1)} s`}
                     color={traffic.idleMs > 30_000 ? 'var(--color-warning)' : undefined} />
            )}
          </div>
          {/* Message contents are not recorded — see services/session-audit.ts */}
          <p className="text-[9.5px] m-0 text-[var(--color-text-muted)]">
            Counts and sizes only; message contents are not stored.
          </p>
        </Section>

        <Section title="Connection">
          <div className="flex flex-col gap-0.5">
            {Object.entries(conn.details).map(([k, v]) => <Field key={k} label={k} value={v} />)}
            {conn.openedAt && <Field label="opened" value={new Date(conn.openedAt).toLocaleTimeString()} />}
            {duration.connectedMs !== undefined && <Field label="connected for" value={`${(duration.connectedMs / 1000).toFixed(1)} s`} />}
          </div>
        </Section>
      </div>

      {channels.length > 0 && (
        <Section title={conn.protocol === 'mqtt' ? `Topics · ${channels.length}` : `Events · ${channels.length}`}>
          <div className="flex flex-col gap-0.5">
            {channels.map(([name, count]) => (
              <div key={name} className="flex gap-2 text-[10.5px] font-mono">
                <span className="text-[var(--color-text-primary)] break-all flex-1">{name}</span>
                <span className="text-[var(--color-text-muted)]">{count}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Section title="Routing" accent={routing.proxied ? 'var(--color-warning)' : undefined}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono"
                  style={{
                    color: routing.proxied ? 'var(--color-warning)' : 'var(--color-text-muted)',
                    background: routing.proxied
                      ? 'color-mix(in srgb, var(--color-warning) 15%, transparent)'
                      : 'color-mix(in srgb, var(--color-text-muted) 12%, transparent)',
                  }}>
              {routing.proxied ? 'PROXIED' : 'DIRECT'}
            </span>
            <span className="text-[10.5px] font-mono text-[var(--color-text-secondary)]">{routing.route}</span>
          </div>
          {routing.warning && (
            <p className="text-[10.5px] m-0" style={{ color: 'var(--color-text-muted)' }}>{routing.warning}</p>
          )}
        </Section>

        <Section title="Settings in force">
          <div className="flex flex-col gap-0.5">
            <Field label="ssl verification" value={String(settings.sslVerification ?? '—')}
                   color={settings.sslVerification === false ? 'var(--color-warning)' : undefined} />
            <Field label="save to history" value={String(settings.saveResponseInHistory ?? '—')} />
          </div>
        </Section>
      </div>
    </div>
  );
}

/** Recognise a session record, so request rows and old thin rows are untouched. */
export function parseSessionAudit(metadata: string | undefined): SessionAuditRecord | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    return parsed?.kind === 'session' && parsed?.connection && parsed?.traffic
      ? parsed as SessionAuditRecord
      : null;
  } catch {
    return null;
  }
}
