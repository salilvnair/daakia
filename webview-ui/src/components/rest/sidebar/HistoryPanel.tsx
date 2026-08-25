import { useState, useEffect, useMemo } from 'react';
import { postMsg } from '../../../vscode';
import { useUrlSuggestionsStore, type SuggestionProtocol } from '../../../store/url-suggestions-store';

const SUGGESTION_PROTOCOLS = new Set<string>(['rest', 'graphql', 'grpc', 'websocket', 'sse', 'socketio', 'mqtt', 'soap', 'mcp', 'ai']);
import { useSidebarDataStore } from '../../../store/sidebar-data-store';
import { useTabsStore } from '../../../store/tabs-store';
import { useScrollRestore } from '../../../hooks/useScrollRestore';
import { ConfirmDialog, SaveRequestModal } from '../../shared';
import { SearchInputView, IconButtonView, ContextMenuView, type ContextMenuItem as DuiContextMenuItem } from '@salilvnair/dui';
import { buildGroups, formatFullTimestamp, exportHistoryItem, exportHistoryItems, type TopGroup, type SubGroup } from '../../../services/history';
import { replayHistoryItem } from '../../../services/collections';
import type { CollectionTreeNode } from '../../../services/collections/tree-helpers';
import { AiDocGeneratorModal } from '../../ai/AiDocGeneratorModal';
import { METHOD_COLORS, getProtocolAccent } from '../../../colors';
import { MoreVerticalIcon, ClockIcon, ChevronRightIcon, ExternalLinkIcon, PlusSquareIcon, DownloadIcon, TrashIcon, SaveIcon, ExpandAllIcon, CollapseAllIcon, DocumentIcon, ServerIcon, SearchIcon, ProtocolRestBadge, ProtocolGraphQLBadge, ProtocolRealtimeBadge, ProtocolGrpcBadge, ProtocolSoapBadge, ProtocolAiBadge, ProtocolMcpBadge } from '../../../icons';
import { logUiEvent } from '../../../store/ui-audit-store';

/** Long provider/endpoint URLs (e.g. AI base URLs) read poorly at full length in a narrow sidebar row. */
function trimUrl(url: string, max = 42): string {
  return url.length > max ? `${url.slice(0, max)}..` : url;
}

/** Response-time → threshold color, matching the (previously unused) --color-time-* tokens. */
function getTimeColor(ms: number): string {
  if (ms < 300) return 'var(--color-protocol-ai)';
  if (ms < 1000) return 'var(--color-time-moderate)';
  if (ms < 3000) return 'var(--color-time-slow)';
  return 'var(--color-time-critical)';
}

function ProtocolHeaderIcon({ protocol }: { protocol: string }) {
  const size = 20;
  if (protocol === 'graphql') return <ProtocolGraphQLBadge size={size} />;
  if (protocol === 'grpc') return <ProtocolGrpcBadge size={size} />;
  if (protocol === 'soap') return <ProtocolSoapBadge size={size} />;
  if (protocol === 'ai') return <ProtocolAiBadge size={size} />;
  if (protocol === 'mcp') return <ProtocolMcpBadge size={size} />;
  if (protocol === 'websocket' || protocol === 'sse' || protocol === 'mqtt' || protocol === 'socketio') return <ProtocolRealtimeBadge size={size} />;
  return <ProtocolRestBadge size={size} />;
}

