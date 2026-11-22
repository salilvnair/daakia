/**
 * Connectivity test — can this pod reach something, and how far does it get?
 *
 * The Python tab's ⋯ menu opens it. The test runs inside the container with
 * its own python (see the host's pod-conn) and reports each step on its own —
 * the name resolved, a connection made, the TLS handshake, what HTTP said — so
 * a failure says where it failed. Three kinds:
 *
 *  - HTTP request: any method, with headers and a body — the POST the service
 *    actually makes, not only a GET of a health page;
 *  - TCP connection: open host:port and close it — a database, a broker, a
 *    cache — optionally shaking hands over TLS;
 *  - DNS lookup: what the pod's resolver says the name is.
 *
 * Each test is remembered as a chip, so the next one is a click.
 */
import { useState } from 'react';
import {
  ButtonView, IconButtonView, ModalView, TextInputView, IconSize, SegmentedControlView, CheckboxView, KeyValueTableView,
  type KeyValueTableRow,
} from '@salilvnair/dui';
import { ChevronRightIcon, CloseIcon, PlayIcon } from '../../../icons';
import {
  testConn, rememberConn, forgetConn, useRecentConn, CONN_METHODS,
  type ConnResult, type ConnTarget, type ConnTest as Test, type ConnStep, type ConnKind,
} from '../../../store/dk8s-conn-store';
import { BulkEditAssist } from '../../shared/controls/BulkEditAssist';
import { ACCENT, BAD, MUTED } from '../tone';

/* Green like every Run and Send in Daakia — the Python tab's own RUN. */
const RUN = 'var(--color-success)';

const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

const KINDS = [
  { value: 'http', label: 'HTTP request' },
  { value: 'tcp', label: 'TCP connection' },
  { value: 'dns', label: 'DNS lookup' },
];

const methodColor = (m: string) => `var(--color-method-${m.toLowerCase()}, ${ACCENT})`;

