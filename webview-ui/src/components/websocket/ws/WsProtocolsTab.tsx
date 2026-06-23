/**
 * WsProtocolsTab — WebSocket sub-protocols management tab.
 */
import { useTabsStore } from '../../../store/tabs-store';
import { TrashIcon, PlusIcon } from '../../../icons';
import { InsertRowDivider } from '../../shared';
import {
  IconButtonView,
  CheckboxView,
  TextInputView,
} from '@salilvnair/dui';

const ACCENT = 'var(--color-protocol-websocket)';

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
          <IconButtonView
            size="xs"
            icon={<TrashIcon size={12} />}
            title="Clear all"
            accentColor="var(--color-error)"
            onClick={clearAll}
          />
          <IconButtonView
            size="xs"
            icon={<PlusIcon size={12} />}
            title="Add protocol"
            accentColor={ACCENT}
            onClick={addEntry}
          />
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-3 py-2">
        {entries.map((entry, idx) => (
          <div key={entry.id}>
            <div className={`flex items-center gap-2 group ${!entry.enabled ? 'opacity-50' : ''}`}>
              <CheckboxView
                size="sm"
                checked={entry.enabled}
                onChange={() => toggleEntry(entry.id)}
                accentColor={ACCENT}
              />
              <TextInputView
                size="sm"
                value={entry.value}
                onChange={(e) => updateEntry(entry.id, e.target.value)}
                placeholder={`Protocol ${idx + 1}`}
                style={{ fontFamily: 'monospace', flex: 1 }}
              />
              <span className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <IconButtonView
                  size="xs"
                  icon={<TrashIcon size={12} />}
                  title="Remove"
                  accentColor="var(--color-error)"
                  onClick={() => removeEntry(entry.id)}
                />
              </span>
            </div>
            <InsertRowDivider
              onInsert={() => {
                const updated = [...entries];
                updated.splice(idx + 1, 0, { id: crypto.randomUUID(), value: '', enabled: true });
                saveEntries(updated);
              }}
              accentColor={ACCENT}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
