/**
 * RequestInterceptorPanel — configure proxy to intercept browser traffic and capture requests.
 * Feature 6B.7 — Request interceptor/proxy
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, TrashIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { useTabsStore } from '../../store/tabs-store';

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

const ACCENT = 'var(--color-protocol-rest)';

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

function Field({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

function ProxyInput({ value, onChange, placeholder, type = 'text' }: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-[30px] px-2.5 rounded-lg text-[11px] outline-none transition-all font-mono"
      style={{
        backgroundColor: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'var(--color-text-primary)',
      }}
      onFocus={e => { e.target.style.borderColor = `color-mix(in srgb, ${ACCENT} 50%, transparent)`; e.target.style.boxShadow = `0 0 0 2px color-mix(in srgb, ${ACCENT} 10%, transparent)`; }}
      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = ''; }}
    />
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
    postMsg({ type: 'interceptor:start', config });
    setRunning(true);
    addToast({ type: 'info', message: `Starting proxy on port ${config.port}…` });
  };

  const stopInterceptor = () => {
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

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-[900px] max-h-[88vh] flex flex-col rounded-2xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0"
          style={{
            borderColor: 'rgba(255,255,255,0.06)',
            background: `linear-gradient(135deg, color-mix(in srgb, ${ACCENT} 8%, var(--color-panel)) 0%, var(--color-panel) 100%)`,
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px]"
            style={{ background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)` }}
          >
            🔌
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Request Interceptor</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Proxy browser traffic → capture requests → import as collection</p>
          </div>
          {!running ? (
            <button type="button" onClick={startInterceptor}
              className="h-[30px] px-4 text-[11px] font-semibold rounded-lg cursor-pointer text-white flex items-center gap-1.5 transition-all hover:brightness-110"
              style={{ background: `linear-gradient(135deg, var(--color-success), color-mix(in srgb, var(--color-success) 70%, #000))`, boxShadow: `0 2px 8px color-mix(in srgb, var(--color-success) 30%, transparent)` }}>
              ▶ Start Proxy
            </button>
          ) : (
            <button type="button" onClick={stopInterceptor}
              className="h-[30px] px-4 text-[11px] font-semibold rounded-lg cursor-pointer text-white flex items-center gap-1.5 transition-all hover:brightness-110"
              style={{ background: `linear-gradient(135deg, var(--color-error), color-mix(in srgb, var(--color-error) 70%, #000))`, boxShadow: `0 2px 8px color-mix(in srgb, var(--color-error) 30%, transparent)` }}>
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Stop Proxy
            </button>
          )}
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)]">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* ── Left: config + captured list ── */}
          <div className="w-[300px] flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>

            {/* Config section */}
            {!running && (
              <div className="p-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: `color-mix(in srgb, ${ACCENT} 70%, var(--color-text-muted))` }}>
                  Proxy Config
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel>Host</FieldLabel>
                    <ProxyInput value={config.listenHost} onChange={v => setConfig(c => ({ ...c, listenHost: v }))} />
                  </Field>
                  <Field>
                    <FieldLabel>Port</FieldLabel>
                    <ProxyInput type="number" value={config.port} onChange={v => setConfig(c => ({ ...c, port: Number(v) }))} />
                  </Field>
                  <div className="col-span-2">
                    <Field>
                      <FieldLabel>Filter Domain</FieldLabel>
                      <ProxyInput value={config.filterDomain} onChange={v => setConfig(c => ({ ...c, filterDomain: v }))} placeholder="api.example.com" />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field>
                      <FieldLabel>Path Prefix</FieldLabel>
                      <ProxyInput value={config.filterPath} onChange={v => setConfig(c => ({ ...c, filterPath: v }))} placeholder="/api/" />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div
                        className="relative w-8 h-4 rounded-full transition-all cursor-pointer flex-shrink-0"
                        onClick={() => setConfig(c => ({ ...c, excludeStaticAssets: !c.excludeStaticAssets }))}
                        style={{
                          background: config.excludeStaticAssets ? ACCENT : 'rgba(255,255,255,0.12)',
                          boxShadow: config.excludeStaticAssets ? `0 0 8px color-mix(in srgb, ${ACCENT} 40%, transparent)` : 'none',
                        }}
                      >
                        <div
                          className="absolute top-[2px] w-3 h-3 rounded-full bg-white shadow transition-all"
                          style={{ left: config.excludeStaticAssets ? 'calc(100% - 14px)' : '2px' }}
                        />
                      </div>
                      <span className="text-[10.5px]" style={{ color: 'var(--color-text-secondary)' }}>
                        Exclude static assets (.js/.css/.png…)
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Running state — proxy instructions */}
            {running && (
              <div
                className="p-4 border-b flex-shrink-0"
                style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'color-mix(in srgb, var(--color-success) 5%, transparent)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--color-success)' }}>
                    Proxy active on :{config.port}
                  </span>
                </div>
                <div className="rounded-lg p-2.5 text-[9.5px] leading-5 font-mono" style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--color-text-muted)' }}>
                  <div>Configure browser proxy to:</div>
                  <div style={{ color: 'var(--color-text-primary)' }}>
                    {config.listenHost}:{config.port}
                  </div>
                  <div className="mt-1 opacity-70">Chrome: Settings → System → Proxy</div>
                  <div className="opacity-70">Firefox: Network → Manual Proxy</div>
                  <div className="opacity-70">macOS: Network → Advanced → Proxies</div>
                </div>
              </div>
            )}

            {/* Captured list header */}
            <div
              className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
              style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
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
                className="w-5 h-5 flex items-center justify-center rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] transition-colors">
                <TrashIcon size={10} />
              </button>
            </div>

            {/* Captured request list */}
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
              {captured.length === 0 ? (
                <div className="p-6 text-center flex flex-col items-center gap-2">
                  <span className="text-[24px] opacity-20">🔌</span>
                  <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
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
                        borderColor: 'rgba(255,255,255,0.04)',
                        backgroundColor: selectedView === req.id ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'transparent',
                      }}
                      onMouseEnter={e => { if (selectedView !== req.id) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.025)'; }}
                      onMouseLeave={e => { if (selectedView !== req.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
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

          {/* ── Right: request detail ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedReq ? (
              <>
                {/* Request header */}
                <div
                  className="px-4 py-3 border-b flex-shrink-0"
                  style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
                >
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
                  {/* Headers */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: `color-mix(in srgb, ${ACCENT} 70%, var(--color-text-muted))` }}>Headers</p>
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                      {Object.entries(selectedReq.headers).slice(0, 20).map(([k, v]) => (
                        <div key={k} className="flex border-b last:border-0 text-[10px]" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                          <div className="w-[150px] px-2.5 py-1.5 font-mono flex-shrink-0 border-r" style={{ borderColor: 'rgba(255,255,255,0.04)', color: 'var(--color-text-muted)', backgroundColor: 'rgba(255,255,255,0.02)' }}>{k}</div>
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
                        style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: 'var(--color-text-primary)', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        {selectedReq.body}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="px-4 py-2.5 border-t flex-shrink-0 flex gap-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <button type="button"
                    onClick={() => { addTab({ method: selectedReq.method, url: selectedReq.url, headers: Object.entries(selectedReq.headers).map(([key, value]) => ({ key, value, enabled: true })), bodyRaw: selectedReq.body || '', bodyType: selectedReq.body ? 'json' : 'none' }); addToast({ type: 'success', message: 'Opened as new tab' }); }}
                    className="h-[28px] px-3 text-[10.5px] font-semibold rounded-lg cursor-pointer text-white transition-all hover:brightness-110"
                    style={{ background: `linear-gradient(135deg, var(--color-info), color-mix(in srgb, var(--color-info) 70%, #000))` }}>
                    Open as Tab
                  </button>
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

        {/* ── Footer ── */}
        <div className="flex items-center gap-2.5 px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.01)' }}>
          {selectedCount > 0 && (
            <>
              <div className="flex items-center gap-2 flex-1">
                <input
                  value={collectionName}
                  onChange={e => setCollectionName(e.target.value)}
                  className="h-[30px] px-2.5 rounded-lg text-[11px] outline-none transition-all w-[200px]"
                  placeholder="Collection name"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-text-primary)' }}
                />
                <button type="button" onClick={importAsCollection}
                  className="h-[30px] px-3 text-[10.5px] font-semibold rounded-lg cursor-pointer text-white transition-all hover:brightness-110 flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, var(--color-success), color-mix(in srgb, var(--color-success) 70%, #000))` }}>
                  Import {selectedCount} as Collection
                </button>
                <button type="button" onClick={openSelected}
                  className="h-[30px] px-3 text-[10.5px] font-semibold rounded-lg cursor-pointer text-white transition-all hover:brightness-110 flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, var(--color-info), color-mix(in srgb, var(--color-info) 70%, #000))` }}>
                  Open {Math.min(selectedCount, 20)} as Tabs
                </button>
              </div>
            </>
          )}
          {selectedCount === 0 && <div className="flex-1" />}
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[11px] font-medium rounded-lg cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.08)]"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
