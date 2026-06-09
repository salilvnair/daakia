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
  filterPath: string;      // path prefix filter (empty = all)
  filterDomain: string;    // domain filter
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
        addToast({ type: 'error', message: msg.error as string || 'Interceptor error' });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [addToast, config]);

  const startInterceptor = () => {
    postMsg({ type: 'interceptor:start', config });
    setRunning(true); // optimistic
    addToast({ type: 'info', message: `Starting proxy on port ${config.port}…` });
  };

  const stopInterceptor = () => {
    postMsg({ type: 'interceptor:stop' });
    setRunning(false);
  };

  const clearCaptured = () => setCaptured([]);

  const toggleSelect = (id: string) => {
    setCaptured(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  };

  const selectAll = () => setCaptured(prev => prev.map(r => ({ ...r, selected: true })));
  const selectNone = () => setCaptured(prev => prev.map(r => ({ ...r, selected: false })));

  const openSelected = () => {
    const sel = captured.filter(r => r.selected);
    sel.slice(0, 20).forEach(r => {
      addTab({
        name: `${r.method} ${r.url.split('/').pop()}`,
        method: r.method,
        url: r.url,
        headers: Object.entries(r.headers).map(([key, value]) => ({ key, value, enabled: true })),
        bodyRaw: r.body || '',
        bodyType: r.body ? 'json' : 'none',
      });
    });
    addToast({ type: 'success', message: `Opened ${Math.min(sel.length, 20)} request tabs` });
  };

  const importAsCollection = () => {
    const sel = captured.filter(r => r.selected);
    if (sel.length === 0) { addToast({ type: 'warning', message: 'No requests selected' }); return; }
    const collId = `intercepted-${Date.now()}`;
    postMsg({ type: 'createCollection', id: collId, name: collectionName, protocol: 'rest' });
    addToast({ type: 'success', message: `Collection "${collectionName}" created with ${sel.length} requests` });
    onClose();
  };

  const selectedReq = captured.find(r => r.id === selectedView);
  const selectedCount = captured.filter(r => r.selected).length;

  const proxyInstructions = `Configure your browser or system to use HTTP proxy:
Host: ${config.listenHost}    Port: ${config.port}

Chrome: Settings → Advanced → System → Proxy
Firefox: Settings → Network → Manual Proxy
macOS: System Preferences → Network → Advanced → Proxies
iOS: Wi-Fi → i → HTTP Proxy (Manual)`;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[920px] max-h-[92vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: '#1a1a1f', borderColor: 'var(--color-surface-border)' }}>

        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Request Interceptor</p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Proxy browser traffic → capture requests → import as collection</p>
          </div>
          {!running ? (
            <button type="button" onClick={startInterceptor}
              className="h-[28px] px-3 text-[11px] font-medium rounded-md cursor-pointer text-white"
              style={{ backgroundColor: 'var(--color-success)' }}>
              ▶ Start Proxy
            </button>
          ) : (
            <button type="button" onClick={stopInterceptor}
              className="h-[28px] px-3 text-[11px] font-medium rounded-md cursor-pointer text-white flex items-center gap-1.5"
              style={{ backgroundColor: 'var(--color-error)' }}>
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Stop Proxy
            </button>
          )}
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: config + captured list */}
          <div className="w-[320px] flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--color-surface-border)' }}>
            {/* Config */}
            {!running && (
              <div className="p-3 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
                <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>Proxy Config</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Host</label>
                    <input value={config.listenHost} onChange={e => setConfig(c => ({ ...c, listenHost: e.target.value }))}
                      className="w-full px-2 py-1 rounded text-[10.5px] outline-none mt-0.5"
                      style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
                  </div>
                  <div>
                    <label className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Port</label>
                    <input type="number" value={config.port} onChange={e => setConfig(c => ({ ...c, port: Number(e.target.value) }))}
                      className="w-full px-2 py-1 rounded text-[10.5px] outline-none mt-0.5"
                      style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Filter domain (optional)</label>
                    <input value={config.filterDomain} onChange={e => setConfig(c => ({ ...c, filterDomain: e.target.value }))}
                      placeholder="api.example.com"
                      className="w-full px-2 py-1 rounded text-[10.5px] outline-none mt-0.5"
                      style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Filter path prefix (optional)</label>
                    <input value={config.filterPath} onChange={e => setConfig(c => ({ ...c, filterPath: e.target.value }))}
                      placeholder="/api/"
                      className="w-full px-2 py-1 rounded text-[10.5px] outline-none mt-0.5"
                      style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={config.excludeStaticAssets}
                        onChange={e => setConfig(c => ({ ...c, excludeStaticAssets: e.target.checked }))} />
                      <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>Exclude static assets (.js/.css/.png…)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Proxy instructions when running */}
            {running && (
              <div className="p-3 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'color-mix(in srgb, var(--color-success) 5%, transparent)' }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--color-success)' }}>Proxy running on port {config.port}</span>
                </div>
                <pre className="text-[9.5px] leading-4 whitespace-pre-wrap" style={{ color: 'var(--color-text-muted)' }}>{proxyInstructions}</pre>
              </div>
            )}

            {/* Captured list header */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)' }}>
              <span className="text-[10.5px] font-medium flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                {captured.length} captured
                {selectedCount > 0 && <span style={{ color: 'var(--color-info)' }}> · {selectedCount} selected</span>}
              </span>
              <button type="button" onClick={selectAll} className="text-[9.5px] cursor-pointer" style={{ color: 'var(--color-info)' }}>All</button>
              <button type="button" onClick={selectNone} className="text-[9.5px] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>None</button>
              <button type="button" onClick={clearCaptured} className="w-5 h-5 flex items-center justify-center opacity-50 hover:opacity-100 cursor-pointer">
                <TrashIcon size={10} />
              </button>
            </div>

            {/* Captured list */}
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
              {captured.length === 0 && (
                <div className="p-4 text-center">
                  <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                    {running ? 'Waiting for requests…\nConfigure your browser to use this proxy.' : 'Start the proxy, then browse your app.'}
                  </p>
                </div>
              )}
              {captured.map(req => (
                <div key={req.id}
                  className="flex items-center gap-1.5 px-2.5 py-2 border-b cursor-pointer"
                  style={{
                    borderColor: 'var(--color-surface-border)',
                    backgroundColor: selectedView === req.id ? 'color-mix(in srgb, var(--color-info) 10%, transparent)' : 'transparent',
                  }}
                  onClick={() => setSelectedView(req.id)}>
                  <input type="checkbox" checked={req.selected}
                    onChange={e => { e.stopPropagation(); toggleSelect(req.id); }}
                    onClick={e => e.stopPropagation()} />
                  <span className="text-[9px] font-bold w-[36px] flex-shrink-0 text-right"
                    style={{ color: req.method === 'GET' ? 'var(--color-success)' : req.method === 'POST' ? 'var(--color-info)' : req.method === 'DELETE' ? 'var(--color-error)' : 'var(--color-warning)' }}>
                    {req.method}
                  </span>
                  <span className="text-[10px] truncate flex-1 font-mono" style={{ color: 'var(--color-text-primary)' }}>
                    {req.url.replace(/^https?:\/\/[^/]+/, '')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: request detail */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedReq ? (
              <>
                <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)' }}>
                  <p className="text-[11px] font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    <span style={{ color: 'var(--color-info)' }}>{selectedReq.method}</span> {selectedReq.url}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(selectedReq.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  <div>
                    <p className="text-[10.5px] font-semibold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Headers</p>
                    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
                      {Object.entries(selectedReq.headers).slice(0, 20).map(([k, v]) => (
                        <div key={k} className="flex border-b last:border-0 text-[10.5px]" style={{ borderColor: 'var(--color-surface-border)' }}>
                          <div className="w-[160px] px-2 py-1 font-mono flex-shrink-0 border-r" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-hover)' }}>{k}</div>
                          <div className="px-2 py-1 font-mono truncate" style={{ color: 'var(--color-text-primary)' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {selectedReq.body && (
                    <div>
                      <p className="text-[10.5px] font-semibold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Body</p>
                      <pre className="p-3 rounded-lg text-[10.5px] font-mono whitespace-pre-wrap overflow-auto max-h-[200px]"
                        style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-text-primary)', border: '1px solid var(--color-surface-border)' }}>
                        {selectedReq.body}
                      </pre>
                    </div>
                  )}
                </div>
                <div className="px-4 py-2.5 border-t flex-shrink-0 flex gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
                  <button type="button"
                    onClick={() => { addTab({ method: selectedReq.method, url: selectedReq.url, headers: Object.entries(selectedReq.headers).map(([key, value]) => ({ key, value, enabled: true })), bodyRaw: selectedReq.body || '', bodyType: selectedReq.body ? 'json' : 'none' }); addToast({ type: 'success', message: 'Opened as new tab' }); }}
                    className="h-[28px] px-3 text-[10.5px] font-medium rounded-md cursor-pointer text-white"
                    style={{ backgroundColor: 'var(--color-info)' }}>
                    Open as Tab
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                <p className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  {captured.length === 0 ? 'No requests captured yet' : 'Select a request to inspect it'}
                </p>
                {captured.length > 0 && (
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{captured.length} requests in queue</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          {selectedCount > 0 && (
            <>
              <input value={collectionName} onChange={e => setCollectionName(e.target.value)}
                className="w-[220px] px-2 py-1 rounded text-[11px] outline-none"
                placeholder="Collection name"
                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
              <button type="button" onClick={importAsCollection}
                className="h-[30px] px-3 text-[11px] font-medium rounded-md cursor-pointer text-white"
                style={{ backgroundColor: 'var(--color-success)' }}>
                Import {selectedCount} as Collection
              </button>
              <button type="button" onClick={openSelected}
                className="h-[30px] px-3 text-[11px] font-medium rounded-md cursor-pointer text-white"
                style={{ backgroundColor: 'var(--color-info)' }}>
                Open {Math.min(selectedCount, 20)} as Tabs
              </button>
            </>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
