import { useState, useMemo, useRef } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { AuthEditor, ScriptsEditor } from '../shared';
import type { KeyValueRow } from '../shared';
import { GrpcProtoManager } from './GrpcProtoManager';
import { AiHeaderSuggest } from '../ai/AiHeaderSuggest';
import { AiBodyGenerate } from '../ai/AiBodyGenerate';
import type { AiBodyGenerateHandle } from '../ai/AiBodyGenerate';
import { AiRequestFuzzerModal } from '../ai/AiRequestFuzzerModal';
import { AiGrpcProtoExplainerModal } from '../ai/AiGrpcProtoExplainerModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { WandIcon } from '../../icons';
import {
  TabView,
  EditorView,
  KeyValueTableView,
  AIButtonView,
  IconButtonView,
  type TabItem,
} from '@salilvnair/dui';

const ACCENT = 'var(--color-protocol-grpc)';

/**
 * GrpcRequestConfig — sub-tabs: Message (JSON editor), Metadata (KV table),
 * Auth (shared AuthEditor), Scripts (shared ScriptsEditor).
 */
export function GrpcRequestConfig() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const [activeSubTab, setActiveSubTab] = useState('message');
  const [showFuzzer, setShowFuzzer] = useState(false);
  const [showProtoExplainer, setShowProtoExplainer] = useState(false);
  const bodyGenRef = useRef<AiBodyGenerateHandle>(null);

  if (!activeTab) return null;

  const tabItems: TabItem[] = useMemo(() => [
    { id: 'message', label: 'Message', dot: !!(activeTab.grpcMessage), dotColor: ACCENT },
    {
      id: 'metadata',
      label: 'Metadata',
      badge: (activeTab.grpcMetadata || []).filter(m => m.enabled && m.key).length || undefined,
      badgeColor: ACCENT,
    },
    { id: 'proto', label: 'Service Definition' },
    { id: 'auth', label: 'Auth', dot: activeTab.authType !== 'none', dotColor: ACCENT },
    {
      id: 'scripts',
      label: 'Scripts',
      dot: !!(activeTab.preRequestScript?.trim()) || !!(activeTab.postResponseScript?.trim()),
      dotColor: ACCENT,
    },
  ], [activeTab]);

  const handleMetadataChange = (rows: KeyValueRow[]) => {
    updateTab(activeTab.id, { grpcMetadata: rows, dirty: true });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[var(--color-surface)]">
      {/* Sub-tabs */}
      <div className="px-3 pt-2.5 pb-0 border-b border-[var(--color-surface-border)]">
        <TabView
          tabs={tabItems}
          activeTab={activeSubTab}
          onChange={setActiveSubTab}
          size="md"
          variant="underline"
          accentColor={ACCENT}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        {activeSubTab === 'message' && (
          <div className="h-full flex flex-col min-h-0">
            {/* Message toolbar — always visible */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] flex-shrink-0">
              <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Request Message (JSON)</span>
              <div className="flex items-center gap-1">
                <IconButtonView
                  icon={<WandIcon size={12} />}
                  size="sm"
                  title="Prettify JSON"
                  onClick={() => {
                    try {
                      const formatted = JSON.stringify(JSON.parse(activeTab.grpcMessage || '{}'), null, 2);
                      updateTab(activeTab.id, { grpcMessage: formatted, dirty: true });
                    } catch { /* invalid JSON */ }
                  }}
                />
                {aiEnabled('bodyGenerator') && (
                  <AIButtonView
                    action="generate"
                    label="Generate ✦"
                    size="sm"
                    accentColor={ACCENT}
                    onClick={() => bodyGenRef.current?.open()}
                  />
                )}
                {aiEnabled('requestFuzzer') && (
                  <AIButtonView
                    action="fuzz"
                    label="Fuzz ✦"
                    size="sm"
                    accentColor={ACCENT}
                    onClick={() => setShowFuzzer(true)}
                  />
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <EditorView
                value={activeTab.grpcMessage || '{\n  \n}'}
                onChange={(val) => updateTab(activeTab.id, { grpcMessage: val, dirty: true })}
                language="json"
                className="h-full"
              />
            </div>
            {aiEnabled('bodyGenerator') && (
              <AiBodyGenerate
                ref={bodyGenRef}
                tabId={activeTab.id}
                method="gRPC"
                url={activeTab.url || ''}
                contentType="application/json"
                onApply={(body) => updateTab(activeTab.id, { grpcMessage: body, dirty: true })}
              />
            )}
          </div>
        )}

        {activeSubTab === 'metadata' && (
          <div className="h-full flex flex-col min-h-0">
            {aiEnabled('headerAutocomplete') && (
              <AiHeaderSuggest
                tabId={activeTab.id}
                method="gRPC"
                url={activeTab.url || ''}
                bodyContentType="application/grpc"
                authType={activeTab.authType}
                existingHeaders={(activeTab.grpcMetadata || []).map(m => ({ id: m.id, key: m.key, value: m.value, enabled: m.enabled }))}
                onAddHeader={(key, value) => {
                  const rows = [...(activeTab.grpcMetadata || [])];
                  const empty = rows.findIndex(r => !r.key);
                  if (empty >= 0) {
                    rows[empty] = { ...rows[empty], key, value, enabled: true };
                  } else {
                    rows.push({ id: crypto.randomUUID(), key, value, description: '', enabled: true });
                  }
                  updateTab(activeTab.id, { grpcMetadata: rows, dirty: true });
                }}
              />
            )}
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-3">
              <KeyValueTableView
                rows={activeTab.grpcMetadata || [{ id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true }]}
                onChange={handleMetadataChange}
                showDescription={false}
                placeholder={{ key: 'metadata-key', value: 'metadata-value' }}
                accentColor={ACCENT}
              />
            </div>
          </div>
        )}

        {activeSubTab === 'proto' && (
          <div className="h-full flex flex-col min-h-0">
            {aiEnabled('grpcProtoExplainer') && (activeTab.grpcServices?.length || activeTab.grpcProtoFile) && (
              <div className="flex items-center justify-end px-3 py-1.5 border-b border-[var(--color-surface-border)] flex-shrink-0">
                <AIButtonView
                  action="explain"
                  label="Proto Explainer ✦"
                  size="sm"
                  accentColor={ACCENT}
                  onClick={() => setShowProtoExplainer(true)}
                />
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
              <GrpcProtoManager />
            </div>
          </div>
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

      {/* Modals */}
      {showFuzzer && <AiRequestFuzzerModal onClose={() => setShowFuzzer(false)} />}
      {showProtoExplainer && <AiGrpcProtoExplainerModal onClose={() => setShowProtoExplainer(false)} />}
    </div>
  );
}
