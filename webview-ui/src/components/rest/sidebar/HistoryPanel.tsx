import { useState, useEffect, useMemo } from 'react';
import { postMsg } from '../../../vscode';
import { useUrlSuggestionsStore } from '../../../store/url-suggestions-store';
import { useSidebarDataStore } from '../../../store/sidebar-data-store';
import { useScrollRestore } from '../../../hooks/useScrollRestore';
import { ConfirmDialog, ContextMenu, type ContextMenuItem } from '../../shared';
import { buildGroups, formatFullTimestamp, exportHistoryItem, type TopGroup } from '../../../services/history';
import { replayHistoryItem } from '../../../services/collections';
import { METHOD_COLORS } from '../../../colors';
import { MoreVerticalIcon, ClockIcon, ChevronRightIcon, ExternalLinkIcon, PlusSquareIcon, DownloadIcon, TrashIcon, SaveIcon } from '../../../icons';
import { SidebarSkeleton } from '../../shared/display/SidebarSkeleton';

interface HistoryItem {
  id: number;
  request_id?: string;
  method: string;
  url: string;
  status: number;
  status_text?: string;
  response_time?: number;
  response_size?: number;
  request_data?: string;
  response_data?: string;
  created_at?: string;
}

export function HistoryPanel({ protocol = 'rest' }: { protocol?: string }) {
  const cachedHistory = useSidebarDataStore(s => s.getHistory(protocol));
  const isLoaded = useSidebarDataStore(s => s.isHistoryLoaded(protocol));
  const setStoreHistory = useSidebarDataStore(s => s.setHistory);
  const [history, setHistory] = useState<HistoryItem[]>(cachedHistory as HistoryItem[]);
  const [search, setSearch] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedSubGroups, setCollapsedSubGroups] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: HistoryItem } | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);

  // Scroll position persistence
  const scrollRef = useScrollRestore(`history.${protocol}`);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'historyData' && (msg.protocol || 'rest') === protocol) {
        const entries = msg.entries ?? [];
        setHistory(entries);
        setStoreHistory(protocol, entries);
        // Feed URLs into suggestions store
        const urls = entries.map((e: HistoryItem) => e.url).filter(Boolean);
        const sugProtocol = protocol === 'grpc' ? 'grpc' : protocol === 'graphql' ? 'graphql' : protocol === 'websocket' ? 'websocket' : 'rest';
        useUrlSuggestionsStore.getState().addUrls(urls, sugProtocol as any);
      }
    };
    window.addEventListener('message', handler);
    // Only fetch from DB if never loaded before
    if (!isLoaded) {
      postMsg({ type: 'getHistory', protocol });
    }
    return () => window.removeEventListener('message', handler);
  }, [protocol]);

  // Sync local state from store cache
  useEffect(() => {
    setHistory(cachedHistory as HistoryItem[]);
  }, [cachedHistory]);

  const handleClearAll = () => {
    postMsg({ type: 'clearHistory', protocol });
    setShowClearConfirm(false);
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = (id: number) => {
    postMsg({ type: 'deleteHistoryEntry', id, protocol });
    setDeleteConfirmId(null);
  };

  const handleReplay = (item: HistoryItem, forceNewTab = false) => {
    replayHistoryItem(item, forceNewTab, protocol);
  };

  const handleExport = (item: HistoryItem) => {
    exportHistoryItem(item);
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const toggleSubGroup = (key: string) => {
    setCollapsedSubGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtered = useMemo(() =>
    history.filter((h) =>
      h.url.toLowerCase().includes(search.toLowerCase()) ||
      h.method.toLowerCase().includes(search.toLowerCase())
    ), [history, search]);

  // Auto-expand all groups when searching, restore collapsed state when cleared
  useEffect(() => {
    if (search.trim()) {
      setCollapsedGroups(new Set());
      setCollapsedSubGroups(new Set());
    }
  }, [search]);

  const groups = useMemo(() => buildGroups(filtered), [filtered]);

  const totalItems = (group: TopGroup) => group.subGroups.reduce((sum, sg) => sum + sg.items.length, 0);

  const renderItem = (item: HistoryItem) => {
    const timestamp = item.created_at ? formatFullTimestamp(new Date(item.created_at)) : '';
    return (
      <div
        key={item.id}
        onClick={() => handleReplay(item)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({ x: e.clientX, y: e.clientY, item });
        }}
        data-context-menu="history"
        className="px-2.5 py-1.5 mx-0.5 my-0.5 rounded-md hover:bg-[rgba(255,255,255,0.04)] cursor-pointer group relative"
        title={timestamp}
      >
        {/* Row: Method | URL | Trash */}
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase shrink-0 min-w-[38px] w-fit px-1.5 text-center py-0.5 rounded-sm"
            style={{
              color: METHOD_COLORS[item.method] || 'var(--color-muted-fallback)',
              backgroundColor: `${METHOD_COLORS[item.method] || 'var(--color-muted-fallback)'}15`,
            }}
          >
            {item.method}
          </span>

          <span className="text-[12px] text-[var(--color-text-primary)] truncate flex-1 min-w-0">
            {item.url}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, item });
            }}
            className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-opacity cursor-pointer p-0.5 rounded hover:bg-[var(--color-icon-hover-bg)] shrink-0"
            title="More Options"
          >
            <MoreVerticalIcon size={12} stroke="none" fill="currentColor" />
          </button>
        </div>

        {/* Sub row: Status | Time */}
        {(item.status >= 0 || item.response_time != null || item.status_text) && (
          <div className="flex items-center gap-2 mt-0.5 pl-[46px]">
            {item.status === 0 && item.status_text ? (
              <span className="text-[10px] font-medium text-[var(--color-error)] truncate max-w-[120px]">
                {item.status_text.match(/\[([A-Z_]+)\]/)?.[1] || (item.status_text.toLowerCase().includes('cancel') ? 'Cancelled' : item.status_text.split(':')[0].slice(0, 20))}
              </span>
            ) : (protocol === 'grpc' ? item.status >= 0 : item.status > 0) ? (
              <span className={`text-[10px] font-medium ${
                protocol === 'grpc'
                  ? (item.status === 0 ? 'text-[#22c55e]' : 'text-[var(--color-error)]')
                  : (item.status < 400 ? 'text-[#22c55e]' : 'text-[var(--color-error)]')
              }`}>
                {item.status}
              </span>
            ) : null}
            {item.response_time != null && item.response_time > 0 && (
              <span className="text-[10px] text-[var(--color-text-muted)]">{item.response_time}ms</span>
            )}
          </div>
        )}

        {/* Delete confirmation */}
        {deleteConfirmId === item.id && (
          <ConfirmDialog
            title="Delete Entry?"
            message="This history entry will be permanently deleted."
            confirmLabel="Delete"
            danger
            onConfirm={() => confirmDelete(item.id)}
            onCancel={() => setDeleteConfirmId(null)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header label */}
      <div className="px-4 py-3 border-b border-[var(--color-surface-border)] text-[13px] text-[var(--color-text-secondary)] flex items-center gap-2">
        <span>History</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--color-surface-border)]">
        <input
          type="text"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-[32px] px-3 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      {/* Actions row */}
      {history.length > 0 && (
        <div className="flex items-center justify-end px-3 py-2 border-b border-[var(--color-surface-border)]">
          <button
            type="button"
            onClick={(e) => setHeaderMenu({ x: e.clientX, y: e.clientY })}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-icon-hover-bg)] cursor-pointer transition-colors"
            title="More Options"
          >
            <MoreVerticalIcon size={14} />
          </button>
        </div>
      )}

      {/* List grouped by date */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {!isLoaded ? (
          <SidebarSkeleton rows={8} />
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <ClockIcon size={40} strokeWidth={1} className="text-[var(--color-text-muted)] opacity-40 mb-3" />
            <p className="text-[12px] text-[var(--color-text-muted)]">No requests yet</p>
            <p className="text-[11px] text-[var(--color-text-muted)] opacity-60 mt-1">Send a request to see it here</p>
          </div>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.label);
            const count = totalItems(group);
            return (
              <div key={group.label} className="mb-0.5">
                {/* Top-level group header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                >
                  <ChevronRightIcon size={10} strokeWidth={2.5} className={`text-[var(--color-text-muted)] shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                  <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                    {group.label}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)] opacity-50 ml-auto">
                    {count}
                  </span>
                </button>

                {/* Group content */}
                <div className={`collapse-wrapper ${!isCollapsed ? 'expanded' : ''}`}>
                  <div className="collapse-inner">
                    <div>
                      {group.subGroups.map((sg) => {
                        // If sub-group has no label (Yesterday, single-date groups), render items directly
                        if (!sg.label) {
                          return (
                            <div key="flat" className="pl-2">
                              {sg.items.map(renderItem)}
                            </div>
                          );
                        }

                        // Sub-group with label (hour intervals inside Today, or dates within a year)
                        const subKey = `${group.label}::${sg.label}`;
                        const isSubCollapsed = collapsedSubGroups.has(subKey);
                        return (
                          <div key={sg.label}>
                            <button
                              type="button"
                              onClick={() => toggleSubGroup(subKey)}
                              className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1 cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                            >
                              <ChevronRightIcon size={8} strokeWidth={2.5} className={`text-[var(--color-text-muted)] opacity-60 shrink-0 transition-transform ${isSubCollapsed ? '' : 'rotate-90'}`} />
                              <span className="text-[10px] font-medium text-[var(--color-text-muted)] opacity-80">
                                {sg.label}
                              </span>
                              <span className="text-[9px] text-[var(--color-text-muted)] opacity-40 ml-auto">
                                {sg.items.length}
                              </span>
                            </button>
                            <div className={`collapse-wrapper ${!isSubCollapsed ? 'expanded' : ''}`}>
                              <div className="collapse-inner">
                                <div className="pl-4">
                                  {sg.items.map(renderItem)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* History item context menu */}
      {contextMenu && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          items={[
            { id: 'open', label: 'Open', shortcut: 'O', icon: <ExternalLinkIcon size={14} /> },
            { id: 'open-new-tab', label: 'Open in New Tab', shortcut: 'T', icon: <PlusSquareIcon size={14} /> },
            { id: 'sep1', label: '', separator: true },
            { id: 'save', label: 'Save to Collection', shortcut: 'S', icon: <SaveIcon size={14} /> },
            { id: 'export', label: 'Export as JSON', shortcut: 'E', icon: <DownloadIcon size={14} /> },
            { id: 'sep2', label: '', separator: true },
            { id: 'delete', label: 'Delete', danger: true, shortcut: 'Del', icon: <TrashIcon size={14} /> },
          ]}
          onSelect={(id) => {
            const item = contextMenu.item;
            switch (id) {
              case 'open': handleReplay(item); break;
              case 'open-new-tab': handleReplay(item, true); break;
              case 'save': handleReplay(item); setTimeout(() => window.postMessage({ type: 'openSaveAs', tabId: `h_${item.id}` }, '*'), 50); break;
              case 'export': exportHistoryItem(item); break;
              case 'delete': setDeleteConfirmId(item.id); break;
            }
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Header more menu */}
      {headerMenu && (
        <ContextMenu
          items={[{ id: 'clear-all', label: 'Delete all history', danger: true, shortcut: 'D', icon: <TrashIcon size={14} /> }]}
          position={headerMenu}
          onSelect={() => { setShowClearConfirm(true); setHeaderMenu(null); }}
          onClose={() => setHeaderMenu(null)}
        />
      )}

      {/* Clear all confirmation */}
      {showClearConfirm && (
        <ConfirmDialog
          title="Clear All History?"
          message="This will permanently delete all history entries. This cannot be undone."
          confirmLabel="Delete All"
          danger
          onConfirm={handleClearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}
