import { useState, useMemo } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { PillTabs, KeyValueTable, CodeEditor, AuthEditor, ScriptsEditor } from '../shared';
import type { PillTab, KeyValueRow } from '../shared';
import { GrpcProtoManager } from './GrpcProtoManager';

const ACCENT = 'var(--color-protocol-grpc)';

const tabs: PillTab[] = [
  { id: 'message', label: 'Message' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'proto', label: 'Service Definition' },
  { id: 'auth', label: 'Auth' },
  { id: 'scripts', label: 'Scripts' },
];

/**
 * GrpcRequestConfig — sub-tabs: Message (JSON editor), Metadata (KV table),
 * Auth (shared AuthEditor), Scripts (shared ScriptsEditor).
 */
export function GrpcRequestConfig() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [activeSubTab, setActiveSubTab] = useState('message');

  if (!activeTab) return null;

  // Add dot/badge indicators
  const tabsWithBadges = useMemo(() => tabs.map(t => {
    switch (t.id) {
      case 'message': return { ...t, dot: !!(activeTab.grpcMessage) };
      case 'metadata': return { ...t, badge: (activeTab.grpcMetadata || []).filter(m => m.enabled && m.key).length };
      case 'auth': return { ...t, dot: activeTab.authType !== 'none' };
      case 'scripts': return { ...t, dot: !!(activeTab.preRequestScript?.trim()) || !!(activeTab.postResponseScript?.trim()) };
      default: return t;
    }
  }), [activeTab]);

  const handleMetadataChange = (rows: KeyValueRow[]) => {
    updateTab(activeTab.id, { grpcMetadata: rows, dirty: true });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[var(--color-surface)]">
      {/* Sub-tabs */}
      <div className="px-3 pt-2.5 pb-0 border-b border-[var(--color-surface-border)]">
        <PillTabs
          tabs={tabsWithBadges}
          activeTab={activeSubTab}
          onChange={setActiveSubTab}
          size="sm"
          variant="underline"
          accentColor={ACCENT}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        {activeSubTab === 'message' && (
          <div className="h-full">
            <CodeEditor
              value={activeTab.grpcMessage || '{\n  \n}'}
              onChange={(val) => updateTab(activeTab.id, { grpcMessage: val, dirty: true })}
              language="json"
              className="h-full"
            />
          </div>
        )}

        {activeSubTab === 'metadata' && (
          <div className="p-3">
            <KeyValueTable
              rows={activeTab.grpcMetadata || [{ id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true }]}
              onChange={handleMetadataChange}
              showDescription={false}
              placeholder={{ key: 'metadata-key', value: 'metadata-value' }}
              accentColor={ACCENT}
            />
          </div>
        )}

        {activeSubTab === 'proto' && (
          <GrpcProtoManager />
        )}

        {activeSubTab === 'auth' && (
          <div className="p-3">
            <AuthEditor
              authType={activeTab.authType}
              authData={activeTab.authData}
              onAuthTypeChange={(t) => { updateTab(activeTab.id, { authType: t } as any); }}
              onAuthDataChange={(d) => { updateTab(activeTab.id, { authData: d } as any); }}
              accentColor={ACCENT}
            />
          </div>
        )}

        {activeSubTab === 'scripts' && (
          <div className="h-full flex flex-col">
            <ScriptsEditor
              preRequestScript={activeTab.preRequestScript}
              postResponseScript={activeTab.postResponseScript}
              onPreRequestScriptChange={(v) => updateTab(activeTab.id, { preRequestScript: v, dirty: true })}
              onPostResponseScriptChange={(v) => updateTab(activeTab.id, { postResponseScript: v, dirty: true })}
              accentColor={ACCENT}
            />
          </div>
        )}
      </div>
    </div>
  );
}
