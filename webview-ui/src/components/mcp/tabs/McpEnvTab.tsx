import { useState, useCallback } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { KeyValueTableView, type KeyValueTableRow } from '@salilvnair/dui';

const ACCENT = 'var(--color-protocol-mcp)';

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
 * McpEnvTab — STDIO process environment variables.
 * Injected into the MCP server process at startup. Use for API keys, tokens, and secrets.
 */
export function McpEnvTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const [rows, setRows] = useState<KeyValueTableRow[]>(() =>
    envVarsToRows(activeTab?.mcpEnvVars || {})
  );

  const handleChange = useCallback((newRows: KeyValueTableRow[]) => {
    if (!activeTab) return;
    setRows(newRows);
    updateTab(activeTab.id, { mcpEnvVars: rowsToEnvVars(newRows), dirty: true });
  }, [activeTab, updateTab]);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 overflow-auto">
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
