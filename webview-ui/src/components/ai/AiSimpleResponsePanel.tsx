/**
 * AiSimpleResponsePanel — Simple assistant response view for AI protocol tab.
 * Displays conversation messages (user + assistant) without ConvEngineChat.
 * Replaces the broken ConvEngineChat-based AiConversationPanel (E6 fix).
 *
 * Shows: conversation history, streaming indicator while loading.
 * Uses MdViewer for assistant message rendering.
 */
import { useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { MdViewer } from '../shared/display/MdViewer';
import { GeneralAssistantIcon } from '../../icons';

const ACCENT = 'var(--color-protocol-ai)';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end mb-3">
      <div
        className="max-w-[75%] px-3.5 py-2.5 rounded-2xl rounded-br-md text-[12.5px] leading-relaxed"
        style={{
          backgroundColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
          border: `1px solid color-mix(in srgb, ${ACCENT} 25%, transparent)`,
          color: 'var(--color-text-primary)',
        }}
      >
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  return (
    <div className="flex gap-2.5 mb-3">
      {/* Avatar */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)`,
        }}
      >
        <GeneralAssistantIcon size={12} style={{ color: ACCENT }} />
      </div>

      {/* Message */}
      <div className="flex-1 min-w-0">
        {isStreaming && !content ? (
          /* Thinking indicator */
          <div className="flex items-center gap-1.5 py-2">
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: ACCENT, animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: ACCENT, animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: ACCENT, animationDelay: '300ms' }} />
          </div>
        ) : (
          <div
            className="px-3.5 py-2.5 rounded-2xl rounded-bl-md text-[12.5px]"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            <MdViewer content={content} />
            {isStreaming && (
              <span
                className="inline-block w-1 h-3.5 ml-0.5 rounded-sm animate-pulse"
                style={{ backgroundColor: ACCENT, verticalAlign: 'text-bottom' }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Empty landing state when no conversation yet */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${ACCENT} 18%, transparent)`,
        }}
      >
        <GeneralAssistantIcon size={18} style={{ color: ACCENT }} />
      </div>
      <div>
        <p className="text-[13px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
          AI Assistant
        </p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Enter a prompt above and press Send to start a conversation.
        </p>
      </div>

      {/* Quick suggestion chips */}
      <div className="flex flex-wrap gap-2 justify-center mt-2">
        {[
          'Build a REST request',
          'Create a mock server',
          'Explain OAuth2',
          'Write test assertions',
        ].map(chip => (
          <button
            key={chip}
            type="button"
            className="text-[11px] px-2.5 py-1 rounded-full cursor-pointer transition-colors"
            style={{
              backgroundColor: `color-mix(in srgb, ${ACCENT} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${ACCENT} 18%, transparent)`,
              color: 'var(--color-text-muted)',
            }}
            onClick={() => {
              const store = (window as any).__tabsStore;
              if (store) {
                const { activeTabId, tabs, updateTab } = store.getState();
                const tab = tabs.find((t: { id: string }) => t.id === activeTabId);
                if (tab) updateTab(activeTabId, { aiUserPrompt: chip, dirty: true });
              }
            }}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * AiSimpleResponsePanel — displays AI conversation without ConvEngineChat.
 * Reads `activeTab.aiConversation` and renders user/assistant messages.
 */
export function AiSimpleResponsePanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversation: Message[] = (activeTab?.aiConversation as Message[] | undefined) ?? [];
  const isStreaming = activeTab?.aiStreaming ?? false;
  const lastAssistantMsg = conversation.filter(m => m.role === 'assistant').at(-1);
  const showStreamingDot = isStreaming && (!lastAssistantMsg || !lastAssistantMsg.content);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.length, isStreaming]);

  if (!activeTab) return null;

  const hasConversation = conversation.filter(m => m.role !== 'system').length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--color-panel)' }}>
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ scrollbarGutter: 'stable' }}
      >
        {!hasConversation && !isStreaming ? (
          <EmptyState />
        ) : (
          <div className="max-w-[720px] mx-auto">
            {conversation
              .filter(m => m.role !== 'system')
              .map((msg, i) => {
                const isLast = i === conversation.filter(m => m.role !== 'system').length - 1;
                if (msg.role === 'user') {
                  return <UserBubble key={msg.id} content={msg.content} />;
                }
                return (
                  <AssistantBubble
                    key={msg.id}
                    content={msg.content}
                    isStreaming={isLast && isStreaming}
                  />
                );
              })}

            {/* Streaming indicator when response hasn't arrived yet */}
            {showStreamingDot && (
              <AssistantBubble content="" isStreaming />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
