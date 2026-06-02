import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { useEnvStore, GLOBAL_ENV_ID } from '../../store/env-store';
import { getProtocolAccent } from '../../colors';
import { MethodBadge, ConfirmDialog, StyledDropdown, type DropdownOption } from '../shared';
import { SettingsIcon, ServerIcon, LayersIcon, RenameIcon, CopyIcon, CloseCircleIcon, CloseSquareIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, ArrowToRightIcon, ArrowToLeftIcon, CloseAllIcon, SaveCheckIcon } from '../../icons';

interface ContextMenu {
  tabId: string;
  x: number;
  y: number;
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
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
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
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  const startRename = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    setRenamingTabId(tabId);
    setRenameValue(tab.name);
    closeContextMenu();
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

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => closeContextMenu();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // Global keyboard shortcuts for tab actions
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Read fresh state inside handler to avoid stale closures
      const store = useTabsStore.getState();
      const currentTabs = store.tabs;
      const currentActiveId = store.activeTabId;

      // Ctrl+W — Close active tab (if not pinned)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'w') {
        e.preventDefault();
        const tab = currentTabs.find(t => t.id === currentActiveId);
        if (tab && !tab.pinned) handleClose(tab.id);
      }
      // Ctrl+D — Duplicate active tab
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'd') {
        e.preventDefault();
        if (currentActiveId) store.duplicateTab(currentActiveId);
      }
      // Ctrl+Shift+W — Close other tabs
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'W') {
        e.preventDefault();
        if (currentActiveId) {
          const others = currentTabs.filter(t => t.id !== currentActiveId && !t.pinned);
          if (others.some(t => t.dirty)) {
            setConfirmCloseOthersId(currentActiveId);
          } else {
            store.closeOtherTabs(currentActiveId);
          }
        }
      }
      // Ctrl+Alt+R — Close to the Right
      if (e.ctrlKey && e.altKey && e.key === 'r') {
        e.preventDefault();
        if (currentActiveId) {
          const idx = currentTabs.findIndex(t => t.id === currentActiveId);
          const rightTabs = currentTabs.slice(idx + 1).filter(t => !t.pinned);
          if (rightTabs.some(t => t.dirty)) {
            setConfirmCloseRightId(currentActiveId);
          } else {
            store.closeTabsToRight(currentActiveId);
          }
        }
      }
      // Ctrl+Alt+L — Close to the Left
      if (e.ctrlKey && e.altKey && e.key === 'l') {
        e.preventDefault();
        if (currentActiveId) {
          const idx = currentTabs.findIndex(t => t.id === currentActiveId);
          const leftTabs = currentTabs.slice(0, idx).filter(t => !t.pinned);
          if (leftTabs.some(t => t.dirty)) {
            setConfirmCloseLeftId(currentActiveId);
          } else {
            store.closeTabsToLeft(currentActiveId);
          }
        }
      }
      // Ctrl+Alt+S — Close Saved
      if (e.ctrlKey && e.altKey && e.key === 's') {
        e.preventDefault();
        store.closeSavedTabs();
      }
      // Ctrl+Alt+A — Close All
      if (e.ctrlKey && e.altKey && e.key === 'a') {
        e.preventDefault();
        const closeable = currentTabs.filter(t => !t.pinned);
        if (closeable.some(t => t.dirty)) {
          setConfirmCloseAll(true);
        } else {
          store.closeAllTabs();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []); // Empty deps — handler reads fresh state via getState()

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

    {/* Right-click context menu */}
    {contextMenu && createPortal(
      <div
        className="fixed z-[99999] min-w-[200px] bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-lg shadow-xl py-1 animate-[fadeSlideIn_120ms_ease-out]"
        style={{ top: contextMenu.y, left: contextMenu.x }}
        onClick={(e) => e.stopPropagation()}
      >
        {(() => {
          const tab = tabs.find(t => t.id === contextMenu.tabId);
          const isRequest = tab?.type === 'request';
          const isPinned = tab?.pinned;
          const tabIdx = tabs.findIndex(t => t.id === contextMenu.tabId);
          const hasTabsToRight = tabIdx < tabs.length - 1;
          const hasTabsToLeft = tabIdx > 0;
          const hasMultipleTabs = tabs.length >= 2;
          const hasDirtyTabs = tabs.some(t => t.dirty && !t.pinned);
          return (
            <>
              {isRequest && (
                <ContextMenuItem
                  icon={<RenameIcon size={14} />}
                  iconColor="var(--color-ctx-rename)"
                  label="Rename"
                  shortcut="Ctrl+R"
                  onClick={() => startRename(contextMenu.tabId)}
                />
              )}
              <ContextMenuItem
                icon={<CopyIcon size={14} />}
                iconColor="var(--color-ctx-duplicate)"
                label="Duplicate"
                shortcut="Ctrl+D"
                onClick={() => { duplicateTab(contextMenu.tabId); closeContextMenu(); }}
              />
              {isRequest && (
                <ContextMenuItem
                  icon={isPinned ? <span className="text-[14px]">📍</span> : <span className="text-[14px]">📌</span>}
                  iconColor="var(--color-ctx-pin)"
                  label={isPinned ? 'Unpin' : 'Pin'}
                  shortcut={isPinned ? 'Ctrl+U' : 'Ctrl+P'}
                  onClick={() => { isPinned ? unpinTab(contextMenu.tabId) : pinTab(contextMenu.tabId); closeContextMenu(); }}
                />
              )}
              <div className="h-px bg-[var(--color-surface-border)] my-1" />
              {!isPinned && (
                <ContextMenuItem
                  icon={<CloseCircleIcon size={14} />}
                  iconColor="var(--color-ctx-close)"
                  label="Close"
                  shortcut="Ctrl+W"
                  onClick={() => { handleClose(contextMenu.tabId); closeContextMenu(); }}
                />
              )}
              {hasMultipleTabs && (
                <ContextMenuItem
                  icon={<CloseSquareIcon size={14} />}
                  iconColor="var(--color-ctx-close-batch)"
                  label="Close Others"
                  shortcut="Ctrl+Shift+W"
                  onClick={() => {
                    const others = tabs.filter(t => t.id !== contextMenu.tabId && !t.pinned);
                    if (others.some(t => t.dirty)) {
                      setConfirmCloseOthersId(contextMenu.tabId);
                    } else {
                      closeOtherTabs(contextMenu.tabId);
                    }
                    closeContextMenu();
                  }}
                />
              )}
              {hasTabsToRight && (
                <ContextMenuItem
                  icon={<ArrowToRightIcon size={14} />}
                  iconColor="var(--color-ctx-close-batch)"
                  label="Close to the Right"
                  shortcut="Ctrl+Alt+R"
                  onClick={() => {
                    const rightTabs = tabs.slice(tabIdx + 1).filter(t => !t.pinned);
                    if (rightTabs.some(t => t.dirty)) {
                      setConfirmCloseRightId(contextMenu.tabId);
                    } else {
                      closeTabsToRight(contextMenu.tabId);
                    }
                    closeContextMenu();
                  }}
                />
              )}
              {hasTabsToLeft && (
                <ContextMenuItem
                  icon={<ArrowToLeftIcon size={14} />}
                  iconColor="var(--color-ctx-close-batch)"
                  label="Close to the Left"
                  shortcut="Ctrl+Alt+L"
                  onClick={() => {
                    const leftTabs = tabs.slice(0, tabIdx).filter(t => !t.pinned);
                    if (leftTabs.some(t => t.dirty)) {
                      setConfirmCloseLeftId(contextMenu.tabId);
                    } else {
                      closeTabsToLeft(contextMenu.tabId);
                    }
                    closeContextMenu();
                  }}
                />
              )}
              {hasDirtyTabs && (
                <ContextMenuItem
                  icon={<SaveCheckIcon size={14} />}
                  iconColor="var(--color-ctx-close-saved)"
                  label="Close Saved"
                  shortcut="Ctrl+Alt+S"
                  onClick={() => { closeSavedTabs(); closeContextMenu(); }}
                />
              )}
              {hasMultipleTabs && (
                <ContextMenuItem
                  icon={<CloseAllIcon size={14} />}
                  iconColor="var(--color-ctx-close-all)"
                  label="Close All"
                  shortcut="Ctrl+Alt+A"
                  onClick={() => {
                    const closeable = tabs.filter(t => !t.pinned);
                    if (closeable.some(t => t.dirty)) {
                      setConfirmCloseAll(true);
                    } else {
                      closeAllTabs();
                    }
                    closeContextMenu();
                  }}
                />
              )}
            </>
          );
        })()}
      </div>,
      document.body
    )}
    </>
  );
}

function ContextMenuItem({ icon, iconColor, label, shortcut, onClick }: { icon: React.ReactNode; iconColor?: string; label: string; shortcut?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 w-full px-3 py-[6px] text-left text-[13px] text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)] cursor-pointer transition-colors"
      onClick={onClick}
    >
      <span className="flex-shrink-0" style={{ color: iconColor || 'var(--color-text-muted)' }}>{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-panel)] rounded px-1.5 py-0.5 font-mono">{shortcut}</span>}
    </button>
  );
}
