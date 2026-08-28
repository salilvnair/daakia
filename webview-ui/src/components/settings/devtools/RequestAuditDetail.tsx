/**
 * Rich rendering for a request audit record.
 *
 * A `rest.send` row now carries the whole request — headers, body, response,
 * routing, and the settings in force — so dumping it as raw JSON would bury the
 * thing the reader came for. This lays it out: outcome first, then routing,
 * then the request and response side by side.
 *
 * Credential-shaped header values are masked on screen by default. The values
 * are stored in full — this is a local diagnostic log on your own machine, and
 * a masked audit log that cannot show you the Authorization header you are
 * debugging is useless — but they are hidden until asked for, so a screenshot
 * of this panel does not leak a token.
 */
import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from '../../../icons';

export interface RequestAuditRecord {
  request: {
    method: string; url: string;
    queryParams?: Record<string, string>;
    authType?: string; bodyMode?: string;
    headers: Record<string, string>; headerCount: number;
    body?: string; bodyBytes?: number; bodyTruncated?: boolean;
  };
  response: {
    status: number; statusText: string;
    headers: Record<string, string>; headerCount: number;
    body?: string; bodyBytes?: number; bodyTruncated?: boolean;
    contentType?: string; sizeBytes?: number; durationMs?: number;
    cookieCount?: number;
    timing?: { name: string; startMs: number; durationMs: number }[];
  };
  routing: { proxied: boolean; route: string; warning?: string };
  settings: Record<string, unknown>;
  scripts?: { preRequest: boolean; postResponse: boolean; testsPassed: number; testsFailed: number };
}

/** Header names whose value is a credential rather than something to read. */
const SENSITIVE = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|apikey|x-auth-token|x-access-token|x-csrf-token)$/i;

const statusColor = (s: number) =>
  s === 0 ? 'var(--color-error)'
  : s < 300 ? 'var(--color-method-get)'
  : s < 400 ? 'var(--color-warning)'
  : 'var(--color-error)';

const bytes = (n?: number) =>
  n === undefined ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

