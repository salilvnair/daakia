/**
 * AI Conversation Store — global singleton for the Daakia AI tab conversation.
 *
 * Unlike per-tab aiConversation in tabs-store, this is global (Daakia AI is a singleton tab).
 * Persists to SQLite via aiConversation:save / aiConversation:load so close/reopen restores chat.
 * Trimming to maxAiChatMessages happens server-side (MainPanel reads the setting from DB).
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import type { AiMessage } from './tabs-store';

export type { AiMessage };

interface AiConversationState {
  messages: AiMessage[];
  streaming: boolean;
  loaded: boolean;

  setStreaming: (v: boolean) => void;

  /** Append or extend the last streaming assistant chunk (live typing effect) */
  appendAssistantChunk: (text: string) => void;

  /** Finalize the last assistant message on ai:complete and save to DB */
  finalizeAssistantMessage: (msg: AiMessage) => void;

  /** Append a user message and save to DB */
  addUserMessage: (msg: AiMessage) => void;

  /** Push an error as an assistant message and save to DB */
  addErrorMessage: (content: string) => void;

  /** Clear all messages — also clears DB */
  clearMessages: () => void;

  /** Set full messages array (used when loading from DB on startup) */
  setMessages: (messages: AiMessage[]) => void;

  /** Request load from DB */
  loadFromDb: () => void;

  /** Save current messages to DB (trimming happens server-side) */
  saveToDb: () => void;
}

export const useAiConversationStore = create<AiConversationState>((set, get) => ({
  messages: [],
  streaming: false,
  loaded: false,

  setStreaming: (v) => set({ streaming: v }),

  appendAssistantChunk: (text) => {
    set(s => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      } else {
        msgs.push({ id: crypto.randomUUID(), role: 'assistant', content: text, timestamp: Date.now() });
      }
      return { messages: msgs };
    });
    // Don't save on every chunk — only on finalize to avoid thrashing DB
  },

  finalizeAssistantMessage: (msg) => {
    set(s => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...msg, id: last.id };
      } else {
        msgs.push(msg);
      }
      return { messages: msgs, streaming: false };
    });
    get().saveToDb();
  },

  addUserMessage: (msg) => {
    set(s => ({ messages: [...s.messages, msg] }));
    get().saveToDb();
  },

  addErrorMessage: (content) => {
    const errMsg: AiMessage = { id: crypto.randomUUID(), role: 'assistant', content, timestamp: Date.now() };
    set(s => ({ messages: [...s.messages, errMsg], streaming: false }));
    get().saveToDb();
  },

  clearMessages: () => {
    set({ messages: [], streaming: false });
    postMsg({ type: 'aiConversation:clear' });
  },

  setMessages: (messages) => set({ messages, loaded: true }),

  loadFromDb: () => {
    postMsg({ type: 'aiConversation:load' });
  },

  saveToDb: () => {
    const { messages } = get();
    postMsg({ type: 'aiConversation:save', messages });
  },
}));
