import { useCallback } from 'react';
import { useTabsStore, type McpAuth } from '../../../store/tabs-store';
import { StyledDropdown, type DropdownOption } from '../../shared';

const ACCENT = 'var(--color-protocol-mcp)';

const AUTH_OPTIONS: DropdownOption[] = [
  { value: 'none', label: 'No Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'api-key', label: 'API Key Header' },
];

const DEFAULT_AUTH: McpAuth = { type: 'none' };

/**
 * McpAuthTab — Transport authentication.
 * HTTP transport: Bearer token or custom API key header.
 * STDIO transport: env-var table for auth credentials.
 */
export function McpAuthTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const transport = activeTab?.mcpTransport || 'stdio';
  const auth: McpAuth = activeTab?.mcpAuth || DEFAULT_AUTH;

  const updateAuth = useCallback((patch: Partial<McpAuth>) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { mcpAuth: { ...auth, ...patch }, dirty: true });
  }, [activeTab, updateTab, auth]);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col gap-5 px-4 py-3 overflow-auto">
      {transport === 'http' ? (
        <>
          {/* HTTP Auth type selector */}
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[var(--color-text-muted)] w-[120px] shrink-0">Auth Type</span>
            <div className="shrink-0">
              <StyledDropdown
                options={AUTH_OPTIONS}
                value={auth.type}
                onChange={(val) => updateAuth({ type: val as McpAuth['type'] })}
                accentColor={ACCENT}
              />
            </div>
          </div>

          {/* Bearer token */}
          {auth.type === 'bearer' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-[var(--color-text-muted)]">Bearer Token</label>
              <input
                type="password"
                value={auth.token || ''}
                onChange={(e) => updateAuth({ token: e.target.value })}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="h-[28px] px-2.5 text-[12px] rounded-md font-mono focus:outline-none"
                style={{
                  backgroundColor: 'var(--color-input-bg)',
                  border: '1px solid var(--color-input-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
              <p className="text-[10.5px] text-[var(--color-text-muted)] opacity-80">
                Sent as <code className="text-[10px]">Authorization: Bearer &lt;token&gt;</code>
              </p>
            </div>
          )}

          {/* API key header */}
          {auth.type === 'api-key' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] text-[var(--color-text-muted)]">Header Name</label>
                <input
                  type="text"
                  value={auth.headerName || ''}
                  onChange={(e) => updateAuth({ headerName: e.target.value })}
                  placeholder="X-API-Key"
                  className="h-[28px] px-2.5 text-[12px] rounded-md font-mono focus:outline-none"
                  style={{
                    backgroundColor: 'var(--color-input-bg)',
                    border: '1px solid var(--color-input-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] text-[var(--color-text-muted)]">Header Value</label>
                <input
                  type="password"
                  value={auth.headerValue || ''}
                  onChange={(e) => updateAuth({ headerValue: e.target.value })}
                  placeholder="sk-..."
                  className="h-[28px] px-2.5 text-[12px] rounded-md font-mono focus:outline-none"
                  style={{
                    backgroundColor: 'var(--color-input-bg)',
                    border: '1px solid var(--color-input-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
            </div>
          )}

          {auth.type === 'none' && (
            <p className="text-[12px] text-[var(--color-text-muted)] opacity-70">
              No authentication. The MCP server accepts anonymous connections.
            </p>
          )}
        </>
      ) : (
        /* STDIO — env var table for auth credentials */
        <StdioAuthEnvTable activeTabId={activeTab.id} />
      )}
    </div>
  );
}

/** Env-var table for STDIO auth — pass secrets via process environment */
function StdioAuthEnvTable({ activeTabId }: { activeTabId: string }) {
  const tab = useTabsStore(s => s.tabs.find(t => t.id === activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const envVars = tab?.mcpEnvVars || {};
  const keys = Object.keys(envVars);

  const updateVar = useCallback((key: string, value: string) => {
    const next = { ...envVars, [key]: value };
    updateTab(activeTabId, { mcpEnvVars: next, dirty: true });
  }, [activeTabId, envVars, updateTab]);

  const removeVar = useCallback((key: string) => {
    const next = { ...envVars };
    delete next[key];
    updateTab(activeTabId, { mcpEnvVars: next, dirty: true });
  }, [activeTabId, envVars, updateTab]);

  const addVar = useCallback(() => {
    const next = { ...envVars, '': '' };
    updateTab(activeTabId, { mcpEnvVars: next, dirty: true });
  }, [activeTabId, envVars, updateTab]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide">
          Auth Environment Variables
        </span>
        <button
          type="button"
          onClick={addVar}
          className="text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors"
          style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}
        >
          + Add
        </button>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)] opacity-70">
        These env vars are injected into the STDIO process environment. Use them for API keys, tokens, and secrets.
      </p>

      {keys.length === 0 && (
        <p className="text-[12px] text-[var(--color-text-muted)] opacity-60 italic">No auth variables configured.</p>
      )}

      {keys.map((k) => (
        <div key={k} className="flex items-center gap-2">
          <input
            type="text"
            value={k}
            onChange={(e) => {
              const newKey = e.target.value;
              const next = { ...envVars };
              const val = next[k];
              delete next[k];
              next[newKey] = val;
              updateTab(activeTabId, { mcpEnvVars: next, dirty: true });
            }}
            placeholder="VARIABLE_NAME"
            className="flex-1 h-[28px] px-2.5 text-[12px] rounded-md font-mono focus:outline-none"
            style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
          />
          <input
            type="password"
            value={envVars[k] || ''}
            onChange={(e) => updateVar(k, e.target.value)}
            placeholder="value (secret)"
            className="flex-1 h-[28px] px-2.5 text-[12px] rounded-md font-mono focus:outline-none"
            style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
          />
          <button
            type="button"
            onClick={() => removeVar(k)}
            className="text-[11px] px-1.5 py-0.5 cursor-pointer transition-colors"
            style={{ color: 'var(--color-error)' }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
