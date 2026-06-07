import { useRef, useEffect, useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { AiMessageBubble } from './AiMessageBubble';
import { TrashIcon } from '../../icons';

/**
 * AiConversationPanel — Shows the conversation history for an AI *request* tab (protocol='ai').
 * Reads from the per-tab aiConversation field in tabs-store. This is separate from the
 * Daakia AI singleton tab (DaakiaAiPanel) which uses ConvEngineChat and its own store.
 */
export function AiConversationPanel() {
  const activeTabId = useTabsStore(s => s.activeTabId);
  const tabs = useTabsStore(s => s.tabs);
  const updateTab = useTabsStore(s => s.updateTab);

  const tab = tabs.find(t => t.id === activeTabId);
  const conversation = tab?.aiConversation ?? [];
  const streaming = tab?.aiStreaming ?? false;

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.length, streaming]);

  const handleClear = useCallback(() => {
    if (activeTabId) {
      updateTab(activeTabId, { aiConversation: [], aiStreaming: false });
    }
  }, [activeTabId, updateTab]);

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
    <div className="flex flex-col h-full overflow-hidden border-t border-[var(--color-surface-border)]">
      {/* Header with clear button */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)] flex-shrink-0">
        <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Conversation</span>
        <button
          type="button"
          onClick={handleClear}
          className="h-[24px] w-[24px] flex items-center justify-center rounded-md cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]"
          title="Clear conversation"
        >
          <TrashIcon size={12} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 gap-2 flex flex-col [scrollbar-gutter:stable]">
        {conversation.map((msg) => (
          <AiMessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming indicator */}
        {streaming && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex gap-1">
              <span className="w-[5px] h-[5px] rounded-full bg-[var(--color-protocol-ai)] animate-pulse" />
              <span className="w-[5px] h-[5px] rounded-full bg-[var(--color-protocol-ai)] animate-pulse [animation-delay:150ms]" />
              <span className="w-[5px] h-[5px] rounded-full bg-[var(--color-protocol-ai)] animate-pulse [animation-delay:300ms]" />
            </div>
            <span className="text-[11px] text-[var(--color-text-muted)]">AI is thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
}
