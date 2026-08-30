import { CopyRootHtmlButton } from '../../pages/wiki/daakia-view/CopyRootHtmlButton';
import { CollectionsPanel } from '../rest/sidebar/CollectionsPanel';
import { HistoryPanel } from '../rest/sidebar/HistoryPanel';
import { EnvironmentsPanel } from '../rest/sidebar/EnvironmentsPanel';
import { GraphQLDocumentationPanel, GraphQLSchemaExplorer } from '../graphql';
import { RunAndDebugPanel } from '../shared/debugger';
import { CollectionsFolderIcon, ClockIcon, LayersIcon, SettingsIcon, DocumentIcon, CodeIcon, BugIcon, GrpcIcon, SoapIcon, SparkleIcon, GeneralAssistantIcon, BookOpenIcon, GitHubIcon, RefreshIcon } from '../../icons';
import { useTabsStore } from '../../store/tabs-store';
import { useDebugStore } from '../../store/debug-store';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

/** Gap kept between a rail popup and both its trigger and the viewport edge. */
const POPUP_MARGIN = 8;
import { postMsg } from '../../vscode';
import { useUiStateStore } from '../../store/ui-state-store';
import { ButtonView } from '@salilvnair/dui';

export type SidebarSection = 'collections' | 'history' | 'environments' | 'debug' | 'gql-docs' | 'gql-schema' | 'gql-collections' | 'gql-history' | 'ws-collections' | 'ws-history' | 'grpc-collections' | 'grpc-history' | 'soap-collections' | 'soap-history' | 'ai-collections' | 'ai-history' | 'mcp-collections' | 'mcp-history' | null;

interface AppSidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  onOpenChange?: (open: boolean) => void;
  sidebarOpen?: boolean;
  sidebarWidth?: number;
  sidebarDragging?: boolean;
}

