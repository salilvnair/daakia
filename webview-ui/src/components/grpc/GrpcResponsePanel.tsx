import { useState, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import type { GrpcStreamMessage } from '../../store/tabs-store';
import { RequestProgressOverlay } from '../shared';
import { ScriptResultsView } from '../shared/display/ScriptResultsView';
import { cancelRequest } from '../../services/request';
import { ArrowUpIcon, ArrowDownIcon, WandIcon } from '../../icons';
import { AiActionButton, type AssistMode } from '../ai/AiAssistPopover';
import { DataSchemaModal } from '../rest/response/DataSchemaModal';
import { AiResponseActionsMenu } from '../rest/response/AiResponseActionsMenu';
import { AiResponsePatternLearning } from '../ai/AiResponsePatternLearning';
import { AiSmartRetryAdvisor } from '../ai/AiSmartRetryAdvisor';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import {
  TabView,
  EditorView,
  CopyButtonView,
  AIButtonView,
  IconButtonView,
  type TabItem,
} from '@salilvnair/dui';

const ACCENT = 'var(--color-protocol-grpc)';

const responseTabs: TabItem[] = [
  { id: 'body', label: 'Body' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'tests', label: 'Tests' },
];

/**
 * GrpcResponsePanel — Shows unary response (JSON body, metadata, status)
 * and streaming timeline for server/client/bidi streaming.
 */
export function GrpcResponsePanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);
  const storedSubTab = useUiStateStore(s => s.prefs[`grpc.response.subtab.${activeTabId}`]);
  const [activeSubTab, setActiveSubTabLocal] = useState(storedSubTab || 'body');
  const [showSchema, setShowSchema] = useState(false);
  const [activePopup, setActivePopup] = useState<AssistMode | null>(null);
  const [showPatternLearning, setShowPatternLearning] = useState(false);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const responseBody = activeTab?.response?.body ?? '';
  const [displayBody, setDisplayBody] = useState(responseBody);
  useEffect(() => { setDisplayBody(responseBody); }, [responseBody]);
  const setActiveSubTab = (tab: string) => {
    setActiveSubTabLocal(tab);
    if (activeTabId) useUiStateStore.getState().setPref(`grpc.response.subtab.${activeTabId}`, tab);
  };

  if (!activeTab) return null;

  const response = activeTab.response;
  const streamMessages = activeTab.grpcStreamMessages || [];
  const streamStatus = activeTab.grpcStreamStatus || 'idle';

  if (!response && streamMessages.length === 0) {
    if (activeTab.loading) {
      const stages = activeTab.requestProgress || [
        { id: 'sending-request', label: 'Sending request', status: 'running' as const, startTime: Date.now() },
      ];
      return (
        <RequestProgressOverlay
          stages={stages}
          onCancel={() => {
            cancelRequest(activeTab.id);
            useTabsStore.getState().updateTab(activeTab.id, { loading: false, requestProgress: undefined, grpcStreamStatus: 'idle' });
          }}
        />
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-text-muted)' }}>
        <span className="text-[28px] opacity-20">⟨/⟩</span>
        <p className="text-[12px]">Send a request to see the response</p>
        <p className="text-[10px] opacity-60">Ctrl+Enter to run</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Status bar */}
      {response && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--color-surface-border)] text-[11px]">
          <GrpcStatusBadge code={response.status} />
          <span style={{ color: 'var(--color-text-muted)' }}>{response.time}ms</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{formatSize(response.size)}</span>
          {streamStatus !== 'idle' && (
            <span
              className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
              style={{ color: ACCENT, backgroundColor: 'rgba(0,184,181,0.12)' }}
            >
              {streamStatus}
            </span>
          )}
        </div>
      )}

      {/* Sub-tabs + AI actions */}
      <div className="flex items-center justify-between px-3 pt-2 border-b border-[var(--color-surface-border)]">
        <TabView
          tabs={responseTabs}
          activeTab={activeSubTab}
          onChange={setActiveSubTab}
          size="md"
          variant="underline"
          accentColor={ACCENT}
        />
        {response && activeSubTab === 'body' && (
          <div className="flex items-center gap-1.5 pb-1.5">
            {aiEnabled('explainGrpc') && (
              <AiActionButton
                mode="explain"
                label="Explain"
                response={response}
                requestMethod="gRPC"
                requestUrl={activeTab.url || ''}
                open={activePopup === 'explain'}
                onOpen={() => setActivePopup(p => p === 'explain' ? null : 'explain')}
              />
            )}
            {aiEnabled('followUpsGrpc') && (
              <AiActionButton
                mode="follow-up"
                label="Follow-ups"
                response={response}
                requestMethod="gRPC"
                requestUrl={activeTab.url || ''}
                open={activePopup === 'follow-up'}
                onOpen={() => setActivePopup(p => p === 'follow-up' ? null : 'follow-up')}
              />
            )}
            {aiEnabled('schemaGrpc') && (
              <AIButtonView
                action="ask"
                label="Schema"
                size="sm"
                accentColor="var(--color-protocol-ai)"
                onClick={() => setShowSchema(true)}
              />
            )}
            {aiEnabled('patternBaseline') && (
              <AIButtonView
                action="ask"
                label="Baseline"
                size="sm"
                accentColor={showPatternLearning ? 'var(--color-protocol-ai)' : undefined}
                onClick={() => setShowPatternLearning(p => !p)}
              />
            )}
            {(aiEnabled('assertGeneration') || aiEnabled('semanticValidator') || aiEnabled('responseTransformer') || aiEnabled('responseDiff')) && (
              <AiResponseActionsMenu
                tabId={activeTab.id}
                response={response}
                requestMethod="gRPC"
                requestUrl={activeTab.url || ''}
              />
            )}
          </div>
        )}
      </div>

      {/* Pattern Learning panel */}
      {showPatternLearning && response && aiEnabled('patternBaseline') && (
        <div className="border-b border-[var(--color-surface-border)]">
          <AiResponsePatternLearning
            responseBody={response.body || ''}
            method="gRPC"
            url={activeTab.url || ''}
            status={response.status}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        {activeSubTab === 'body' && response && (
          <div className="h-full flex flex-col min-h-0">
            <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--color-surface-border)] flex-shrink-0">
              <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Response Body</span>
              <div className="flex items-center gap-1">
                <IconButtonView
                  icon={<WandIcon size={12} />}
                  size="sm"
                  title="Prettify JSON"
                  onClick={() => {
                    try { setDisplayBody(JSON.stringify(JSON.parse(displayBody), null, 2)); } catch { /* invalid JSON */ }
                  }}
                />
                <CopyButtonView text={response.body || ''} size="sm" />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <EditorView
                value={displayBody}
                onChange={setDisplayBody}
                language="json"
                className="h-full"
              />
            </div>
            {response.status !== 0 && aiEnabled('smartRetryAdvisor') && (
              <div className="border-t border-[var(--color-surface-border)] flex-shrink-0">
                <AiSmartRetryAdvisor
                  status={response.status}
                  responseBody={response.body || ''}
                  method="gRPC"
                  url={activeTab.url || ''}
                />
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'metadata' && response && (
          <div className="p-3">
            <div className="space-y-2">
              {Object.entries(response.headers || {}).map(([key, val]) => (
                <div key={key} className="flex gap-2 text-[12px]">
                  <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>{key}:</span>
                  <span className="font-mono break-all" style={{ color: 'var(--color-text-primary)' }}>{val}</span>
                </div>
              ))}
              {Object.keys(response.headers || {}).length === 0 && (
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>No metadata received</p>
              )}
            </div>
          </div>
        )}

        {activeSubTab === 'timeline' && (
          <GrpcTimeline messages={streamMessages} status={streamStatus} response={response} />
        )}

        {activeSubTab === 'tests' && response && (
          <ScriptResultsView response={response} />
        )}
      </div>
      {showSchema && response && (
        <DataSchemaModal body={response.body || ''} onClose={() => setShowSchema(false)} />
      )}
    </div>
  );
}

// ─── Timeline (unified for unary + streaming) ───

function GrpcTimeline({ messages, status, response }: { messages: GrpcStreamMessage[]; status: string; response?: { status: number; statusText: string; time: number; size: number; body?: string } | null }) {
  if (messages.length === 0 && response) {
    const isOk = response.status === 0;
    return (
      <div className="flex flex-col">
        <div className="flex items-start gap-2 px-3 py-2 border-b border-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)]">
          <span className="mt-0.5 shrink-0">
            <ArrowUpIcon size={12} style={{ color: 'var(--color-warning)' }} />
          </span>
          <span className="shrink-0 text-[10px] font-mono mt-0.5 w-[70px]" style={{ color: 'var(--color-text-muted)' }}>0ms</span>
          <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-primary)' }}>Request sent</span>
        </div>
        <div className="flex items-start gap-2 px-3 py-2 border-b border-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)]">
          <span className="mt-0.5 shrink-0">
            <ArrowDownIcon size={12} style={{ color: isOk ? ACCENT : 'var(--color-error)' }} />
          </span>
          <span className="shrink-0 text-[10px] font-mono mt-0.5 w-[70px]" style={{ color: 'var(--color-text-muted)' }}>{response.time}ms</span>
          <span className="flex-1 min-w-0">
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-primary)' }}>Response received</span>
            <span className="ml-2 text-[10px] font-mono" style={{ color: isOk ? 'var(--color-success)' : 'var(--color-error)' }}>
              {isOk ? 'OK' : response.statusText}
            </span>
          </span>
        </div>
        <div className="px-3 py-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          Total time: {response.time}ms • Size: {formatSize(response.size)}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6" style={{ color: 'var(--color-text-muted)' }}>
        <span className="text-[24px] opacity-20">〜</span>
        <p className="text-[12px]">{status === 'streaming' ? 'Waiting for messages...' : 'No stream messages yet'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className="flex items-start gap-2 px-3 py-2 border-b border-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-text-primary)_2%,transparent)]"
        >
          <span className="mt-0.5 shrink-0">
            {msg.direction === 'sent' ? (
              <ArrowUpIcon size={12} style={{ color: 'var(--color-warning)' }} />
            ) : (
              <ArrowDownIcon size={12} style={{ color: ACCENT }} />
            )}
          </span>
          <span className="shrink-0 text-[10px] font-mono mt-0.5 w-[70px]" style={{ color: 'var(--color-text-muted)' }}>
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
          <pre className="flex-1 text-[11px] font-mono whitespace-pre-wrap break-all min-w-0" style={{ color: 'var(--color-text-primary)' }}>
            {msg.data}
          </pre>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ───

function GrpcStatusBadge({ code }: { code: number }) {
  const statusName = GRPC_STATUS_CODES[code] || `CODE_${code}`;
  const isOk = code === 0;

  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
      style={{
        color: isOk ? 'var(--color-success)' : 'var(--color-error)',
        backgroundColor: isOk ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      }}
    >
      {statusName}
    </span>
  );
}

const GRPC_STATUS_CODES: Record<number, string> = {
  0: 'OK',
  1: 'CANCELLED',
  2: 'UNKNOWN',
  3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED',
  5: 'NOT_FOUND',
  6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED',
  8: 'RESOURCE_EXHAUSTED',
  9: 'FAILED_PRECONDITION',
  10: 'ABORTED',
  11: 'OUT_OF_RANGE',
  12: 'UNIMPLEMENTED',
  13: 'INTERNAL',
  14: 'UNAVAILABLE',
  15: 'DATA_LOSS',
  16: 'UNAUTHENTICATED',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
