/**
 * ProxySettings — HTTP/HTTPS/SOCKS proxy per environment or global.
 * Feature 6B.14 — Proxy settings
 */
import { useState, useEffect } from 'react';
import { CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { ModalView, ButtonView, TextInputView, ToggleSwitchView } from '@salilvnair/dui';
import { logUiEvent } from '../../store/ui-audit-store';

interface ProxyConfig {
  enabled: boolean;
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: string;
  username: string;
  password: string;
  noProxy: string;
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
const ACCENT = 'var(--color-settings)';

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
    logUiEvent('settings.proxy_save', { host: config.host, port: config.port, enabled: config.enabled });
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

  return (
    <ModalView
      open
      title="Proxy Settings"
      subtitle="HTTP/HTTPS/SOCKS proxy configuration"
      headerColor={ACCENT}
      size="md"
      onClose={onClose}
      footerRight={
        <ButtonView
          size="md"
          variant="primary"
          accentColor={saved ? 'var(--color-success)' : ACCENT}
          iconLeft={saved ? <CheckIcon size={12} /> : undefined}
          onClick={save}
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </ButtonView>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        {/* Enable toggle */}
        <div className="flex items-center gap-3">
          <ToggleSwitchView
            checked={config.enabled}
            onChange={v => { logUiEvent('settings.proxy_toggle', { enabled: v }); update({ enabled: v }); }}
            accentColor={ACCENT}
            size="sm"
          />
          <div>
            <p className="text-[12px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {config.enabled ? 'Proxy enabled' : 'Proxy disabled'}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              All requests will {config.enabled ? '' : 'NOT '}route through the proxy
            </p>
          </div>
        </div>

        <div className={config.enabled ? '' : 'opacity-50 pointer-events-none'}>
          {/* Type */}
          <div className="mb-3">
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Proxy type</label>
            <div className="flex gap-2">
              {(['http', 'https', 'socks4', 'socks5'] as const).map(t => (
                <ButtonView
                  key={t}
                  size="sm"
                  accentColor={config.type === t ? ACCENT : 'var(--color-text-muted)'}
                  onClick={() => update({ type: t })}
                >
                  {t.toUpperCase()}
                </ButtonView>
              ))}
            </div>
          </div>

          {/* Host + Port */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Host</label>
              <TextInputView
                value={config.host}
                onChange={e => update({ host: e.target.value })}
                placeholder="proxy.example.com or 192.168.1.1"
                size="md"
                accentColor={ACCENT}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ width: 80 }}>
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Port</label>
              <TextInputView
                value={config.port}
                onChange={e => update({ port: e.target.value })}
                placeholder="8080"
                size="md"
                accentColor={ACCENT}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Auth */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Username (optional)</label>
              <TextInputView
                value={config.username}
                onChange={e => update({ username: e.target.value })}
                placeholder="proxy_user"
                size="md"
                accentColor={ACCENT}
                style={{ width: '100%' }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Password (optional)</label>
              <TextInputView
                type="password"
                value={config.password}
                onChange={e => update({ password: e.target.value })}
                placeholder="••••••"
                size="md"
                accentColor={ACCENT}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* No-proxy */}
          <div className="mb-3">
            <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Bypass proxy for (comma-separated)</label>
            <TextInputView
              value={config.noProxy}
              onChange={e => update({ noProxy: e.target.value })}
              placeholder="localhost, 127.0.0.1, *.internal.company.com"
              size="md"
              accentColor={ACCENT}
              style={{ width: '100%' }}
            />
          </div>

          {/* Preview */}
          {proxyUrl && (
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
              <p className="text-[10px] mb-1" style={{ color: 'var(--color-text-muted)' }}>Proxy URL</p>
              <p className="text-[11px] font-mono" style={{ color: 'var(--color-text-primary)' }}>{proxyUrl}</p>
            </div>
          )}
        </div>
      </div>
    </ModalView>
  );
}
