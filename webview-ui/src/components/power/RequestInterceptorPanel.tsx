/**
 * RequestInterceptorPanel — a proxy that captures what a browser sends.
 *
 * ── What this replaces ──
 *
 * "Start Proxy" posted `interceptor:start` to a host handler that did not
 * exist. The button set a spinner, the list sat at "0 captured" forever, and
 * there was no error because no code path could produce one. There is a real
 * proxy behind it now (`interceptor-handler.ts`).
 *
 * ── Why HTTPS rows say "tunnelled" ──
 *
 * A browser sends `CONNECT host:443` and everything after it is encrypted
 * end to end. Reading it would mean terminating TLS with a generated
 * certificate and installing a new trusted root on this machine — a permanent
 * hole in the user's trust store, not something to do behind a button. So an
 * HTTPS request is recorded as the one thing honestly visible: that a tunnel
 * to that host was opened.
 */
import { useState, useEffect } from 'react';
import { TrashIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { useTabsStore } from '../../store/tabs-store';
import { ModalView, ButtonView, TextInputView, ToggleSwitchView } from '@salilvnair/dui';
import { logUiEvent } from '../../store/ui-audit-store';

interface InterceptedRequest {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
  selected: boolean;
  /** HTTPS: the host was seen, the contents were not. */
  tunnelled?: boolean;
}

interface InterceptorConfig {
  port: number;
  listenHost: string;
  filterPath: string;
  filterDomain: string;
  excludeStaticAssets: boolean;
}

interface Props {
  onClose: () => void;
}

const DEFAULT_CONFIG: InterceptorConfig = {
  port: 8888,
  listenHost: '127.0.0.1',
  filterPath: '',
  filterDomain: '',
  excludeStaticAssets: true,
};

const ACCENT = 'var(--color-settings)';

const METHOD_COLORS: Record<string, string> = {
  GET: 'var(--color-success)',
  POST: 'var(--color-info)',
  PUT: 'var(--color-warning)',
  PATCH: '#f59e0b',
  DELETE: 'var(--color-error)',
  HEAD: 'var(--color-text-muted)',
  OPTIONS: '#a78bfa',
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </label>
  );
}

