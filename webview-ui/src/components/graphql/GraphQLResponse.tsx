import { useState } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { CodeEditor, RequestProgressOverlay, CopyButton } from '../shared';
import { cancelRequest } from '../../services/request';
import { AiActionButton, type AssistMode } from '../ai/AiAssistPopover';
import { DataSchemaModal } from '../rest/response/DataSchemaModal';
import { AiResponseActionsMenu } from '../rest/response/AiResponseActionsMenu';
import { AiResponsePatternLearning } from '../ai/AiResponsePatternLearning';
import { AiSmartRetryAdvisor } from '../ai/AiSmartRetryAdvisor';
import { SparkleIcon } from '../../icons';
import { useAiFeaturesStore } from '../../store/ai-features-store';

/**
 * GraphQL Response panel — shows JSON response, errors, and metadata.
 */
export function GraphQLResponse() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [showSchema, setShowSchema] = useState(false);
  const [activePopup, setActivePopup] = useState<AssistMode | null>(null);
  const [showPatternLearning, setShowPatternLearning] = useState(false);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);

  if (!activeTab) return null;

  const response = activeTab.response;

  // No response yet
  if (!response && !activeTab.loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-2">
        <span className="text-[28px] opacity-20">⟨/⟩</span>
        <p className="text-[12px]">Execute a query to see the response</p>
        <p className="text-[10px] opacity-60">Ctrl+Enter to run</p>
      </div>
    );
  }

  // Loading state
  if (activeTab.loading) {
    const stages = activeTab.requestProgress || [
      { id: 'sending-request', label: 'Sending request', status: 'running' as const, startTime: Date.now() },
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

  if (!response) return null;

  // Parse response to detect GraphQL errors
  let parsedBody: any = null;
  let hasErrors = false;
  try {
    parsedBody = JSON.parse(response.body);
    hasErrors = Array.isArray(parsedBody?.errors) && parsedBody.errors.length > 0;
  } catch {
    // Non-JSON response
  }

  const isFailure = response.status >= 400 || hasErrors;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[var(--color-panel)]">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--color-surface-border)] text-[11px]">
        <span className="text-[var(--color-text-muted)]">Status:</span>
        <span className={`font-bold ${response.status >= 400 ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>
          {response.status} • {response.statusText}
        </span>
        <span className="text-[var(--color-text-muted)]">Size: {formatSize(response.size)}</span>
        {response.time > 0 && <span className="text-[var(--color-text-muted)]">{response.time}ms</span>}
        {hasErrors && (
          <span className="text-[var(--color-error)] font-medium">⚠ GraphQL Errors</span>
        )}
      </div>

      {/* Response header + AI actions */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)]">
        <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Response</span>
        <div className="flex items-center gap-1.5">
          {aiEnabled('explainGraphql') && (
            <AiActionButton
              mode="explain"
              label="Explain"
              response={response}
              requestMethod="GQL"
              requestUrl={activeTab.url || ''}
              open={activePopup === 'explain'}
              onOpen={() => setActivePopup(p => p === 'explain' ? null : 'explain')}
            />
          )}
          {aiEnabled('followUpsGraphql') && (
            <AiActionButton
              mode="follow-up"
              label="Follow-ups"
              response={response}
              requestMethod="GQL"
              requestUrl={activeTab.url || ''}
              open={activePopup === 'follow-up'}
              onOpen={() => setActivePopup(p => p === 'follow-up' ? null : 'follow-up')}
            />
          )}
          {aiEnabled('schemaGraphql') && (
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
          {/* 8.2: Record Baseline ✦ */}
          {aiEnabled('patternBaseline') && (
            <button
              type="button"
              onClick={() => setShowPatternLearning(p => !p)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-medium cursor-pointer transition-all border"
              style={{
                color: showPatternLearning ? 'var(--color-protocol-ai)' : 'var(--color-text-muted)',
                borderColor: showPatternLearning
                  ? 'color-mix(in srgb, var(--color-protocol-ai) 35%, transparent)'
                  : 'color-mix(in srgb, var(--color-text-muted) 25%, transparent)',
                backgroundColor: 'transparent',
              }}
              title="Record / compare response pattern baseline"
            >
              <SparkleIcon size={10} />
              Baseline
            </button>
          )}
          {/* 8.1: ⋮ AI Actions menu */}
          {aiEnabled('assertGeneration') || aiEnabled('semanticValidator') || aiEnabled('responseTransformer') || aiEnabled('responseDiff') ? (
            <AiResponseActionsMenu
              tabId={activeTab.id}
              response={response}
              requestMethod="GQL"
              requestUrl={activeTab.url || ''}
            />
          ) : null}
          <CopyButton text={response.body ? formatJson(response.body) : ''} size={14} />
        </div>
      </div>

      {/* 8.2: Pattern Learning panel */}
      {showPatternLearning && aiEnabled('patternBaseline') && (
        <div className="border-b border-[var(--color-surface-border)]">
          <AiResponsePatternLearning
            responseBody={response.body}
            method="GQL"
            url={activeTab.url || ''}
            status={response.status}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeEditor
          value={response.body ? formatJson(response.body) : ''}
          onChange={() => {}}
          language="json"
          height="100%"
          readOnly
        />
      </div>

      {/* 8.3: Smart Retry Advisor — shown on GQL errors or HTTP failure */}
      {isFailure && aiEnabled('smartRetryAdvisor') && (
        <div className="border-t border-[var(--color-surface-border)]">
          <AiSmartRetryAdvisor
            status={response.status}
            responseBody={response.body}
            method="GQL"
            url={activeTab.url || ''}
          />
        </div>
      )}

      {showSchema && <DataSchemaModal body={response.body} onClose={() => setShowSchema(false)} />}
    </div>
  );
}

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
