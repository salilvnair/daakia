/**
 * The Settings tab on a request and on a collection.
 *
 * Same three groups as the global settings page — General, Encoding, Proxy —
 * with one difference that matters: every control here has an **Inherit**
 * position, and it is the default.
 *
 * Inherit is not decoration. Without it, opening this tab and touching nothing
 * would still pin whatever the global values happened to be at that moment,
 * and a later change to the global proxy would silently stop reaching this
 * request. With it, you override the one field you meant to and the rest keep
 * following the level above.
 *
 * Each Inherit option shows the value it resolves to and where that came from,
 * so "Inherit" is never a question you have to leave the page to answer. Those
 * values are computed by the host, which is also what the request runs with —
 * a second resolution here could disagree with the real one, and a settings
 * screen that lies about the effective value is worse than none.
 */
import {
  TextInputView, SegmentedControlView, SelectInputView, TabView, type TabItem,
} from '@salilvnair/dui';
import { useState } from 'react';
import {
  type ExecutionSettings, type EffectiveSettings, type SettingsLevel,
  type ProxyConfig, type QueryEncoding,
  DEFAULT_PROXY, LEVEL_LABEL, describeProxy, describeTimeout,
} from './execution-settings';

const TABS: TabItem[] = [
  { id: 'general', label: 'General' },
  { id: 'encoding', label: 'Encoding' },
  { id: 'proxy', label: 'Proxy' },
];

interface Props {
  /** What this level pins. Undefined fields inherit. */
  value: ExecutionSettings;
  onChange: (next: ExecutionSettings) => void;
  /** What the levels above resolve to, from the host. */
  inherited?: EffectiveSettings;
  /** Which level each inherited value came from. */
  inheritedFrom?: Record<keyof EffectiveSettings, SettingsLevel>;
  /** Names the level being edited, for the copy. */
  scope: 'request' | 'collection';
  accentColor?: string;
}

