/**
 * AiHistoryPanel — shows saved AI conversations grouped by date.
 * Supports load (restore conversation into current tab), delete, and clear all.
 * Feature 6D.16 — Conversation persistence (save/load)
 */
import { useState, useEffect, useCallback } from 'react';
import { useTabsStore, type AiMessage } from '../../store/tabs-store';
import { TrashIcon, SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';

interface ConversationMeta {
  id: string;
  title: string;
  provider: string;
  model: string;
  message_count: number;
  token_total: number;
  created_at: string;
  updated_at: string;
}

interface ConversationFull extends ConversationMeta {
  messages: AiMessage[];
}

interface Props {
  onClose: () => void;
}

function groupByDate(conversations: ConversationMeta[]): Record<string, ConversationMeta[]> {
  const groups: Record<string, ConversationMeta[]> = {};
  for (const c of conversations) {
    const date = new Date(c.updated_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    let label: string;
    if (date.toDateString() === today.toDateString()) {
      label = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = 'Yesterday';
    } else {
      label = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(c);
  }
  return groups;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AiHistoryPanel({ onClose }: Props) {
  const updateTab = useTabsStore(s => s.updateTab);
  const activeTabId = useTabsStore(s => s.activeTabId);

  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);

  // Load conversation list on mount
  useEffect(() => {
    setLoading(true);
    postMsg({ type: 'ai:loadConversations' });

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setConversations(detail.conversations || []);
      setLoading(false);
    };
    window.addEventListener('ai:conversations', handler);
    return () => window.removeEventListener('ai:conversations', handler);
  }, []);

  // Handle load conversation response
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { conversation: ConversationFull | null };
      setLoadingId(null);
      if (!detail.conversation || !activeTabId) return;
      updateTab(activeTabId, {
        aiConversation: detail.conversation.messages,
        aiProvider: detail.conversation.provider || undefined,
        aiModel: detail.conversation.model || undefined,
        aiStreaming: false,
      });
      onClose();
    };
    window.addEventListener('ai:conversation', handler);
    return () => window.removeEventListener('ai:conversation', handler);
  }, [activeTabId, updateTab, onClose]);

  // Handle delete response
  useEffect(() => {
    const handler = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      setDeletingId(null);
      setConversations(prev => prev.filter(c => c.id !== id));
    };
    window.addEventListener('ai:conversationDeleted', handler);
    return () => window.removeEventListener('ai:conversationDeleted', handler);
  }, []);

  // Handle clear response
  useEffect(() => {
    const handler = () => {
      setConversations([]);
      setClearConfirm(false);
    };
    window.addEventListener('ai:conversationsCleared', handler);
    return () => window.removeEventListener('ai:conversationsCleared', handler);
  }, []);

  const handleLoad = useCallback((id: string) => {
    setLoadingId(id);
    postMsg({ type: 'ai:loadConversation', id });
  }, []);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    postMsg({ type: 'ai:deleteConversation', id });
  }, []);

  const handleClearAll = useCallback(() => {
    if (!clearConfirm) { setClearConfirm(true); return; }
    postMsg({ type: 'ai:clearConversations' });
  }, [clearConfirm]);

  const grouped = groupByDate(conversations);
  const groups = Object.entries(grouped);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col"
      style={{ backgroundColor: 'var(--color-panel)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-surface-border)' }}
      >
        <div className="flex items-center gap-2">
          <SparkleIcon size={13} style={{ color: 'var(--color-protocol-ai)' }} />
          <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            AI Conversation History
          </span>
          {conversations.length > 0 && (
            <span
              className="text-[9.5px] px-1.5 py-0.5 rounded-full font-mono"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 12%, transparent)', color: 'var(--color-protocol-ai)' }}
            >
              {conversations.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {conversations.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-all"
              style={{
                borderColor: clearConfirm ? 'var(--color-error)' : 'var(--color-surface-border)',
                color: clearConfirm ? 'var(--color-error)' : 'var(--color-text-muted)',
              }}
              title="Clear all saved conversations"
            >
              {clearConfirm ? 'Confirm clear' : 'Clear all'}
            </button>
          )}
          {clearConfirm && (
            <button
              type="button"
              onClick={() => setClearConfirm(false)}
              className="text-[10px] cursor-pointer"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-[24px] w-[24px] flex items-center justify-center rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2 flex flex-col gap-3 [scrollbar-gutter:stable]">
        {loading && (
          <div className="flex items-center justify-center h-20">
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Loading…</span>
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-4">
            <SparkleIcon size={20} style={{ color: 'var(--color-protocol-ai)', opacity: 0.3 }} />
            <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>No saved conversations yet</p>
            <p className="text-[10.5px] opacity-60" style={{ color: 'var(--color-text-muted)' }}>
              Use the "Save" button in the conversation header to save a conversation
            </p>
          </div>
        )}

        {!loading && groups.map(([dateLabel, items]) => (
          <div key={dateLabel} className="flex flex-col gap-1">
            <p
              className="text-[9.5px] uppercase tracking-wider font-semibold px-1.5 py-0.5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {dateLabel}
            </p>
            {items.map(conv => (
              <button
                key={conv.id}
                type="button"
                onClick={() => handleLoad(conv.id)}
                disabled={loadingId === conv.id}
                className="w-full text-left rounded-lg px-3 py-2.5 cursor-pointer transition-all border group relative"
                style={{
                  backgroundColor: 'var(--color-surface-raised)',
                  borderColor: 'var(--color-surface-border)',
                }}
              >
                {/* Title */}
                <div className="flex items-start justify-between gap-2 pr-5">
                  <p
                    className="text-[12px] font-medium truncate flex-1"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {conv.title}
                  </p>
                  {loadingId === conv.id && (
                    <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-protocol-ai)' }}>
                      Loading…
                    </span>
                  )}
                </div>

                {/* Metadata row */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {conv.provider && (
                    <span
                      className="text-[9.5px] px-1 py-0.5 rounded font-mono"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 10%, transparent)', color: 'var(--color-protocol-ai)' }}
                    >
                      {conv.provider}/{conv.model}
                    </span>
                  )}
                  <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
                    {conv.message_count} msg{conv.message_count !== 1 ? 's' : ''}
                  </span>
                  {conv.token_total > 0 && (
                    <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
                      {conv.token_total.toLocaleString()} tok
                    </span>
                  )}
                  <span className="text-[9.5px] ml-auto" style={{ color: 'var(--color-text-muted)' }}>
                    {timeAgo(conv.updated_at)}
                  </span>
                </div>

                {/* Delete button — shown on hover */}
                <button
                  type="button"
                  onClick={(e) => handleDelete(conv.id, e)}
                  disabled={deletingId === conv.id}
                  className="absolute top-2 right-2 h-[20px] w-[20px] flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  style={{ color: 'var(--color-error)' }}
                  title="Delete this conversation"
                >
                  <TrashIcon size={11} />
                </button>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