const PROTOCOL_LABEL_MAP: Record<string, string> = {
  graphql: 'GQL',
  websocket: 'WS',
  grpc: 'gRPC',
  soap: 'SOAP',
  ai: 'AI',
  mcp: 'MCP',
  sse: 'SSE',
  mqtt: 'MQTT',
  socketio: 'Socket.IO',
};
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
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; items: DuiContextMenuItem[] } | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ position: { x: number; y: number }; items: DuiContextMenuItem[] } | null>(null);
  const [docGeneratorNode, setDocGeneratorNode] = useState<CollectionTreeNode | null>(null);
  const [bulkSaveItems, setBulkSaveItems] = useState<HistoryItem[] | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ position: { x: number; y: number }; items: DuiContextMenuItem[] } | null>(null);

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
        const sugProtocol = SUGGESTION_PROTOCOLS.has(protocol) ? (protocol as SuggestionProtocol) : 'rest';
        useUrlSuggestionsStore.getState().addUrls(urls, sugProtocol);
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
    logUiEvent('history.clear', { protocol });
    postMsg({ type: 'clearHistory', protocol });
    setShowClearConfirm(false);
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = (id: number) => {
    logUiEvent('history.delete', { id, protocol });
    postMsg({ type: 'deleteHistoryEntry', id, protocol });
    setDeleteConfirmId(null);
  };

  const handleReplay = (item: HistoryItem, forceNewTab = false) => {
    logUiEvent('history.open', { method: item.method, url: item.url, protocol });
    replayHistoryItem(item, forceNewTab, protocol);
  };

  const handleExport = (item: HistoryItem) => {
    exportHistoryItem(item);
  };

  const openHistoryContextMenu = (e: React.MouseEvent, item: HistoryItem) => {
    e.preventDefault();
    e.stopPropagation();
    const close = () => setContextMenu(null);
    const items: DuiContextMenuItem[] = [
      { id: 'open', label: 'Open', shortcut: 'O', icon: <ExternalLinkIcon size={14} style={{ color: 'var(--color-info)' }} />, onClick: () => { handleReplay(item); close(); } },
      { id: 'open-new-tab', label: 'Open in New Tab', shortcut: 'T', icon: <PlusSquareIcon size={14} style={{ color: 'var(--color-success)' }} />, onClick: () => { handleReplay(item, true); close(); } },
      { id: 'sep1', label: '', separator: true },
      { id: 'save', label: 'Save to Collection', shortcut: 'S', icon: <SaveIcon size={14} style={{ color: 'var(--color-primary)' }} />, onClick: () => { handleReplay(item); setTimeout(() => window.postMessage({ type: 'openSaveAs', tabId: `h_${item.id}` }, '*'), 50); close(); } },
      { id: 'export', label: 'Export as JSON', shortcut: 'E', icon: <DownloadIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => { exportHistoryItem(item); close(); } },
      { id: 'sep1b', label: '', separator: true },
      { id: 'document-request', label: 'Document Request', shortcut: 'M', icon: <DocumentIcon size={14} style={{ color: 'var(--color-info)' }} />, onClick: () => {
        const req = { id: String(item.id), collection_id: '', name: item.url, method: item.method, url: item.url, data: item.request_data };
        setDocGeneratorNode({ id: req.id, name: req.name, parent_id: null, sort_order: 0, children: [], requests: [req] });
        close();
      } },
      { id: 'mock-request', label: 'Mock Request', shortcut: 'K', icon: <ServerIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => {
        useTabsStore.getState().openMockServerTab();
        setTimeout(() => window.postMessage({ type: 'mockRequestFromSidebar', protocol, name: item.url, method: item.method, url: item.url }, '*'), 250);
        close();
      } },
      { id: 'sep2', label: '', separator: true },
      { id: 'delete', label: 'Delete', danger: true, shortcut: '⌫', icon: <TrashIcon size={14} style={{ color: 'var(--color-error)' }} />, onClick: () => { setDeleteConfirmId(item.id); close(); } },
    ];
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, items });
  };

  const openHeaderMenu = (e: React.MouseEvent) => {
    const close = () => setHeaderMenu(null);
    const items: DuiContextMenuItem[] = [
      { id: 'expand-all', label: 'Expand all', icon: <ExpandAllIcon size={14} className="text-[var(--color-info)]" />, onClick: () => { expandAllGroups(); close(); } },
      { id: 'collapse-all', label: 'Collapse all', icon: <CollapseAllIcon size={14} className="text-[var(--color-warning)]" />, onClick: () => { collapseAllGroups(); close(); } },
      { id: 'sep-export', label: '', separator: true },
      // Whole-history scope — export only, no "Save to Collection" (dumping every request ever
      // made into one collection isn't a meaningful action the way a single day/month's worth is).
      { id: 'export-all', label: 'Export as JSON', shortcut: 'E', icon: <DownloadIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => { exportHistoryItems(history, 'all'); close(); } },
      { id: 'sep-expand', label: '', separator: true },
      { id: 'clear-all', label: 'Delete all history', danger: true, shortcut: 'D', icon: <TrashIcon size={14} style={{ color: 'var(--color-error)' }} />, onClick: () => { setShowClearConfirm(true); close(); } },
    ];
    setHeaderMenu({ position: { x: e.clientX, y: e.clientY }, items });
  };

  // Every HistoryItem nested under a top-level group (Today / June / 2025 / ...), flattened.
  const flattenGroupItems = (group: TopGroup): HistoryItem[] => {
    const items: HistoryItem[] = [];
    for (const sg of group.subGroups) {
      if (sg.subGroups) {
        for (const inner of sg.subGroups) items.push(...inner.items);
      } else {
        items.push(...sg.items);
      }
    }
    return items;
  };

  const openGroupMenu = (e: React.MouseEvent, group: TopGroup) => {
    e.stopPropagation();
    const close = () => setGroupMenu(null);
    const items: DuiContextMenuItem[] = [
      { id: 'save', label: 'Save to Collection', shortcut: 'S', icon: <SaveIcon size={14} style={{ color: 'var(--color-primary)' }} />, onClick: () => { setBulkSaveItems(flattenGroupItems(group)); close(); } },
      { id: 'export', label: 'Export as JSON', shortcut: 'E', icon: <DownloadIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => { exportHistoryItems(flattenGroupItems(group), group.label); close(); } },
    ];
    setGroupMenu({ position: { x: e.clientX, y: e.clientY }, items });
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

  // Every sub-group key nested under a given sub-group (itself + descendants) —
  // covers both the 2-level leaf case (just subKey) and the 3-level year→month→date case.
  const collectSubGroupKeys = (sg: SubGroup, subKey: string): string[] => {
    const keys = [subKey];
    if (sg.subGroups) {
      for (const inner of sg.subGroups) keys.push(...collectSubGroupKeys(inner, `${subKey}::${inner.label}`));
    }
    return keys;
  };

  // All sub-group keys under a top-level group (used by both the global
  // Expand/Collapse All action and the per-group inline icons).
  const collectGroupSubKeys = (group: TopGroup): string[] => {
    const keys: string[] = [];
    for (const sg of group.subGroups) {
      if (!sg.label) continue; // flat items with no sub-group wrapper
      keys.push(...collectSubGroupKeys(sg, `${group.label}::${sg.label}`));
    }
    return keys;
  };

  // Expand/collapse one top-level group plus every descendant sub-group.
  const expandGroupTree = (group: TopGroup) => {
    setCollapsedGroups((prev) => { const next = new Set(prev); next.delete(group.label); return next; });
    const descendantKeys = collectGroupSubKeys(group);
    setCollapsedSubGroups((prev) => { const next = new Set(prev); descendantKeys.forEach(k => next.delete(k)); return next; });
  };
  const collapseGroupTree = (group: TopGroup) => {
    setCollapsedGroups((prev) => new Set(prev).add(group.label));
    const descendantKeys = collectGroupSubKeys(group);
    setCollapsedSubGroups((prev) => { const next = new Set(prev); descendantKeys.forEach(k => next.add(k)); return next; });
  };

  // Expand/collapse one sub-group plus every descendant (for the 3-level case).
  const expandSubGroupTree = (sg: SubGroup, subKey: string) => {
    const keys = collectSubGroupKeys(sg, subKey);
    setCollapsedSubGroups((prev) => { const next = new Set(prev); keys.forEach(k => next.delete(k)); return next; });
  };
  const collapseSubGroupTree = (sg: SubGroup, subKey: string) => {
    const keys = collectSubGroupKeys(sg, subKey);
    setCollapsedSubGroups((prev) => { const next = new Set(prev); keys.forEach(k => next.add(k)); return next; });
  };

  // Global Expand All / Collapse All — every group and sub-group in the tree.
  const expandAllGroups = () => {
    setCollapsedGroups(new Set());
    setCollapsedSubGroups(new Set());
  };
  const collapseAllGroups = () => {
    setCollapsedGroups(new Set(groups.map(g => g.label)));
    const allSubKeys: string[] = [];
    for (const g of groups) allSubKeys.push(...collectGroupSubKeys(g));
    setCollapsedSubGroups(new Set(allSubKeys));
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

  const totalItems = (group: TopGroup) => {
    let count = 0;
    for (const sg of group.subGroups) {
      if (sg.subGroups) {
        for (const inner of sg.subGroups) {
          count += inner.items.length;
        }
      } else {
        count += sg.items.length;
      }
    }
    return count;
  };

  const renderItem = (item: HistoryItem) => {
    const timestamp = item.created_at ? formatFullTimestamp(new Date(item.created_at)) : '';
    return (
      <div
        key={item.id}
        onClick={() => handleReplay(item)}
        onContextMenu={(e) => openHistoryContextMenu(e, item)}
        data-context-menu="history"
        className="px-2.5 py-1.5 mx-0.5 my-0.5 rounded-md hover:bg-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)] cursor-pointer group relative"
        title={timestamp}
      >
        {/* Row: Method | URL | Trash */}
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase shrink-0 w-fit px-1.5 text-center py-0.5 rounded-sm"
            style={{
              // AI history stores the provider id lowercase (e.g. "openai"); METHOD_COLORS keys
              // are uppercase for every protocol, so the lookup must normalize case here.
              color: METHOD_COLORS[item.method?.toUpperCase()] || 'var(--color-muted-fallback)',
              backgroundColor: `${METHOD_COLORS[item.method?.toUpperCase()] || 'var(--color-muted-fallback)'}15`,
              // Provider names vary widely in length (GOOGLE vs AZURE-OPENAI) — give AI a wider
              // fixed floor so every chip lines up; other protocols' method labels are short and
              // uniform enough for the default floor.
              minWidth: protocol === 'ai' ? 84 : 38,
            }}
          >
            {item.method}
          </span>

          <span className="text-[12px] text-[var(--color-text-primary)] truncate flex-1 min-w-0" title={item.url}>
            {trimUrl(item.url)}
          </span>

          <IconButtonView
            icon={<MoreVerticalIcon size={12} style={{ color: 'var(--color-text-muted)' }} />}
            size="sm"
            tooltip="More Options"
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={(e) => { e.stopPropagation(); openHistoryContextMenu(e, item); }}
          />
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
                  ? (item.status === 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]')
                  : (item.status < 400 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]')
              }`}>
                {item.status}
              </span>
            ) : null}
            {item.response_time != null && item.response_time > 0 && (
              <span className="text-[10px] font-medium" style={{ color: getTimeColor(item.response_time) }}>{item.response_time}ms</span>
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
        <span className="flex-shrink-0" style={{ color: getProtocolAccent(protocol as any) }}>
          <ProtocolHeaderIcon protocol={protocol} />
        </span>
        <span>History</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--color-surface-border)]">
        <SearchInputView
          value={search}
          onChange={setSearch}
          placeholder="Search"
          height={30}
          prefix={<SearchIcon size={13} />}
          suffix={search.trim() ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              title="Clear search"
              style={{ border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 4, background: 'transparent', color: 'var(--color-text-muted)' }}
            >
              <span style={{ fontSize: 12, lineHeight: 1, fontWeight: 500 }}>✕</span>
            </button>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', padding: '1px 6px', borderRadius: 4, background: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)' }}>
              {history.length}
            </span>
          )}
        />
      </div>

      {/* Actions row */}
      {history.length > 0 && (
        <div className="flex items-center justify-end px-3 py-1.5 border-b border-[var(--color-surface-border)]">
          <IconButtonView
            icon={<MoreVerticalIcon size={14} style={{ color: 'var(--color-text-muted)' }} />}
            size="sm"
            tooltip="More Options"
            onClick={openHeaderMenu}
          />
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
                <div
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)] transition-colors"
                >
                  <ChevronRightIcon size={10} strokeWidth={2.5} className={`text-[var(--color-text-muted)] shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                  <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                    {group.label}
                  </span>
                  <span className="flex items-center gap-0.5 ml-auto">
                    <IconButtonView
                      icon={<ExpandAllIcon size={10} className="text-[var(--color-info)]" />}
                      size="xs"
                      tooltip="Expand all"
                      onClick={(e) => { e.stopPropagation(); expandGroupTree(group); }}
                    />
                    <IconButtonView
                      icon={<CollapseAllIcon size={10} className="text-[var(--color-warning)]" />}
                      size="xs"
                      tooltip="Collapse all"
                      onClick={(e) => { e.stopPropagation(); collapseGroupTree(group); }}
                    />
                    <IconButtonView
                      icon={<MoreVerticalIcon size={10} style={{ color: 'var(--color-text-muted)' }} />}
                      size="xs"
                      tooltip="More Options"
                      onClick={(e) => openGroupMenu(e, group)}
                    />
                    <span className="text-[10px] text-[var(--color-text-muted)] opacity-50">
                      {count}
                    </span>
                  </span>
                </div>

                {/* Group content */}
                <div className={`collapse-wrapper ${!isCollapsed ? 'expanded' : ''}`}>
                  <div className="collapse-inner">
                    <div>
                      {group.subGroups.map((sg) => {
                        // If sub-group has no label, render items directly
                        if (!sg.label) {
                          return (
                            <div key="flat" className="pl-2">
                              {sg.items.map(renderItem)}
                            </div>
                          );
                        }

                        // Sub-group with label
                        const subKey = `${group.label}::${sg.label}`;
                        const isSubCollapsed = collapsedSubGroups.has(subKey);

                        // 3-level nesting: year → month → date (subGroups has subGroups)
                        if (sg.subGroups && sg.subGroups.length > 0) {
                          return (
                            <div key={sg.label}>
                              <div
                                onClick={() => toggleSubGroup(subKey)}
                                className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text-primary)_2%,transparent)] transition-colors"
                              >
                                <ChevronRightIcon size={8} strokeWidth={2.5} className={`text-[var(--color-text-muted)] opacity-60 shrink-0 transition-transform ${isSubCollapsed ? '' : 'rotate-90'}`} />
                                <span className="text-[10px] font-medium text-[var(--color-text-muted)] opacity-80">
                                  {sg.label}
                                </span>
                                <span className="flex items-center gap-0.5 ml-auto">
                                  <IconButtonView
                                    icon={<ExpandAllIcon size={9} className="text-[var(--color-info)]" />}
                                    size="xs"
                                    tooltip="Expand all"
                                    onClick={(e) => { e.stopPropagation(); expandSubGroupTree(sg, subKey); }}
                                  />
                                  <IconButtonView
                                    icon={<CollapseAllIcon size={9} className="text-[var(--color-warning)]" />}
                                    size="xs"
                                    tooltip="Collapse all"
                                    onClick={(e) => { e.stopPropagation(); collapseSubGroupTree(sg, subKey); }}
                                  />
                                  <span className="text-[9px] text-[var(--color-text-muted)] opacity-40">
                                    {sg.subGroups.reduce((s, inner) => s + inner.items.length, 0)}
                                  </span>
                                </span>
                              </div>
                              <div className={`collapse-wrapper ${!isSubCollapsed ? 'expanded' : ''}`}>
                                <div className="collapse-inner">
                                  <div>
                                    {sg.subGroups.map((inner) => {
                                      const innerKey = `${subKey}::${inner.label}`;
                                      const isInnerCollapsed = collapsedSubGroups.has(innerKey);
                                      return (
                                        <div key={inner.label}>
                                          <div
                                            onClick={() => toggleSubGroup(innerKey)}
                                            className="w-full flex items-center gap-1.5 pl-10 pr-3 py-0.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text-primary)_2%,transparent)] transition-colors"
                                          >
                                            <ChevronRightIcon size={7} strokeWidth={2} className={`text-[var(--color-text-muted)] opacity-50 shrink-0 transition-transform ${isInnerCollapsed ? '' : 'rotate-90'}`} />
                                            <span className="text-[9px] text-[var(--color-text-muted)] opacity-70">
                                              {inner.label}
                                            </span>
                                            <span className="flex items-center gap-0.5 ml-auto">
                                              <IconButtonView
                                                icon={<ExpandAllIcon size={8} className="text-[var(--color-info)]" />}
                                                size="xs"
                                                tooltip="Expand all"
                                                onClick={(e) => { e.stopPropagation(); expandSubGroupTree(inner, innerKey); }}
                                              />
                                              <IconButtonView
                                                icon={<CollapseAllIcon size={8} className="text-[var(--color-warning)]" />}
                                                size="xs"
                                                tooltip="Collapse all"
                                                onClick={(e) => { e.stopPropagation(); collapseSubGroupTree(inner, innerKey); }}
                                              />
                                              <span className="text-[8px] text-[var(--color-text-muted)] opacity-35">
                                                {inner.items.length}
                                              </span>
                                            </span>
                                          </div>
                                          <div className={`collapse-wrapper ${!isInnerCollapsed ? 'expanded' : ''}`}>
                                            <div className="collapse-inner">
                                              <div className="pl-14">
                                                {inner.items.map(renderItem)}
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
                        }

                        // 2-level: normal sub-group (e.g., "May 31" under "May", or hour intervals under "Today")
                        return (
                          <div key={sg.label}>
                            <div
                              onClick={() => toggleSubGroup(subKey)}
                              className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text-primary)_2%,transparent)] transition-colors"
                            >
                              <ChevronRightIcon size={8} strokeWidth={2.5} className={`text-[var(--color-text-muted)] opacity-60 shrink-0 transition-transform ${isSubCollapsed ? '' : 'rotate-90'}`} />
                              <span className="text-[10px] font-medium text-[var(--color-text-muted)] opacity-80">
                                {sg.label}
                              </span>
                              <span className="flex items-center gap-0.5 ml-auto">
                                <IconButtonView
                                  icon={<ExpandAllIcon size={9} className="text-[var(--color-info)]" />}
                                  size="xs"
                                  tooltip="Expand all"
                                  onClick={(e) => { e.stopPropagation(); expandSubGroupTree(sg, subKey); }}
                                />
                                <IconButtonView
                                  icon={<CollapseAllIcon size={9} className="text-[var(--color-warning)]" />}
                                  size="xs"
                                  tooltip="Collapse all"
                                  onClick={(e) => { e.stopPropagation(); collapseSubGroupTree(sg, subKey); }}
                                />
                                <span className="text-[9px] text-[var(--color-text-muted)] opacity-40">
                                  {sg.items.length}
                                </span>
                              </span>
                            </div>
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
        <ContextMenuView
          open={true}
          anchorEl={null}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          items={contextMenu.items}
        />
      )}

      {/* Header more menu */}
      {headerMenu && (
        <ContextMenuView
          open={true}
          anchorEl={null}
          position={headerMenu.position}
          onClose={() => setHeaderMenu(null)}
          items={headerMenu.items}
        />
      )}

      {/* Per-group (Today / June / 2025 / ...) more menu */}
      {groupMenu && (
        <ContextMenuView
          open={true}
          anchorEl={null}
          position={groupMenu.position}
          onClose={() => setGroupMenu(null)}
          items={groupMenu.items}
        />
      )}

      {/* Bulk "Save to Collection" — save every request in a date group to one destination */}
      <SaveRequestModal
        open={!!bulkSaveItems}
        tab={null}
        bulkItems={bulkSaveItems ?? undefined}
        bulkProtocol={protocol}
        onClose={() => setBulkSaveItems(null)}
      />

      {/* Document Request modal */}
      {docGeneratorNode && (
        <AiDocGeneratorModal
          collectionNode={docGeneratorNode}
          onClose={() => setDocGeneratorNode(null)}
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