function Row({ title, description, children, overridden }: {
  title: string; description: string; children: React.ReactNode; overridden: boolean;
}) {
  return (
    <div className="flex items-start gap-4 py-1">
      <div className="flex-1 min-w-0" style={{ maxWidth: '46ch' }}>
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-medium text-[var(--color-text-primary)] m-0">{title}</p>
          {/* A dot, not a word: it has to be scannable down a column of six
              rows without adding a second column of text to read. */}
          {overridden && (
            <span title="Set here, not inherited"
                  style={{
                    width: 5, height: 5, borderRadius: 5, flexShrink: 0,
                    background: 'var(--color-accent, #7c8cff)',
                  }} />
          )}
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-0 leading-relaxed">
          {description}
        </p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Inherit / On / Off. The tri-state that makes per-field overrides work. */
function TriToggle({ value, onChange, inheritedLabel, accentColor }: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  inheritedLabel: string;
  accentColor: string;
}) {
  return (
    <SegmentedControlView
      value={value === undefined ? 'inherit' : value ? 'on' : 'off'}
      onChange={v => onChange(v === 'inherit' ? undefined : v === 'on')}
      options={[
        { value: 'inherit', label: inheritedLabel },
        { value: 'on', label: 'On' },
        { value: 'off', label: 'Off' },
      ]}
      size="md" variant="rounded" accentColor={accentColor}
    />
  );
}

export function ExecutionSettingsEditor({
  value, onChange, inherited, inheritedFrom, scope,
  accentColor = 'var(--color-accent, #7c8cff)',
}: Props) {
  const [tab, setTab] = useState('general');
  const set = (patch: Partial<ExecutionSettings>) => onChange({ ...value, ...patch });

  const eff = inherited;
  /** "Inherit (on)" — the resolved value, in the label, where it is needed. */
  const inheritBool = (k: 'followRedirects' | 'sslVerification' | 'saveResponseInHistory') =>
    eff ? `Inherit (${eff[k] ? 'on' : 'off'})` : 'Inherit';
  const source = (k: keyof EffectiveSettings) =>
    inheritedFrom ? ` from ${LEVEL_LABEL[inheritedFrom[k]]}` : '';

  const proxy = value.proxy;
  const proxyMode = proxy?.mode;
  const editProxy = (patch: Partial<ProxyConfig>) =>
    set({ proxy: { ...DEFAULT_PROXY, ...proxy, ...patch } as ProxyConfig });

  const where = scope === 'request' ? 'this request' : 'every request in this collection';

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-2 pb-0" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <TabView tabs={TABS} activeTab={tab} onChange={setTab}
                 size="md" variant="underline" accentColor={accentColor} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 py-4 flex flex-col gap-5">
        {tab === 'general' && (
          <>
            <p className="text-[11px] text-[var(--color-text-muted)] m-0 leading-relaxed"
               style={{ maxWidth: '78ch' }}>
              Anything left on <strong>Inherit</strong> follows the level above, so changing it
              there still reaches {where}. Only what you set here is pinned.
            </p>

            <Row title="Follow Redirects"
                 description={`Automatically follow HTTP 3xx redirects${source('followRedirects')}.`}
                 overridden={value.followRedirects !== undefined}>
              <TriToggle value={value.followRedirects} accentColor={accentColor}
                         inheritedLabel={inheritBool('followRedirects')}
                         onChange={v => set({ followRedirects: v })} />
            </Row>

            <Row title="SSL Certificate Verification"
                 description={`Verify SSL certificates when making requests${source('sslVerification')}.`}
                 overridden={value.sslVerification !== undefined}>
              <TriToggle value={value.sslVerification} accentColor={accentColor}
                         inheritedLabel={inheritBool('sslVerification')}
                         onChange={v => set({ sslVerification: v })} />
            </Row>

            <Row title="Save Response in History"
                 description={`Store response body and headers in history entries${source('saveResponseInHistory')}.`}
                 overridden={value.saveResponseInHistory !== undefined}>
              <TriToggle value={value.saveResponseInHistory} accentColor={accentColor}
                         inheritedLabel={inheritBool('saveResponseInHistory')}
                         onChange={v => set({ saveResponseInHistory: v })} />
            </Row>

            <Row
              title="Request Timeout"
              description={
                value.timeout === undefined
                  ? `Inheriting ${eff ? describeTimeout(eff.timeout) : 'the value above'}${source('timeout')}. `
                    + 'Type a value in milliseconds to pin one here.'
                  : 'Maximum time to wait for a response, in milliseconds. 0 means no timeout.'
              }
              overridden={value.timeout !== undefined}
            >
              <div className="flex items-center gap-2">
                <TextInputView
                  type="number"
                  size="md"
                  accentColor={accentColor}
                  // Empty, not 0: 0 is a real value here ("no timeout"), so it
                  // cannot double as the way to say "inherit".
                  value={value.timeout === undefined ? '' : String(value.timeout)}
                  placeholder={eff ? String(eff.timeout) : 'inherit'}
                  onChange={e => {
                    const raw = e.target.value.trim();
                    set({ timeout: raw === '' ? undefined : Math.max(0, parseInt(raw, 10) || 0) });
                  }}
                  style={{ width: 140 }}
                />
                {value.timeout !== undefined && (
                  <button type="button" onClick={() => set({ timeout: undefined })}
                          className="text-[11px] cursor-pointer border-none bg-transparent px-1"
                          style={{ color: 'var(--color-text-muted)' }}>
                    inherit
                  </button>
                )}
              </div>
            </Row>
          </>
        )}

        {tab === 'encoding' && (
          <Row
            title="Query Parameters Encoding"
            description={
              'How values in the query string are encoded. Disable sends them exactly as typed, '
              + 'for APIs that expect a literal comma or colon; Auto encodes only what is not '
              + 'already encoded, so %20 does not become %2520.'
            }
            overridden={value.encoding !== undefined}
          >
            <SegmentedControlView
              value={value.encoding ?? 'inherit'}
              onChange={v => set({ encoding: v === 'inherit' ? undefined : v as QueryEncoding })}
              options={[
                { value: 'inherit', label: eff ? `Inherit (${eff.encoding})` : 'Inherit' },
                { value: 'enable', label: 'Enable' },
                { value: 'disable', label: 'Disable' },
                { value: 'auto', label: 'Auto' },
              ]}
              size="md" variant="rounded" accentColor={accentColor}
            />
          </Row>
        )}

        {tab === 'proxy' && (
          <div className="flex flex-col gap-4">
            <Row
              title="Proxy Configuration"
              description={
                proxyMode === undefined
                  ? `Inheriting ${eff ? describeProxy(eff.proxy) : 'the setting above'}${source('proxy')}.`
                  : `Route ${where} through a proxy.`
              }
              overridden={proxyMode !== undefined}
            >
              <SegmentedControlView
                value={proxyMode ?? 'inherit'}
                onChange={v => v === 'inherit'
                  ? set({ proxy: undefined })
                  : editProxy({ mode: v as ProxyConfig['mode'] })}
                options={[
                  { value: 'inherit', label: 'Inherit' },
                  { value: 'none', label: 'No proxy' },
                  { value: 'system', label: 'System' },
                  { value: 'manual', label: 'Manual' },
                ]}
                size="md" variant="rounded" accentColor={accentColor}
              />
            </Row>

            {proxyMode === 'none' && (
              <p className="text-[11px] m-0" style={{ color: 'var(--color-text-muted)' }}>
                Connects directly, ignoring any proxy set above. This is the way to keep one
                request off the corporate proxy without turning it off for everything else.
              </p>
            )}

            {proxyMode === 'system' && (
              <p className="text-[11px] m-0 leading-relaxed" style={{ color: 'var(--color-text-muted)', maxWidth: '78ch' }}>
                Uses <code>HTTPS_PROXY</code> / <code>HTTP_PROXY</code> from the environment
                VS Code was launched with. If neither is set the request goes direct and the
                response says so, rather than failing quietly.
              </p>
            )}

            {proxyMode === 'manual' && (
              <div className="flex flex-col gap-3" style={{ maxWidth: 620 }}>
                <div className="flex items-end gap-2">
                  <Field label="type">
                    <SelectInputView
                      value={proxy?.type ?? 'http'}
                      onChange={v => editProxy({ type: v as ProxyConfig['type'] })}
                      options={[
                        { value: 'http', label: 'http' },
                        { value: 'https', label: 'https' },
                        { value: 'socks5', label: 'socks5' },
                      ]}
                      size="md" width={110} accentColor={accentColor}
                    />
                  </Field>
                  <Field label="host" grow>
                    <TextInputView
                      value={proxy?.host ?? ''} size="md" accentColor={accentColor}
                      placeholder="proxy.corp.example"
                      onChange={e => editProxy({ host: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </Field>
                  <Field label="port">
                    <TextInputView
                      type="number" value={String(proxy?.port ?? 8080)} size="md"
                      accentColor={accentColor}
                      onChange={e => editProxy({ port: parseInt(e.target.value, 10) || 8080 })}
                      style={{ width: 92 }}
                    />
                  </Field>
                </div>

                <div className="flex items-end gap-2">
                  <Field label="username" grow>
                    <TextInputView
                      value={proxy?.username ?? ''} size="md" accentColor={accentColor}
                      placeholder="optional"
                      onChange={e => editProxy({ username: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </Field>
                  <Field label="password" grow>
                    <TextInputView
                      type="password" value={proxy?.password ?? ''} size="md"
                      accentColor={accentColor} placeholder="optional"
                      onChange={e => editProxy({ password: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </Field>
                </div>

                <Field label="bypass" hint="Hosts that go direct. Comma separated; a leading dot or *. matches subdomains.">
                  <TextInputView
                    value={(proxy?.bypass ?? []).join(', ')} size="md" accentColor={accentColor}
                    placeholder="localhost, 127.0.0.1, .internal"
                    onChange={e => editProxy({
                      bypass: e.target.value.split(',').map(x => x.trim()).filter(Boolean),
                    })}
                    style={{ width: '100%' }}
                  />
                </Field>

                {proxy?.type === 'socks5' && (
                  <p className="text-[11px] m-0" style={{ color: 'var(--color-warning)' }}>
                    SOCKS5 is not supported — requests will go direct and say so. Use an HTTP or
                    HTTPS proxy, or run a local SOCKS-to-HTTP bridge.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, grow, children }: {
  label: string; hint?: string; grow?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${grow ? 'flex-1 min-w-0' : ''}`}>
      <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
      {hint && <span className="text-[10.5px] text-[var(--color-text-muted)]">{hint}</span>}
    </div>
  );
}
