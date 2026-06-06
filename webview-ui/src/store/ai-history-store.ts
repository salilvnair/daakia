/**
 * AI History Store — manages persisted chat conversation sessions.
 * Sessions are stored in SQLite via the extension host.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

export interface AiChatSession {
  id: string;
  title: string;
  provider: string;
  model: string;
  messages: string; // JSON-serialized message array
  created_at?: string;
  updated_at?: string;
}

interface AiHistoryState {
  sessions: AiChatSession[];
  searchResults: AiChatSession[] | null;
  loaded: boolean;

  setSessions: (sessions: AiChatSession[]) => void;
  setSearchResults: (sessions: AiChatSession[]) => void;

  saveSession: (session: Omit<AiChatSession, 'created_at' | 'updated_at'>) => void;
  loadSessions: () => void;
  deleteSession: (id: string) => void;
  searchSessions: (query: string) => void;
  clearSearch: () => void;
}

export const useAiHistoryStore = create<AiHistoryState>((set) => ({
  sessions: [],
  searchResults: null,
  loaded: false,

  setSessions: (sessions) => set({ sessions, loaded: true }),
  setSearchResults: (sessions) => set({ searchResults: sessions }),

  saveSession: (session) => {
    postMsg({ type: 'aiHistory:save', ...session });
  },

  loadSessions: () => {
    postMsg({ type: 'aiHistory:load' });
  },

  deleteSession: (id) => {
    postMsg({ type: 'aiHistory:delete', id });
    set(s => ({ sessions: s.sessions.filter(x => x.id !== id) }));
  },

  searchSessions: (query) => {
    postMsg({ type: 'aiHistory:search', query });
  },

  clearSearch: () => set({ searchResults: null }),
}));
