import { useState, useMemo, useRef } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { PillTabs, KeyValueTable, CodeEditor, AuthEditor, ScriptsEditor } from '../shared';
import type { PillTab, KeyValueRow } from '../shared';
import { GrpcProtoManager } from './GrpcProtoManager';
import { SparkleIcon } from '../../icons';
import { AiHeaderSuggest } from '../ai/AiHeaderSuggest';
import { AiBodyGenerate } from '../ai/AiBodyGenerate';
import type { AiBodyGenerateHandle } from '../ai/AiBodyGenerate';
import { AiRequestFuzzerModal } from '../ai/AiRequestFuzzerModal';
import { AiGrpcProtoExplainerModal } from '../ai/AiGrpcProtoExplainerModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';

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
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const [activeSubTab, setActiveSubTab] = useState('message');
  const [showFuzzer, setShowFuzzer] = useState(false);
  const [showProtoExplainer, setShowProtoExplainer] = useState(false);
  const bodyGenRef = useRef<AiBodyGenerateHandle>(null);

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
          <div className="h-full flex flex-col min-h-0">
            {/* 8.15 & 8.16: Message toolbar */}
            {(aiEnabled('bodyGenerator') || aiEnabled('requestFuzzer')) && (
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] flex-shrink-0">
                <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Request Message (JSON)</span>
                <div className="flex items-center gap-1">
                  {aiEnabled('bodyGenerator') && (
                    <button
                      type="button"
                      onClick={() => bodyGenRef.current?.open()}
                      className="flex items-center gap-1 h-[26px] px-2 rounded-md text-[10.5px] font-medium cursor-pointer transition-all"
                      style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 8%, transparent)` }}
                      title="AI Message Generator"
                    >
                      <SparkleIcon size={10} />
                      Generate ✦
                    </button>
                  )}
                  {aiEnabled('requestFuzzer') && (
                    <button
                      type="button"
                      onClick={() => setShowFuzzer(true)}
                      className="flex items-center gap-1 h-[26px] px-2 rounded-md text-[10.5px] font-medium cursor-pointer transition-all"
                      style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 8%, transparent)` }}
                      title="AI Request Fuzzer"
                    >
                      <SparkleIcon size={10} />
                      Fuzz ✦
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <CodeEditor
                value={activeTab.grpcMessage || '{\n  \n}'}
                onChange={(val) => updateTab(activeTab.id, { grpcMessage: val, dirty: true })}
                language="json"
                className="h-full"
              />
            </div>
            {/* 8.15: Body generator drawer */}
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
            {/* 8.14: Metadata Suggest ✦ */}
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
              <KeyValueTable
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
            {/* 8.17: Proto Explainer button */}
            {aiEnabled('grpcProtoExplainer') && (activeTab.grpcServices?.length || activeTab.grpcProtoFile) && (
              <div className="flex items-center justify-end px-3 py-1.5 border-b border-[var(--color-surface-border)] flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowProtoExplainer(true)}
                  className="flex items-center gap-1 h-[26px] px-2 rounded-md text-[10.5px] font-medium cursor-pointer transition-all"
                  style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 8%, transparent)` }}
                  title="AI Proto Explainer — plain-English explanation of all services and methods"
                >
                  <SparkleIcon size={10} />
                  Proto Explainer ✦
                </button>
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
