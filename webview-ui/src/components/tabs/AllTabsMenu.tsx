/**
 * Every open tab in one list — the way to one tab among a hundred without
 * scrolling the strip. Chrome's Tab Search and Firefox's List all tabs.
 *
 * With nothing typed: the tabs used last, then every tab grouped as the strip
 * is, then the tabs closed recently, which reopen from here. Typing searches
 * names and URLs across all of it. Arrow keys move, Enter opens, Escape
 * closes; every open tab has its own close button.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SearchIcon, RefreshIcon } from '../../icons';
import type { TabGroup } from '../../services/tabs/tab-groups';

export interface ListedTab { id: string; name: string; groupId?: string; pinned?: boolean; searchText: string }

type Row = { kind: 'open' | 'closed'; tab: ListedTab; key: string };
type Section = { key: string; title: string; color?: string; rows: Row[] };

const RECENT_SHOWN = 5;

export function AllTabsMenu({
  anchor, tabs, groups, recentIds, closed, activeTabId, renderBadge, onPick, onCloseTab, onReopen, onDismiss,
}: {
  anchor: DOMRect;
  tabs: ListedTab[];
  groups: TabGroup[];
  /** Most recently in front first. */
  recentIds: string[];
  closed: ListedTab[];
  activeTabId: string;
  renderBadge: (id: string) => ReactNode;
  onPick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onReopen: (id: string) => void;
  onDismiss: () => void;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const hit = (t: ListedTab) => !q || t.searchText.toLowerCase().includes(q);

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    const open = tabs.filter(hit);
    if (!q) {
      const byId = new Map(tabs.map(t => [t.id, t]));
      const recent = recentIds.filter(id => id !== activeTabId).map(id => byId.get(id)).filter((t): t is ListedTab => !!t).slice(0, RECENT_SHOWN);
      if (recent.length && tabs.length > RECENT_SHOWN) {
        out.push({ key: 'recent', title: 'Recently used', rows: recent.map(t => ({ kind: 'open', tab: t, key: `r:${t.id}` })) });
      }
    }
    const byGroup = new Map(groups.map(g => [g.id, g]));
    const loose: ListedTab[] = [];
    for (const t of open) {
      const g = t.groupId ? byGroup.get(t.groupId) : undefined;
      if (!g) { loose.push(t); continue; }
      let sec = out.find(s => s.key === g.id);
      if (!sec) { sec = { key: g.id, title: g.name || 'Unnamed group', color: g.color, rows: [] }; out.push(sec); }
      sec.rows.push({ kind: 'open', tab: t, key: `o:${t.id}` });
    }
    if (loose.length) out.push({ key: 'loose', title: groups.length ? 'Not in a group' : 'Open tabs', rows: loose.map(t => ({ kind: 'open', tab: t, key: `o:${t.id}` })) });
    const shut = closed.filter(hit);
    if (shut.length) out.push({ key: 'closed', title: 'Recently closed', rows: shut.map(t => ({ kind: 'closed', tab: t, key: `c:${t.id}` })) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, groups, recentIds, closed, q, activeTabId]);
  const flat = sections.flatMap(s => s.rows);

  useEffect(() => { setCursor(0); }, [q]);
  useEffect(() => { if (cursor >= flat.length) setCursor(Math.max(0, flat.length - 1)); }, [flat.length, cursor]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) onDismiss(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onDismiss]);

  const choose = (row: Row) => (row.kind === 'open' ? onPick(row.tab.id) : onReopen(row.tab.id));
  const width = 360;
  const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
  const top = anchor.bottom + 4;
  let n = -1;

  return createPortal(
    <div
      ref={boxRef}
      className="dk-alltabs"
      style={{ left, top, width, maxHeight: Math.max(240, window.innerHeight - top - 16) }}
      role="dialog"
      aria-label="All tabs"
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); onDismiss(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(flat.length - 1, c + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
        else if (e.key === 'Enter' && flat[cursor]) { e.preventDefault(); choose(flat[cursor]); }
      }}
    >
      <div className="dk-alltabs__search">
        <SearchIcon size={12} />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${tabs.length} open tab${tabs.length === 1 ? '' : 's'}`}
          aria-label="Search tabs"
          spellCheck={false}
        />
      </div>
      <div className="dk-alltabs__list" ref={listRef} role="listbox" aria-label="Tabs">
        {flat.length === 0 && <p className="dk-alltabs__none">No tab matches "{query.trim()}".</p>}
        {sections.map(sec => (
          <div key={sec.key}>
            <div className="dk-alltabs__head" style={sec.color ? { color: sec.color } : undefined}>
              {sec.color && <span className="dk-alltabs__dot" style={{ background: sec.color }} />}
              {sec.title}
              <span className="dk-alltabs__n">{sec.rows.length}</span>
            </div>
            {sec.rows.map(row => {
              n += 1;
              const i = n;
              const t = row.tab;
              return (
                <div
                  key={row.key}
                  data-row={i}
                  role="option"
                  aria-selected={row.kind === 'open' && t.id === activeTabId}
                  className={`dk-alltabs__row${i === cursor ? ' is-cursor' : ''}${row.kind === 'open' && t.id === activeTabId ? ' is-active' : ''}${row.kind === 'closed' ? ' is-closed' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(row)}
                >
                  <span className="dk-alltabs__badge">{renderBadge(t.id)}</span>
                  <span className="dk-alltabs__name">{t.name}</span>
                  {row.kind === 'closed' ? (
                    <span className="dk-alltabs__reopen" title="Reopen"><RefreshIcon size={12} /></span>
                  ) : !t.pinned && (
                    <button
                      type="button"
                      className="dk-alltabs__close"
                      aria-label={`Close ${t.name}`}
                      title="Close tab"
                      onClick={e => { e.stopPropagation(); onCloseTab(t.id); }}
                    >
                      <CloseIcon size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
