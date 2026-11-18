import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import type { Protocol, RequestTab } from '../../store/tabs-store';
import { stripPieces, type TabGroup, type GroupBy } from '../../services/tabs/tab-groups';
import { newTabLikeActive } from '../../services/keyboard/new-tab-like-active';
import { collectionName } from '../../services/tabs/collection-name';
import { TabGroupChip } from './TabGroupChip';
import { AllTabsMenu, type ListedTab } from './AllTabsMenu';
import { TabHoverCard } from './TabHoverCard';
import './tab-strip.css';
import { useEnvStore, GLOBAL_ENV_ID } from '../../store/env-store';
import { selectedEnvId } from './env-selector';
import { getProtocolAccent } from '../../colors';
import { COLLECTION_PROTOCOL_LABELS } from '../../services/collections';
import { MethodBadge, ConfirmDialog, ContextMenu, type ContextMenuItem, type ContextMenuSubItem } from '../shared';
import { SettingsIcon, ServerIcon, LayersIcon, RenameIcon, CopyIcon, CloseCircleIcon, CloseSquareIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, ArrowToRightIcon, ArrowToLeftIcon, CloseAllIcon, SaveCheckIcon, DaakiaMarkIcon, FilterIcon, BookOpenIcon, Dk8sIcon, SearchIcon, IssueOpenedIcon, StethoscopeIcon, LayoutGridIcon, PinIcon, UnpinIcon, ClockIcon, ScratchpadIcon, ChevronDownIcon, PlusSquareIcon, RefreshIcon } from '../../icons';
import { IconButtonView, StateMachineIcon, SelectInputView, type SelectOption } from '@salilvnair/dui';
import { logUiEvent } from '../../store/ui-audit-store';
import { useScratchpadStore, SCRATCHPAD_TYPES, SCRATCHPAD_TYPE_ORDER, type ScratchpadType } from '../../store/scratchpad-store';

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
  const { tabs: allTabs, activeTabId, activeProtocol, setActiveTab, closeTab, addTab, updateTab, duplicateTab, closeOtherTabs, closeAllTabs, closeTabsToRight, closeTabsToLeft, closeSavedTabs, pinTab, unpinTab } = useTabsStore();
  const tabGroups = useTabsStore(s => s.tabGroups);
  const closedTabs = useTabsStore(s => s.closedTabs);
  const recentTabIds = useTabsStore(s => s.recentTabIds);
  const { createTabGroup, moveTabToGroup, renameTabGroup, recolorTabGroup, toggleTabGroup, ungroupTabGroup, closeTabGroup,
    groupTabsBy, ungroupAllTabs, moveTabGroup, dropTab, reopenClosedTab } = useTabsStore.getState();
  const { environments, activeEnvId, setActiveEnvironment, requestEditEnv } = useEnvStore();

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
  /* The + button's menu: a request in the protocol you are in, or a scratchpad of any type. */
  const [newScratchMenu, setNewScratchMenu] = useState<{ x: number; y: number } | null>(null);
  const scratchFiles = useScratchpadStore(s => s.files);
  const protocolLabel = activeProtocol === 'ai' ? 'AI' : COLLECTION_PROTOCOL_LABELS[activeProtocol] ?? 'REST';
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  /* What is being dragged — a tab or a whole group — and what it is over. */
  type Dragged = { kind: 'tab' | 'group'; id: string };
  const dragRef = useRef<Dragged | null>(null);
  const [dragging, setDragging] = useState<Dragged | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  /* A group just made, whose chip arrives renaming. */
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [allTabsAnchor, setAllTabsAnchor] = useState<DOMRect | null>(null);
  const [confirmCloseGroupId, setConfirmCloseGroupId] = useState<string | null>(null);
  /* The hover card: which tab, where, after a moment's rest. */
  const [hoverCard, setHoverCard] = useState<{ id: string; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverOff = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = null; setHoverCard(null); };
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
  /* Folding a group changes how wide the strip is without the strip resizing. */
  useEffect(() => { checkScroll(); }, [checkScroll, tabs, tabGroups]);

  /* The wheel scrolls the strip sideways, as in Firefox and VS Code. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* The tab in front is always on screen — after a click in the list, a shortcut, Ctrl+N. */
  /* After layout, and clear of the 28px fade — scrollIntoView ran before the
     last of a burst of new tabs was laid out, and stopped under the fade. */
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const strip = scrollRef.current;
      const el = strip?.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`);
      if (!strip || !el) return;
      const FADE = 32;
      const left = el.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
      const right = left + el.offsetWidth;
      if (left < strip.scrollLeft + FADE) strip.scrollTo({ left: Math.max(0, left - FADE) });
      else if (right > strip.scrollLeft + strip.clientWidth - FADE) strip.scrollTo({ left: right - strip.clientWidth + FADE });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTabId, tabGroups, tabs.length]);

  const scrollTabs = (dir: 'left' | 'right', step = 180) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' });
  };
  /* Hold an arrow to keep going. */
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = (dir: 'left' | 'right') => {
    scrollTabs(dir);
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = setInterval(() => scrollTabs(dir, 120), 160);
  };
  const holdStop = () => { if (holdTimer.current) clearInterval(holdTimer.current); holdTimer.current = null; };
  useEffect(() => () => holdStop(), []);
  useEffect(() => {
    const onKey = (e: Event) => { if ((e as CustomEvent).type) setAllTabsAnchor(countRef.current?.getBoundingClientRect() ?? null); };
    window.addEventListener('daakia:all-tabs', onKey);
    return () => window.removeEventListener('daakia:all-tabs', onKey);
  }, []);
  const countRef = useRef<HTMLButtonElement>(null);


  const customEnvs = environments.filter(e => e.id !== GLOBAL_ENV_ID);
  const envOptions: SelectOption[] = customEnvs.map(e => ({ value: e.id, label: e.name }));

  const handleClose = (tabId: string) => {
    logUiEvent('tab.close', { tabId });
    const tab = tabs.find(t => t.id === tabId);
    // daakia-ai tabs have no save flow — never prompt for unsaved changes
    if (tab?.dirty && tab.type !== 'daakia-ai') {
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
    /* A scratchpad is a document like a request: it renames, duplicates and
       pins. Renaming it renames the scratchpad, not just the tab. */
    const isScratch = tab?.type === 'scratchpad';
    /*
      The surfaces there is only ever one of.

      Each of these opens by name — `openDk8sTab`, `openSettingsTab` — and
      returns the existing tab when there is one, because they are places
      rather than documents: a second Settings is the same Settings, and two
      dk8s tabs are two views of one cluster watch that fight over it.
      Offering Duplicate on them promised a copy the app then refused to make,
      so the entry did nothing and looked broken.

      `dk8s-results` is deliberately not here — it holds one search's output,
      which is a document, and a second copy of it is a reasonable thing to
      want while a new search runs.
    */
    const isSingleton = tab !== undefined && ([
      'dk8s', 'dkgh', 'settings', 'mock-server', 'daakia-ai', 'wiki', 'workspace',
    ] as const).includes(tab.type as 'dk8s');
    const isPinned = tab?.pinned;
    const hasTabsToRight = tabIdx < tabs.length - 1;
    const hasTabsToLeft = tabIdx > 0;
    const hasMultipleTabs = tabs.length >= 2;
    const hasDirtyTabs = tabs.some(t => t.dirty && !t.pinned);
    const presentProtocols = allTabs.filter(t => t.type === 'request').map(t => t.protocol);
    const hasRequestTabs = presentProtocols.length > 0;
    const uniqueProtocols = [...new Set(presentProtocols)];

    const items: ContextMenuItem[] = [];
    if (isRequest || isScratch) items.push({ id: 'rename', label: 'Rename', shortcut: 'R', icon: <RenameIcon size={13} />, iconColor: 'var(--color-ctx-rename)' });
    if (!isSingleton) items.push({ id: 'duplicate', label: 'Duplicate', shortcut: 'D', icon: <CopyIcon size={13} />, iconColor: 'var(--color-ctx-duplicate)' });
 if (isRequest || isScratch) items.push({ id: isPinned ? 'unpin': 'pin', label: isPinned ? 'Unpin': 'Pin', shortcut: isPinned ? 'U': 'P', icon: isPinned ? <UnpinIcon size={13} /> : <PinIcon size={13} />, iconColor: 'var(--color-ctx-pin)'});
    if (isScratch) items.push({ id: 'reveal', label: 'Reveal in Scratchpads', icon: <ScratchpadIcon size={13} />, iconColor: 'var(--color-scratchpad)' });

    /* Tab groups, as in Chrome: into a new one, into one there is, or out. */
    items.push({ id: 'sep-group', label: '', separator: true });
    if (tab && !isPinned) {
      items.push({ id: 'group-new', label: 'Add to new group', icon: <PlusSquareIcon size={13} />, iconColor: 'var(--color-info)' });
      const others = tabGroups.filter(g => g.id !== tab.groupId);
      if (others.length) {
        items.push({
          id: 'group-add', label: tab.groupId ? 'Move to group' : 'Add to group', icon: <LayersIcon size={13} />, iconColor: 'var(--color-info)',
          submenu: others.map(g => ({ id: g.id, label: g.name || 'Unnamed group', icon: <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: g.color }} /> })),
        });
      }
      if (tab.groupId) items.push({ id: 'group-remove', label: 'Remove from group', icon: <CloseSquareIcon size={13} />, iconColor: 'var(--color-text-muted)' });
    }
    items.push({
      id: 'group-by', label: 'Group tabs', icon: <LayersIcon size={13} />, iconColor: 'var(--color-primary)',
      submenu: [
        { id: 'protocol', label: 'By protocol' },
        { id: 'host', label: 'By host' },
        { id: 'collection', label: 'By collection' },
      ],
    });
    if (tabGroups.length) items.push({ id: 'ungroup-all', label: 'Ungroup all', icon: <LayersIcon size={13} />, iconColor: 'var(--color-text-muted)' });
    if (closedTabs.length) items.push({ id: 'reopen', label: 'Reopen closed tab', icon: <RefreshIcon size={13} />, iconColor: 'var(--color-success)' });

    if (hasRequestTabs && uniqueProtocols.length >= 1) {
      items.push({ id: 'sep-filter', label: '', separator: true });
      items.push({
        id: 'filter',
        label: tabProtocolFilter.size > 0 ? `Filter (${tabProtocolFilter.size} active)` : 'Filter',
        icon: <FilterIcon size={13} />,
        iconColor: tabProtocolFilter.size > 0 ? 'var(--color-primary)' : 'var(--color-ctx-close-batch)',
        submenu: buildFilterSubmenu(),
        keepOpenOnSelect: true,
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
  }, [contextMenu?.tabId, contextMenu, tabProtocolFilter, tabs, allTabs, tabGroups, closedTabs]);

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
      case 'duplicate': {
        const scratchId = tabs.find(t => t.id === tabId)?.scratchpadId;
        /* A copy of a scratchpad is a new scratchpad, not a second tab on the same text. */
        if (scratchId) useScratchpadStore.getState().duplicate(scratchId);
        else { logUiEvent('tab.duplicate', { tabId }); duplicateTab(tabId); }
        setContextMenu(null);
        break;
      }
      case 'reveal': {
        const scratchId = tabs.find(t => t.id === tabId)?.scratchpadId;
        if (scratchId) { setActiveTab(tabId); useScratchpadStore.getState().reveal(scratchId); }
        setContextMenu(null);
        break;
      }
      case 'group-new': { const gid = createTabGroup([tabId]); setEditingGroupId(gid); setContextMenu(null); break; }
      case 'group-add': if (subId) moveTabToGroup(tabId, subId); setContextMenu(null); break;
      case 'group-remove': moveTabToGroup(tabId, null); setContextMenu(null); break;
      case 'group-by': if (subId) groupTabsBy(subId as GroupBy, collectionName); setContextMenu(null); break;
      case 'ungroup-all': ungroupAllTabs(); setContextMenu(null); break;
      case 'reopen': reopenClosedTab(); setContextMenu(null); break;
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
    /* A scratchpad is renamed without its extension — the type supplies it. */
    const scratch = tab.scratchpadId ? scratchFiles.find(f => f.id === tab.scratchpadId) : undefined;
    setRenameValue(scratch ? scratch.name : tab.name);
  };

  const finishRename = () => {
    if (renamingTabId && renameValue.trim()) {
      const scratchId = tabs.find(t => t.id === renamingTabId)?.scratchpadId;
      if (scratchId) useScratchpadStore.getState().rename(scratchId, renameValue);
      else updateTab(renamingTabId, { name: renameValue.trim() });
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

  // Drag and drop — tabs, and whole groups by their chip.
  const startDrag = (e: React.DragEvent, d: Dragged) => {
    hoverOff();
    dragRef.current = d;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', d.id);
    setTimeout(() => setDragging(d), 0);
  };
  const endDrag = () => { dragRef.current = null; setDragging(null); setOverKey(null); };
  const over = (key: string) => (e: React.DragEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overKey !== key) setOverKey(key);
  };
  /* Dropped on a tab: just before it, and in whatever group it is in. */
  const dropOnTab = (target: RequestTab) => (e: React.DragEvent) => {
    e.preventDefault();
    const d = dragRef.current;
    endDrag();
    if (!d || d.id === target.id) return;
    if (d.kind === 'tab') dropTab(d.id, target.id, target.pinned ? null : (target.groupId ?? null));
    else moveTabGroup(d.id, target.id);
  };
  /* Dropped on a chip: a tab joins the group at its end; a group goes before it. */
  const dropOnChip = (g: TabGroup, first: RequestTab) => (e: React.DragEvent) => {
    e.preventDefault();
    const d = dragRef.current;
    endDrag();
    if (!d) return;
    if (d.kind === 'tab') moveTabToGroup(d.id, g.id);
    else if (d.id !== g.id) moveTabGroup(d.id, first.id);
  };
  /* Dropped past the last tab: to the end, out of every group. */
  const dropAtEnd = (e: React.DragEvent) => {
    e.preventDefault();
    const d = dragRef.current;
    endDrag();
    if (!d) return;
    if (d.kind === 'tab') dropTab(d.id, null, null);
    else moveTabGroup(d.id, null);
  };

  /** The mark in front of a tab's name: method, protocol, or the page it is. */
  const badgeFor = (tab: RequestTab) => {
    const isScratch = tab.type === 'scratchpad';
    const scratch = isScratch ? scratchFiles.find(f => f.id === tab.scratchpadId) : undefined;
    if (tab.type === 'settings') return <SettingsIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-settings)' }} />;
    if (tab.type === 'mock-server') return <ServerIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-mock-server)' }} />;
    if (tab.type === 'state-machine') return <StateMachineIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-sm-tab, #f59e0b)' }} />;
    if (tab.type === 'daakia-ai') return <span className="flex-shrink-0 inline-flex"><DaakiaMarkIcon size={13} tint="var(--color-ai-accent, #D97757)" /></span>;
    if (tab.type === 'wiki') return <BookOpenIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-wiki)' }} />;
    if (tab.type === 'dk8s' || tab.type === 'dk8s-logfile' || tab.type === 'dk8s-payload') return <Dk8sIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-dk8s)' }} />;
    if (tab.type === 'dk8s-results') return <SearchIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-dk8s)' }} />;
    if (tab.type === 'dk8s-window') return <ClockIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-dk8s)' }} />;
    if (tab.type === 'dkgh') return <IssueOpenedIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-dkgh)' }} />;
    if (tab.type === 'workspace') return <LayoutGridIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-workspace)' }} />;
    if (isScratch) {
      return scratch
        ? <span className="inline-block font-mono font-bold text-[9.5px] leading-none flex-shrink-0" style={{ color: SCRATCHPAD_TYPES[scratch.type].color }}>{SCRATCHPAD_TYPES[scratch.type].badge}</span>
        : <ScratchpadIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-scratchpad)' }} />;
    }
    const mark = (label: string, color: string) => <span className="inline-block font-mono font-bold text-[10px] leading-none flex-shrink-0" style={{ color }}>{label}</span>;
    if (tab.protocol === 'graphql') return mark('GQL', 'var(--color-protocol-graphql)');
    if (tab.protocol === 'websocket') {
      const rt = tab.authData?.['rt_protocol'] || 'websocket';
      const b: Record<string, [string, string]> = { websocket: ['WS', 'var(--color-protocol-websocket)'], sse: ['SSE', 'var(--color-protocol-sse)'], socketio: ['SIO', 'var(--color-protocol-socketio)'], mqtt: ['MQTT', 'var(--color-protocol-mqtt)'] };
      const [l, c] = b[rt] || b.websocket;
      return mark(l, c);
    }
    if (tab.protocol === 'grpc') return mark('gRPC', 'var(--color-protocol-grpc)');
    if (tab.protocol === 'soap') return mark('SOAP', 'var(--color-protocol-soap)');
    if (tab.protocol === 'ai') return mark('AI', 'var(--color-protocol-ai)');
    if (tab.protocol === 'mcp') return mark('MCP', 'var(--color-protocol-mcp)');
    return <MethodBadge method={tab.method} compact />;
  };
  const tabLabel = (tab: RequestTab) => (tab.type === 'settings' ? 'Settings' : tab.type === 'mock-server' ? 'Mock Server' : tab.type === 'state-machine' ? 'State Machine' : (tab.name || tab.url || 'Untitled'));

  /* The list wants every tab, filter or not: it is how you find what the filter hides. */
  const listed = (t: RequestTab): ListedTab => ({ id: t.id, name: tabLabel(t), groupId: t.groupId, pinned: t.pinned, searchText: `${tabLabel(t)} ${t.url ?? ''} ${t.method ?? ''}` });
  const closeGroupAsked = (groupId: string) => {
    if (allTabs.some(t => t.groupId === groupId && t.dirty)) setConfirmCloseGroupId(groupId);
    else closeTabGroup(groupId);
  };
  /* A new tab in a group: another like the group's first, then into the group. */
  const newTabInGroup = (g: TabGroup, first: RequestTab) => {
    setActiveTab(first.id);
    newTabLikeActive();
    const id = useTabsStore.getState().activeTabId;
    if (id !== first.id) moveTabToGroup(id, g.id);
  };

  const renderTab = (tab: RequestTab, group?: TabGroup) => {
      const isActive = tab.id === activeTabId;
      const isSettings = tab.type === 'settings';
      const isMockServer = tab.type === 'mock-server';
      const isDaakiaAi = tab.type === 'daakia-ai';
      const isStateMachine = tab.type === 'state-machine';
      const isWiki = tab.type === 'wiki';
      const isDk8s = tab.type === 'dk8s';
      /* A search result wears dk8s's colour and a magnifier: it belongs to
         dk8s, and it is not the pods. */
      const isDk8sResults = tab.type === 'dk8s-results';
      /* A downloaded pod log: dk8s's colour, and a page icon — it is a document. */
      const isDk8sLogFile = tab.type === 'dk8s-logfile' || tab.type === 'dk8s-payload';
      /* The minutes around a hit: dk8s's colour, and a clock — it is a stretch of time. */
      const isDk8sWindow = tab.type === 'dk8s-window';
      const isDkgh = tab.type === 'dkgh';
      const isWorkspace = tab.type === 'workspace';
      const isScratch = tab.type === 'scratchpad';
      const scratch = isScratch ? scratchFiles.find(f => f.id === tab.scratchpadId) : undefined;
      const SM_ACCENT = 'var(--color-sm-tab, #f59e0b)';
      const tabAccent = isSettings ? 'var(--color-settings)' : isMockServer ? 'var(--color-mock-server)' : isDaakiaAi ? 'var(--color-ai-accent, #D97757)' : isStateMachine ? SM_ACCENT : isWiki ? 'var(--color-wiki)' : isDk8s || isDk8sResults || isDk8sLogFile || isDk8sWindow ? 'var(--color-dk8s)' : isDkgh ? 'var(--color-dkgh)' : isWorkspace ? 'var(--color-workspace)' : isScratch ? 'var(--color-scratchpad)' : (tab.protocol ? getProtocolAccent(tab.protocol) : requestAccentColor);
      const isDragOver = overKey === tab.id && dragging?.id !== tab.id;
      return (
        <div
          key={tab.id}
          draggable
          onDragStart={(e) => startDrag(e, { kind: 'tab', id: tab.id })}
          onDragOver={over(tab.id)}
          onDrop={dropOnTab(tab)}
          onDragEnd={endDrag}
          onContextMenu={(e) => handleContextMenu(e, tab.id)}
          data-context-menu="tab"
          data-tab-id={tab.id}
          style={{
            ...(isActive ? { backgroundColor: `color-mix(in srgb, ${tabAccent} 2%, transparent)` } : {}),
            /* The group's colour along the bottom edge, as in Chrome. */
            ...(group ? { boxShadow: `inset 0 -2px 0 ${group.color}` } : {}),
          }}
          onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); hoverOff(); }}
          onAuxClick={(e) => { if (e.button === 1 && !tab.pinned) { e.preventDefault(); handleClose(tab.id); } }}
          onMouseEnter={(e) => {
            if (tab.type !== 'request' || dragRef.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
            hoverTimer.current = setTimeout(() => setHoverCard({ id: tab.id, rect }), 600);
          }}
          onMouseLeave={hoverOff}
          className={`group flex items-center gap-2 h-full px-3 border-r border-[var(--color-panel-border)] cursor-pointer select-none transition-colors relative ${
            renamingTabId === tab.id
              ? 'min-w-[220px] max-w-[320px] flex-shrink-0'
              : tab.pinned ? 'w-[40px] justify-center !px-0 flex-shrink-0' : 'max-w-[200px] min-w-[120px] flex-shrink-0'
          } ${
            isActive
              ? ''
              : 'bg-[var(--color-panel)] hover:bg-[var(--color-surface-hover)]'
          } ${isDragOver ? 'border-l-2 border-l-[var(--color-primary)]' : ''} ${dragging?.id === tab.id ? 'opacity-50' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          onDoubleClick={isScratch ? () => startRename(tab.id) : undefined}
          title={isScratch ? `${tab.name} — double-click to rename` : tab.pinned ? tabLabel(tab) : undefined}
        >
          {/* Active top-line indicator — absolutely positioned div, immune to overflow clipping */}
          {isActive && (
            <div className="absolute top-0 left-0 right-0 h-[2px] z-10" style={{ backgroundColor: tabAccent }} />
          )}
          {isSettings ? (
            <SettingsIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-settings)' }} />
          ) : isMockServer ? (
            <ServerIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-mock-server)' }} />
          ) : isStateMachine ? (
            <StateMachineIcon size={13} className="flex-shrink-0" style={{ color: SM_ACCENT }} />
          ) : isDaakiaAi ? (
            <span className="flex-shrink-0 inline-flex"><DaakiaMarkIcon size={13} tint={tabAccent} /></span>
          ) : isWiki ? (
            <BookOpenIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-wiki)' }} />
          ) : isDk8s ? (
            <Dk8sIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-dk8s)' }} />
          ) : isDk8sResults ? (
            <SearchIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-dk8s)' }} />
          ) : isDk8sLogFile ? (
            <Dk8sIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-dk8s)' }} />
          ) : isDk8sWindow ? (
            <ClockIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-dk8s)' }} />
          ) : isDkgh ? (
            <IssueOpenedIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-dkgh)' }} />
          ) : isWorkspace ? (
            <LayoutGridIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-workspace)' }} />
          ) : isScratch ? (
            scratch
              ? <span className="inline-block font-mono font-bold text-[9.5px] leading-none flex-shrink-0" style={{ color: SCRATCHPAD_TYPES[scratch.type].color }}>{SCRATCHPAD_TYPES[scratch.type].badge}</span>
              : <ScratchpadIcon size={13} className="flex-shrink-0" style={{ color: 'var(--color-scratchpad)' }} />
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
          {!tab.pinned && <span className="flex-1 truncate-text text-[12px] text-[var(--color-text-primary)]">
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
              isSettings ? 'Settings' : isMockServer ? 'Mock Server' : isStateMachine ? 'State Machine' : (tab.name || tab.url || 'Untitled')
            )}
          </span>}
          {!isSettings && !isMockServer && !isDaakiaAi && tab.dirty && !tab.pinned && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: tab.protocol === 'websocket' ? (() => { const rt = tab.authData?.['rt_protocol'] || 'websocket'; return rt === 'sse' ? 'var(--color-protocol-sse)' : rt === 'socketio' ? 'var(--color-protocol-socketio)' : rt === 'mqtt' ? 'var(--color-protocol-mqtt)' : 'var(--color-protocol-websocket)'; })() : tabAccent }}
            />
          )}
          {tab.pinned ? null : (
            <button
              type="button"
              className={`flex items-center justify-center w-[18px] h-[18px] rounded cursor-pointer transition-all self-center mt-px ${
                isSettings || isMockServer || tab.type === 'scratchpad'
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
      {/* Pinned tabs, as their icon only, ahead of everything and never scrolled away. */}
      {tabs.filter(t => t.pinned).map(t => renderTab(t))}

      {/* Full-height arrows while the strip overflows; hold one to keep going. */}
      {(canScrollLeft || canScrollRight) && (
        <button
          type="button"
          className={`dk-tabnav${canScrollLeft ? '' : ' is-end'}`}
          onPointerDown={() => canScrollLeft && holdStart('left')}
          onPointerUp={holdStop}
          onPointerLeave={holdStop}
          aria-label="Scroll tabs left"
          title="Scroll tabs left"
        >
          <ChevronLeftIcon size={15} />
        </button>
      )}

      {/* Tabs */}
      <div
        ref={scrollRef}
        className={`dk-tabstrip flex items-center h-full min-w-0 overflow-x-auto scrollbar-none${canScrollLeft ? ' fade-l' : ''}${canScrollRight ? ' fade-r' : ''}`}
      >
        {stripPieces(tabs.filter(t => !t.pinned), tabGroups).map(piece => {
          if (piece.kind === 'tab') return renderTab(piece.tab);
          const g = piece.group;
          const first = piece.tabs[0];
          return (
            <Fragment key={`g:${g.id}`}>
              <TabGroupChip
                group={g}
                count={allTabs.filter(t => t.groupId === g.id).length}
                editing={editingGroupId === g.id}
                onEditDone={() => setEditingGroupId(null)}
                onToggle={() => toggleTabGroup(g.id)}
                onRename={name => renameTabGroup(g.id, name)}
                onRecolor={c => recolorTabGroup(g.id, c)}
                onNewTab={() => newTabInGroup(g, first)}
                onUngroup={() => ungroupTabGroup(g.id)}
                onCloseGroup={() => closeGroupAsked(g.id)}
                isOver={overKey === `g:${g.id}`}
                onDragStart={e => startDrag(e, { kind: 'group', id: g.id })}
                onDragEnd={endDrag}
                onDragOver={over(`g:${g.id}`)}
                onDragLeave={() => { if (overKey === `g:${g.id}`) setOverKey(null); }}
                onDrop={dropOnChip(g, first)}
              />
              {!g.collapsed && piece.tabs.map(t => renderTab(t, g))}
            </Fragment>
          );
        })}
      </div>

      {(canScrollLeft || canScrollRight) && (
        <button
          type="button"
          className={`dk-tabnav dk-tabnav--r${canScrollRight ? '' : ' is-end'}`}
          onPointerDown={() => canScrollRight && holdStart('right')}
          onPointerUp={holdStop}
          onPointerLeave={holdStop}
          aria-label="Scroll tabs right"
          title="Scroll tabs right"
        >
          <ChevronRightIcon size={15} />
        </button>
      )}


      {/* + right after the last tab, as it always was; once the tabs overflow
          it stays at the strip's edge instead of scrolling away. */}
      <button
        type="button"
        className="dk-tabplus flex items-center justify-center w-9 h-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] cursor-pointer flex-shrink-0 transition-colors"
        style={{ color: requestAccentColor }}
        onClick={(e) => {
          /* Always a menu: a request in the protocol you are in, or a scratchpad. */
          const r = e.currentTarget.getBoundingClientRect();
          setNewScratchMenu({ x: r.left, y: r.bottom + 2 });
        }}
        title={`New ${protocolLabel} request or scratchpad`}
      >
        <PlusIcon size={16} />
      </button>

      {/* The rest of the strip: drop here for the end, double-click for a new tab. */}
      <div
        className={`dk-tabstrip__end${overKey === 'end' ? ' is-over' : ''}`}
        onDragOver={over('end')}
        onDragLeave={() => { if (overKey === 'end') setOverKey(null); }}
        onDrop={dropAtEnd}
        onDoubleClick={() => newTabLikeActive()}
        title="Double-click for a new tab"
      />

      {/* Every tab in a searchable list — Chrome's Tab Search. */}
      <button
        ref={countRef}
        type="button"
        className={`dk-tabcount${allTabsAnchor ? ' is-open' : ''}`}
        onClick={e => setAllTabsAnchor(allTabsAnchor ? null : e.currentTarget.getBoundingClientRect())}
        title="All tabs (Alt+L)"
        aria-label={`All ${allTabs.length} tabs`}
      >
        <ChevronDownIcon size={12} />
        <span>{allTabs.length}</span>
      </button>

      {/* Per-tab environment selector — far right */}
      {activeTab && activeTab.type === 'request' && (
        <div className="flex items-center gap-2 h-full px-3 py-1 border-l border-[var(--color-panel-border)] flex-shrink-0 z-10">
          <IconButtonView
            icon={<LayersIcon size={14} style={{ color: 'var(--color-sidebar-environments)' }} />}
            size="sm"
            tooltip="Open Environments"
            onClick={() => {
              const envId = activeTab?.envId || useEnvStore.getState().activeEnvId || GLOBAL_ENV_ID;
              requestEditEnv(envId);
              onEnvironmentsClick?.();
            }}
          />
          {customEnvs.length === 0 ? (
            <span className="text-[12px] text-[var(--color-text-muted)]">No Environment</span>
          ) : (
            <SelectInputView
              options={envOptions}
              value={selectedEnvId({ tabEnvId: activeTab.envId, activeEnvId, options: envOptions })}
              onChange={(v) => {
                updateTab(activeTab.id, { envId: v });
                setActiveEnvironment(v);
              }}
              size="md"
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

    {allTabsAnchor && (
      <AllTabsMenu
        anchor={allTabsAnchor}
        tabs={allTabs.map(listed)}
        groups={tabGroups}
        recentIds={recentTabIds}
        closed={closedTabs.map(listed)}
        activeTabId={activeTabId}
        renderBadge={id => { const t = allTabs.find(x => x.id === id) ?? closedTabs.find(x => x.id === id); return t ? badgeFor(t) : null; }}
        onPick={id => { setActiveTab(id); setAllTabsAnchor(null); }}
        onCloseTab={id => handleClose(id)}
        onReopen={id => { reopenClosedTab(id); setAllTabsAnchor(null); }}
        onDismiss={() => setAllTabsAnchor(null)}
      />
    )}

    {hoverCard && (() => {
      const t = allTabs.find(x => x.id === hoverCard.id);
      if (!t) return null;
      return (
        <TabHoverCard
          tab={t}
          anchor={hoverCard.rect}
          badge={badgeFor(t)}
          envName={environments.find(e => e.id === t.envId)?.name}
          collectionName={t.collectionId ? collectionName(t.collectionId) : undefined}
        />
      );
    })()}

    {confirmCloseGroupId && (
      <ConfirmDialog
        title="Unsaved Changes"
        message="Some tabs in this group have unsaved changes. Close the group anyway?"
        confirmLabel="Discard & Close Group"
        danger
        onConfirm={() => { closeTabGroup(confirmCloseGroupId); setConfirmCloseGroupId(null); }}
        onCancel={() => setConfirmCloseGroupId(null)}
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
    {newScratchMenu && (
      <ContextMenu
        items={[
          /* The protocol you are in comes first: it is what + made before it had a menu. */
          { id: 'request', label: `New ${protocolLabel} request`, icon: <PlusIcon size={13} />, iconColor: requestAccentColor },
          { id: 'sep', label: '', separator: true },
          { id: 'heading', label: 'New scratchpad', heading: true },
          ...SCRATCHPAD_TYPE_ORDER.map(k => ({
            id: k,
            label: SCRATCHPAD_TYPES[k].label,
            icon: <span className="inline-block font-mono font-bold text-[9.5px] leading-none" style={{ color: SCRATCHPAD_TYPES[k].color }}>{SCRATCHPAD_TYPES[k].badge}</span>,
            shortcut: `.${SCRATCHPAD_TYPES[k].ext}`,
          })),
        ]}
        position={newScratchMenu}
        onSelect={(id) => {
          setNewScratchMenu(null);
          if (id === 'request') { logUiEvent('tab.new'); addTab(); }
          else if (id in SCRATCHPAD_TYPES) useScratchpadStore.getState().create(id as ScratchpadType);
        }}
        onClose={() => setNewScratchMenu(null)}
      />
    )}
    </>
  );
}