/** `https://api.example.com/health` → `api.example.com/health`, for a chip. */
function short(t: Test): string {
  const u = t.url.replace(/^https?:\/\//, '');
  return u.length > 38 ? `${u.slice(0, 37)}…` : u;
}

/** What a chip says the test was: `POST`, `TCP`, `DNS` — nothing for a plain GET. */
function badge(t: Test): { text: string; color: string } | null {
  if (t.kind === 'tcp') return { text: t.tls ? 'TLS' : 'TCP', color: 'var(--color-info)' };
  if (t.kind === 'dns') return { text: 'DNS', color: 'var(--color-warning)' };
  if (t.method && t.method !== 'GET') return { text: t.method, color: methodColor(t.method) };
  return null;
}

const rowsOf = (hs?: { key: string; value: string }[]): KeyValueTableRow[] => [
  ...(hs ?? []).map(h => ({ id: crypto.randomUUID(), key: h.key, value: h.value, enabled: true })),
  { id: crypto.randomUUID(), key: '', value: '', enabled: true },
];

export function ConnTestDialog({ target, onClose }: { target: ConnTarget; onClose: () => void }) {
  const recent = useRecentConn();
  const first = recent[0];
  const [kind, setKind] = useState<ConnKind>(first?.kind ?? 'http');
  const [url, setUrl] = useState(first?.url ?? '');
  const [proxy, setProxy] = useState(first?.proxy ?? '');
  const [method, setMethod] = useState(first?.method ?? 'GET');
  const [headers, setHeaders] = useState<KeyValueTableRow[]>(rowsOf(first?.headers));
  const [body, setBody] = useState(first?.body ?? '');
  const [insecure, setInsecure] = useState(!!first?.insecure);
  const [tls, setTls] = useState(!!first?.tls);
  const [showHeaders, setShowHeaders] = useState(!!first?.headers?.length);
  const [showBody, setShowBody] = useState(!!first?.body);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConnResult>();
  const [error, setError] = useState<string>();

  const current = (): Test => ({
    kind, url, proxy, method, body, insecure, tls,
    headers: headers.filter(h => h.enabled && h.key.trim()).map(h => ({ key: h.key, value: h.value })),
  });

  /** A remembered test back in the form, all of it. */
  const load = (t: Test) => {
    setKind(t.kind ?? 'http'); setUrl(t.url); setProxy(t.proxy ?? ''); setMethod(t.method ?? 'GET');
    setHeaders(rowsOf(t.headers)); setBody(t.body ?? ''); setInsecure(!!t.insecure); setTls(!!t.tls);
    setShowHeaders(!!t.headers?.length); setShowBody(!!t.body);
  };

  const go = async (t: Test) => {
    if (!t.url.trim() || busy) return;
    const test: Test = { ...t, url: t.url.trim(), proxy: t.proxy?.trim() };
    /* A JSON body nobody labelled: label it, as every HTTP client would. */
    if ((test.kind ?? 'http') === 'http' && test.body?.trim() && !test.headers?.some(h => h.key.toLowerCase() === 'content-type')) {
      try { JSON.parse(test.body); test.headers = [...(test.headers ?? []), { key: 'Content-Type', value: 'application/json' }]; } catch { /* sent as written */ }
    }
    load(test);
    setBusy(true); setResult(undefined); setError(undefined);
    const r = await testConn(target, test);
    setBusy(false);
    if (r.result) { setResult(r.result); rememberConn(test); } else setError(r.error ?? 'No answer from the pod.');
  };

  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') void go(current()); };
  const https = /^https:/i.test(url.trim());
  const headerCount = headers.filter(h => h.enabled && h.key.trim()).length;

  return (
    <ModalView
      open onClose={onClose} size="lg"
      title="Connectivity test"
      subtitle={`From inside ${target.pod}${target.container ? ` · ${target.container}` : ''}, with its own network and DNS`}
      headerColor={ACCENT}
      footerRight={
        <div style={{ display: 'flex', gap: 8 }}>
          <ButtonView size="md" variant="secondary" onClick={onClose}>Close</ButtonView>
          <ButtonView size="md" variant="secondary" accentColor={RUN} color={RUN}
                      iconLeft={<PlayIcon size={IconSize.action} />}
                      disabled={!url.trim() || busy} onClick={() => void go(current())}>
            {busy ? 'Testing…' : 'Test'}
          </ButtonView>
        </div>
      }
    >
      <div className="flex flex-col" style={{ gap: 12 }}>
        <SegmentedControlView options={KINDS} value={kind} onChange={v => { setKind(v as ConnKind); setResult(undefined); setError(undefined); }}
                              size="sm" accentColor={ACCENT} />

        {kind === 'http' && (
          <>
            <div className="flex flex-wrap" role="radiogroup" aria-label="Method" style={{ gap: 6 }}>
              {CONN_METHODS.map(m => {
                const on = m === method;
                const c = methodColor(m);
                return (
                  <button key={m} type="button" role="radio" aria-checked={on} onClick={() => setMethod(m)}
                          className="cursor-pointer"
                          style={{
                            height: 24, padding: '0 10px', borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700,
                            letterSpacing: '.02em', color: on ? c : MUTED,
                            background: on ? `color-mix(in srgb, ${c} 14%, transparent)` : 'transparent',
                            border: `1px solid ${on ? `color-mix(in srgb, ${c} 45%, transparent)` : 'var(--color-surface-border)'}`,
                          }}>
                    {m}
                  </button>
                );
              })}
            </div>
            <Label text="URL">
              <TextInputView size="sm" value={url} placeholder="https://api.example.com/health"
                             onChange={e => setUrl((e.target as HTMLInputElement).value)}
                             onKeyDown={enter} accentColor={ACCENT} style={{ width: '100%' }} />
            </Label>
            <Label text="Proxy" hint="Optional. Empty uses the pod's own HTTP_PROXY / HTTPS_PROXY, if it has one.">
              <TextInputView size="sm" value={proxy} placeholder="http://proxy.internal:3128"
                             onChange={e => setProxy((e.target as HTMLInputElement).value)}
                             onKeyDown={enter} accentColor={ACCENT} style={{ width: '100%' }} />
            </Label>

            <Disclosure open={showHeaders} onToggle={() => setShowHeaders(o => !o)} text="Headers" count={headerCount}>
              <BulkEditAssist suggest="headers">
                <KeyValueTableView rows={headers} onChange={setHeaders} autocompleteKeys maskSensitive
                                   placeholder={{ key: 'Header', value: 'Value' }} accentColor={ACCENT} size="sm" />
              </BulkEditAssist>
            </Disclosure>
            <Disclosure open={showBody} onToggle={() => setShowBody(o => !o)} text="Body" count={body.trim() ? 1 : 0}
                        hint={method === 'GET' || method === 'HEAD' ? `Sent with ${method} too, if you write one.` : undefined}>
              <textarea value={body} onChange={e => setBody(e.target.value)} spellCheck={false} rows={6}
                        placeholder={'{\n  "id": 42\n}'}
                        aria-label="Request body"
                        style={{
                          width: '100%', resize: 'vertical', padding: '8px 10px', borderRadius: 8, fontFamily: MONO, fontSize: 12,
                          color: 'var(--color-text-primary)', background: 'var(--color-input-bg, transparent)',
                          border: '1px solid var(--color-input-border, var(--color-surface-border))', outline: 'none',
                        }} />
              <span style={{ fontSize: 11, color: MUTED }}>Sent as written. A JSON body with no Content-Type header goes as application/json.</span>
            </Disclosure>
            {https && (
              <CheckboxView size="sm" accentColor={ACCENT} checked={insecure} onChange={setInsecure}
                            label="Skip the TLS certificate check (a self-signed or internal certificate)" />
            )}
          </>
        )}

        {kind === 'tcp' && (
          <>
            <Label text="Host and port" hint="Opens a connection from the pod and closes it again — for anything that does not speak HTTP. A URL works too: redis://cache:6379.">
              <TextInputView size="sm" value={url} placeholder="postgres.db.svc.cluster.local:5432"
                             onChange={e => setUrl((e.target as HTMLInputElement).value)}
                             onKeyDown={enter} accentColor={ACCENT} style={{ width: '100%' }} />
            </Label>
            <CheckboxView size="sm" accentColor={ACCENT} checked={tls} onChange={setTls}
                          label="Then shake hands over TLS, and show the certificate" />
            {tls && (
              <CheckboxView size="sm" accentColor={ACCENT} checked={insecure} onChange={setInsecure}
                            label="Skip the certificate check" />
            )}
          </>
        )}

        {kind === 'dns' && (
          <Label text="Host" hint="Every address the pod's own resolver gives for the name — its search domains and CoreDNS, not yours.">
            <TextInputView size="sm" value={url} placeholder="billing.payments.svc.cluster.local"
                           onChange={e => setUrl((e.target as HTMLInputElement).value)}
                           onKeyDown={enter} accentColor={ACCENT} style={{ width: '100%' }} />
          </Label>
        )}

        {recent.length > 0 && (
          <div className="flex flex-col" style={{ gap: 6 }}>
            <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED }}>Recent</span>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {recent.map(t => {
                const b = badge(t);
                return (
                  <span key={`${t.kind ?? 'http'}|${t.method ?? 'GET'}|${t.url}|${t.proxy ?? ''}`} className="inline-flex items-center"
                        style={{
                          gap: 4, height: 24, padding: '0 4px 0 10px', borderRadius: 999, fontSize: 11.5,
                          border: `1px solid color-mix(in srgb, ${ACCENT} 35%, var(--color-surface-border))`,
                          background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`,
                        }}>
                    <button type="button" disabled={busy} onClick={() => void go(t)}
                            title={`Test ${t.url}${t.proxy ? ` through ${t.proxy}` : ''} again`}
                            className="cursor-pointer border-none bg-transparent p-0"
                            style={{ color: 'var(--color-text-primary)', fontFamily: MONO, fontSize: 11 }}>
                      {short(t)}{t.proxy && <span style={{ color: MUTED }}> · via proxy</span>}
                    </button>
                    {b && <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: b.color, order: -1 }}>{b.text}</span>}
                    <IconButtonView size="xs" icon={<CloseIcon size={IconSize.inline} />}
                                    tooltip="Forget" aria-label={`Forget ${t.url}`} onClick={() => forgetConn(t)} />
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12, color: BAD,
            background: `color-mix(in srgb, ${BAD} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${BAD} 35%, transparent)` }}>
            {error}
          </div>
        )}
        {result && <ConnSteps result={result} />}
      </div>
    </ModalView>
  );
}

function Label({ text, hint, children }: { text: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col" style={{ gap: 4 }}>
      <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED }}>{text}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: MUTED }}>{hint}</span>}
    </label>
  );
}

/** A section that folds: headers and body stay out of the way of a plain GET. */
function Disclosure({ open, onToggle, text, count, hint, children }: {
  open: boolean; onToggle: () => void; text: string; count: number; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
              className="inline-flex items-center cursor-pointer border-none bg-transparent p-0 self-start"
              style={{ gap: 6, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED }}>
        <ChevronRightIcon size={11} style={{ transition: 'transform 120ms', transform: open ? 'rotate(90deg)' : undefined }} />
        {text}
        {count > 0 && (
          <span style={{ fontSize: 10, letterSpacing: 0, padding: '0 6px', borderRadius: 999, color: ACCENT,
            background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }}>{count}</span>
        )}
        {hint && !open && <span style={{ textTransform: 'none', letterSpacing: 0 }}>{hint}</span>}
      </button>
      {open && children}
    </div>
  );
}

/** The steps the kind of test took — each with its time, and the first that failed says why. */
export function ConnSteps({ result }: { result: ConnResult }) {
  const kind = result.kind ?? 'http';
  const viaProxy = !!result.proxy;
  const tls = result.tls;
  const rows: { name: string; step: ConnStep; detail?: string }[] = [
    { name: viaProxy ? 'DNS · proxy' : 'DNS', step: result.dns,
      detail: result.dns.ok
        ? `${result.dns.host} → ${(result.dns.addresses ?? []).join(', ')}${result.dns.canonical ? ` (${result.dns.canonical})` : ''}`
        : result.dns.host },
  ];
  if (kind !== 'dns') rows.push({ name: viaProxy ? 'TCP · proxy' : 'TCP', step: result.tcp, detail: result.tcp.to });
  if (kind === 'tcp' && tls) {
    rows.push({ name: 'TLS', step: tls,
      detail: tls.ok
        ? [tls.version, tls.cipher, tls.subject, tls.notAfter ? `until ${tls.notAfter}` : '', tls.verified ? '' : 'certificate not checked'].filter(Boolean).join(' · ')
        : undefined });
  }
  if (kind === 'http') {
    rows.push({ name: 'HTTP', step: result.http,
      detail: result.http.ok ? `${result.http.status} ${result.http.reason ?? ''}${result.http.server ? ` · ${result.http.server}` : ''}` : undefined });
  }
  const failedAt = rows.findIndex(r => !r.step.ok);

  const headline = (() => {
    if (kind === 'dns') {
      const n = result.dns.addresses?.length ?? 0;
      return result.ok ? `Resolved — ${n} address${n === 1 ? '' : 'es'}` : 'Not resolved';
    }
    if (kind === 'tcp') {
      return result.ok
        ? `Connected to ${result.tcp.to}${tls?.ok ? ` · ${tls.version}` : ''}`
        : `Not connected — failed at ${rows[failedAt]?.name ?? 'TCP'}`;
    }
    return result.ok
      ? `Reached — ${result.method && result.method !== 'GET' ? `${result.method} ` : 'HTTP '}${result.http.status}${(result.http.status ?? 0) >= 400 ? ' (the server answered; the network is fine)' : ''}`
      : `Not reached — failed at ${rows[failedAt]?.name ?? 'HTTP'}`;
  })();

  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <div style={{ fontSize: 12, color: result.ok ? RUN : BAD, fontWeight: 600 }}>
        {headline}
        {viaProxy && <span style={{ color: MUTED, fontWeight: 400 }}> · through {result.proxy}{result.proxyFrom === 'env' ? ' (from the pod’s environment)' : ''}</span>}
      </div>
      {rows.map((r, i) => {
        const skipped = failedAt >= 0 && i > failedAt;
        const tone = skipped ? MUTED : r.step.ok ? RUN : BAD;
        return (
          <div key={r.name} className="flex items-start" style={{
            gap: 10, padding: '6px 10px', borderRadius: 8, fontSize: 12,
            border: '1px solid var(--color-surface-border)', background: 'var(--color-panel)',
          }}>
            <span style={{ width: 86, flexShrink: 0, color: tone, fontWeight: 600 }}>{r.name}</span>
            <span style={{ width: 70, flexShrink: 0, color: tone }}>{skipped ? 'skipped' : r.step.ok ? 'ok' : 'failed'}</span>
            <span style={{ width: 64, flexShrink: 0, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{r.step.ms !== undefined ? `${r.step.ms} ms` : ''}</span>
            <span className="min-w-0" style={{ fontFamily: MONO, fontSize: 11.5, color: r.step.error ? BAD : 'var(--color-text-secondary)', wordBreak: 'break-all' }}>
              {r.step.error ?? r.detail ?? ''}
            </span>
          </div>
        );
      })}
      {kind === 'http' && result.http.preview !== undefined && (
        <div className="flex flex-col" style={{ gap: 4 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED }}>
            Response{result.http.contentType ? ` · ${result.http.contentType}` : ''}{result.http.bytes !== undefined ? ` · first ${result.http.bytes} bytes` : ''}
          </span>
          <pre style={{
            margin: 0, maxHeight: 200, overflow: 'auto', padding: '8px 10px', borderRadius: 8, fontFamily: MONO, fontSize: 11.5,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--color-text-primary)',
            background: 'var(--color-panel)', border: '1px solid var(--color-surface-border)',
          }}>{result.http.preview || '(empty body)'}</pre>
        </div>
      )}
    </div>
  );
}
