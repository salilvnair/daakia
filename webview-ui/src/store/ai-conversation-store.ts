/**
 * The model's history of each Daakia AI tab's conversation.
 *
 * One entry per open Daakia AI tab, keyed by the tab's id: a conversation can
 * be opened in a tab of its own, and each tab asks, streams and is answered
 * on its own. Persistence is the conversations table (ai-chat-sessions-store
 * saves a tab's thread after each question and each answer) — which is also
 * how a tab gets its thread back after a restart, by the conversation id the
 * tab keeps.
 */
import { create } from 'zustand';
import type { AiMessage } from './tabs-store';

export type { AiMessage };

interface TabConversation {
  messages: AiMessage[];
  streaming: boolean;
}

const EMPTY: AiMessage[] = [];

interface AiConversationState {
  byTab: Record<string, TabConversation>;

  /** The tab's history — an empty list for a tab that has none yet. */
  messagesOf: (tabId: string) => AiMessage[];
  setStreaming: (tabId: string, v: boolean) => void;
  /** Append or extend the last streaming assistant chunk (live typing effect). */
  appendAssistantChunk: (tabId: string, text: string) => void;
  /** Finalize the last assistant message on ai:complete. */
  finalizeAssistantMessage: (tabId: string, msg: AiMessage) => void;
  addUserMessage: (tabId: string, msg: AiMessage) => void;
  /** An answer that did not come, kept as an assistant message (with how it is drawn). */
  addErrorMessage: (tabId: string, content: string, display?: string) => void;
  clearMessages: (tabId: string) => void;
  setMessages: (tabId: string, messages: AiMessage[]) => void;
  /** The tab closed: its history goes with it (the saved conversation stays). */
  dropTab: (tabId: string) => void;
}

export const useAiConversationStore = create<AiConversationState>((set, get) => {
  const patch = (tabId: string, fn: (c: TabConversation) => Partial<TabConversation>) =>
    set(s => {
      const cur = s.byTab[tabId] ?? { messages: [], streaming: false };
      return { byTab: { ...s.byTab, [tabId]: { ...cur, ...fn(cur) } } };
    });

  return {
    byTab: {},

    messagesOf: (tabId) => get().byTab[tabId]?.messages ?? EMPTY,

    setStreaming: (tabId, v) => patch(tabId, () => ({ streaming: v })),

    appendAssistantChunk: (tabId, text) => patch(tabId, c => {
      const msgs = [...c.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + text };
      else msgs.push({ id: crypto.randomUUID(), role: 'assistant', content: text, timestamp: Date.now() });
      return { messages: msgs };
    }),

    finalizeAssistantMessage: (tabId, msg) => patch(tabId, c => {
      const msgs = [...c.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') msgs[msgs.length - 1] = { ...msg, id: last.id };
      else msgs.push(msg);
      return { messages: msgs, streaming: false };
    }),

    addUserMessage: (tabId, msg) => patch(tabId, c => ({ messages: [...c.messages, msg] })),

    addErrorMessage: (tabId, content, display) => patch(tabId, c => ({
      messages: [...c.messages, {
        id: crypto.randomUUID(), role: 'assistant', content, timestamp: Date.now(), ...(display ? { display } : {}),
      }],
      streaming: false,
    })),

    clearMessages: (tabId) => patch(tabId, () => ({ messages: [], streaming: false })),

    setMessages: (tabId, messages) => patch(tabId, () => ({ messages })),

    dropTab: (tabId) => set(s => {
      const { [tabId]: _gone, ...rest } = s.byTab;
      return { byTab: rest };
    }),
  };
});
