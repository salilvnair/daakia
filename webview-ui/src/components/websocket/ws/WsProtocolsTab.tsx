/**
 * WsProtocolsTab — WebSocket sub-protocols management tab.
 */
import { useTabsStore } from '../../../store/tabs-store';
import { TrashIcon, PlusIcon, CheckCircleFilledIcon } from '../../../icons';
import { InsertRowDivider } from '../../shared';

export function WsProtocolsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  if (!activeTab) return null;

  // Protocols stored as JSON array in authData['ws_protocol_entries']
  const rawEntries = activeTab.authData?.['ws_protocol_entries'];
  const entries: { id: string; value: string; enabled: boolean }[] = rawEntries
    ? JSON.parse(rawEntries)
    : [{ id: crypto.randomUUID(), value: '', enabled: true }];

  const saveEntries = (updated: typeof entries) => {
    updateTab(activeTab.id, {
      authData: {
        ...activeTab.authData,
        ws_protocol_entries: JSON.stringify(updated),
        // Also update the flat protocols string for the connect handler
        ws_protocols: updated.filter(e => e.enabled && e.value.trim()).map(e => e.value.trim()).join(','),
      },
    });
  };

  const addEntry = () => {
    saveEntries([...entries, { id: crypto.randomUUID(), value: '', enabled: true }]);
  };

  const removeEntry = (id: string) => {
    const updated = entries.filter(e => e.id !== id);
    saveEntries(updated.length ? updated : [{ id: crypto.randomUUID(), value: '', enabled: true }]);
  };

  const toggleEntry = (id: string) => {
    saveEntries(entries.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e));
  };

  const updateEntry = (id: string, value: string) => {
    saveEntries(entries.map(e => e.id === id ? { ...e, value } : e));
  };

  const clearAll = () => {
    saveEntries([{ id: crypto.randomUUID(), value: '', enabled: true }]);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
        <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Protocols</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clearAll}
            className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors flex items-center justify-center rounded-md"
            title="Clear all"
          >
            <TrashIcon size={12} />
          </button>
          <button
            type="button"
            onClick={addEntry}
            className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-protocol-websocket)] hover:bg-[rgba(76,175,80,0.08)] cursor-pointer transition-colors flex items-center justify-center rounded-md"
            title="Add protocol"
          >
            <PlusIcon size={12} />
          </button>
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-3 py-2">
        {entries.map((entry, idx) => (
          <div key={entry.id}>
            <div className={`flex items-center gap-2 group ${!entry.enabled ? 'opacity-50' : ''}`}>
              <button
                type="button"
                onClick={() => toggleEntry(entry.id)}
                className="h-[26px] w-[26px] flex items-center justify-center cursor-pointer rounded-md transition-colors hover:bg-[var(--color-hover)] flex-shrink-0"
                title={entry.enabled ? 'Disable' : 'Enable'}
              >
                <CheckCircleFilledIcon size={14} checked={entry.enabled} />
              </button>
              <input
                type="text"
                value={entry.value}
                onChange={(e) => updateEntry(entry.id, e.target.value)}
                placeholder={`Protocol ${idx + 1}`}
                className="flex-1 h-[30px] px-2.5 text-[12px] font-mono rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                className="h-[26px] w-[26px] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer rounded-md transition-colors hover:bg-[rgba(239,68,68,0.08)] opacity-0 group-hover:opacity-100 flex-shrink-0"
                title="Remove"
              >
                <TrashIcon size={12} />
              </button>
            </div>
            <InsertRowDivider
              onInsert={() => {
                const updated = [...entries];
                updated.splice(idx + 1, 0, { id: crypto.randomUUID(), value: '', enabled: true });
                saveEntries(updated);
              }}
              accentColor="var(--color-protocol-websocket)"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
