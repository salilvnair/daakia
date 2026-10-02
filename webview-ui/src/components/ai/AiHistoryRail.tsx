/**
 * The Daakia AI tab's conversations — drawn the way the History tab draws
 * requests.
 *
 * The same groups from the same function (`buildGroups`): Today split into
 * "Just now" and "N hours ago", then Yesterday, the days of this month, the
 * months of this year, and years. Same search box, same collapsing headers
 * with their counts and expand/collapse-all, same rows — a chip on the left,
 * the title, and when and by which model underneath.
 *
 * Every answer saves the open thread (ai-chat-sessions-store), so this list is
 * the saved state rather than a separate "save" the user has to remember.
 */
import { useEffect, useMemo, useState } from 'react';
import { ContextMenuView, IconButtonView, SearchInputView, type ContextMenuItem } from '@salilvnair/dui';
import { useAiChatSessions, currentId, type ConversationRow } from '../../store/ai-chat-sessions-store';
import { useTabsStore } from '../../store/tabs-store';
import { buildGroups, formatFullTimestamp, type SubGroup, type TopGroup } from '../../services/history';
import {
  ChevronRightIcon, ClockIcon, CollapseAllIcon, ExpandAllIcon, ExternalLinkIcon, MoreVerticalIcon, SearchIcon, TrashIcon,
} from '../../icons';

type Row = ConversationRow & { created_at: string };

const ACCENT = 'var(--color-ai-accent, #D97757)';
const DK8S = 'var(--color-dk8s)';

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const count = (g: SubGroup<Row>): number =>
  g.items.length + (g.subGroups ?? []).reduce((n, s) => n + count(s), 0);

