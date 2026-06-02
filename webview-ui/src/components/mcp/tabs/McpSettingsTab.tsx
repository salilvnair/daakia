import { useCallback } from 'react';
import { useTabsStore } from '../../../store/tabs-store';

/**
 * McpSettingsTab — Working directory, timeouts, auto-reconnect, max retries.
 */
export function McpSettingsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const settings = activeTab?.mcpSettings || {
    connectionTimeout: 15000,
    requestTimeout: 30000,
    autoReconnect: true,
    maxRetries: 3,
  };

  const updateSetting = useCallback((key: string, value: number | boolean | string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, {
      mcpSettings: { ...settings, [key]: value },
      dirty: true,
    });
  }, [activeTab, updateTab, settings]);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col px-4 py-3 gap-2.5 overflow-auto">
      {/* Connection Timeout */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[140px] flex-shrink-0">Connection Timeout</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={settings.connectionTimeout}
            onChange={(e) => updateSetting('connectionTimeout', parseInt(e.target.value) || 15000)}
            min={1000}
            max={120000}
            step={1000}
            className="w-[100px] h-[28px] px-2.5 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <span className="text-[11px] text-[var(--color-text-muted)]">ms</span>
        </div>
      </div>

      {/* Request Timeout */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[140px] flex-shrink-0">Request Timeout</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={settings.requestTimeout}
            onChange={(e) => updateSetting('requestTimeout', parseInt(e.target.value) || 30000)}
            min={1000}
            max={300000}
            step={1000}
            className="w-[100px] h-[28px] px-2.5 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <span className="text-[11px] text-[var(--color-text-muted)]">ms</span>
        </div>
      </div>

      {/* Max Retries */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[140px] flex-shrink-0">Max Retries</span>
        <input
          type="number"
          value={settings.maxRetries}
          onChange={(e) => updateSetting('maxRetries', parseInt(e.target.value) || 3)}
          min={0}
          max={10}
          className="w-[80px] h-[28px] px-2.5 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      {/* Auto Reconnect */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[140px] flex-shrink-0">Auto Reconnect</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateSetting('autoReconnect', !settings.autoReconnect)}
            className={`w-[34px] h-[18px] rounded-full relative transition-colors cursor-pointer ${settings.autoReconnect ? 'bg-[var(--color-protocol-mcp)]' : 'bg-[var(--color-surface-border)]'}`}
          >
            <div
              className="w-[14px] h-[14px] rounded-full bg-white absolute top-[2px] transition-transform"
              style={{ transform: settings.autoReconnect ? 'translateX(18px)' : 'translateX(2px)' }}
            />
          </button>
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {settings.autoReconnect ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {/* Working Directory */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[140px] flex-shrink-0">Working Directory</span>
        <input
          type="text"
          value={settings.workingDir || ''}
          onChange={(e) => updateSetting('workingDir', e.target.value)}
          placeholder="Leave blank for workspace root"
          className="flex-1 max-w-[300px] h-[28px] px-2.5 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>
    </div>
  );
}
