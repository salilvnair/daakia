import { useCallback, useMemo } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { KeyValueTable, type KeyValueRow } from '../../shared';

/**
 * McpEnvTab — Environment variables for the MCP STDIO process using KeyValueTable.
 */
export function McpEnvTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const envVars = activeTab?.mcpEnvVars || {};

  // Convert Record<string,string> → KeyValueRow[]
  const rows: KeyValueRow[] = useMemo(() => {
    const entries = Object.entries(envVars);
    const mapped: KeyValueRow[] = entries.map(([key, value]) => ({
      id: key, // use key as ID since keys are unique
      key,
      value,
      enabled: true,
    }));
    // Always have an empty row at the end for adding
    if (mapped.length === 0 || mapped[mapped.length - 1].key !== '') {
      mapped.push({ id: crypto.randomUUID(), key: '', value: '', enabled: true });
    }
    return mapped;
  }, [envVars]);

  // Convert KeyValueRow[] → Record<string,string>
  const handleChange = useCallback((newRows: KeyValueRow[]) => {
    if (!activeTab) return;
    const updated: Record<string, string> = {};
    for (const row of newRows) {
      if (row.key.trim()) {
        updated[row.key.trim()] = row.value;
      }
    }
    updateTab(activeTab.id, { mcpEnvVars: updated, dirty: true });
  }, [activeTab, updateTab]);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] px-3 py-2">
      <KeyValueTable
        rows={rows}
        onChange={handleChange}
        placeholder={{ key: 'VARIABLE_NAME', value: 'value' }}
        label="Environment Variables"
        accentColor="var(--color-protocol-mcp)"
      />
    </div>
  );
}
