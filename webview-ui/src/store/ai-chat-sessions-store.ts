/**
 * The Daakia AI tabs' conversations — which one each tab has open.
 *
 * Every Daakia AI tab is a conversation of its own: the rail's "Open in new
 * tab" opens one beside the others. This keeps, per tab, the thread on screen
 * and moves between threads: each answer saves the tab's thread to the
 * `ai_conversations` table, and opening one loads its messages back into both
 * the model's history (ai-conversation-store) and — through `epoch` — a fresh
 * chat seeded with what was on screen, cards included.
 *
 * The tab keeps its conversation's id (`aiChatId`), so a restart brings each
 * tab's thread back; a tab from before that existed takes the last one used.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { useAiConversationStore } from './ai-conversation-store';
import { useUiStateStore } from './ui-state-store';
import { useTabsStore, type AiMessage } from './tabs-store';

export interface ConversationRow {
  id: string;
  title: string;
  provider: string;
  model: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  /** Whether any answer in it searched dk8s or ran kubectl — the rail marks those. */
  dk8s?: number | boolean;
}

/** The last conversation any tab used — where a tab with none of its own starts. */
const ACTIVE_PREF = 'ai.chat.active';

export interface TabSession {
  /** The thread on screen in this tab. Saved under this id. */
  activeId: string;
  /** Bumped to remount the tab's chat — a new thread, or one reopened. */
  epoch: number;
  /** What the remounted chat starts with. */
  seed: AiMessage[];
  /** Waiting for this conversation's messages to arrive. */
  opening?: string;
  /** Who answered the last message, as the host resolved it. */
  answeredBy?: { provider: string; model: string };
}

interface State {
  conversations: ConversationRow[];
  byTab: Record<string, TabSession>;

  /** The tab's session, created — and its thread asked for — the first time. */
  ensure: (tabId: string) => TabSession;
  refresh: () => void;
  open: (tabId: string, id: string) => void;
  newChat: (tabId: string) => void;
  /** Save the tab's thread — after every question and every answer. */
  save: (tabId: string) => void;
  remove: (id: string) => void;
  setAnsweredBy: (tabId: string, a: { provider: string; model: string }) => void;
}

function newId(): string {
  return crypto.randomUUID();
}

