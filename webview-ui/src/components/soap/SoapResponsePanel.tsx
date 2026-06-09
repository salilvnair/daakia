import { useState } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { PillTabs, CodeEditor, RequestProgressOverlay, CopyButton } from '../shared';
import { ScriptResultsView } from '../shared/display/ScriptResultsView';
import { cancelRequest } from '../../services/request';
import type { PillTab } from '../shared';
import { SparkleIcon } from '../../icons';
import { AiActionButton, type AssistMode } from '../ai/AiAssistPopover';
import { DataSchemaModal } from '../rest/response/DataSchemaModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';

const ACCENT = 'var(--color-protocol-soap)';

const responseTabs: PillTab[] = [
  { id: 'body', label: 'Body' },
  { id: 'headers', label: 'Headers' },
  { id: 'tests', label: 'Tests' },
];

/**
 * SoapResponsePanel — Shows XML response body, response headers, and test results.
 * Detects SOAP faults and displays them with a fault indicator.
 */
export function SoapResponsePanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);
  const storedSubTab = useUiStateStore(s => s.prefs[`soap.response.subtab.${activeTabId}`]);
  const [activeSubTab, setActiveSubTabLocal] = useState(storedSubTab || 'body');
  const [showSchema, setShowSchema] = useState(false);
  const [activePopup, setActivePopup] = useState<AssistMode | null>(null);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const setActiveSubTab = (tab: string) => {
    setActiveSubTabLocal(tab);
    if (activeTabId) useUiStateStore.getState().setPref(`soap.response.subtab.${activeTabId}`, tab);
  };

  if (!activeTab) return null;

  const response = activeTab.response;

  // Show progress overlay while loading (even if previous response exists)
  if (activeTab.loading) {
    const stages = activeTab.requestProgress || [
      { id: 'sending-request', label: 'Sending SOAP request', status: 'running' as const, startTime: Date.now() },
    ];
    return (
      <RequestProgressOverlay
        stages={stages}
        onCancel={() => {
          cancelRequest(activeTab.id);
          useTabsStore.getState().updateTab(activeTab.id, { loading: false, requestProgress: undefined });
        }}
      />
    );
  }

  // If no response yet, show placeholder
  if (!response) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--color-panel)] text-[var(--color-text-muted)] gap-2">
        <span className="text-[28px] opacity-20">&#10216;/&#10217;</span>
        <p className="text-[12px]">Hit Invoke to get a response</p>
        <p className="text-[10px] opacity-60">Ctrl+Enter to run</p>
      </div>
    );
  }

  // Detect SOAP fault in response body
  const hasFault = response.body
    ? /<(soap:|SOAP-ENV:|)Fault[> ]/i.test(response.body)
    : false;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--color-surface-border)] text-[11px]">
        <SoapStatusBadge status={response.status} hasFault={hasFault} />
        <span className="text-[var(--color-text-muted)]">{response.time}ms</span>
        <span className="text-[var(--color-text-muted)]">{formatSize(response.size)}</span>
        {response.status === 0 && response.statusText && (
          <span className="ml-auto text-[var(--color-error)] truncate max-w-[60%]" title={response.statusText}>
            {response.statusText}
          </span>
        )}
        {hasFault && response.status !== 0 && (
          <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase text-[var(--color-error)] bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)]">
            SOAP Fault
          </span>
        )}
      </div>

      {/* Sub-tabs + AI actions */}
      <div className="flex items-center justify-between px-3 pt-2 border-b border-[var(--color-surface-border)]">
        <PillTabs
          tabs={responseTabs}
          activeTab={activeSubTab}
          onChange={setActiveSubTab}
          size="sm"
          variant="underline"
          accentColor={ACCENT}
        />
        {activeSubTab === 'body' && (
          <div className="flex items-center gap-1.5 pb-1.5">
            {aiEnabled('explainSoap') && (
              <AiActionButton
                mode="explain"
                label="Explain"
                response={response}
                requestMethod="SOAP"
                requestUrl={activeTab.url || ''}
                open={activePopup === 'explain'}
                onOpen={() => setActivePopup(p => p === 'explain' ? null : 'explain')}
              />
            )}
            {aiEnabled('followUpsSoap') && (
              <AiActionButton
                mode="follow-up"
                label="Follow-ups"
                response={response}
                requestMethod="SOAP"
                requestUrl={activeTab.url || ''}
                open={activePopup === 'follow-up'}
                onOpen={() => setActivePopup(p => p === 'follow-up' ? null : 'follow-up')}
              />
            )}
            {aiEnabled('schemaSoap') && (
              <button
                type="button"
                onClick={() => setShowSchema(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-medium cursor-pointer transition-all border"
                style={{
                  color: 'var(--color-protocol-ai)',
                  borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 25%, transparent)',
                  backgroundColor: 'transparent',
                }}
                title="Generate Data Schema"
              >
                <SparkleIcon size={10} />
                Schema
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-h-0 flex flex-col ${activeSubTab === 'body' ? '' : 'overflow-y-auto [scrollbar-gutter:stable]'}`}>
        {activeSubTab === 'body' && (
          <>
            {response.status === 0 && response.statusText && (
              <div className="px-3 py-2 border-b border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.06)] text-[11px] text-[var(--color-error)] flex-shrink-0">
                <span className="font-semibold">Error: </span>{response.statusText}
              </div>
            )}
            <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--color-surface-border)]">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Response Body</span>
              <CopyButton text={response.body || ''} size={14} />
            </div>
            <div className="flex-1 min-h-0">
              <CodeEditor
                value={response.body || ''}
                onChange={() => {}}
                language="xml"
                readOnly
                height="100%"
              />
            </div>
          </>
        )}

        {activeSubTab === 'headers' && (
          <div className="p-3 space-y-1">
            {(() => {
              const hdrs = (response as any).headers;
              if (Array.isArray(hdrs)) {
                return hdrs.map((entry: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-[var(--color-text-secondary)] font-semibold">{entry.key}:</span>
                    <span className="text-[var(--color-text-primary)]">{entry.value}</span>
                  </div>
                ));
              }
              return Object.entries(hdrs || {}).length > 0
                ? Object.entries(hdrs).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="text-[var(--color-text-secondary)] font-semibold">{key}:</span>
                      <span className="text-[var(--color-text-primary)]">{val}</span>
                    </div>
                  ))
                : <p className="text-[11px] text-[var(--color-text-muted)]">No response headers</p>;
            })()}
          </div>
        )}

        {activeSubTab === 'tests' && (
          <ScriptResultsView response={response} />
        )}
      </div>
      {showSchema && (
        <DataSchemaModal body={response.body || ''} onClose={() => setShowSchema(false)} />
      )}
    </div>
  );
}

/* --- Helpers --- */

function SoapStatusBadge({ status, hasFault }: { status: number; hasFault: boolean }) {
  const isSuccess = status >= 200 && status < 300 && !hasFault;
  const color = isSuccess ? 'var(--color-success)' : 'var(--color-error)';
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-bold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {status}
    </span>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
