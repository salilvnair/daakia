/**
 * Connectivity test — can this pod reach a URL, directly or through a proxy?
 *
 * The Python tab's ⋯ menu opens it. The test runs inside the
 * container with its own python (see the host's pod-conn) and reports each
 * step on its own — the name resolved, a connection made, what HTTP said — so
 * a failure says where it failed. Each test is remembered as a chip, so the
 * next one is a click.
 */
import { useState } from 'react';
import { ButtonView, IconButtonView, ModalView, TextInputView, IconSize } from '@salilvnair/dui';
import { CloseIcon, PlayIcon } from '../../../icons';
import {
  testConn, rememberConn, forgetConn, useRecentConn,
  type ConnResult, type ConnTarget, type ConnTest as Test, type ConnStep,
} from '../../../store/dk8s-conn-store';
import { ACCENT, BAD, MUTED } from '../tone';

/* Green like every Run and Send in Daakia — the Python tab's own RUN. */
const RUN = 'var(--color-success)';

const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

/** `https://api.example.com/health` → `api.example.com/health`, for a chip. */
function short(t: Test): string {
  const u = t.url.replace(/^https?:\/\//, '');
  return u.length > 38 ? `${u.slice(0, 37)}…` : u;
}

export function ConnTestDialog({ target, onClose }: { target: ConnTarget; onClose: () => void }) {
  const recent = useRecentConn();
  const [url, setUrl] = useState(recent[0]?.url ?? '');
  const [proxy, setProxy] = useState(recent[0]?.proxy ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConnResult>();
  const [error, setError] = useState<string>();

  const go = async (t: Test) => {
    if (!t.url.trim() || busy) return;
    const test = { url: t.url.trim(), ...(t.proxy?.trim() ? { proxy: t.proxy.trim() } : {}) };
    setUrl(test.url); setProxy(test.proxy ?? '');
    setBusy(true); setResult(undefined); setError(undefined);
    const r = await testConn(target, test);
    setBusy(false);
    if (r.result) { setResult(r.result); rememberConn(test); } else setError(r.error ?? 'No answer from the pod.');
  };

  return (
    <ModalView
      open onClose={onClose} size="md"
      title="Connectivity test"
      subtitle={`From inside ${target.pod}${target.container ? ` · ${target.container}` : ''}, with its own network and DNS`}
      headerColor={ACCENT}
      footerRight={
        <div style={{ display: 'flex', gap: 8 }}>
          <ButtonView size="md" variant="secondary" onClick={onClose}>Close</ButtonView>
          <ButtonView size="md" variant="secondary" accentColor={RUN} color={RUN}
                      iconLeft={<PlayIcon size={IconSize.action} />}
                      disabled={!url.trim() || busy} onClick={() => void go({ url, proxy })}>
            {busy ? 'Testing…' : 'Test'}
          </ButtonView>
        </div>
      }
    >
      <div className="flex flex-col" style={{ gap: 12 }}>
        <Label text="URL">
          <TextInputView size="sm" value={url} placeholder="https://api.example.com/health"
                         onChange={e => setUrl((e.target as HTMLInputElement).value)}
                         onKeyDown={e => { if (e.key === 'Enter') void go({ url, proxy }); }}
                         accentColor={ACCENT} style={{ width: '100%' }} />
        </Label>
        <Label text="Proxy" hint="Optional. Empty uses the pod's own HTTP_PROXY / HTTPS_PROXY, if it has one.">
          <TextInputView size="sm" value={proxy} placeholder="http://proxy.internal:3128"
                         onChange={e => setProxy((e.target as HTMLInputElement).value)}
                         onKeyDown={e => { if (e.key === 'Enter') void go({ url, proxy }); }}
                         accentColor={ACCENT} style={{ width: '100%' }} />
        </Label>

        {recent.length > 0 && (
          <div className="flex flex-col" style={{ gap: 6 }}>
            <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED }}>Recent</span>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {recent.map(t => (
                <span key={`${t.url}|${t.proxy ?? ''}`} className="inline-flex items-center"
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
                  <IconButtonView size="xs" icon={<CloseIcon size={IconSize.inline} />}
                                  tooltip="Forget" aria-label={`Forget ${t.url}`} onClick={() => forgetConn(t)} />
                </span>
              ))}
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

/** DNS, TCP, HTTP — each with its time, and the first that failed says why. */
export function ConnSteps({ result }: { result: ConnResult }) {
  const viaProxy = !!result.proxy;
  const rows: { name: string; step: ConnStep; detail?: string }[] = [
    { name: viaProxy ? 'DNS · proxy' : 'DNS', step: result.dns,
      detail: result.dns.ok ? `${result.dns.host} → ${(result.dns.addresses ?? []).join(', ')}` : result.dns.host },
    { name: viaProxy ? 'TCP · proxy' : 'TCP', step: result.tcp, detail: result.tcp.to },
    { name: 'HTTP', step: result.http,
      detail: result.http.ok ? `${result.http.status} ${result.http.reason ?? ''}${result.http.server ? ` · ${result.http.server}` : ''}` : undefined },
  ];
  const failedAt = rows.findIndex(r => !r.step.ok);
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <div style={{ fontSize: 12, color: result.ok ? RUN : BAD, fontWeight: 600 }}>
        {result.ok
          ? `Reached — HTTP ${result.http.status}${(result.http.status ?? 0) >= 400 ? ' (the server answered; the network is fine)' : ''}`
          : `Not reached — failed at ${rows[failedAt]?.name ?? 'HTTP'}`}
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
    </div>
  );
}