const TITLE_MAX = 28;
/** A tab is named after its conversation, so two of them can be told apart. */
function nameTab(tabId: string, title?: string) {
  const name = title ? (title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX)}…` : title) : 'Daakia AI';
  const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
  if (tab && tab.name !== name) useTabsStore.getState().updateTab(tabId, { name });
}

export const useAiChatSessions = create<State>((set, get) => {
  const patch = (tabId: string, p: Partial<TabSession>) => set(s => (
    s.byTab[tabId] ? { byTab: { ...s.byTab, [tabId]: { ...s.byTab[tabId], ...p } } } : s
  ));

  const load = (tabId: string, id: string) => {
    patch(tabId, { opening: id });
    postMsg({ type: 'ai:loadConversation', id });
  };

  return {
    conversations: [],
    byTab: {},

    ensure: (tabId) => {
      const have = get().byTab[tabId];
      if (have) return have;
      const tabs = useTabsStore.getState().tabs;
      const tab = tabs.find(t => t.id === tabId);
      /* The first Daakia AI tab picks up the last conversation used; any other starts from its own. */
      const firstAi = tabs.find(t => t.type === 'daakia-ai')?.id === tabId;
      const stored = tab?.aiChatId || (firstAi ? (useUiStateStore.getState().prefs[ACTIVE_PREF] as string | undefined) : undefined);
      const session: TabSession = { activeId: stored || newId(), epoch: 0, seed: [] };
      set(s => ({ byTab: { ...s.byTab, [tabId]: session } }));
      if (tab && tab.aiChatId !== session.activeId) useTabsStore.getState().updateTab(tabId, { aiChatId: session.activeId });
      if (stored) load(tabId, stored);
      return session;
    },

    refresh: () => postMsg({ type: 'ai:loadConversations' }),

    open: (tabId, id) => {
      if (get().byTab[tabId]?.activeId === id) return;
      get().ensure(tabId);
      load(tabId, id);
    },

    newChat: (tabId) => {
      /* An answer still on its way belongs to the thread being left: stop it rather than let it land in the new one. */
      const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
      if (tab?.aiStreaming) postMsg({ type: 'ai:cancel', tabId });
      const activeId = newId();
      useAiConversationStore.getState().clearMessages(tabId);
      useUiStateStore.getState().setPref(ACTIVE_PREF, activeId);
      useTabsStore.getState().updateTab(tabId, { aiChatId: activeId });
      nameTab(tabId);
      set(s => ({
        byTab: { ...s.byTab, [tabId]: { activeId, seed: [], epoch: (s.byTab[tabId]?.epoch ?? 0) + 1 } },
      }));
    },

    save: (tabId) => {
      const messages = useAiConversationStore.getState().messagesOf(tabId);
      const firstUser = messages.find(m => m.role === 'user');
      if (!firstUser) return;
      const session = get().ensure(tabId);
      useUiStateStore.getState().setPref(ACTIVE_PREF, session.activeId);
      nameTab(tabId, firstUser.content.trim());
      postMsg({
        type: 'ai:saveConversation', id: session.activeId, messages,
        provider: session.answeredBy?.provider ?? '', model: session.answeredBy?.model ?? '',
      });
    },

    remove: (id) => {
      postMsg({ type: 'ai:deleteConversation', id });
      set(s => ({ conversations: s.conversations.filter(c => c.id !== id) }));
      /* Any tab showing it starts afresh. */
      for (const [tabId, sess] of Object.entries(get().byTab)) if (sess.activeId === id) get().newChat(tabId);
    },

    setAnsweredBy: (tabId, answeredBy) => patch(tabId, { answeredBy }),
  };
});

/** The tab's open thread id, creating the tab's session if it has none yet. */
export function currentId(tabId: string): string {
  return useAiChatSessions.getState().ensure(tabId).activeId;
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
    const waiting = Object.entries(s.byTab).filter(([, sess]) => sess.opening && (!conv || sess.opening === conv.id));
    if (!conv) {
      /* Not in the table — never answered, or deleted: the tab keeps the id and starts empty. */
      for (const [tabId, sess] of waiting) {
        useAiChatSessions.setState(st => ({ byTab: { ...st.byTab, [tabId]: { ...sess, activeId: sess.opening!, opening: undefined } } }));
      }
      return;
    }
    for (const [tabId] of waiting) {
      /* The model's history becomes this thread's, and the tab's chat is remounted on it. */
      useAiConversationStore.getState().setMessages(tabId, conv.messages);
      useUiStateStore.getState().setPref(ACTIVE_PREF, conv.id);
      useTabsStore.getState().updateTab(tabId, { aiChatId: conv.id });
      nameTab(tabId, conv.title);
      useAiChatSessions.setState(st => ({
        byTab: { ...st.byTab, [tabId]: { ...st.byTab[tabId], activeId: conv.id, seed: conv.messages, epoch: st.byTab[tabId].epoch + 1, opening: undefined } },
      }));
    }
  }) as EventListener);

  window.addEventListener('message', (evt: MessageEvent) => {
    const msg = evt.data as Record<string, unknown> | undefined;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ai:conversationSaved') useAiChatSessions.getState().refresh();
    if (msg.type === 'ai:resolved' && typeof msg.model === 'string' && typeof msg.tabId === 'string') {
      useAiChatSessions.getState().setAnsweredBy(msg.tabId, { provider: String(msg.provider ?? ''), model: msg.model });
    }
  });

  /* A Daakia AI tab that closes takes its in-memory thread with it; the saved conversation stays in the rail. */
  let known = new Set<string>();
  useTabsStore.subscribe(st => {
    const now = new Set(st.tabs.filter(t => t.type === 'daakia-ai').map(t => t.id));
    for (const id of known) {
      if (now.has(id)) continue;
      useAiConversationStore.getState().dropTab(id);
      useAiChatSessions.setState(s => {
        const { [id]: _gone, ...rest } = s.byTab;
        return { byTab: rest };
      });
    }
    known = now;
  });
}
