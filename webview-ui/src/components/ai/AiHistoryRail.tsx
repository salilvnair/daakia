/**
 * The Daakia AI tab's conversations, newest first — dui's list with search.
 *
 * Every answer saves the open thread (ai-chat-sessions-store), so this list is
 * the saved state rather than a separate "save" the user has to remember.
 * Deleting is in the header's menu, for the thread that is open.
 */
import { useEffect, useMemo, useState } from 'react';
import { ButtonView, PromptLibraryListView, type PromptLibrarySection } from '@salilvnair/dui';
import { useAiChatSessions, currentId, type ConversationRow } from '../../store/ai-chat-sessions-store';

const ACCENT = 'var(--color-ai-accent, #D97757)';

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Today / Yesterday / Earlier, by the local day it was last touched. */
function groupOf(iso: string, now: Date): 'Today' | 'Yesterday' | 'Earlier' {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  return dayKey(d) === dayKey(y) ? 'Yesterday' : 'Earlier';
}

function when(iso: string, group: string): string {
  const d = new Date(iso);
  return group === 'Earlier'
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function AiHistoryRail() {
  const conversations = useAiChatSessions(s => s.conversations);
  const activeId = useAiChatSessions(s => s.activeId);
  const opening = useAiChatSessions(s => s.opening);
  const { refresh, open, newChat } = useAiChatSessions.getState();
  const [q, setQ] = useState('');

  useEffect(() => { refresh(); }, [refresh]);

  const sections = useMemo<PromptLibrarySection[]>(() => {
    const now = new Date();
    const needle = q.trim().toLowerCase();
    const groups = new Map<string, ConversationRow[]>();
    for (const row of conversations) {
      if (needle && !row.title.toLowerCase().includes(needle)) continue;
      const g = groupOf(row.updated_at, now);
      groups.set(g, [...(groups.get(g) ?? []), row]);
    }
    return [{
      id: 'conversations',
      title: 'Conversations',
      categories: [...groups.entries()].map(([name, rows]) => ({
        id: name,
        title: name,
        items: rows.map(row => ({
          id: row.id,
          title: row.title,
          description: row.id === opening ? 'Opening…' : `${when(row.updated_at, name)}${row.model ? ` · ${row.model}` : ''}`,
        })),
      })),
    }];
  }, [conversations, q, opening]);

  const empty = sections[0].categories.length === 0;

  return (
    <aside className="dai-rail" aria-label="Conversations">
      <ButtonView
        variant="secondary"
        size="sm"
        width="fullWidth"
        accentColor={ACCENT}
        iconLeft={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>}
        onClick={newChat}
      >
        New chat
      </ButtonView>
      <div className="dai-rail-list">
        <PromptLibraryListView
          sections={sections}
          activeId={activeId || currentId()}
          onSelect={open}
          search={q}
          onSearchChange={setQ}
          accentColor={ACCENT}
        />
        {empty && (
          <div className="dai-empty">
            {q ? 'No conversation matches.' : 'Conversations appear here after the first answer, and every answer saves them.'}
          </div>
        )}
      </div>
    </aside>
  );
}
