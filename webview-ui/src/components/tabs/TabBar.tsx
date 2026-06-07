import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import type { Protocol } from '../../store/tabs-store';
import { useEnvStore, GLOBAL_ENV_ID } from '../../store/env-store';
import { getProtocolAccent } from '../../colors';
import { MethodBadge, ConfirmDialog, StyledDropdown, ContextMenu, type ContextMenuItem, type ContextMenuSubItem, type DropdownOption } from '../shared';
import { SettingsIcon, ServerIcon, LayersIcon, RenameIcon, CopyIcon, CloseCircleIcon, CloseSquareIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, ArrowToRightIcon, ArrowToLeftIcon, CloseAllIcon, SaveCheckIcon, GeneralAssistantIcon, FilterIcon } from '../../icons';

interface TabContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

interface TabBarProps {
  requestAccentColor: string;
  onEnvironmentsClick?: () => void;
}

// ─── Protocol display config for submenus ────────────────────────────────────

const PROTOCOL_SUBMENU_META: { id: Protocol; label: string; color: string; badge: string }[] = [
  { id: 'rest',      label: 'REST',      color: 'var(--color-method-get)',       badge: 'REST'  },
  { id: 'graphql',   label: 'GraphQL',   color: 'var(--color-protocol-graphql)', badge: 'GQL'   },
  { id: 'websocket', label: 'WebSocket', color: 'var(--color-protocol-websocket)', badge: 'WS'  },
  { id: 'grpc',      label: 'gRPC',      color: 'var(--color-protocol-grpc)',    badge: 'gRPC'  },
  { id: 'soap',      label: 'SOAP',      color: 'var(--color-protocol-soap)',    badge: 'SOAP'  },
  { id: 'ai',        label: 'AI',        color: 'var(--color-protocol-ai)',      badge: 'AI'    },
  { id: 'mcp',       label: 'MCP',       color: 'var(--color-protocol-mcp)',     badge: 'MCP'   },
];

function ProtocolBadgeIcon({ badge, color }: { badge: string; color: string }) {
  return (
    <span className="inline-block font-mono font-bold text-[10px] leading-none" style={{ color }}>
      {badge}
    </span>
  );
}

// ─── Filter Indicator Bar ─────────────────────────────────────────────────────

function FilterBar({ filter, onClear, onClearOne }: { filter: Set<Protocol>; onClear: () => void; onClearOne: (p: Protocol) => void }) {
  if (filter.size === 0) return null;
  const active = PROTOCOL_SUBMENU_META.filter(p => filter.has(p.id));
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-[3px] border-b shrink-0 text-[10.5px] flex-wrap"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-primary) 5%, transparent)',
        borderColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
        color: 'var(--color-text-muted)',
      }}
    >
      <FilterIcon size={10} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
      <span className="mr-0.5">Filter:</span>
      {active.map(p => (
        <span
          key={p.id}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{
            backgroundColor: `color-mix(in srgb, ${p.color} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${p.color} 30%, transparent)`,
            color: p.color,
          }}
        >
          <span className="font-mono">{p.badge}</span>
          <span>{p.label}</span>
          <button
            type="button"
            onClick={() => onClearOne(p.id)}
            className="flex items-center justify-center w-[13px] h-[13px] rounded-full cursor-pointer hover:opacity-70 transition-opacity ml-0.5"
            style={{ backgroundColor: `color-mix(in srgb, ${p.color} 25%, transparent)` }}
            title={`Remove ${p.label} filter`}
          >
            <span style={{ fontSize: 9, lineHeight: 1, color: p.color }}>✕</span>
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-[9.5px] px-1.5 py-0.5 rounded cursor-pointer transition-colors hover:opacity-80 flex-shrink-0"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
          color: 'var(--color-primary)',
          border: '1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)',
        }}
      >
        Clear All
      </button>
    </div>
  );
}

// ─── TabBar ───────────────────────────────────────────────────────────────────

