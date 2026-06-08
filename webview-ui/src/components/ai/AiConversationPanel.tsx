import { useState, useRef, useEffect, useCallback, useMemo, useReducer } from 'react';
import { useTabsStore, type AiMessage, type AiToolCall } from '../../store/tabs-store';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { AiMessageBubble } from './AiMessageBubble';
import { AiHistoryPanel } from './AiHistoryPanel';
import { TrashIcon, McpToolIcon, SendIcon, SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';

/**
 * AiConversationPanel — Shows the conversation history for an AI *request* tab (protocol='ai').
 * Reads from the per-tab aiConversation field in tabs-store. This is separate from the
 * Daakia AI singleton tab (DaakiaAiPanel) which uses ConvEngineChat and its own store.
 *
 * 6D.14 — Tool calling flow:
 *   Detects when last assistant message has unresolved toolCalls (no MCP auto-execution),
 *   shows an inline ToolResultInputPanel, and re-sends the conversation with tool results.
 */
export function AiConversationPanel() {
  const activeTabId = useTabsStore(s => s.activeTabId);
  const tabs = useTabsStore(s => s.tabs);
  const updateTab = useTabsStore(s => s.updateTab);
  const providers = useAiProvidersStore(s => s.providers);
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);

  const tab = tabs.find(t => t.id === activeTabId);
  const conversation = tab?.aiConversation ?? [];
  const streaming = tab?.aiStreaming ?? false;

  const scrollRef = useRef<HTMLDivElement>(null);
  const streamingStartRef = useRef<number | null>(null);
  // Force re-render every second while streaming (for elapsed time display)
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  // Track streaming start time
  useEffect(() => {
    if (streaming && streamingStartRef.current === null) {
      streamingStartRef.current = Date.now();
    } else if (!streaming) {
      streamingStartRef.current = null;
    }
  }, [streaming]);

  // Tick every second while streaming to update elapsed time
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(forceUpdate, 1000);
    return () => clearInterval(id);
  }, [streaming]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.length, streaming]);

  const [showHistory, setShowHistory] = useState(false);

  const handleClear = useCallback(() => {
    if (activeTabId) {
      updateTab(activeTabId, { aiConversation: [], aiStreaming: false });
    }
  }, [activeTabId, updateTab]);

  const handleSaveConversation = useCallback(() => {
    if (!tab || !conversation.length) return;
    postMsg({
      type: 'ai:saveConversation',
      id: crypto.randomUUID(),
      provider: tab.aiProvider || '',
      model: tab.aiModel || '',
      messages: conversation,
    });
  }, [tab, conversation]);

  // ─── Detect pending (unresolved) tool calls ───────────────────────────────
  // "Pending" = last assistant message has toolCalls, streaming is done,
  // and none of those toolCallIds appear as toolCallId in any tool message.
  const pendingToolCalls = useMemo((): AiToolCall[] | null => {
    if (streaming) return null;
    if (conversation.length === 0) return null;

    // Find the last assistant message with toolCalls
    let lastAssistant: AiMessage | null = null;
    for (let i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].role === 'assistant') {
        lastAssistant = conversation[i];
        break;
      }
    }
    if (!lastAssistant?.toolCalls?.length) return null;

    // Check if ALL tool calls already have a corresponding tool result
    const resolvedIds = new Set(
      conversation
        .filter(m => m.role === 'tool' && m.toolCallId)
        .map(m => m.toolCallId!)
    );
    const unresolved = lastAssistant.toolCalls.filter(tc => !resolvedIds.has(tc.id));
    return unresolved.length > 0 ? unresolved : null;
  }, [conversation, streaming]);

  if (conversation.length === 0 && !streaming) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 text-center px-6 border-t border-[var(--color-surface-border)]">
        <span className="text-[13px] text-[var(--color-text-muted)]">
          No messages yet
        </span>
        <span className="text-[11px] text-[var(--color-text-muted)] opacity-70">
          Configure your prompt above and click Send to start a conversation.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-t border-[var(--color-surface-border)] relative">
      {/* AI History Panel overlay */}
      {showHistory && <AiHistoryPanel onClose={() => setShowHistory(false)} />}

      {/* Header with Save + History + Clear buttons */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)] flex-shrink-0">
        <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Conversation</span>
        <div className="flex items-center gap-1">
          {/* Save conversation */}
          {conversation.length > 0 && !streaming && (
            <button
              type="button"
              onClick={handleSaveConversation}
              className="h-[24px] px-2 flex items-center gap-1 rounded-md cursor-pointer transition-colors text-[10px]"
              style={{ color: 'var(--color-protocol-ai)' }}
              title="Save conversation to history"
            >
              <SparkleIcon size={10} />
              Save
            </button>
          )}
          {/* History */}
          <button
            type="button"
            onClick={() => setShowHistory(p => !p)}
            className="h-[24px] px-2 flex items-center gap-1 rounded-md cursor-pointer transition-colors text-[10px]"
            style={{ color: showHistory ? 'var(--color-protocol-ai)' : 'var(--color-text-muted)' }}
            title="View saved conversations"
          >
            History
          </button>
          {/* Clear */}
          <button
            type="button"
            onClick={handleClear}
            className="h-[24px] w-[24px] flex items-center justify-center rounded-md cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]"
            title="Clear conversation"
          >
            <TrashIcon size={12} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 gap-2 flex flex-col [scrollbar-gutter:stable]">
        {conversation.map((msg) => (
          <AiMessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming progress indicator */}
        {streaming && (
          <StreamingProgressIndicator
            conversation={conversation}
            streamingStartRef={streamingStartRef}
          />
        )}

        {/* Tool result input panel — shown when AI returned unresolved tool calls */}
        {pendingToolCalls && tab && (
          <ToolResultInputPanel
            toolCalls={pendingToolCalls}
            onSubmit={(results) => {
              if (!activeTabId) return;

              // Build tool result messages
              const toolMessages: AiMessage[] = results.map(r => ({
                id: crypto.randomUUID(),
                role: 'tool' as const,
                content: r.result,
                toolCallId: r.toolCallId,
                timestamp: Date.now(),
              }));

              const updatedConv = [...conversation, ...toolMessages];
              updateTab(activeTabId, { aiConversation: updatedConv, aiStreaming: true, loading: true });

              // Resolve provider/model
              const provider = tab.aiProvider || defaultProviderId;
              const model = tab.aiModel || defaultModelId;
              const providerInfo = providers.find(p => p.id === provider);
              const effectiveModel = model || providerInfo?.models.find(m => m.enabled)?.id || '';

              // Re-send conversation with tool results — userPrompt is empty (continuation)
              postMsg({
                type: 'ai:send',
                tabId: activeTabId,
                provider,
                model: effectiveModel,
                baseUrl: '',
                systemPrompts: tab.aiSystemPrompts || [],
                userPrompt: '',
                conversation: updatedConv,
                tools: tab.aiTools || [],
                settings: tab.aiSettings || {},
                mcpServerConfigs: tab.mcpServerConfigs || [],
                envId: tab.envId,
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Streaming Progress Indicator ────────────────────────────────────────────

interface StreamingProgressProps {
  conversation: AiMessage[];
  streamingStartRef: React.MutableRefObject<number | null>;
}

function StreamingProgressIndicator({ conversation, streamingStartRef }: StreamingProgressProps) {
  // Find the currently-building assistant message (last message, role=assistant)
  const buildingMsg = conversation.length > 0 && conversation[conversation.length - 1].role === 'assistant'
    ? conversation[conversation.length - 1]
    : null;
  const charCount = buildingMsg?.content.length ?? 0;

  const elapsedMs = streamingStartRef.current ? Date.now() - streamingStartRef.current : 0;
  const elapsedSec = (elapsedMs / 1000).toFixed(1);

  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      {/* Animated dots */}
      <div className="flex gap-1">
        <span className="w-[5px] h-[5px] rounded-full bg-[var(--color-protocol-ai)] animate-pulse" />
        <span className="w-[5px] h-[5px] rounded-full bg-[var(--color-protocol-ai)] animate-pulse [animation-delay:150ms]" />
        <span className="w-[5px] h-[5px] rounded-full bg-[var(--color-protocol-ai)] animate-pulse [animation-delay:300ms]" />
      </div>
      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        {charCount > 0 ? 'Streaming…' : 'AI is thinking…'}
      </span>
      {/* Stats */}
      <div className="flex items-center gap-2 ml-auto">
        {charCount > 0 && (
          <span
            className="text-[9.5px] font-mono px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 10%, transparent)', color: 'var(--color-protocol-ai)' }}
          >
            {charCount.toLocaleString()} chars
          </span>
        )}
        {elapsedMs > 0 && (
          <span className="text-[9.5px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {elapsedSec}s
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Tool Result Input Panel ──────────────────────────────────────────────────

interface ToolResult {
  toolCallId: string;
  result: string;
}

interface ToolResultInputPanelProps {
  toolCalls: AiToolCall[];
  onSubmit: (results: ToolResult[]) => void;
}

function ToolResultInputPanel({ toolCalls, onSubmit }: ToolResultInputPanelProps) {
  const [results, setResults] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const tc of toolCalls) init[tc.id] = '';
    return init;
  });
  const [mockAll, setMockAll] = useState(false);

  const handleMockAll = () => {
    const mocked: Record<string, string> = {};
    for (const tc of toolCalls) {
      let params: Record<string, unknown> = {};
      try { params = JSON.parse(tc.function.arguments || '{}'); } catch { /* */ }
      mocked[tc.id] = JSON.stringify({ success: true, result: `Mock result for ${tc.function.name}`, input: params }, null, 2);
    }
    setResults(mocked);
    setMockAll(true);
  };

  const handleSubmit = () => {
    onSubmit(toolCalls.map(tc => ({ toolCallId: tc.id, result: results[tc.id] || '' })));
  };

  const allFilled = toolCalls.every(tc => results[tc.id]?.trim());

  return (
    <div
      className="rounded-xl border overflow-hidden flex-shrink-0 mt-1"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 30%, var(--color-surface-border))',
        backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 4%, var(--color-surface-bg))',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{
          borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 20%, var(--color-surface-border))',
          backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)',
        }}
      >
        <McpToolIcon size={13} style={{ color: 'var(--color-protocol-ai)' }} />
        <span className="text-[12px] font-semibold flex-1" style={{ color: 'var(--color-protocol-ai)' }}>
          Tool Results Required
        </span>
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {toolCalls.length} call{toolCalls.length !== 1 ? 's' : ''} awaiting results
        </span>
        <button
          type="button"
          onClick={handleMockAll}
          className="text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-all"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 35%, transparent)',
            color: 'var(--color-protocol-ai)',
            backgroundColor: mockAll ? 'color-mix(in srgb, var(--color-protocol-ai) 10%, transparent)' : 'transparent',
          }}
          title="Auto-fill with mock responses for testing"
        >
          Auto-mock
        </button>
      </div>

      {/* Tool call forms */}
      <div className="flex flex-col gap-0 divide-y" style={{ divideColor: 'var(--color-surface-border)' }}>
        {toolCalls.map((tc, idx) => {
          let parsedArgs: unknown = null;
          try { parsedArgs = JSON.parse(tc.function.arguments || '{}'); } catch { /* */ }

          return (
            <div key={tc.id} className="p-3 flex flex-col gap-2">
              {/* Tool name + args preview */}
              <div className="flex items-start gap-2">
                <div
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)', color: 'var(--color-protocol-ai)' }}
                >
                  #{idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {tc.function.name}
                  </p>
                  {parsedArgs && Object.keys(parsedArgs as object).length > 0 && (
                    <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {tc.function.arguments.length > 100
                        ? tc.function.arguments.slice(0, 100) + '…'
                        : tc.function.arguments}
                    </p>
                  )}
                </div>
              </div>

              {/* Result textarea */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  Result (JSON or plain text):
                </label>
                <textarea
                  value={results[tc.id] || ''}
                  onChange={(e) => setResults(prev => ({ ...prev, [tc.id]: e.target.value }))}
                  placeholder={`Enter the result for ${tc.function.name}...`}
                  rows={3}
                  className="w-full rounded-md p-2 text-[12px] font-mono resize-none outline-none focus:ring-1 focus:ring-[var(--color-protocol-ai)]"
                  style={{
                    backgroundColor: 'var(--color-panel)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit button */}
      <div
        className="flex items-center justify-between px-3 py-2 border-t"
        style={{ borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 20%, var(--color-surface-border))' }}
      >
        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          Provide results and continue the conversation
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allFilled}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--color-protocol-ai)',
            color: 'white',
          }}
        >
          <SendIcon size={11} />
          Submit Results
        </button>
      </div>
    </div>
  );
}