export function RequestInterceptorPanel({ onClose }: Props) {
  const [config, setConfig] = useState<InterceptorConfig>(DEFAULT_CONFIG);
  const [running, setRunning] = useState(false);
  const [captured, setCaptured] = useState<InterceptedRequest[]>([]);
  const [collectionName, setCollectionName] = useState('Intercepted Requests');
  const [selectedView, setSelectedView] = useState<string | null>(null);

  const addToast = useToastStore(s => s.addToast);
  const addTab = useTabsStore(s => s.addTab);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'interceptor:request') {
        const req = msg.request as Omit<InterceptedRequest, 'selected'>;
        setCaptured(prev => [{ ...req, selected: true }, ...prev].slice(0, 200));
      }
      if (msg.type === 'interceptor:started') {
        setRunning(true);
        addToast({ type: 'success', message: `Proxy listening on ${msg.host ?? config.listenHost}:${msg.port ?? config.port}` });
      }
      if (msg.type === 'interceptor:stopped') {
        setRunning(false);
        addToast({ type: 'info', message: 'Proxy stopped' });
      }
      if (msg.type === 'interceptor:error') {
        setRunning(false);
        addToast({ type: 'error', message: (msg.error as string) || 'Interceptor error' });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [addToast, config]);

  const startInterceptor = () => {
    logUiEvent('settings.intercept_start', { port: config.port });
    /* `running` is set by `interceptor:started`, not here: claiming it started
       is what made a proxy that never bound look like one that was working. */
    postMsg({ type: 'interceptor:start', config });
    addToast({ type: 'info', message: `Starting proxy on port ${config.port}…` });
  };

  const stopInterceptor = () => {
    logUiEvent('settings.intercept_stop');
    postMsg({ type: 'interceptor:stop' });
    setRunning(false);
  };

  const clearCaptured = () => setCaptured([]);
  const toggleSelect = (id: string) => setCaptured(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  const selectAll = () => setCaptured(prev => prev.map(r => ({ ...r, selected: true })));
  const selectNone = () => setCaptured(prev => prev.map(r => ({ ...r, selected: false })));

  const openSelected = () => {
    const sel = captured.filter(r => r.selected && !r.tunnelled);
    sel.slice(0, 20).forEach(r => {
      addTab({ name: `${r.method} ${r.url.split('/').pop()}`, method: r.method as import('../../store/tabs-store').HttpMethod, url: r.url, headers: Object.entries(r.headers).map(([key, value]) => ({ id: crypto.randomUUID(), key, value, enabled: true })), bodyRaw: r.body || '', bodyMode: r.body ? ('raw' as const) : ('none' as const) });
    });
    addToast({ type: 'success', message: `Opened ${Math.min(sel.length, 20)} request tabs` });
  };

  /*
    This used to create the collection and stop — then say "created with N
    requests" over an empty one. Each captured request is saved into it now.
    A tunnelled HTTPS row is skipped: there is no request body or path to save.
  */
  const importAsCollection = () => {
    const sel = captured.filter(r => r.selected && !r.tunnelled);
    if (sel.length === 0) {
      addToast({ type: 'warning', message: 'Nothing to import — HTTPS rows carry only the host.' });
      return;
    }
    const collectionId = `intercepted-${Date.now()}`;
    postMsg({ type: 'createCollection', id: collectionId, name: collectionName, protocol: 'rest' });

    for (const r of sel) {
      let name = r.url;
      try { name = `${r.method} ${new URL(r.url).pathname}`; } catch { /* keep the raw URL */ }
      postMsg({
        type: 'saveRequestToCollection',
        collectionId,
        protocol: 'rest',
        request: {
          id: `${collectionId}-${r.id}`,
          name,
          method: r.method,
          url: r.url,
          data: JSON.stringify({
            headers: Object.entries(r.headers).map(([key, value]) => ({ key, value, enabled: true })),
            bodyRaw: r.body ?? '',
            bodyMode: r.body ? 'raw' : 'none',
          }),
        },
      });
    }

    addToast({ type: 'success', message: `Saved ${sel.length} request${sel.length === 1 ? '' : 's'} into "${collectionName}"` });
    onClose();
  };

  const selectedReq = captured.find(r => r.id === selectedView);
  const selectedCount = captured.filter(r => r.selected && !r.tunnelled).length;
  const tunnelledCount = captured.filter(r => r.tunnelled).length;

  return (
    <ModalView
      open
      title="Request Interceptor"
      subtitle="Proxy browser traffic → capture requests → import as collection"
      headerColor={ACCENT}
      size="xl"
      onClose={onClose}
      footerLeft={
        selectedCount > 0 ? (
          <div className="flex items-center gap-2">
            <TextInputView
              value={collectionName}
              onChange={e => setCollectionName(e.target.value)}
              placeholder="Collection name"
              size="md"
              accentColor={ACCENT}
              style={{ width: 200 }}
            />
            <ButtonView size="md" variant="primary" accentColor={ACCENT} onClick={importAsCollection}>
              Import {selectedCount} as Collection
            </ButtonView>
            <ButtonView size="md" accentColor={ACCENT} onClick={openSelected}>
              Open {Math.min(selectedCount, 20)} as Tabs
            </ButtonView>
          </div>
        ) : undefined
      }
      footerRight={
        !running ? (
          <ButtonView size="md" variant="primary" accentColor={ACCENT} onClick={startInterceptor}>
            Start Proxy
          </ButtonView>
        ) : (
          <ButtonView size="md" accentColor="var(--color-error)" iconLeft={<span className="w-2 h-2 rounded-full bg-white animate-pulse" />} onClick={stopInterceptor}>
            Stop Proxy
          </ButtonView>
        )
      }
    >
      <div className="flex flex-1 min-h-0" style={{ height: 520 }}>
        {/* Left: config + captured list */}
        <div className="w-[300px] flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--color-surface-border)' }}>

          {/* Config section */}
          {!running && (
            <div className="p-4 flex-shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: `color-mix(in srgb, ${ACCENT} 70%, var(--color-text-muted))` }}>
                Proxy Config
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Host</FieldLabel>
                  <TextInputView
                    value={config.listenHost}
                    onChange={e => setConfig(c => ({ ...c, listenHost: e.target.value }))}
                    size="sm"
                    accentColor={ACCENT}
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                </div>
                <div>
                  <FieldLabel>Port</FieldLabel>
                  <TextInputView
                    type="number"
                    value={String(config.port)}
                    onChange={e => setConfig(c => ({ ...c, port: Number(e.target.value) }))}
                    size="sm"
                    accentColor={ACCENT}
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Filter Domain</FieldLabel>
                  <TextInputView
                    value={config.filterDomain}
                    onChange={e => setConfig(c => ({ ...c, filterDomain: e.target.value }))}
                    placeholder="api.example.com"
                    size="sm"
                    accentColor={ACCENT}
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Path Prefix</FieldLabel>
                  <TextInputView
                    value={config.filterPath}
                    onChange={e => setConfig(c => ({ ...c, filterPath: e.target.value }))}
                    placeholder="/api/"
                    size="sm"
                    accentColor={ACCENT}
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                </div>
                <div className="col-span-2">
                  <ToggleSwitchView
                    checked={config.excludeStaticAssets}
                    onChange={v => setConfig(c => ({ ...c, excludeStaticAssets: v }))}
                    label="Exclude static assets (.js/.css/.png…)"
                    accentColor={ACCENT}
                    size="sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Running state — proxy instructions */}
          {running && (
            <div className="p-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)', background: 'color-mix(in srgb, var(--color-success) 5%, transparent)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
                <span className="text-[11px] font-semibold" style={{ color: 'var(--color-success)' }}>
                  Proxy active on :{config.port}
                </span>
              </div>
              <div className="rounded-lg p-2.5 text-[9.5px] leading-5 font-mono" style={{ background: 'var(--color-overlay-subtle)', color: 'var(--color-text-muted)' }}>
                <div>Configure browser proxy to:</div>
                <div style={{ color: 'var(--color-text-primary)' }}>{config.listenHost}:{config.port}</div>
                <div className="mt-1 opacity-70">Chrome: Settings → System → Proxy</div>
                <div className="opacity-70">Firefox: Network → Manual Proxy</div>
                <div className="opacity-70">macOS: Network → Advanced → Proxies</div>
              </div>
            </div>
          )}

          {/* Captured list header.

              Was a filled band with its own border, bolted under a plain
              section — two different visual registers stacked, which is what
              made this column look assembled rather than designed. It is a
              section header now, same padding and same uppercase accent label
              as PROXY CONFIG above it. */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-2 flex-shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest flex-1"
              style={{ color: `color-mix(in srgb, ${ACCENT} 70%, var(--color-text-muted))` }}>
              Captured
              <span className="ml-1.5 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                {captured.length}
              </span>
              {selectedCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold normal-case tracking-normal" style={{ color: 'var(--color-info)', background: 'color-mix(in srgb, var(--color-info) 12%, transparent)' }}>
                  {selectedCount} selected
                </span>
              )}
            </span>
            <button type="button" onClick={selectAll} className="text-[9.5px] font-medium cursor-pointer hover:opacity-80 transition-opacity" style={{ color: 'var(--color-info)' }}>All</button>
            <button type="button" onClick={selectNone} className="text-[9.5px] cursor-pointer hover:opacity-80 transition-opacity" style={{ color: 'var(--color-text-muted)' }}>None</button>
            <button type="button" onClick={clearCaptured}
              className="w-5 h-5 flex items-center justify-center rounded cursor-pointer"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--color-error)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}>
              <TrashIcon size={10} />
            </button>
          </div>

          {/* Captured request list */}
          <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
            {captured.length === 0 ? (
              <div className="px-4 py-6 text-center flex flex-col items-center gap-2">
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {running ? 'Waiting for requests…' : 'Start the proxy, then browse your app.'}
                </p>
              </div>
            ) : (
              captured.map(req => {
                const mc = METHOD_COLORS[req.method] || 'var(--color-text-muted)';
                return (
                  <div
                    key={req.id}
                    className="flex items-center gap-2 px-4 py-2 border-b cursor-pointer transition-all"
                    style={{
                      borderColor: 'var(--color-surface-border)',
                      backgroundColor: selectedView === req.id ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'transparent',
                    }}
                    onClick={() => setSelectedView(req.id)}
                  >
                    <input type="checkbox" checked={req.selected}
                      disabled={req.tunnelled}
                      onChange={e => { e.stopPropagation(); toggleSelect(req.id); }}
                      onClick={e => e.stopPropagation()}
                      className="flex-shrink-0 w-3 h-3 cursor-pointer"
                      style={{ opacity: req.tunnelled ? 0.3 : 1 }}
                    />
                    <span
                      className="text-[9px] font-bold w-[34px] flex-shrink-0 text-right px-1 py-0.5 rounded"
                      style={{ color: mc, background: `color-mix(in srgb, ${mc} 10%, transparent)` }}
                    >
                      {req.method}
                    </span>
                    <span
                      className="text-[10px] truncate flex-1 font-mono"
                      style={{ color: req.tunnelled ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}
                      title={req.url}
                    >
                      {req.tunnelled ? req.url.replace(/^https?:\/\//, '') : req.url.replace(/^https?:\/\/[^/]+/, '')}
                    </span>
                    {req.tunnelled && (
                      /* An encrypted tunnel: the host is all there is. Saying so
                         beats an empty row the user has to guess about. */
                      <span
                        title="HTTPS — encrypted end to end, so only the host is visible"
                        className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          color: 'var(--color-text-muted)',
                          background: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)',
                        }}
                      >TUNNEL</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: request detail */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedReq ? (
            <>
              <div className="px-4 py-3 border-b flex-shrink-0"
                style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)' }}>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0"
                    style={{
                      color: METHOD_COLORS[selectedReq.method] || 'var(--color-text-muted)',
                      background: `color-mix(in srgb, ${METHOD_COLORS[selectedReq.method] || 'var(--color-text-muted)'} 12%, transparent)`,
                    }}
                  >
                    {selectedReq.method}
                  </span>
                  <p className="text-[11px] font-mono truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {selectedReq.url}
                  </p>
                </div>
                <p className="text-[10px] mt-1 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {new Date(selectedReq.timestamp).toLocaleTimeString()}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: `color-mix(in srgb, ${ACCENT} 70%, var(--color-text-muted))` }}>Headers</p>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
                    {Object.entries(selectedReq.headers).slice(0, 20).map(([k, v]) => (
                      <div key={k} className="flex border-b last:border-0 text-[10px]" style={{ borderColor: 'var(--color-surface-border)' }}>
                        <div className="w-[150px] px-2.5 py-1.5 font-mono flex-shrink-0 border-r" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-hover)' }}>{k}</div>
                        <div className="px-2.5 py-1.5 font-mono truncate" style={{ color: 'var(--color-text-primary)' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedReq.body && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: `color-mix(in srgb, ${ACCENT} 70%, var(--color-text-muted))` }}>Body</p>
                    <pre
                      className="p-3 rounded-xl text-[10px] font-mono whitespace-pre-wrap overflow-auto max-h-[200px]"
                      style={{ backgroundColor: 'var(--color-overlay-subtle)', color: 'var(--color-text-primary)', border: '1px solid var(--color-surface-border)' }}
                    >
                      {selectedReq.body}
                    </pre>
                  </div>
                )}
              </div>

              <div className="px-4 py-2.5 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
                <ButtonView
                  size="md"
                  accentColor={ACCENT}
                  onClick={() => {
                    addTab({ method: selectedReq.method as import('../../store/tabs-store').HttpMethod, url: selectedReq.url, headers: Object.entries(selectedReq.headers).map(([key, value]) => ({ id: crypto.randomUUID(), key, value, enabled: true })), bodyRaw: selectedReq.body || '', bodyMode: selectedReq.body ? ('raw' as const) : ('none' as const) });
                    addToast({ type: 'success', message: 'Opened as new tab' });
                  }}
                >
                  Open as Tab
                </ButtonView>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
              {captured.length === 0 ? (
                <div style={{ maxWidth: 380, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                    {running ? 'Listening — nothing has come through yet' : 'Not listening'}
                  </p>
                  <p style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--color-text-muted)', margin: 0 }}>
                    {running
                      ? 'Point a browser or a tool at the proxy address below and its requests will appear here.'
                      : 'Start the proxy, then send traffic through it. Requests appear here as they pass.'}
                  </p>

                  <div
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '9px 12px', borderRadius: 9,
                      background: `color-mix(in srgb, ${ACCENT} 7%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${ACCENT} 22%, transparent)`,
                    }}
                  >
                    <code style={{ fontSize: 12, color: ACCENT, fontFamily: 'var(--font-mono, monospace)' }}>
                      http://{config.listenHost}:{config.port}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(`http://${config.listenHost}:${config.port}`);
                        addToast({ type: 'success', message: 'Proxy address copied' });
                      }}
                      style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 5, cursor: 'pointer',
                        color: 'var(--color-text-secondary)', background: 'transparent',
                        border: '1px solid color-mix(in srgb, var(--color-text-primary) 15%, transparent)',
                      }}
                    >Copy</button>
                  </div>

                  <p style={{
                    fontSize: 10.5, lineHeight: 1.65, color: 'var(--color-text-muted)', margin: 0,
                    paddingTop: 10, borderTop: '1px solid color-mix(in srgb, var(--color-text-primary) 7%, transparent)',
                    textAlign: 'left',
                  }}>
                    <strong style={{ color: 'var(--color-text-secondary)' }}>HTTP</strong> is captured in full —
                    method, URL, headers and body.{' '}
                    <strong style={{ color: 'var(--color-text-secondary)' }}>HTTPS</strong> is tunnelled: the host is
                    recorded, the contents are not. Reading them would mean installing a new trusted
                    certificate authority on this machine, which Daakia will not do on its own.
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', margin: 0 }}>
                    Select a request to inspect
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
                    {captured.length - tunnelledCount} captured
                    {tunnelledCount > 0 && ` · ${tunnelledCount} HTTPS tunnel${tunnelledCount === 1 ? '' : 's'} (host only)`}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalView>
  );
}