function Field({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[10.5px] font-mono" style={{ color: color ?? 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );
}

function HeaderTable({ headers, reveal }: { headers: Record<string, string>; reveal: boolean }) {
  const entries = Object.entries(headers);
  if (!entries.length) return <p className="text-[10.5px] text-[var(--color-text-muted)] m-0">none</p>;
  return (
    <div className="flex flex-col">
      {entries.map(([k, v]) => {
        const masked = !reveal && SENSITIVE.test(k);
        return (
          <div key={k} className="flex gap-2 text-[10.5px] font-mono py-[1px]">
            <span className="text-[var(--color-text-muted)] flex-shrink-0" style={{ minWidth: 150 }}>{k}</span>
            <span className="break-all" style={{ color: masked ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
              {masked ? `•••••••• (${v.length} chars — click the eye to reveal)` : v}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Body({ label, body, truncated, size }: { label: string; body?: string; truncated?: boolean; size?: number }) {
  const [open, setOpen] = useState(false);
  if (!body) return null;
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={() => setOpen(o => !o)}
              className="flex items-center gap-2 cursor-pointer text-left"
              style={{ background: 'none', border: 'none', padding: 0 }}>
        <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
          {open ? '▾' : '▸'} {label}
        </span>
        <span className="text-[9.5px] font-mono text-[var(--color-text-muted)]">
          {bytes(size)}{truncated ? ' · truncated' : ''}
        </span>
      </button>
      {open && (
        <pre className="m-0 p-2 rounded text-[10px] font-mono overflow-auto"
             style={{ maxHeight: 260, background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
          {body}
        </pre>
      )}
    </div>
  );
}

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
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

export function RequestAuditDetail({ record }: { record: RequestAuditRecord }) {
  const [reveal, setReveal] = useState(false);
  const { request: req, response: res, routing, settings, scripts } = record;

  return (
    <div className="flex flex-col gap-2">
      {/* Outcome first — what happened, before how */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded font-mono"
              style={{ color: 'var(--color-method-get)', background: 'color-mix(in srgb, var(--color-method-get) 12%, transparent)' }}>
          {req.method}
        </span>
        <span className="text-[11px] font-mono text-[var(--color-text-primary)] break-all flex-1" style={{ minWidth: 200 }}>
          {req.url}
        </span>
        <span className="text-[11px] font-mono font-semibold" style={{ color: statusColor(res.status) }}>
          {res.status || 'ERR'} {res.statusText}
        </span>
        <span className="text-[10.5px] font-mono text-[var(--color-text-muted)]">
          {res.durationMs ?? 0} ms · {bytes(res.sizeBytes)}
        </span>
        <button type="button" onClick={() => setReveal(r => !r)}
                title={reveal ? 'Hide credential values' : 'Reveal credential values'}
                className="cursor-pointer flex items-center gap-1 text-[10px]"
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)' }}>
          {reveal ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
          {reveal ? 'hide secrets' : 'reveal secrets'}
        </button>
      </div>

      {/* Routing — the question that prompted all this */}
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
          <p className="text-[10.5px] m-0" style={{ color: 'var(--color-warning)' }}>{routing.warning}</p>
        )}
      </Section>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Section title={`Request · ${req.headerCount} headers`}>
          <div className="flex gap-3 flex-wrap mb-1">
            {req.authType && <Field label="auth" value={req.authType} />}
            {req.bodyMode && <Field label="body" value={req.bodyMode} />}
          </div>
          {req.queryParams && (
            <>
              <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">Query</span>
              <HeaderTable headers={req.queryParams} reveal={reveal} />
            </>
          )}
          <HeaderTable headers={req.headers} reveal={reveal} />
          <Body label="Request body" body={req.body} truncated={req.bodyTruncated} size={req.bodyBytes} />
        </Section>

        <Section title={`Response · ${res.headerCount} headers`}>
          <div className="flex gap-3 flex-wrap mb-1">
            <Field label="type" value={res.contentType ?? '—'} />
            {res.cookieCount ? <Field label="cookies" value={res.cookieCount} /> : null}
          </div>
          <HeaderTable headers={res.headers} reveal={reveal} />
          <Body label="Response body" body={res.body} truncated={res.bodyTruncated} size={res.bodyBytes} />
        </Section>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Section title="Settings in force">
          <div className="flex flex-col gap-0.5">
            <Field label="follow redirects" value={String(settings.followRedirects ?? '—')} />
            <Field label="ssl verification" value={String(settings.sslVerification ?? '—')}
                   color={settings.sslVerification === false ? 'var(--color-warning)' : undefined} />
            <Field label="timeout" value={settings.timeoutMs ? `${settings.timeoutMs} ms` : 'none'} />
            <Field label="save to history" value={String(settings.saveResponseInHistory ?? '—')} />
          </div>
        </Section>

        {res.timing && res.timing.length > 0 && (
          <Section title="Timing">
            <div className="flex flex-col gap-0.5">
              {res.timing.map(t => <Field key={t.name} label={t.name} value={`${t.durationMs} ms`} />)}
            </div>
          </Section>
        )}

        {scripts && (scripts.preRequest || scripts.postResponse || scripts.testsPassed || scripts.testsFailed) && (
          <Section title="Scripts">
            <div className="flex flex-col gap-0.5">
              <Field label="pre-request" value={scripts.preRequest ? 'ran' : 'none'} />
              <Field label="post-response" value={scripts.postResponse ? 'ran' : 'none'} />
              <Field label="tests" value={`${scripts.testsPassed} passed, ${scripts.testsFailed} failed`}
                     color={scripts.testsFailed > 0 ? 'var(--color-error)' : undefined} />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

/** Recognise a full request record, so older thin rows still render as JSON. */
export function parseRequestAudit(metadata: string | undefined): RequestAuditRecord | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    return parsed?.request?.method && parsed?.response && parsed?.routing ? parsed as RequestAuditRecord : null;
  } catch {
    return null;
  }
}
