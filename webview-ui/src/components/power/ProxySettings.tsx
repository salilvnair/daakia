/**
 * ProxySettings — HTTP/HTTPS/SOCKS proxy per environment or global.
 * Feature 6B.14 — Proxy settings
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';

interface ProxyConfig {
  enabled: boolean;
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: string;
  username: string;
  password: string;
  noProxy: string;  // comma-separated list of hosts to bypass
  scope: 'global' | 'environment';
  envId?: string;
}

interface Props {
  onClose: () => void;
}

const DEFAULT_CONFIG: ProxyConfig = {
  enabled: false,
  type: 'http',
  host: '',
  port: '8080',
  username: '',
  password: '',
  noProxy: 'localhost, 127.0.0.1, ::1',
  scope: 'global',
};

const STORAGE_KEY = 'daakia:proxy-config';

export function ProxySettings({ onClose }: Props) {
  const [config, setConfig] = useState<ProxyConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored) setConfig(stored);
    } catch { /* ignore */ }
  }, []);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    postMsg({ type: 'proxy:configure', config });
    setSaved(true);
    addToast({ type: 'success', message: config.enabled ? `Proxy configured: ${config.type}://${config.host}:${config.port}` : 'Proxy disabled' });
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (partial: Partial<ProxyConfig>) => setConfig(c => ({ ...c, ...partial }));

  const proxyUrl = config.host && config.port
    ? `${config.type}://${config.username ? `${config.username}:***@` : ''}${config.host}:${config.port}`
    : '';

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[560px] max-h-[88vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: '#1a1a1f', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Proxy Settings</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">HTTP/HTTPS/SOCKS proxy configuration</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Enable toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" checked={config.enabled} onChange={e => update({ enabled: e.target.checked })} className="sr-only" />
              <div className="w-9 h-5 rounded-full transition-colors"
                style={{ backgroundColor: config.enabled ? 'var(--color-success)' : 'var(--color-surface-border)' }}>
                <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ transform: config.enabled ? 'translateX(16px)' : 'translateX(0)' }} />
              </div>
            </div>
            <div>
              <p className="text-[12px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {config.enabled ? 'Proxy enabled' : 'Proxy disabled'}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                All requests will {config.enabled ? '' : 'NOT '}route through the proxy
              </p>
            </div>
          </label>

          <div className={config.enabled ? '' : 'opacity-50 pointer-events-none'}>
            {/* Type */}
            <div className="mb-3">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Proxy type</label>
              <div className="flex gap-2">
                {(['http', 'https', 'socks4', 'socks5'] as const).map(t => (
                  <button key={t} type="button" onClick={() => update({ type: t })}
                    className="px-3 py-1 text-[11px] rounded border cursor-pointer"
                    style={{
                      borderColor: config.type === t ? 'var(--color-info)' : 'var(--color-surface-border)',
                      color: config.type === t ? 'var(--color-info)' : 'var(--color-text-secondary)',
                      backgroundColor: config.type === t ? 'color-mix(in srgb, var(--color-info) 10%, transparent)' : 'transparent',
                    }}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Host + Port */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Host</label>
                <input value={config.host} onChange={e => update({ host: e.target.value })}
                  className="w-full h-[26px] px-2.5 rounded text-[11px] outline-none"
                  placeholder="proxy.example.com or 192.168.1.1"
                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
              </div>
              <div className="w-[80px]">
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Port</label>
                <input value={config.port} onChange={e => update({ port: e.target.value })}
                  className="w-full h-[26px] px-2.5 rounded text-[11px] outline-none"
                  placeholder="8080"
                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
              </div>
            </div>

            {/* Auth */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Username (optional)</label>
                <input value={config.username} onChange={e => update({ username: e.target.value })}
                  className="w-full h-[26px] px-2.5 rounded text-[11px] outline-none"
                  placeholder="proxy_user"
                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Password (optional)</label>
                <input type="password" value={config.password} onChange={e => update({ password: e.target.value })}
                  className="w-full h-[26px] px-2.5 rounded text-[11px] outline-none"
                  placeholder="••••••"
                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
              </div>
            </div>

            {/* No-proxy */}
            <div className="mb-3">
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Bypass proxy for (comma-separated)</label>
              <input value={config.noProxy} onChange={e => update({ noProxy: e.target.value })}
                className="w-full h-[26px] px-2.5 rounded text-[11px] outline-none"
                placeholder="localhost, 127.0.0.1, *.internal.company.com"
                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
            </div>

            {/* Preview */}
            {proxyUrl && (
              <div className="rounded-lg border p-3"
                style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
                <p className="text-[10px] mb-1" style={{ color: 'var(--color-text-muted)' }}>Proxy URL</p>
                <p className="text-[11px] font-mono" style={{ color: 'var(--color-text-primary)' }}>{proxyUrl}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={save}
            className="h-[26px] px-2.5 text-[11px] font-medium rounded cursor-pointer hover:opacity-90 text-white flex items-center gap-1.5"
            style={{ backgroundColor: saved ? 'var(--color-success)' : 'var(--color-info)' }}>
            {saved ? <><CheckIcon size={12} />Saved!</> : 'Save Settings'}
          </button>
          <button type="button" onClick={onClose}
            className="h-[26px] px-2.5 text-[11px] font-medium rounded cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
