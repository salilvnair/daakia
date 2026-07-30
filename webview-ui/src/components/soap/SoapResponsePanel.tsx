import { useState, useEffect, useRef } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { RequestProgressOverlay } from '../shared';
import { ScriptResultsView } from '../shared/display/ScriptResultsView';
import { cancelRequest } from '../../services/request';
import { AiAssistPopover, type AssistMode } from '../ai/AiAssistPopover';
import { DataSchemaModal } from '../rest/response/DataSchemaModal';
import { AiResponseActionsMenu } from '../rest/response/AiResponseActionsMenu';
import { AiResponsePatternLearning } from '../ai/AiResponsePatternLearning';
import { AiSmartRetryAdvisor } from '../ai/AiSmartRetryAdvisor';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { WandIcon } from '../../icons';
import { EditorView, CopyButtonView, TabView, IconButtonView, AIButtonView, type TabItem } from '@salilvnair/dui';

const ACCENT = 'var(--color-protocol-soap)';

function prettifyXml(xml: string): string {
  const INDENT = '  ';
  let depth = 0;
  let result = '';
  const tokens = xml.replace(/>\s*</g, '><').split(/(?<=>)(?=<)/);
  for (const token of tokens) {
    const isClosing = /^<\//.test(token);
    const isSelfClosing = /\/>$/.test(token) || /^<!/.test(token) || /^<\?/.test(token);
    if (isClosing) depth = Math.max(0, depth - 1);
    result += INDENT.repeat(depth) + token.trim() + '\n';
    if (!isClosing && !isSelfClosing && /^<[^/!?]/.test(token)) depth++;
  }
  return result.trimEnd();
}

const responseTabs: TabItem[] = [
  { id: 'body', label: 'Body' },
  { id: 'headers', label: 'Headers' },
  { id: 'tests', label: 'Tests' },
];

export function SoapResponsePanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);
  const storedSubTab = useUiStateStore(s => s.prefs[`soap.response.subtab.${activeTabId}`]);
  const [activeSubTab, setActiveSubTabLocal] = useState(storedSubTab || 'body');
  const [showSchema, setShowSchema] = useState(false);
  const [activePopup, setActivePopup] = useState<AssistMode | null>(null);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const explainRef = useRef<HTMLDivElement>(null);
  const followUpRef = useRef<HTMLDivElement>(null);
  const responseBody = activeTab?.response?.body ?? '';
  const [displayBody, setDisplayBody] = useState(responseBody);
  useEffect(() => { setDisplayBody(responseBody); }, [responseBody]);

  const setActiveSubTab = (tab: string) => {
    setActiveSubTabLocal(tab);
    if (activeTabId) useUiStateStore.getState().setPref(`soap.response.subtab.${activeTabId}`, tab);
  };

  if (!activeTab) return null;

  const response = activeTab.response;

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

  if (!response) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--color-panel)] text-[var(--color-text-muted)] gap-2">
        <span className="text-[28px] opacity-20">&#10216;/&#10217;</span>
        <p className="text-[12px]">Hit Invoke to get a response</p>
        <p className="text-[10px] opacity-60">Ctrl+Enter to run</p>
      </div>
    );
  }

  const hasFault = response.body
    ? /<(soap:|SOAP-ENV:|)Fault[> ]/i.test(response.body)
    : false;

  const isFailure = response.status >= 400 || hasFault || response.status === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[var(--color-panel)]">
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
      <div className="flex items-center px-3 border-b border-[var(--color-surface-border)]">
        <div className="flex-1 pt-2.5 pb-0">
          <TabView
            tabs={responseTabs}
            activeTab={activeSubTab}
            onChange={setActiveSubTab}
            variant="underline"
            accentColor={ACCENT}
            size="md"
          />
        </div>
        {activeSubTab === 'body' && (
          <div className="flex items-center gap-1.5 pb-1.5 flex-shrink-0">
            {aiEnabled('explainSoap') && (
              <>
                <div ref={explainRef} className="flex-shrink-0" style={{ whiteSpace: 'nowrap' }}>
                  <AIButtonView
                    action="explain"
                    label="Explain"
                    size="xs"
                    accentColor="var(--color-protocol-ai)"
                    onClick={() => setActivePopup(p => p === 'explain' ? null : 'explain')}
                  />
                </div>
                {activePopup === 'explain' && (
                  <AiAssistPopover
                    mode="explain"
                    response={response}
                    requestMethod="SOAP"
                    requestUrl={activeTab.url || ''}
                    onClose={() => setActivePopup(null)}
                    anchorEl={explainRef.current}
                  />
                )}
              </>
            )}
            {aiEnabled('followUpsSoap') && (
              <>
                <div ref={followUpRef} className="flex-shrink-0" style={{ whiteSpace: 'nowrap' }}>
                  <AIButtonView
                    action="ask"
                    label="Follow-ups"
                    size="xs"
                    accentColor="var(--color-protocol-ai)"
                    onClick={() => setActivePopup(p => p === 'follow-up' ? null : 'follow-up')}
                  />
                </div>
                {activePopup === 'follow-up' && (
                  <AiAssistPopover
                    mode="follow-up"
                    response={response}
                    requestMethod="SOAP"
                    requestUrl={activeTab.url || ''}
                    onClose={() => setActivePopup(null)}
                    anchorEl={followUpRef.current}
                  />
                )}
              </>
            )}
            {isFailure && aiEnabled('smartRetryAdvisor') && (
              <AiSmartRetryAdvisor
                status={hasFault ? 500 : response.status}
                responseBody={response.body || ''}
                method="SOAP"
                url={activeTab.url || ''}
              />
            )}
            {aiEnabled('patternBaseline') && (
              <div className="flex-shrink-0" style={{ whiteSpace: 'nowrap' }}>
                <AiResponsePatternLearning
                  responseBody={response.body || ''}
                  method="SOAP"
                  url={activeTab.url || ''}
                  status={response.status}
                />
              </div>
            )}
            {(aiEnabled('assertGeneration') || aiEnabled('semanticValidator') || aiEnabled('responseTransformer') || aiEnabled('responseDiff')) && (
              <AiResponseActionsMenu
                tabId={activeTab.id}
                response={response}
                requestMethod="SOAP"
                requestUrl={activeTab.url || ''}
              />
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
              <div className="flex items-center gap-1">
                <IconButtonView
                  icon={<WandIcon size={12} />}
                  size="sm"
                  title="Prettify XML"
                  onClick={() => {
                    try { setDisplayBody(prettifyXml(displayBody)); } catch { /* malformed XML */ }
                  }}
                />
                <CopyButtonView text={response.body || ''} accentColor="var(--color-success)" />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <EditorView
                value={displayBody}
                onChange={setDisplayBody}
                language="xml"
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
                      <span className="text-[var(--color-text-primary)]">{String(val)}</span>
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
