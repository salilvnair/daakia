import { useState, useCallback } from 'react';
import { useTabsStore, type McpAuth } from '../../../store/tabs-store';
import { TextInputView, SelectInputView, KeyValueTableView, type KeyValueTableRow } from '@salilvnair/dui';

const ACCENT = 'var(--color-protocol-mcp)';

const AUTH_OPTIONS = [
  { value: 'none', label: 'No Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'api-key', label: 'API Key Header' },
];

const DEFAULT_AUTH: McpAuth = { type: 'none' };

function makeRow(): KeyValueTableRow {
  return { id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true };
}

function envVarsToRows(env: Record<string, string>): KeyValueTableRow[] {
  const entries = Object.entries(env);
  if (entries.length === 0) return [makeRow()];
  return entries.map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value,
    description: '',
    enabled: true,
  }));
}

function rowsToEnvVars(rows: KeyValueTableRow[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const r of rows) {
    if (r.key.trim()) env[r.key.trim()] = r.value;
  }
  return env;
}

/**
 * McpAuthTab — Transport authentication.
 * HTTP transport: Bearer token or custom API key header.
 * STDIO transport: env-var key/value table (same layout as REST Headers).
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
    <div className="flex flex-col gap-4 px-4 py-3 overflow-auto">
      {transport === 'http' ? (
        <>
          {/* HTTP Auth type selector */}
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[var(--color-text-muted)] w-[120px] shrink-0">Auth Type</span>
            <SelectInputView
              options={AUTH_OPTIONS}
              value={auth.type}
              onChange={(val) => updateAuth({ type: val as McpAuth['type'] })}
              size="md"
              accentColor={ACCENT}
            />
          </div>

          {/* Bearer token */}
          {auth.type === 'bearer' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-[var(--color-text-muted)]">Bearer Token</label>
              <TextInputView
                masked
                value={auth.token || ''}
                onChange={(e) => updateAuth({ token: e.target.value })}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                size="md"
                accentColor={ACCENT}
                style={{ width: '100%', fontFamily: 'monospace' }}
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
                <TextInputView
                  value={auth.headerName || ''}
                  onChange={(e) => updateAuth({ headerName: e.target.value })}
                  placeholder="X-API-Key"
                  size="md"
                  accentColor={ACCENT}
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] text-[var(--color-text-muted)]">Header Value</label>
                <TextInputView
                  masked
                  value={auth.headerValue || ''}
                  onChange={(e) => updateAuth({ headerValue: e.target.value })}
                  placeholder="sk-..."
                  size="md"
                  accentColor={ACCENT}
                  style={{ width: '100%', fontFamily: 'monospace' }}
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
        <StdioAuthEnvTable activeTabId={activeTab.id} />
      )}
    </div>
  );
}

function StdioAuthEnvTable({ activeTabId }: { activeTabId: string }) {
  const tab = useTabsStore(s => s.tabs.find(t => t.id === activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const [rows, setRows] = useState<KeyValueTableRow[]>(() =>
    envVarsToRows(tab?.mcpEnvVars || {})
  );

  const handleChange = useCallback((newRows: KeyValueTableRow[]) => {
    setRows(newRows);
    updateTab(activeTabId, { mcpEnvVars: rowsToEnvVars(newRows), dirty: true });
  }, [activeTabId, updateTab]);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] text-[var(--color-text-muted)] opacity-70">
        These env vars are injected into the STDIO process environment. Use them for API keys, tokens, and secrets.
      </p>
      <KeyValueTableView
        rows={rows}
        onChange={handleChange}
        label="Variable"
        placeholder={{ key: 'VARIABLE_NAME', value: 'value (secret)' }}
        maskSensitive
        accentColor={ACCENT}
      />
    </div>
  );
}
