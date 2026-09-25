/**
 * The Daakia AI tab's conversations — the history rail.
 *
 * The chat library keeps one thread in memory; `ai-conversation-store` keeps
 * the model's history of that thread. This keeps the list of threads, which
 * one is open, and moves between them: each answer saves the open thread to
 * the `ai_conversations` table, and opening one loads its messages back into
 * both — the model's history, and (through `epoch`) a fresh chat seeded with
 * what was on screen, cards included.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { useAiConversationStore } from './ai-conversation-store';
import { useUiStateStore } from './ui-state-store';
import type { AiMessage } from './tabs-store';

export interface ConversationRow {
  id: string;
  title: string;
  provider: string;
  model: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

const ACTIVE_PREF = 'ai.chat.active';

interface State {
  conversations: ConversationRow[];
  /** The thread on screen. Saved under this id. */
  activeId: string;
  /** Bumped to remount the chat — a new thread, or one reopened. */
  epoch: number;
  /** What the remounted chat starts with. */
  seed: AiMessage[];
  /** Waiting for this conversation's messages to arrive. */
  opening?: string;
  /** Who answered the last message, as the host resolved it. */
  answeredBy?: { provider: string; model: string };

  refresh: () => void;
  open: (id: string) => void;
  newChat: () => void;
  /** Save the open thread — called after every answer. */
  save: () => void;
  remove: (id: string) => void;
  setAnsweredBy: (a: { provider: string; model: string }) => void;
}

function newId(): string {
  return crypto.randomUUID();
}

export const useAiChatSessions = create<State>((set, get) => ({
  conversations: [],
  /* Empty until first needed: the saved preference is only readable once the
     UI state has loaded, which is after this module is. */
  activeId: '',
  epoch: 0,
  seed: [],

  refresh: () => postMsg({ type: 'ai:loadConversations' }),

  open: (id) => {
    if (id === currentId()) return;
    set({ opening: id });
    postMsg({ type: 'ai:loadConversation', id });
  },

  newChat: () => {
    const activeId = newId();
    useAiConversationStore.getState().clearMessages();
    useUiStateStore.getState().setPref(ACTIVE_PREF, activeId);
    set(s => ({ activeId, seed: [], epoch: s.epoch + 1, opening: undefined }));
  },

  save: () => {
    const messages = useAiConversationStore.getState().messages;
    if (!messages.some(m => m.role === 'user')) return;
    const activeId = currentId();
    const { answeredBy } = get();
    useUiStateStore.getState().setPref(ACTIVE_PREF, activeId);
    postMsg({
      type: 'ai:saveConversation', id: activeId, messages,
      provider: answeredBy?.provider ?? '', model: answeredBy?.model ?? '',
    });
  },

  remove: (id) => {
    postMsg({ type: 'ai:deleteConversation', id });
    set(s => ({ conversations: s.conversations.filter(c => c.id !== id) }));
    if (id === currentId()) get().newChat();
  },

  setAnsweredBy: (answeredBy) => set({ answeredBy }),
}));

/** The open thread's id: the one on screen, else the one open last session, else a new one. */
export function currentId(): string {
  const s = useAiChatSessions.getState();
  if (s.activeId) return s.activeId;
  const id = (useUiStateStore.getState().prefs[ACTIVE_PREF] as string | undefined) || newId();
  useAiChatSessions.setState({ activeId: id });
  return id;
}

/* The host's answers, wherever they came from. Registered once, at import. */
if (typeof window !== 'undefined') {
  window.addEventListener('ai:conversations', ((e: CustomEvent) => {
    const rows = (e.detail?.conversations ?? []) as ConversationRow[];
    useAiChatSessions.setState({ conversations: rows });
  }) as EventListener);

  window.addEventListener('ai:conversation', ((e: CustomEvent) => {
    const conv = e.detail?.conversation as (ConversationRow & { messages: AiMessage[] }) | null;
    const s = useAiChatSessions.getState();
    if (!conv || conv.id !== s.opening) return;
    /* The model's history becomes this thread's, and the chat is remounted on it. */
    useAiConversationStore.getState().setMessages(conv.messages);
    useAiConversationStore.getState().saveToDb();
    useUiStateStore.getState().setPref(ACTIVE_PREF, conv.id);
    useAiChatSessions.setState(st => ({
      activeId: conv.id, seed: conv.messages, epoch: st.epoch + 1, opening: undefined,
    }));
  }) as EventListener);

  window.addEventListener('message', (evt: MessageEvent) => {
    const msg = evt.data as Record<string, unknown> | undefined;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ai:conversationSaved') useAiChatSessions.getState().refresh();
    if (msg.type === 'ai:resolved' && typeof msg.model === 'string') {
      useAiChatSessions.getState().setAnsweredBy({ provider: String(msg.provider ?? ''), model: msg.model });
    }
  });
}