export function AiHistoryRail({ tabId }: { tabId: string }) {
  const conversations = useAiChatSessions(s => s.conversations);
  const activeId = useAiChatSessions(s => s.byTab[tabId]?.activeId ?? '');
  const opening = useAiChatSessions(s => s.byTab[tabId]?.opening);
  /* Conversations open in other Daakia AI tabs, so the rail can say so. */
  const elsewhereIds = useTabsStore(s => s.tabs.filter(t => t.type === 'daakia-ai' && t.id !== tabId && t.aiChatId).map(t => t.aiChatId!).join(','));
  const elsewhere = useMemo(() => new Set(elsewhereIds.split(',').filter(Boolean)), [elsewhereIds]);
  const { refresh, remove } = useAiChatSessions.getState();
  const open = (id: string) => useAiChatSessions.getState().open(tabId, id);
  const openInNewTab = (row: ConversationRow) => useTabsStore.getState().openDaakiaAiTab({ chatId: row.id, title: row.title });
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ position: { x: number; y: number }; items: ContextMenuItem[] } | null>(null);

  useEffect(() => { refresh(); }, [refresh]);

  const needle = q.trim().toLowerCase();
  const groups = useMemo<TopGroup<Row>[]>(() => buildGroups<Row>(conversations
    .filter(c => !needle || c.title.toLowerCase().includes(needle) || (c.model ?? '').toLowerCase().includes(needle))
    .map(c => ({ ...c, created_at: c.updated_at }))), [conversations, needle]);

  /* A search opens every group it found something in; clearing it gives the reader's own back. */
  const isCollapsed = (key: string) => !needle && collapsed.has(key);
  const toggle = (key: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const keysUnder = (g: SubGroup<Row>, key: string): string[] =>
    [key, ...(g.subGroups ?? []).flatMap(s => keysUnder(s, `${key}::${s.label}`))];
  const setTree = (keys: string[], collapse: boolean) => setCollapsed(prev => {
    const next = new Set(prev);
    for (const k of keys) { if (collapse) next.add(k); else next.delete(k); }
    return next;
  });
  const topKeys = (g: TopGroup<Row>) => [g.label, ...g.subGroups.filter(s => s.label).flatMap(s => keysUnder(s, `${g.label}::${s.label}`))];

  const active = activeId || currentId(tabId);

  const rowMenu = (e: React.MouseEvent, row: Row) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      position: { x: e.clientX, y: e.clientY },
      items: [
        { id: 'open', label: 'Open', onClick: () => { open(row.id); setMenu(null); } },
        { id: 'open-tab', label: elsewhere.has(row.id) ? 'Go to its tab' : 'Open in new tab',
          icon: <ExternalLinkIcon size={14} />, onClick: () => { openInNewTab(row); setMenu(null); } },
        { id: 's', label: '', separator: true },
        { id: 'delete', label: 'Delete conversation', danger: true, icon: <TrashIcon size={14} />,
          onClick: () => { remove(row.id); setMenu(null); } },
      ],
    });
  };

  const renderRow = (row: Row) => {
    const on = row.id === active;
    const dk8s = !!row.dk8s;
    const chip = dk8s ? DK8S : ACCENT;
    return (
      <div
        key={row.id}
        onClick={() => open(row.id)}
        onContextMenu={e => rowMenu(e, row)}
        className="dai-conv group"
        data-on={on || undefined}
        title={`${row.title}\n${formatFullTimestamp(new Date(row.updated_at))}`}
      >
        <div className="flex items-center gap-2">
          <span className="dai-conv-chip" style={{ color: chip, backgroundColor: `color-mix(in srgb, ${chip} 14%, transparent)` }}>
            {dk8s ? 'dk8s' : 'AI'}
          </span>
          <span className="dai-conv-title">{row.title}</span>
          <IconButtonView
            icon={<MoreVerticalIcon size={12} style={{ color: 'var(--color-text-muted)' }} />}
            size="sm"
            tooltip="More options"
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={e => rowMenu(e, row)}
          />
        </div>
        <div className="dai-conv-sub">
          {row.id === opening ? 'Opening…' : when(row.updated_at)}
          {row.model ? <span>· {row.model}</span> : null}
          {elsewhere.has(row.id) ? <span style={{ color: 'var(--dai-accent)' }}>· open in another tab</span> : null}
        </div>
      </div>
    );
  };

  const header = (label: string, key: string, n: number, level: 0 | 1 | 2, keys: string[]) => {
    const shut = isCollapsed(key);
    return (
      <div onClick={() => toggle(key)} className={`dai-grp dai-grp-${level}`}>
        <ChevronRightIcon size={level === 0 ? 10 : level === 1 ? 8 : 7} strokeWidth={2.5}
                          className={`shrink-0 transition-transform ${shut ? '' : 'rotate-90'}`} />
        <span className="dai-grp-label">{label}</span>
        <span className="flex items-center gap-0.5 ml-auto">
          <IconButtonView icon={<ExpandAllIcon size={level === 0 ? 10 : 9} className="text-[var(--color-info)]" />} size="xs" tooltip="Expand all"
                          onClick={e => { e.stopPropagation(); setTree(keys, false); }} />
          <IconButtonView icon={<CollapseAllIcon size={level === 0 ? 10 : 9} className="text-[var(--color-warning)]" />} size="xs" tooltip="Collapse all"
                          onClick={e => { e.stopPropagation(); setTree(keys, true); }} />
          <span className="dai-grp-count">{n}</span>
        </span>
      </div>
    );
  };

  const renderSub = (sg: SubGroup<Row>, key: string, level: 1 | 2): React.ReactNode => {
    if (!sg.label) return <div key="flat" className="pl-2">{sg.items.map(renderRow)}</div>;
    const shut = isCollapsed(key);
    return (
      <div key={sg.label}>
        {header(sg.label, key, count(sg), level, keysUnder(sg, key))}
        <div className={`collapse-wrapper ${!shut ? 'expanded' : ''}`}>
          <div className="collapse-inner">
            {/* The History tab's indents: a month's days sit under it unindented; rows step in. */}
            <div className={sg.subGroups?.length ? '' : level === 1 ? 'pl-4' : 'pl-14'}>
              {sg.subGroups?.length
                ? sg.subGroups.map(inner => renderSub(inner, `${key}::${inner.label}`, 2))
                : sg.items.map(renderRow)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className="dai-rail" aria-label="Conversations">
      <div className="dai-rail-search">
        <SearchInputView
          value={q}
          onChange={setQ}
          placeholder="Search conversations"
          height={30}
          prefix={<SearchIcon size={13} />}
          suffix={q.trim() ? (
            <button type="button" onClick={() => setQ('')} title="Clear search" className="dai-rail-clear">✕</button>
          ) : (
            <span className="dai-rail-total">{conversations.length}</span>
          )}
        />
      </div>

      <div className="dai-rail-list">
        {groups.length === 0 ? (
          <div className="dai-empty">
            <ClockIcon size={34} strokeWidth={1} style={{ opacity: 0.4 }} />
            <span>{q ? 'No conversation matches.' : 'No conversations yet'}</span>
            {!q && <span style={{ opacity: 0.7 }}>Every answer saves the conversation here.</span>}
          </div>
        ) : groups.map(g => {
          const shut = isCollapsed(g.label);
          const n = g.subGroups.reduce((s, sg) => s + count(sg), 0);
          return (
            <div key={g.label} className="mb-0.5">
              {header(g.label, g.label, n, 0, topKeys(g))}
              <div className={`collapse-wrapper ${!shut ? 'expanded' : ''}`}>
                <div className="collapse-inner">
                  <div>{g.subGroups.map(sg => renderSub(sg, `${g.label}::${sg.label}`, 1))}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {menu && (
        <ContextMenuView open anchorEl={null} position={menu.position} onClose={() => setMenu(null)} items={menu.items} />
      )}
    </aside>
  );
}
