/**
 * Bulk URL Tester — check a list of endpoints and see what each one did.
 *
 * ── What this replaces ──
 *
 * The panel used to post a real request per URL, throw the reply away, wait
 * `200 + Math.random() * 300`, and paint `Math.random() > 0.15 ? 200 : 404` as
 * the status. It made traffic and then lied about the outcome. The run happens
 * on the host now (`bulk-handler.ts`) and every cell here is a measurement.
 *
 * It also ran one URL at a time, which makes two hundred URLs a coffee break.
 * There is a concurrency knob.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postMsg } from '../../vscode';
import { ModalView, ButtonView, TextInputView, MultilineInputView } from '@salilvnair/dui';
import { logUiEvent } from '../../store/ui-audit-store';
import { PlayIcon, CopyIcon, SearchIcon } from '../../icons';

type RowState = 'queued' | 'running' | 'done';

interface Row {
  index: number;
  method: string;
  url: string;
  state: RowState;
  status?: number;
  statusText?: string;
  ms?: number;
  bytes?: number;
  redirects?: number;
  contentType?: string;
  error?: string;
}

const ACCENT = 'var(--color-settings)';
const OK = 'var(--color-success)';
const BAD = 'var(--color-error)';
const WARN = 'var(--color-warning)';
const INFO = 'var(--color-info, #38bdf8)';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'];

function toneFor(row: Row): string {
  if (row.error || row.status === 0) return BAD;
  if (row.status == null) return 'var(--color-text-muted)';
  if (row.status < 300) return OK;
  if (row.status < 400) return INFO;
  if (row.status < 500) return WARN;
  return BAD;
}

const fmtBytes = (b?: number) =>
  b == null ? '' : b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(1)} kB` : `${(b / 1024 ** 2).toFixed(1)} MB`;

/** A status as a pill, so a wall of rows can be read by colour first. */
function StatusPill({ row }: { row: Row }) {
  const tone = toneFor(row);
  const text = row.error ? 'ERR' : row.status === 0 ? 'ERR' : row.status != null ? String(row.status) : '···';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
      padding: '2px 7px', borderRadius: 5, color: tone,
      background: `color-mix(in srgb, ${tone} 13%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 30%, transparent)`,
      minWidth: 40, textAlign: 'center', display: 'inline-block',
    }}>{text}</span>
  );
}

/** Response times as a strip, newest last — the shape of a slow tail. */
function TimingStrip({ rows }: { rows: Row[] }) {
  const times = rows.filter(r => r.ms != null).map(r => r.ms!);
  if (times.length < 2) return null;
  const max = Math.max(...times, 1);
  const W = 100;
  return (
    <svg viewBox={`0 0 ${W} 22`} width="100%" height="22" preserveAspectRatio="none" role="img"
      aria-label={`Response times, slowest ${max} milliseconds`}>
      {times.map((t, i) => {
        const h = Math.max(1.5, (t / max) * 20);
        return (
          <rect
            key={i}
            x={(i / times.length) * W}
            width={Math.max(0.6, W / times.length - 0.3)}
            y={21 - h}
            height={h}
            fill={ACCENT}
            fillOpacity={0.35 + 0.65 * (t / max)}
          />
        );
      })}
    </svg>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 650, fontVariantNumeric: 'tabular-nums', color: tone ?? 'var(--color-text-primary)', lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.05em', color: 'var(--color-text-secondary)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 9.5, color: 'var(--color-text-muted)' }}>{hint}</span>}
    </label>
  );
}

interface Props { onClose: () => void }

