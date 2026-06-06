import { useState, useRef, useEffect, useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useEnvStore, GLOBAL_ENV_ID } from '../../store/env-store';
import { getProtocolAccent } from '../../colors';
import { MethodBadge, ConfirmDialog, StyledDropdown, ContextMenu, type ContextMenuItem, type DropdownOption } from '../shared';
import { SettingsIcon, ServerIcon, LayersIcon, RenameIcon, CopyIcon, CloseCircleIcon, CloseSquareIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, ArrowToRightIcon, ArrowToLeftIcon, CloseAllIcon, SaveCheckIcon } from '../../icons';

interface TabContextMenuState {
  tabId: string;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface TabBarProps {
  requestAccentColor: string;
  onEnvironmentsClick?: () => void;
}

export function TabBar({ requestAccentColor, onEnvironmentsClick }: TabBarProps) {
  const { tabs: allTabs, activeTabId, activeProtocol, setActiveTab, closeTab, addTab, updateTab, duplicateTab, closeOtherTabs, closeAllTabs, closeTabsToRight, closeTabsToLeft, closeSavedTabs, pinTab, unpinTab, reorderTabs } = useTabsStore();
  const { environments, setActiveEnvironment, requestEditEnv } = useEnvStore();
  // Show ALL tabs — protocol mixing is allowed (like Settings/MockServer already are)
  const tabs = allTabs;
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [confirmCloseOthersId, setConfirmCloseOthersId] = useState<string | null>(null);
  const [confirmCloseRightId, setConfirmCloseRightId] = useState<string | null>(null);
  const [confirmCloseLeftId, setConfirmCloseLeftId] = useState<string | null>(null);
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);
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

  // Context menu actions
  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    const tab = tabs.find(t => t.id === tabId);
    const tabIdx = tabs.findIndex(t => t.id === tabId);
    const isRequest = tab?.type === 'request';
    const isPinned = tab?.pinned;
    const hasTabsToRight = tabIdx < tabs.length - 1;
    const hasTabsToLeft = tabIdx > 0;
    const hasMultipleTabs = tabs.length >= 2;
    const hasDirtyTabs = tabs.some(t => t.dirty && !t.pinned);
    const items: ContextMenuItem[] = [];
    if (isRequest) items.push({ id: 'rename', label: 'Rename', shortcut: 'R', icon: <RenameIcon size={13} />, iconColor: 'var(--color-ctx-rename)' });
    items.push({ id: 'duplicate', label: 'Duplicate', shortcut: 'D', icon: <CopyIcon size={13} />, iconColor: 'var(--color-ctx-duplicate)' });
    if (isRequest) items.push({ id: isPinned ? 'unpin' : 'pin', label: isPinned ? 'Unpin' : 'Pin', shortcut: isPinned ? 'U' : 'P', icon: <span className="text-[13px]">{isPinned ? '📍' : '📌'}</span>, iconColor: 'var(--color-ctx-pin)' });
    items.push({ id: 'sep1', label: '', separator: true });
    if (!isPinned) items.push({ id: 'close', label: 'Close', shortcut: 'W', icon: <CloseCircleIcon size={13} />, iconColor: 'var(--color-ctx-close)' });
    if (hasMultipleTabs) items.push({ id: 'close-others', label: 'Close Others', shortcut: 'O', icon: <CloseSquareIcon size={13} />, iconColor: 'var(--color-ctx-close-batch)' });
    if (hasTabsToRight) items.push({ id: 'close-right', label: 'Close to the Right', icon: <ArrowToRightIcon size={13} />, iconColor: 'var(--color-ctx-close-batch)' });
    if (hasTabsToLeft) items.push({ id: 'close-left', label: 'Close to the Left', icon: <ArrowToLeftIcon size={13} />, iconColor: 'var(--color-ctx-close-batch)' });
    if (hasDirtyTabs) items.push({ id: 'close-saved', label: 'Close Saved', shortcut: 'S', icon: <SaveCheckIcon size={13} />, iconColor: 'var(--color-ctx-close-saved)' });
    if (hasMultipleTabs) items.push({ id: 'close-all', label: 'Close All', shortcut: 'A', icon: <CloseAllIcon size={13} />, iconColor: 'var(--color-ctx-close-all)', danger: true });
    setContextMenu({ tabId, x: e.clientX, y: e.clientY, items });
  };

  const handleContextMenuSelect = (actionId: string) => {
    if (!contextMenu) return;
    const { tabId } = contextMenu;
    const tabIdx = tabs.findIndex(t => t.id === tabId);
    switch (actionId) {
      case 'rename': startRename(tabId); break;
      case 'duplicate': duplicateTab(tabId); break;
      case 'pin': pinTab(tabId); break;
      case 'unpin': unpinTab(tabId); break;
      case 'close': handleClose(tabId); break;
      case 'close-others': {
        const others = tabs.filter(t => t.id !== tabId && !t.pinned);
        if (others.some(t => t.dirty)) setConfirmCloseOthersId(tabId);
        else closeOtherTabs(tabId);
        break;
      }
      case 'close-right': {
        const rightTabs = tabs.slice(tabIdx + 1).filter(t => !t.pinned);
        if (rightTabs.some(t => t.dirty)) setConfirmCloseRightId(tabId);
        else closeTabsToRight(tabId);
        break;
      }
      case 'close-left': {
        const leftTabs = tabs.slice(0, tabIdx).filter(t => !t.pinned);
        if (leftTabs.some(t => t.dirty)) setConfirmCloseLeftId(tabId);
        else closeTabsToLeft(tabId);
        break;
      }
      case 'close-saved': closeSavedTabs(); break;
      case 'close-all': {
        const closeable = tabs.filter(t => !t.pinned);
        if (closeable.some(t => t.dirty)) setConfirmCloseAll(true);
        else closeAllTabs();
        break;
      }
    }
    setContextMenu(null);
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
          const tabAccent = isSettings ? 'var(--color-settings)' : isMockServer ? 'var(--color-mock-server)' : (tab.protocol ? getProtocolAccent(tab.protocol) : requestAccentColor);
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
              {!isSettings && !isMockServer && tab.dirty && !tab.pinned && (
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

    {/* Right-click context menu — shared ContextMenu component with single-letter shortcuts */}
    {contextMenu && (
      <ContextMenu
        items={contextMenu.items}
        position={{ x: contextMenu.x, y: contextMenu.y }}
        onSelect={handleContextMenuSelect}
        onClose={() => setContextMenu(null)}
      />
    )}
    </>
  );
}