export function TabBar({ requestAccentColor, onEnvironmentsClick }: TabBarProps) {
  const { tabs: allTabs, activeTabId, activeProtocol, setActiveTab, closeTab, addTab, updateTab, duplicateTab, closeOtherTabs, closeAllTabs, closeTabsToRight, closeTabsToLeft, closeSavedTabs, pinTab, unpinTab, reorderTabs } = useTabsStore();
  const { environments, setActiveEnvironment, requestEditEnv } = useEnvStore();

  // Tab protocol filter — Set of protocols to show (empty = show all)
  const [tabProtocolFilter, setTabProtocolFilter] = useState<Set<Protocol>>(new Set());

  // Visible tabs: always show non-request tabs (settings, mock-server, daakia-ai)
  const tabs = tabProtocolFilter.size === 0
    ? allTabs
    : allTabs.filter(t => t.type !== 'request' || tabProtocolFilter.has(t.protocol));

  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [confirmCloseOthersId, setConfirmCloseOthersId] = useState<string | null>(null);
  const [confirmCloseRightId, setConfirmCloseRightId] = useState<string | null>(null);
  const [confirmCloseLeftId, setConfirmCloseLeftId] = useState<string | null>(null);
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);
  const [confirmCloseProtocol, setConfirmCloseProtocol] = useState<Protocol | null>(null);
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Check scroll overflow
  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll);
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [checkScroll, tabs.length]);

  const scrollTabs = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -150 : 150, behavior: 'smooth' });
  };
  const customEnvs = environments.filter(e => e.id !== GLOBAL_ENV_ID);
  const envOptions: DropdownOption[] = customEnvs.map(e => ({ value: e.id, label: e.name }));

  const handleClose = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.dirty) {
      setConfirmCloseId(tabId);
    } else {
      closeTab(tabId);
    }
  };

  // Build protocol submenu items for Filter
  const buildFilterSubmenu = (): ContextMenuSubItem[] => {
    // Only show protocols that have at least one request tab
    const presentProtocols = new Set(allTabs.filter(t => t.type === 'request').map(t => t.protocol));
    const protocolItems: ContextMenuSubItem[] = PROTOCOL_SUBMENU_META
      .filter(p => presentProtocols.has(p.id))
      .map(p => ({
        id: p.id,
        label: p.label,
        icon: <ProtocolBadgeIcon badge={p.badge} color={p.color} />,
        iconColor: p.color,
        checked: tabProtocolFilter.has(p.id),
      }));
    return protocolItems;
  };

  // Build protocol submenu items for Close Protocol
  const buildCloseProtocolSubmenu = (): ContextMenuSubItem[] => {
    const presentProtocols = new Set(allTabs.filter(t => t.type === 'request').map(t => t.protocol));
    return PROTOCOL_SUBMENU_META
      .filter(p => presentProtocols.has(p.id))
      .map(p => ({
        id: p.id,
        label: p.label,
        icon: <ProtocolBadgeIcon badge={p.badge} color={p.color} />,
        iconColor: p.color,
      }));
  };

  // Derive context menu items fresh on every render — this is the KEY fix for stale submenu state.
  // By never storing items in state, tabProtocolFilter changes immediately reflect in checked marks.
  const contextMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const { tabId } = contextMenu;
    const tab = tabs.find(t => t.id === tabId);
    const tabIdx = tabs.findIndex(t => t.id === tabId);
    const isRequest = tab?.type === 'request';
    const isPinned = tab?.pinned;
    const hasTabsToRight = tabIdx < tabs.length - 1;
    const hasTabsToLeft = tabIdx > 0;
    const hasMultipleTabs = tabs.length >= 2;
    const hasDirtyTabs = tabs.some(t => t.dirty && !t.pinned);
    const presentProtocols = allTabs.filter(t => t.type === 'request').map(t => t.protocol);
    const hasRequestTabs = presentProtocols.length > 0;
    const uniqueProtocols = [...new Set(presentProtocols)];

    const items: ContextMenuItem[] = [];
    if (isRequest) items.push({ id: 'rename', label: 'Rename', shortcut: 'R', icon: <RenameIcon size={13} />, iconColor: 'var(--color-ctx-rename)' });
    items.push({ id: 'duplicate', label: 'Duplicate', shortcut: 'D', icon: <CopyIcon size={13} />, iconColor: 'var(--color-ctx-duplicate)' });
    if (isRequest) items.push({ id: isPinned ? 'unpin' : 'pin', label: isPinned ? 'Unpin' : 'Pin', shortcut: isPinned ? 'U' : 'P', icon: <span className="text-[13px]">{isPinned ? '📍' : '📌'}</span>, iconColor: 'var(--color-ctx-pin)' });

    if (hasRequestTabs && uniqueProtocols.length >= 1) {
      items.push({ id: 'sep-filter', label: '', separator: true });
      items.push({
        id: 'filter',
        label: tabProtocolFilter.size > 0 ? `Filter (${tabProtocolFilter.size} active)` : 'Filter',
        icon: <FilterIcon size={13} />,
        iconColor: tabProtocolFilter.size > 0 ? 'var(--color-primary)' : 'var(--color-ctx-close-batch)',
        submenu: buildFilterSubmenu(),
      });
      if (tabProtocolFilter.size > 0) {
        items.push({
          id: 'clear-filter',
          label: 'Clear Filter',
          icon: <span className="text-[11px]">✕</span>,
          iconColor: 'var(--color-text-muted)',
        });
      }
      items.push({
        id: 'close-protocol',
        label: 'Close Protocol',
        icon: <CloseSquareIcon size={13} />,
        iconColor: 'var(--color-ctx-close-batch)',
        submenu: buildCloseProtocolSubmenu(),
      });
    }

    items.push({ id: 'sep1', label: '', separator: true });
    if (!isPinned) items.push({ id: 'close', label: 'Close', shortcut: 'W', icon: <CloseCircleIcon size={13} />, iconColor: 'var(--color-ctx-close)' });
    if (hasMultipleTabs) items.push({ id: 'close-others', label: 'Close Others', shortcut: 'O', icon: <CloseSquareIcon size={13} />, iconColor: 'var(--color-ctx-close-batch)' });
    if (hasTabsToRight) items.push({ id: 'close-right', label: 'Close to the Right', icon: <ArrowToRightIcon size={13} />, iconColor: 'var(--color-ctx-close-batch)' });
    if (hasTabsToLeft) items.push({ id: 'close-left', label: 'Close to the Left', icon: <ArrowToLeftIcon size={13} />, iconColor: 'var(--color-ctx-close-batch)' });
    if (hasDirtyTabs) items.push({ id: 'close-saved', label: 'Close Saved', shortcut: 'S', icon: <SaveCheckIcon size={13} />, iconColor: 'var(--color-ctx-close-saved)' });
    if (hasMultipleTabs) items.push({ id: 'close-all', label: 'Close All', shortcut: 'A', icon: <CloseAllIcon size={13} />, iconColor: 'var(--color-ctx-close-all)', danger: true });
    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu?.tabId, contextMenu, tabProtocolFilter, tabs, allTabs]);

  // Context menu actions
  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    // Just record position + tabId — items are derived fresh in contextMenuItems useMemo
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const handleContextMenuSelect = (actionId: string, subId?: string) => {
    if (!contextMenu) return;
    const { tabId } = contextMenu;
    const tabIdx = tabs.findIndex(t => t.id === tabId);

    switch (actionId) {
      case 'rename': startRename(tabId); setContextMenu(null); break;
      case 'duplicate': duplicateTab(tabId); setContextMenu(null); break;
      case 'pin': pinTab(tabId); setContextMenu(null); break;
      case 'unpin': unpinTab(tabId); setContextMenu(null); break;
      case 'close': handleClose(tabId); setContextMenu(null); break;
      case 'close-others': {
        const others = tabs.filter(t => t.id !== tabId && !t.pinned);
        if (others.some(t => t.dirty)) setConfirmCloseOthersId(tabId);
        else closeOtherTabs(tabId);
        setContextMenu(null);
        break;
      }
      case 'close-right': {
        const rightTabs = tabs.slice(tabIdx + 1).filter(t => !t.pinned);
        if (rightTabs.some(t => t.dirty)) setConfirmCloseRightId(tabId);
        else closeTabsToRight(tabId);
        setContextMenu(null);
        break;
      }
      case 'close-left': {
        const leftTabs = tabs.slice(0, tabIdx).filter(t => !t.pinned);
        if (leftTabs.some(t => t.dirty)) setConfirmCloseLeftId(tabId);
        else closeTabsToLeft(tabId);
        setContextMenu(null);
        break;
      }
      case 'close-saved': closeSavedTabs(); setContextMenu(null); break;
      case 'close-all': {
        const closeable = tabs.filter(t => !t.pinned);
        if (closeable.some(t => t.dirty)) setConfirmCloseAll(true);
        else closeAllTabs();
        setContextMenu(null);
        break;
      }

      // ─── Filter (multiselect — keep context menu open) ────────────────
      case 'filter': {
        if (subId) {
          const proto = subId as Protocol;
          setTabProtocolFilter(prev => {
            const next = new Set(prev);
            if (next.has(proto)) next.delete(proto);
            else next.add(proto);
            return next;
          });
          // Keep context menu open for multiselect — re-renders with updated checked states
        }
        break;
      }
      case 'clear-filter': {
        setTabProtocolFilter(new Set());
        setContextMenu(null);
        break;
      }

      // ─── Close Protocol ───────────────────────────────────────────────
      case 'close-protocol': {
        if (subId) {
          const proto = subId as Protocol;
          const protoTabs = allTabs.filter(t => t.type === 'request' && t.protocol === proto && !t.pinned);
          // Warn if any matching tabs are dirty (unsaved)
          if (protoTabs.some(t => t.dirty)) {
            setConfirmCloseProtocol(proto);
          } else {
            protoTabs.forEach(t => closeTab(t.id));
          }
        }
        setContextMenu(null);
        break;
      }
    }
  };

  const startRename = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    setRenamingTabId(tabId);
    setRenameValue(tab.name);
  };

  const finishRename = () => {
    if (renamingTabId && renameValue.trim()) {
      updateTab(renamingTabId, { name: renameValue.trim() });
    }
    setRenamingTabId(null);
  };

  useEffect(() => {
    if (renamingTabId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingTabId]);

  // Close context menu on outside click — handled by shared ContextMenu component

  // Global keyboard shortcuts for tab navigation (non-conflicting with VS Code)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only handle if no context menu is open (context menu handles its own keys)
      if (contextMenu) return;
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [contextMenu]);

  // Drag and drop
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== toIdx) {
      // Convert filtered indices to full store indices
      const fromTab = tabs[dragIdx];
      const toTab = tabs[toIdx];
      if (fromTab && toTab) {
        const fullFromIdx = allTabs.findIndex(t => t.id === fromTab.id);
        const fullToIdx = allTabs.findIndex(t => t.id === toTab.id);
        if (fullFromIdx !== -1 && fullToIdx !== -1) {
          reorderTabs(fullFromIdx, fullToIdx);
        }
      }
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  return (
    <>
    {/* Active filter bar — shown below TabBar when protocols are filtered */}
    <FilterBar
      filter={tabProtocolFilter}
      onClear={() => setTabProtocolFilter(new Set())}
      onClearOne={p => setTabProtocolFilter(prev => { const next = new Set(prev); next.delete(p); return next; })}
    />

    <div className="flex items-center h-[38px] flex-shrink-0 bg-[var(--color-panel)] border-b border-[var(--color-panel-border)]">
      {/* Scroll left arrow */}
      {canScrollLeft && (
        <button
          type="button"
          className="flex items-center justify-center w-6 h-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer flex-shrink-0 transition-colors"
          onClick={() => scrollTabs('left')}
          title="Scroll tabs left"
        >
          <ChevronLeftIcon size={12} />
        </button>
      )}

      {/* Tabs */}
      <div ref={scrollRef} className="flex items-center h-full flex-1 min-w-0 overflow-x-auto scrollbar-none">
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isSettings = tab.type === 'settings';
          const isMockServer = tab.type === 'mock-server';
          const isDaakiaAi = tab.type === 'daakia-ai';
          const tabAccent = isSettings ? 'var(--color-settings)' : isMockServer ? 'var(--color-mock-server)' : isDaakiaAi ? 'var(--color-protocol-ai)' : (tab.protocol ? getProtocolAccent(tab.protocol) : requestAccentColor);
          const isDragOver = dragOverIdx === idx && dragIdx !== idx;
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              data-context-menu="tab"
              style={isActive ? { backgroundColor: `color-mix(in srgb, ${tabAccent} 2%, transparent)` } : undefined}
              className={`group flex items-center gap-2 h-full px-3 border-r border-[var(--color-panel-border)] cursor-pointer select-none transition-colors relative ${
                renamingTabId === tab.id
                  ? 'min-w-[220px] max-w-[320px] flex-shrink-0'
                  : 'max-w-[200px] min-w-[80px]'
              } ${
                isActive
                  ? ''
                  : 'bg-[var(--color-panel)] hover:bg-[var(--color-surface-hover)]'
              } ${isDragOver ? 'border-l-2 border-l-[var(--color-primary)]' : ''} ${dragIdx === idx ? 'opacity-50' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {/* Active indicator line at top */}
              {isActive && (
                <div
                  className="absolute top-0 left-0 right-0 h-[2px]"
                  style={{ backgroundColor: tabAccent }}
                />
              )}
              {isSettings ? (
                <SettingsIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-settings)' }} />
              ) : isMockServer ? (
                <ServerIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-mock-server)' }} />
              ) : isDaakiaAi ? (
                <GeneralAssistantIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-protocol-ai)' }} />
              ) : tab.protocol === 'graphql' ? (
                <span className="inline-block font-mono font-bold text-[10px] leading-none text-[var(--color-protocol-graphql)] flex-shrink-0">GQL</span>
              ) : tab.protocol === 'websocket' ? (
                (() => {
                  const rtProto = tab.authData?.['rt_protocol'] || 'websocket';
                  const badgeMap: Record<string, { label: string; color: string }> = {
                    websocket: { label: 'WS', color: 'var(--color-protocol-websocket)' },
                    sse: { label: 'SSE', color: 'var(--color-protocol-sse)' },
                    socketio: { label: 'SIO', color: 'var(--color-protocol-socketio)' },
                    mqtt: { label: 'MQTT', color: 'var(--color-protocol-mqtt)' },
                  };
                  const b = badgeMap[rtProto] || badgeMap.websocket;
                  return <span className="inline-block font-mono font-bold text-[10px] leading-none flex-shrink-0" style={{ color: b.color }}>{b.label}</span>;
                })()
              ) : tab.protocol === 'grpc' ? (
                <span className="inline-block font-mono font-bold text-[10px] leading-none text-[var(--color-protocol-grpc)] flex-shrink-0">gRPC</span>
              ) : tab.protocol === 'soap' ? (
                <span className="inline-block font-mono font-bold text-[10px] leading-none text-[var(--color-protocol-soap)] flex-shrink-0">SOAP</span>
              ) : tab.protocol === 'ai' ? (
                <span className="inline-block font-mono font-bold text-[10px] leading-none text-[var(--color-protocol-ai)] flex-shrink-0">AI</span>
              ) : tab.protocol === 'mcp' ? (
                <span className="inline-block font-mono font-bold text-[10px] leading-none text-[var(--color-protocol-mcp)] flex-shrink-0">MCP</span>
              ) : (
                <MethodBadge method={tab.method} compact />
              )}
              <span className="flex-1 truncate-text text-[12px] text-[var(--color-text-primary)]">
                {renamingTabId === tab.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={finishRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') setRenamingTabId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-[var(--color-input-bg)] border border-[var(--color-primary)] rounded px-1 text-[12px] text-[var(--color-text-primary)] outline-none"
                  />
                ) : (
                  isSettings ? 'Settings' : isMockServer ? 'Mock Server' : (tab.name || tab.url || 'Untitled')
                )}
              </span>
              {!isSettings && !isMockServer && !isDaakiaAi && tab.dirty && !tab.pinned && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tab.protocol === 'websocket' ? (() => { const rt = tab.authData?.['rt_protocol'] || 'websocket'; return rt === 'sse' ? 'var(--color-protocol-sse)' : rt === 'socketio' ? 'var(--color-protocol-socketio)' : rt === 'mqtt' ? 'var(--color-protocol-mqtt)' : 'var(--color-protocol-websocket)'; })() : tabAccent }}
                />
              )}
              {tab.pinned ? (
                <span className="flex-shrink-0 text-[11px]">📌</span>
              ) : (
                <button
                  type="button"
                  className={`flex items-center justify-center w-[18px] h-[18px] rounded cursor-pointer transition-all self-center mt-px ${
                    isSettings || isMockServer
                      ? 'text-[var(--color-error)] hover:bg-[var(--color-icon-hover-bg)]'
                      : 'opacity-0 group-hover:opacity-100 text-[var(--color-error)] hover:bg-[var(--color-icon-hover-bg)]'
                  }`}
                  onClick={(e) => { e.stopPropagation(); handleClose(tab.id); }}
                  title="Close tab"
                >
                  <CloseIcon size={18} />
                </button>
              )}
            </div>
          );
        })}

        {/* Add tab button — right after tabs */}
        <button
          type="button"
          className="flex items-center justify-center w-9 h-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] cursor-pointer flex-shrink-0 transition-colors"
          style={{ color: requestAccentColor }}
          onClick={() => addTab()}
          title="New Tab"
        >
          <PlusIcon size={16} />
        </button>
      </div>

      {/* Scroll right arrow */}
      {canScrollRight && (
        <button
          type="button"
          className="flex items-center justify-center w-6 h-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer flex-shrink-0 transition-colors"
          onClick={() => scrollTabs('right')}
          title="Scroll tabs right"
        >
          <ChevronRightIcon size={12} />
        </button>
      )}

      {/* Per-tab environment selector — far right */}
      {activeTab && activeTab.type === 'request' && (
        <div className="flex items-center gap-2 h-full px-3 py-1 border-l border-[var(--color-panel-border)] flex-shrink-0 z-10">
          <button type="button" onClick={() => {
            const envId = activeTab?.envId || useEnvStore.getState().activeEnvId || GLOBAL_ENV_ID;
            requestEditEnv(envId);
            onEnvironmentsClick?.();
          }} className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity" title="Open Environments">
            <LayersIcon size={14} style={{ color: 'var(--color-sidebar-environments)' }} />
          </button>
          {customEnvs.length === 0 ? (
            <span className="text-[12px] text-[var(--color-text-muted)]">No Environment</span>
          ) : (
            <StyledDropdown
              options={envOptions}
              value={(activeTab.envId && activeTab.envId !== GLOBAL_ENV_ID) ? activeTab.envId : envOptions[0]?.value || ''}
              onChange={(v) => {
                updateTab(activeTab.id, { envId: v });
                setActiveEnvironment(v);
              }}
              size="sm"
            />
          )}
        </div>
      )}
    </div>

    {/* Confirm close dirty tab */}
    {confirmCloseId && (
      <ConfirmDialog
        title="Unsaved Changes"
        message="This tab has unsaved changes. Close it anyway?"
        confirmLabel="Discard & Close"
        danger
        onConfirm={() => { closeTab(confirmCloseId); setConfirmCloseId(null); }}
        onCancel={() => setConfirmCloseId(null)}
      />
    )}

    {/* Confirm close other dirty tabs */}
    {confirmCloseOthersId && (
      <ConfirmDialog
        title="Unsaved Changes"
        message="Some tabs have unsaved changes. Close them anyway?"
        confirmLabel="Discard & Close All"
        danger
        onConfirm={() => { closeOtherTabs(confirmCloseOthersId); setConfirmCloseOthersId(null); }}
        onCancel={() => setConfirmCloseOthersId(null)}
      />
    )}

    {/* Confirm close tabs to the right */}
    {confirmCloseRightId && (
      <ConfirmDialog
        title="Unsaved Changes"
        message="Some tabs to the right have unsaved changes. Close them anyway?"
        confirmLabel="Discard & Close"
        danger
        onConfirm={() => { closeTabsToRight(confirmCloseRightId); setConfirmCloseRightId(null); }}
        onCancel={() => setConfirmCloseRightId(null)}
      />
    )}

    {/* Confirm close tabs to the left */}
    {confirmCloseLeftId && (
      <ConfirmDialog
        title="Unsaved Changes"
        message="Some tabs to the left have unsaved changes. Close them anyway?"
        confirmLabel="Discard & Close"
        danger
        onConfirm={() => { closeTabsToLeft(confirmCloseLeftId); setConfirmCloseLeftId(null); }}
        onCancel={() => setConfirmCloseLeftId(null)}
      />
    )}

    {/* Confirm close all tabs */}
    {confirmCloseAll && (
      <ConfirmDialog
        title="Unsaved Changes"
        message="Some tabs have unsaved changes. Close all anyway?"
        confirmLabel="Discard & Close All"
        danger
        onConfirm={() => { closeAllTabs(); setConfirmCloseAll(false); }}
        onCancel={() => setConfirmCloseAll(false)}
      />
    )}

    {/* Confirm close all tabs of a protocol */}
    {confirmCloseProtocol && (
      <ConfirmDialog
        title="Unsaved Changes"
        message={`Some ${confirmCloseProtocol.toUpperCase()} tabs have unsaved changes. Close all ${confirmCloseProtocol.toUpperCase()} tabs anyway?`}
        confirmLabel={`Discard & Close ${confirmCloseProtocol.toUpperCase()}`}
        danger
        onConfirm={() => {
          const protoTabs = allTabs.filter(t => t.type === 'request' && t.protocol === confirmCloseProtocol && !t.pinned);
          protoTabs.forEach(t => closeTab(t.id));
          setConfirmCloseProtocol(null);
        }}
        onCancel={() => setConfirmCloseProtocol(null)}
      />
    )}

    {/* Right-click context menu — shared ContextMenu component with submenu support */}
    {contextMenu && (
      <ContextMenu
        items={contextMenuItems}
        position={{ x: contextMenu.x, y: contextMenu.y }}
        onSelect={handleContextMenuSelect}
        onClose={() => setContextMenu(null)}
      />
    )}
    </>
  );
}