export function BulkUrlTester({ onClose }: Props) {
  const [input, setInput] = useState('');
  const [method, setMethod] = useState('GET');
  const [headers, setHeaders] = useState('');
  const [concurrency, setConcurrency] = useState(6);
  const [timeoutMs, setTimeoutMs] = useState(10000);
  const [followRedirects, setFollowRedirects] = useState(true);

  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState('');
  const [only, setOnly] = useState<'all' | 'failed'>('all');
  const [copied, setCopied] = useState(false);

  const runIdRef = useRef(0);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (!msg || msg.runId !== runIdRef.current) return;

      if (msg.type === 'bulk:started') {
        setRows(((msg.rows as { index: number; method: string; url: string }[]) ?? [])
          .map(r => ({ ...r, state: 'queued' as RowState })));
      } else if (msg.type === 'bulk:running') {
        setRows(prev => prev.map(r => r.index === msg.index ? { ...r, state: 'running' } : r));
      } else if (msg.type === 'bulk:result') {
        setRows(prev => prev.map(r => r.index === msg.index ? {
          ...r,
          state: 'done',
          status: msg.status as number,
          statusText: msg.statusText as string,
          ms: msg.ms as number,
          bytes: msg.bytes as number,
          redirects: msg.redirects as number,
          contentType: msg.contentType as string,
          error: msg.error as string | undefined,
        } : r));
      } else if (msg.type === 'bulk:done') {
        setRunning(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const lineCount = useMemo(
    () => input.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//')).length,
    [input],
  );

  const run = useCallback(() => {
    if (lineCount === 0) return;
    const runId = Date.now();
    runIdRef.current = runId;
    setRunning(true);
    setRows([]);
    logUiEvent('settings.bulk_run', { count: lineCount, concurrency });
    postMsg({
      type: 'bulk:run',
      runId, urls: input, method, headers, concurrency, timeoutMs, followRedirects,
    });
  }, [input, method, headers, concurrency, timeoutMs, followRedirects, lineCount]);

  const stop = useCallback(() => {
    postMsg({ type: 'bulk:stop', runId: runIdRef.current });
    setRunning(false);
  }, []);

  const done = rows.filter(r => r.state === 'done');
  /* Status 0 means the request never got a response, so it is a failure even
     though 0 < 400 — which is how a refused connection first counted as
     healthy here. */
  const ok = done.filter(r => !r.error && r.status != null && r.status >= 100 && r.status < 400).length;
  const failed = done.length - ok;
  const times = done.filter(r => r.ms != null).map(r => r.ms!);
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const slowest = times.length ? Math.max(...times) : 0;

  const visible = rows.filter(r => {
    if (only === 'failed' && !(r.error || (r.status != null && r.status >= 400) || r.status === 0)) return false;
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return r.url.toLowerCase().includes(q) || String(r.status ?? '').includes(q) || (r.error ?? '').toLowerCase().includes(q);
  });

  /** The results as CSV, which is what a list of checks usually has to become. */
  const copyCsv = useCallback(() => {
    const csv = ['method,url,status,ms,bytes,redirects,content_type,error']
      .concat(done.map(r => [
        r.method, r.url, r.error ? 0 : r.status ?? '', r.ms ?? '', r.bytes ?? '',
        r.redirects ?? 0, r.contentType ?? '', (r.error ?? '').replace(/,/g, ';'),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')))
      .join('\n');
    navigator.clipboard?.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [done]);

  const retryFailed = useCallback(() => {
    const failedUrls = done
      .filter(r => r.error || r.status === 0 || (r.status ?? 0) >= 400)
      .map(r => `${r.method} ${r.url}`)
      .join('\n');
    if (failedUrls) setInput(failedUrls);
  }, [done]);

  return (
    <ModalView
      open
      onClose={onClose}
      size="xxl"
      title="Bulk URL Tester"
      subtitle="Check a list of endpoints — real responses, run in parallel"
      headerColor={ACCENT}
      headerGradient
      footerLeft={
        rows.length > 0 ? (
          <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
            {done.length}/{rows.length} checked
            {failed > 0 && <span style={{ color: BAD }}> · {failed} failing</span>}
          </span>
        ) : undefined
      }
      footerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {done.length > 0 && !running && (
            <>
              {failed > 0 && (
                <ButtonView size="md" variant="secondary" onClick={retryFailed}>Load failures</ButtonView>
              )}
              <ButtonView size="md" variant="secondary" onClick={copyCsv} iconLeft={<CopyIcon size={12} />}>
                {copied ? 'Copied' : 'Copy CSV'}
              </ButtonView>
            </>
          )}
          {running && <ButtonView size="md" variant="secondary" accentColor={BAD} onClick={stop}>Stop</ButtonView>}
          <ButtonView
            size="md" variant="primary" accentColor={ACCENT}
            disabled={running || lineCount === 0}
            onClick={run}
            iconLeft={<PlayIcon size={12} />}
          >
            {running ? 'Checking…' : `Check ${lineCount || ''} URL${lineCount === 1 ? '' : 's'}`}
          </ButtonView>
        </div>
      }
    >
      <div style={{ display: 'flex', gap: 18, minHeight: 440 }}>

        {/* ── Input ─────────────────────────────────────────────────────── */}
        <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="URLS" hint="One per line — prefix a method to override, # to comment out">
            <MultilineInputView
              rows={9}
              placeholder={'https://api.example.com/health\nPOST https://api.example.com/users\n# staging is down this week'}
              value={input}
              onChange={e => setInput((e.target as HTMLTextAreaElement).value)}
              accentColor={ACCENT}
              style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}
            />
          </Field>

          <Field label="DEFAULT METHOD">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {METHODS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  style={{
                    fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                    color: method === m ? ACCENT : 'var(--color-text-muted)',
                    background: method === m ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
                    border: `1px solid ${method === m ? `color-mix(in srgb, ${ACCENT} 40%, transparent)` : 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)'}`,
                  }}
                >{m}</button>
              ))}
            </div>
          </Field>

          <Field label="HEADERS" hint="Applied to every request">
            <MultilineInputView
              rows={3}
              placeholder={'Authorization: Bearer token\nAccept: application/json'}
              value={headers}
              onChange={e => setHeaders((e.target as HTMLTextAreaElement).value)}
              accentColor={ACCENT}
              style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="IN PARALLEL">
              <TextInputView
                size="sm" type="number" value={String(concurrency)} accentColor={ACCENT}
                onChange={e => setConcurrency(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))}
                style={{ width: '100%' }}
              />
            </Field>
            <Field label="TIMEOUT (ms)">
              <TextInputView
                size="sm" type="number" value={String(timeoutMs)} accentColor={ACCENT}
                onChange={e => setTimeoutMs(Math.max(100, Number((e.target as HTMLInputElement).value) || 100))}
                style={{ width: '100%' }}
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={() => setFollowRedirects(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <span style={{
              width: 30, height: 17, borderRadius: 999, position: 'relative', flexShrink: 0,
              background: followRedirects ? ACCENT : 'color-mix(in srgb, var(--color-text-primary) 14%, transparent)',
              transition: 'background .18s',
            }}>
              <span style={{
                position: 'absolute', top: 2.5, left: followRedirects ? 15 : 2.5,
                width: 12, height: 12, borderRadius: 999, background: '#fff', transition: 'left .18s',
              }} />
            </span>
            <span style={{ fontSize: 11, color: followRedirects ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
              Follow redirects
            </span>
          </button>
        </div>

        {/* ── Results ───────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10,
          borderLeft: '1px solid color-mix(in srgb, var(--color-text-primary) 8%, transparent)',
          paddingLeft: 18,
        }}>
          {rows.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 6, textAlign: 'center', padding: 24,
            }}>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>Nothing checked yet</p>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0, maxWidth: 320, lineHeight: 1.6 }}>
                Paste a list and run it. Each row shows the status the server returned, how long it
                took, how much came back, and how many redirects it went through.
              </p>
            </div>
          ) : (
            <>
              <div style={{
                display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 10,
                background: 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-text-primary) 7%, transparent)',
              }}>
                <Stat label="Checked" value={`${done.length}`} />
                <Stat label="Healthy" value={`${ok}`} tone={ok > 0 ? OK : undefined} />
                <Stat label="Failing" value={`${failed}`} tone={failed > 0 ? BAD : undefined} />
                <Stat label="Average" value={avg ? `${avg}ms` : '—'} />
                <Stat label="Slowest" value={slowest ? `${slowest}ms` : '—'} />
              </div>

              <TimingStrip rows={done} />

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <TextInputView
                  size="sm"
                  placeholder="Filter by URL, status or error…"
                  value={filter}
                  onChange={e => setFilter((e.target as HTMLInputElement).value)}
                  iconLeft={<SearchIcon size={12} style={{ color: 'var(--color-text-muted)' }} />}
                  accentColor={ACCENT}
                  style={{ flex: 1 }}
                />
                {(['all', 'failed'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setOnly(v)}
                    style={{
                      fontSize: 10, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                      textTransform: 'capitalize',
                      color: only === v ? ACCENT : 'var(--color-text-muted)',
                      background: only === v ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'transparent',
                      border: `1px solid ${only === v ? `color-mix(in srgb, ${ACCENT} 35%, transparent)` : 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)'}`,
                    }}
                  >{v}</button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {visible.map(r => (
                  <div
                    key={r.index}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '46px 1fr auto auto auto',
                      alignItems: 'center', gap: 10, padding: '7px 4px',
                      borderBottom: '1px solid color-mix(in srgb, var(--color-text-primary) 5%, transparent)',
                      opacity: r.state === 'queued' ? 0.45 : 1,
                    }}
                  >
                    <StatusPill row={r} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--color-text-muted)', flexShrink: 0 }}>{r.method}</span>
                        <span style={{
                          fontSize: 11, color: 'var(--color-text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }} title={r.url}>{r.url}</span>
                      </div>
                      {r.error && <div style={{ fontSize: 10, color: BAD, marginTop: 1 }}>{r.error}</div>}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {r.redirects ? `${r.redirects}↪` : ''}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmtBytes(r.bytes)}
                    </span>
                    <span style={{
                      fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 52, textAlign: 'right',
                      color: r.state === 'running' ? ACCENT : 'var(--color-text-secondary)',
                    }}>
                      {r.state === 'running' ? '···' : r.ms != null ? `${r.ms}ms` : ''}
                    </span>
                  </div>
                ))}
                {visible.length === 0 && (
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: 16, textAlign: 'center' }}>
                    Nothing matches that filter.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </ModalView>
  );
}