export function AppSidebar({ activeSection, onSectionChange, onOpenChange, sidebarOpen = true, sidebarWidth = 260, sidebarDragging = false }: AppSidebarProps) {
  const toggle = (section: SidebarSection) => {
    if (activeSection === section) {
      onSectionChange(null);
    } else {
      onSectionChange(section);
      // Ensure panel opens when selecting a section
      if (!sidebarOpen) onOpenChange?.(true);
    }
  };

  const { tabs, activeTabId, activeProtocol } = useTabsStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const settingsOpen = tabs.some(t => t.type === 'settings');
  const settingsActive = activeTab?.type === 'settings';
  // Realtime tab bundles 4 sub-protocols (WS/SSE/Socket.IO/MQTT) behind one 'ws-*' sidebar
  // section — Collections/History must follow whichever sub-protocol is actually active,
  // not always show WebSocket-tagged data.
  const rtProtocol = (activeTab?.authData?.['rt_protocol'] as string) || 'websocket';

  const hasAnyBreakpoints = useDebugStore(s =>
    Object.values(s.breakpoints).some(lines => lines.length > 0)
  );
  const debugActive = useDebugStore(s => s.active);

  // Auto-close debug panel when no breakpoints and debug is inactive
  useEffect(() => {
    if (activeSection === 'debug' && !hasAnyBreakpoints && !debugActive) {
      onSectionChange(null);
    }
  }, [hasAnyBreakpoints, debugActive, activeSection, onSectionChange]);

  // Protocol-aware sidebar — use store protocol (follows left rail switch)
  const isMockServer = activeTab?.type === 'mock-server';
  const isStateMachine = activeTab?.type === 'state-machine';
  const isDaakiaAi = activeTab?.type === 'daakia-ai';
  const isWiki = activeTab?.type === 'wiki';
  const isDk8s = activeTab?.type === 'dk8s';
  // Never show protocol icons when a standalone tab is active — settings,
  // mock-server, dk8s, state-machine, daakia-ai or wiki. Those own the whole
  // surface, so a REST collections tree beside them is just noise.
  const showProtocolIcons = !settingsActive && !isMockServer && !isStateMachine && !isDaakiaAi && !isWiki && !isDk8s;
  const showRestSidebar = showProtocolIcons && activeProtocol === 'rest';
  const showGraphqlSidebar = showProtocolIcons && activeProtocol === 'graphql';
  const showWebsocketSidebar = showProtocolIcons && activeProtocol === 'websocket';
  const showGrpcSidebar = showProtocolIcons && activeProtocol === 'grpc';
  const showSoapSidebar = showProtocolIcons && activeProtocol === 'soap';
  const showAiSidebar = showProtocolIcons && activeProtocol === 'ai';
  const showMcpSidebar = showProtocolIcons && activeProtocol === 'mcp';

  // Determine if panel should show
  const showPanel = activeSection && (
    (showRestSidebar && ['collections', 'history', 'environments', 'debug'].includes(activeSection)) ||
    (showGraphqlSidebar && (activeSection.startsWith('gql-') || activeSection === 'environments')) ||
    (showWebsocketSidebar && (activeSection.startsWith('ws-') || activeSection === 'environments')) ||
    (showGrpcSidebar && (activeSection.startsWith('grpc-') || activeSection === 'environments')) ||
    (showSoapSidebar && (activeSection.startsWith('soap-') || activeSection === 'environments')) ||
    (showAiSidebar && (activeSection.startsWith('ai-') || activeSection === 'environments')) ||
    (showMcpSidebar && (activeSection.startsWith('mcp-') || activeSection === 'environments'))
  );

  return (
    <div className="flex h-full">
      {/* Expandable panel — width animates to 0 when collapsed, CSS-controlled */}
      <div
        className="bg-[var(--color-surface)] flex flex-col overflow-hidden"
        style={{
          width: showPanel && sidebarOpen ? sidebarWidth : 0,
          transition: sidebarDragging ? 'none' : 'width 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {showPanel && <SidebarPanelContent section={activeSection} rtProtocol={rtProtocol} />}
      </div>

      {/* Icon rail — always has left border for clean separation */}
      <div className="flex flex-col items-center w-12 bg-[var(--color-panel)] border-l border-[var(--color-surface-border)] py-2 gap-1 flex-shrink-0">
        {/* REST sidebar icons */}
        {showRestSidebar && (
          <>
            <SidebarIcon
              active={activeSection === 'collections'}
              accentColor="var(--color-sidebar-collections)"
              onClick={() => toggle('collections')}
              title="Collections"
            >
              <CollectionsFolderIcon style={{ color: 'var(--color-sidebar-collections)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'history'}
              accentColor="var(--color-sidebar-history)"
              onClick={() => toggle('history')}
              title="History"
            >
              <ClockIcon style={{ color: 'var(--color-sidebar-history)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'environments'}
              accentColor="var(--color-sidebar-environments)"
              onClick={() => toggle('environments')}
              title="Environments"
            >
              <LayersIcon style={{ color: 'var(--color-sidebar-environments)' }} />
            </SidebarIcon>

            {(hasAnyBreakpoints || debugActive) && (
              <SidebarIcon
                active={activeSection === 'debug'}
                accentColor="var(--color-success)"
                onClick={() => toggle('debug')}
                title="Run and Debug"
              >
                <BugIcon size={16} style={{ color: activeSection === 'debug' ? 'var(--color-success)' : undefined }} />
              </SidebarIcon>
            )}
          </>
        )}

        {/* GraphQL sidebar icons */}
        {showGraphqlSidebar && (
          <>
            <SidebarIcon
              active={activeSection === 'gql-docs'}
              accentColor="var(--color-protocol-graphql)"
              onClick={() => toggle('gql-docs')}
              title="Documentation"
            >
              <DocumentIcon size={18} style={{ color: 'var(--color-protocol-graphql)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'gql-schema'}
              accentColor="var(--color-protocol-graphql)"
              onClick={() => toggle('gql-schema')}
              title="Schema"
            >
              <CodeIcon size={18} style={{ color: 'var(--color-protocol-graphql)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'gql-collections'}
              accentColor="var(--color-sidebar-collections)"
              onClick={() => toggle('gql-collections')}
              title="Collections"
            >
              <CollectionsFolderIcon style={{ color: 'var(--color-sidebar-collections)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'gql-history'}
              accentColor="var(--color-sidebar-history)"
              onClick={() => toggle('gql-history')}
              title="History"
            >
              <ClockIcon style={{ color: 'var(--color-sidebar-history)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'environments'}
              accentColor="var(--color-sidebar-environments)"
              onClick={() => toggle('environments')}
              title="Environments"
            >
              <LayersIcon style={{ color: 'var(--color-sidebar-environments)' }} />
            </SidebarIcon>
          </>
        )}

        {/* WebSocket sidebar icons */}
        {showWebsocketSidebar && (
          <>
            <SidebarIcon
              active={activeSection === 'ws-collections'}
              accentColor="var(--color-sidebar-collections)"
              onClick={() => toggle('ws-collections')}
              title="Collections"
            >
              <CollectionsFolderIcon style={{ color: 'var(--color-sidebar-collections)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'ws-history'}
              accentColor="var(--color-sidebar-history)"
              onClick={() => toggle('ws-history')}
              title="History"
            >
              <ClockIcon style={{ color: 'var(--color-sidebar-history)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'environments'}
              accentColor="var(--color-sidebar-environments)"
              onClick={() => toggle('environments')}
              title="Environments"
            >
              <LayersIcon style={{ color: 'var(--color-sidebar-environments)' }} />
            </SidebarIcon>
          </>
        )}

        {/* gRPC sidebar icons */}
        {showGrpcSidebar && (
          <>
            <SidebarIcon
              active={activeSection === 'grpc-collections'}
              accentColor="var(--color-sidebar-collections)"
              onClick={() => toggle('grpc-collections')}
              title="Collections"
            >
              <CollectionsFolderIcon style={{ color: 'var(--color-sidebar-collections)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'grpc-history'}
              accentColor="var(--color-sidebar-history)"
              onClick={() => toggle('grpc-history')}
              title="History"
            >
              <ClockIcon style={{ color: 'var(--color-sidebar-history)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'environments'}
              accentColor="var(--color-sidebar-environments)"
              onClick={() => toggle('environments')}
              title="Environments"
            >
              <LayersIcon style={{ color: 'var(--color-sidebar-environments)' }} />
            </SidebarIcon>
          </>
        )}

        {/* SOAP sidebar icons */}
        {showSoapSidebar && (
          <>
            <SidebarIcon
              active={activeSection === 'soap-collections'}
              accentColor="var(--color-sidebar-collections)"
              onClick={() => toggle('soap-collections')}
              title="Collections"
            >
              <CollectionsFolderIcon style={{ color: 'var(--color-sidebar-collections)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'soap-history'}
              accentColor="var(--color-sidebar-history)"
              onClick={() => toggle('soap-history')}
              title="History"
            >
              <ClockIcon style={{ color: 'var(--color-sidebar-history)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'environments'}
              accentColor="var(--color-sidebar-environments)"
              onClick={() => toggle('environments')}
              title="Environments"
            >
              <LayersIcon style={{ color: 'var(--color-sidebar-environments)' }} />
            </SidebarIcon>
          </>
        )}

        {/* AI sidebar icons */}
        {showAiSidebar && (
          <>
            <SidebarIcon
              active={activeSection === 'ai-collections'}
              accentColor="var(--color-sidebar-collections)"
              onClick={() => toggle('ai-collections')}
              title="Collections"
            >
              <CollectionsFolderIcon style={{ color: 'var(--color-sidebar-collections)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'ai-history'}
              accentColor="var(--color-sidebar-history)"
              onClick={() => toggle('ai-history')}
              title="History"
            >
              <ClockIcon style={{ color: 'var(--color-sidebar-history)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'environments'}
              accentColor="var(--color-sidebar-environments)"
              onClick={() => toggle('environments')}
              title="Environments"
            >
              <LayersIcon style={{ color: 'var(--color-sidebar-environments)' }} />
            </SidebarIcon>
          </>
        )}

        {/* MCP sidebar icons */}
        {showMcpSidebar && (
          <>
            <SidebarIcon
              active={activeSection === 'mcp-collections'}
              accentColor="var(--color-sidebar-collections)"
              onClick={() => toggle('mcp-collections')}
              title="Collections"
            >
              <CollectionsFolderIcon style={{ color: 'var(--color-sidebar-collections)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'mcp-history'}
              accentColor="var(--color-sidebar-history)"
              onClick={() => toggle('mcp-history')}
              title="History"
            >
              <ClockIcon style={{ color: 'var(--color-sidebar-history)' }} />
            </SidebarIcon>

            <SidebarIcon
              active={activeSection === 'environments'}
              accentColor="var(--color-sidebar-environments)"
              onClick={() => toggle('environments')}
              title="Environments"
            >
              <LayersIcon style={{ color: 'var(--color-sidebar-environments)' }} />
            </SidebarIcon>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Dev utility — copy root outerHTML for wiki captures */}
        <CopyRootHtmlButton />

        {/* Daakia AI — chat tab shortcut */}
        <DaakiaAiButton />

        {/* AI Provider Status — above settings */}
        <AiProviderStatusIcon />

        {/* Daakia Wiki — above settings */}
        <DaakiaWikiButton />

        {/* Git Sync — above settings */}
        <GitSyncButton />

        {/* Settings — always visible */}
        <SidebarIcon
          active={settingsActive}
          accentColor="var(--color-settings)"
          onClick={() => useTabsStore.getState().openSettingsTab()}
          title="Settings"
        >
          <SettingsIcon size={18} strokeWidth={1.8} style={{ color: settingsActive || settingsOpen ? 'var(--color-settings)' : undefined }} />
        </SidebarIcon>
      </div>
    </div>
  );
}

// ─── Daakia AI Chat Button ────────────────────────────────────────────────────

function DaakiaAiButton() {
  const tabs = useTabsStore(s => s.tabs);
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const isDaakiaAiOpen = tabs.some(t => t.type === 'daakia-ai');
  const isDaakiaAiActive = activeTab?.type === 'daakia-ai';
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);

  // If daakiaAiChat feature is disabled, hide the button entirely
  if (!aiEnabled('daakiaAiChat')) return null;

  return (
    <button
      type="button"
      onClick={() => useTabsStore.getState().openDaakiaAiTab()}
      title="Daakia AI"
      className="w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer transition-colors"
      style={{
        backgroundColor: isDaakiaAiActive
          ? 'color-mix(in srgb, var(--color-protocol-ai) 18%, transparent)'
          : isDaakiaAiOpen
            ? 'color-mix(in srgb, var(--color-protocol-ai) 10%, transparent)'
            : undefined,
      }}
      onMouseEnter={e => {
        if (!isDaakiaAiActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)';
      }}
      onMouseLeave={e => {
        if (!isDaakiaAiActive) (e.currentTarget as HTMLElement).style.backgroundColor =
          isDaakiaAiOpen ? 'color-mix(in srgb, var(--color-protocol-ai) 10%, transparent)' : '';
      }}
    >
      <GeneralAssistantIcon
        size={16}
        style={{ color: isDaakiaAiActive || isDaakiaAiOpen ? 'var(--color-protocol-ai)' : 'var(--color-text-muted)' }}
      />
    </button>
  );
}

// ─── Daakia Wiki Button ───────────────────────────────────────────────────────

function DaakiaWikiButton() {
  const tabs = useTabsStore(s => s.tabs);
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const isWikiOpen = tabs.some(t => t.type === 'wiki');
  const isWikiActive = activeTab?.type === 'wiki';

  return (
    <button
      type="button"
      onClick={() => useTabsStore.getState().openDaakiaWikiTab()}
      title="Daakia Wiki"
      className="w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer transition-colors"
      style={{
        backgroundColor: isWikiActive
          ? 'color-mix(in srgb, var(--color-wiki) 18%, transparent)'
          : isWikiOpen
            ? 'color-mix(in srgb, var(--color-wiki) 10%, transparent)'
            : undefined,
      }}
      onMouseEnter={e => {
        if (!isWikiActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)';
      }}
      onMouseLeave={e => {
        if (!isWikiActive) (e.currentTarget as HTMLElement).style.backgroundColor =
          isWikiOpen ? 'color-mix(in srgb, var(--color-wiki) 10%, transparent)' : '';
      }}
    >
      <BookOpenIcon
        size={16}
        style={{ color: isWikiActive || isWikiOpen ? 'var(--color-wiki)' : 'var(--color-text-muted)' }}
      />
    </button>
  );
}

// ─── Git Sync Button ────────────────────────────────────────────────────────────

function formatSyncRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function GitSyncButton() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'gitSync:syncResult') {
        setSyncing(false);
        setLastMessage(msg.result.message);
        if (msg.result.ok) setLastSyncedAt(new Date().toISOString());
      } else if (msg.type === 'gitSync:autoSyncTick') {
        setLastMessage(msg.result?.message ?? null);
        if (msg.result?.ok) setLastSyncedAt(msg.at);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleOpen = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    // Provisional only — the measured placement happens in the layout effect below.
    setPos({ top: rect.top, left: rect.left - 240 - POPUP_MARGIN });
    setOpen(v => !v);
  };

  // Position from the popup's REAL height, before paint. These rail buttons sit at the very
  // foot of the window, and the previous code clamped against a HARD-CODED height guess —
  // whenever the real content was taller than the guess the popup ran off the bottom of the
  // screen and got cut off. Measuring means it flips/clamps correctly whatever it contains.
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !popupRef.current) return;
    const place = () => {
      const anchor = btnRef.current!.getBoundingClientRect();
      const box = popupRef.current!.getBoundingClientRect();
      setPos({
        top: Math.max(POPUP_MARGIN, Math.min(anchor.top, window.innerHeight - box.height - POPUP_MARGIN)),
        left: Math.max(POPUP_MARGIN, anchor.left - box.width - POPUP_MARGIN),
      });
    };
    place();
    const ro = new ResizeObserver(place);   // content grows once async status arrives
    ro.observe(popupRef.current);
    window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSyncNow = () => {
    setSyncing(true);
    postMsg({ type: 'gitSync:syncNow' });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        title="Git Sync"
        className={`w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${open ? '' : 'hover:opacity-80'}`}
        style={{ backgroundColor: open ? 'color-mix(in srgb, var(--color-settings) 15%, transparent)' : undefined }}
      >
        <GitHubIcon size={16} style={{ color: open ? 'var(--color-settings)' : 'var(--color-text-muted)' }} />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 240 }}
          className="rounded-xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div style={{ backgroundColor: 'var(--vscode-editor-background, #1e1e1e)', border: '1px solid color-mix(in srgb, var(--color-text-primary) 10%, transparent)', borderRadius: 12 }}>
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]">
              <GitHubIcon size={13} style={{ color: 'var(--color-settings)' }} />
              <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">Git Sync</span>
            </div>

            <div className="px-3.5 py-3 flex flex-col gap-2.5">
              <ButtonView
                size="sm"
                variant="primary"
                accentColor="var(--color-settings)"
                iconLeft={<RefreshIcon size={12} />}
                onClick={handleSyncNow}
                disabled={syncing}
                style={{ width: '100%' }}
              >
                {syncing ? 'Syncing…' : 'Sync Now'}
              </ButtonView>

              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)]">Last Synced</span>
                <span className="text-[11px] text-[var(--color-text-secondary)]">
                  {lastSyncedAt ? formatSyncRelativeTime(lastSyncedAt) : 'Never'}
                </span>
                {lastMessage && (
                  <span className="text-[10px] text-[var(--color-text-muted)] leading-snug mt-0.5">{lastMessage}</span>
                )}
              </div>
            </div>

            <div className="px-3.5 py-2.5 border-t border-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]">
              <button
                type="button"
                onClick={() => {
                  useUiStateStore.getState().setPref('settings.section', 'git-sync');
                  useTabsStore.getState().openSettingsTab();
                  setOpen(false);
                }}
                className="text-[11px] cursor-pointer hover:underline"
                style={{ color: 'var(--color-settings)' }}
              >
                Open Git Sync Settings →
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── AI Provider Status Popup ─────────────────────────────────────────────────

const BADGE_STYLE = {
  backgroundColor: 'color-mix(in srgb, var(--color-info) 14%, transparent)',
  color: 'var(--color-info)',
  border: '1px solid color-mix(in srgb, var(--color-info) 28%, transparent)',
};

function AiProviderStatusIcon() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const providers = useAiProvidersStore(s => s.providers);
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);

  const defaultProvider = providers.find(p => p.id === defaultProviderId);
  const defaultModel = defaultProvider?.models.find(m => m.id === defaultModelId);

  const handleOpen = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    // Provisional only — the measured placement happens in the layout effect below.
    setPos({ top: rect.top, left: rect.left - 252 - POPUP_MARGIN });
    setOpen(v => !v);
  };

  // Position from the popup's REAL height, before paint. These rail buttons sit at the very
  // foot of the window, and the previous code clamped against a HARD-CODED height guess —
  // whenever the real content was taller than the guess the popup ran off the bottom of the
  // screen and got cut off. Measuring means it flips/clamps correctly whatever it contains.
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !popupRef.current) return;
    const place = () => {
      const anchor = btnRef.current!.getBoundingClientRect();
      const box = popupRef.current!.getBoundingClientRect();
      setPos({
        top: Math.max(POPUP_MARGIN, Math.min(anchor.top, window.innerHeight - box.height - POPUP_MARGIN)),
        left: Math.max(POPUP_MARGIN, anchor.left - box.width - POPUP_MARGIN),
      });
    };
    place();
    const ro = new ResizeObserver(place);   // content grows once async status arrives
    ro.observe(popupRef.current);
    window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        title="AI Provider Status"
        className={`w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${open ? '' : 'hover:opacity-80'}`}
        style={{ backgroundColor: open ? 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)' : undefined }}
      >
        <SparkleIcon size={16} style={{ color: open ? 'var(--color-protocol-ai)' : 'var(--color-text-muted)' }} />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 252 }}
          className="rounded-xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Dark card background */}
          <div style={{ backgroundColor: 'var(--vscode-editor-background, #1e1e1e)', border: '1px solid color-mix(in srgb, var(--color-text-primary) 10%, transparent)', borderRadius: 12 }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]">
              <SparkleIcon size={13} style={{ color: 'var(--color-protocol-ai)' }} />
              <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">Active AI Provider</span>
            </div>

            {/* Body */}
            <div className="px-3.5 py-3 flex flex-col gap-2.5">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)]">Provider</span>
                <span className="self-start text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md" style={BADGE_STYLE}>
                  {defaultProvider?.name || '—'}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)]">Model</span>
                <span className="self-start text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md" style={BADGE_STYLE}>
                  {defaultModel?.name || defaultModelId || '—'}
                </span>
              </div>

            </div>

            {/* Footer */}
            <div className="px-3.5 py-2.5 border-t border-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]">
              <button
                type="button"
                onClick={() => {
                  useTabsStore.getState().openSettingsTab();
                  setOpen(false);
                }}
                className="text-[11px] cursor-pointer hover:underline"
                style={{ color: 'var(--color-protocol-ai)' }}
              >
                Open LLM Provider Settings →
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SidebarIcon({
  active,
  accentColor,
  onClick,
  title,
  children,
}: {
  active: boolean;
  accentColor: string;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${
        active
          ? ''
          : 'hover:opacity-80'
      }`}
      style={{
        backgroundColor: active ? `color-mix(in srgb, ${accentColor} 15%, transparent)` : undefined,
      }}
    >
      {children}
    </button>
  );
}

function SidebarPanelContent({ section, rtProtocol }: { section: SidebarSection; rtProtocol: string }) {
  switch (section) {
    case 'collections':
      return <CollectionsPanel protocol="rest" />;
    case 'history':
      return <HistoryPanel protocol="rest" />;
    case 'environments':
      return <EnvironmentsPanel />;
    case 'debug':
      return <RunAndDebugPanel />;
    case 'gql-docs':
      return <GraphQLDocumentationPanel />;
    case 'gql-schema':
      return <GraphQLSchemaExplorer />;
    case 'gql-collections':
      return <CollectionsPanel protocol="graphql" />;
    case 'gql-history':
      return <HistoryPanel protocol="graphql" />;
    case 'ws-collections':
      return <CollectionsPanel protocol={rtProtocol} />;
    case 'ws-history':
      return <HistoryPanel protocol={rtProtocol} />;
    case 'grpc-collections':
      return <CollectionsPanel protocol="grpc" />;
    case 'grpc-history':
      return <HistoryPanel protocol="grpc" />;
    case 'soap-collections':
      return <CollectionsPanel protocol="soap" />;
    case 'soap-history':
      return <HistoryPanel protocol="soap" />;
    case 'ai-collections':
      return <CollectionsPanel protocol="ai" />;
    case 'ai-history':
      return <HistoryPanel protocol="ai" />;
    case 'mcp-collections':
      return <CollectionsPanel protocol="mcp" />;
    case 'mcp-history':
      return <HistoryPanel protocol="mcp" />;
    default:
      return null;
  }
}

function PlaceholderPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[var(--color-surface-border)]">
        <h3 className="text-[12px] font-bold text-[var(--color-text-primary)] uppercase tracking-wide">{title}</h3>
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-[11px] text-[var(--color-text-muted)] text-center">{message}</p>
      </div>
    </div>
  );
}
