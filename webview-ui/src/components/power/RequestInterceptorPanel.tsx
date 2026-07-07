/**
 * RequestInterceptorPanel — configure proxy to intercept browser traffic and capture requests.
 * Feature 6B.7 — Request interceptor/proxy
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
        addToast({ type: 'success', message: `Proxy listening on ${config.listenHost}:${config.port}` });
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
    postMsg({ type: 'interceptor:start', config });
    setRunning(true);
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
    const sel = captured.filter(r => r.selected);
    sel.slice(0, 20).forEach(r => {
      addTab({ name: `${r.method} ${r.url.split('/').pop()}`, method: r.method, url: r.url, headers: Object.entries(r.headers).map(([key, value]) => ({ key, value, enabled: true })), bodyRaw: r.body || '', bodyType: r.body ? 'json' : 'none' });
    });
    addToast({ type: 'success', message: `Opened ${Math.min(sel.length, 20)} request tabs` });
  };

  const importAsCollection = () => {
    const sel = captured.filter(r => r.selected);
    if (sel.length === 0) { addToast({ type: 'warning', message: 'No requests selected' }); return; }
    postMsg({ type: 'createCollection', id: `intercepted-${Date.now()}`, name: collectionName, protocol: 'rest' });
    addToast({ type: 'success', message: `Collection "${collectionName}" created with ${sel.length} requests` });
    onClose();
  };

  const selectedReq = captured.find(r => r.id === selectedView);
  const selectedCount = captured.filter(r => r.selected).length;

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
            ▶ Start Proxy
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
            <div className="p-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
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
                    onChange={e => setConfig(c => ({ ...c, excludeStaticAssets: e.target.checked }))}
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

          {/* Captured list header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
            style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)' }}>
            <span className="text-[10px] font-medium flex-1" style={{ color: 'var(--color-text-secondary)' }}>
              {captured.length} captured
              {selectedCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ color: 'var(--color-info)', background: 'color-mix(in srgb, var(--color-info) 12%, transparent)' }}>
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
              <div className="p-6 text-center flex flex-col items-center gap-2">
                <span className="text-[24px] opacity-20">🔌</span>
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
                    className="flex items-center gap-2 px-3 py-2 border-b cursor-pointer transition-all"
                    style={{
                      borderColor: 'var(--color-surface-border)',
                      backgroundColor: selectedView === req.id ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'transparent',
                    }}
                    onClick={() => setSelectedView(req.id)}
                  >
                    <input type="checkbox" checked={req.selected}
                      onChange={e => { e.stopPropagation(); toggleSelect(req.id); }}
                      onClick={e => e.stopPropagation()}
                      className="flex-shrink-0 w-3 h-3 cursor-pointer"
                    />
                    <span
                      className="text-[9px] font-bold w-[34px] flex-shrink-0 text-right px-1 py-0.5 rounded"
                      style={{ color: mc, background: `color-mix(in srgb, ${mc} 10%, transparent)` }}
                    >
                      {req.method}
                    </span>
                    <span className="text-[10px] truncate flex-1 font-mono" style={{ color: 'var(--color-text-primary)' }}>
                      {req.url.replace(/^https?:\/\/[^/]+/, '')}
                    </span>
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
                    addTab({ method: selectedReq.method, url: selectedReq.url, headers: Object.entries(selectedReq.headers).map(([key, value]) => ({ key, value, enabled: true })), bodyRaw: selectedReq.body || '', bodyType: selectedReq.body ? 'json' : 'none' });
                    addToast({ type: 'success', message: 'Opened as new tab' });
                  }}
                >
                  Open as Tab
                </ButtonView>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
              <span className="text-[32px] opacity-15">🔌</span>
              <p className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {captured.length === 0 ? 'No requests captured yet' : 'Select a request to inspect'}
              </p>
              {captured.length > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{captured.length} requests ready</p>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalView>
  );
}
