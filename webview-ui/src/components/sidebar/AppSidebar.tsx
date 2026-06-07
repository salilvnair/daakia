import { CollectionsPanel } from '../rest/sidebar/CollectionsPanel';
import { HistoryPanel } from '../rest/sidebar/HistoryPanel';
import { EnvironmentsPanel } from '../rest/sidebar/EnvironmentsPanel';
import { GraphQLDocumentationPanel, GraphQLSchemaPanel } from '../graphql';
import { RunAndDebugPanel } from '../shared/debugger';
import { CollectionsFolderIcon, ClockIcon, LayersIcon, SettingsIcon, DocumentIcon, CodeIcon, BugIcon, GrpcIcon, SoapIcon, SparkleIcon, GeneralAssistantIcon } from '../../icons';
import { useTabsStore } from '../../store/tabs-store';
import { useDebugStore } from '../../store/debug-store';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type SidebarSection = 'collections' | 'history' | 'environments' | 'debug' | 'gql-docs' | 'gql-schema' | 'gql-collections' | 'gql-history' | 'ws-collections' | 'ws-history' | 'grpc-collections' | 'grpc-history' | 'soap-collections' | 'soap-history' | 'ai-collections' | 'ai-history' | 'mcp-collections' | 'mcp-history' | null;

interface AppSidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  sidebarOpen: boolean;
  sidebarWidth: number;
  sidebarDragging: boolean;
}

export function AppSidebar({ activeSection, onSectionChange, sidebarOpen, sidebarWidth, sidebarDragging }: AppSidebarProps) {
  const toggle = (section: SidebarSection) => {
    onSectionChange(activeSection === section ? null : section);
  };

  const { tabs, activeTabId, activeProtocol } = useTabsStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const settingsOpen = tabs.some(t => t.type === 'settings');
  const settingsActive = activeTab?.type === 'settings';

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
  const isDaakiaAi = activeTab?.type === 'daakia-ai';
  // Never show protocol icons when settings, mock-server, or daakia-ai tab is active — they have their own full-panel UI
  const showProtocolIcons = !settingsActive && !isMockServer && !isDaakiaAi;
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
      {/* Expandable panel — keep mounted, control visibility via width */}
      <div
        className="bg-[var(--color-surface)] flex flex-col overflow-hidden"
        style={{
          width: showPanel && sidebarOpen ? sidebarWidth : 0,
          transition: sidebarDragging ? 'none' : 'width 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {showPanel && <SidebarPanelContent section={activeSection} />}
      </div>

      {/* Icon rail */}
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

        {/* Daakia AI — chat tab shortcut */}
        <DaakiaAiButton />

        {/* AI Provider Status — above settings */}
        <AiProviderStatusIcon />

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

  return (
    <button
      type="button"
      onClick={() => useTabsStore.getState().openDaakiaAiTab()}
      title="Daakia AI"
      className="w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer transition-colors hover:opacity-80"
      style={{
        backgroundColor: isDaakiaAiActive
          ? 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)'
          : isDaakiaAiOpen
            ? 'color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)'
            : undefined,
      }}
    >
      <GeneralAssistantIcon
        size={16}
        style={{ color: isDaakiaAiActive || isDaakiaAiOpen ? 'var(--color-protocol-ai)' : 'var(--color-text-muted)' }}
      />
    </button>
  );
}

// ─── AI Provider Status Popup ─────────────────────────────────────────────────

const BADGE_STYLE = {
  backgroundColor: 'rgba(59,130,246,0.14)',
  color: '#60a5fa',
  border: '1px solid rgba(59,130,246,0.28)',
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
    const popupW = 252;
    const popupH = 175; // estimated popup height
    const MARGIN = 8;
    // Clamp top so popup stays in viewport — align to button top, but shift up if it would overflow
    const rawTop = rect.top;
    const clampedTop = Math.min(rawTop, window.innerHeight - popupH - MARGIN);
    setPos({ top: Math.max(MARGIN, clampedTop), left: rect.left - popupW - MARGIN });
    setOpen(v => !v);
  };

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
          <div style={{ backgroundColor: 'var(--vscode-editor-background, #1e1e1e)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[rgba(255,255,255,0.07)]">
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
            <div className="px-3.5 py-2.5 border-t border-[rgba(255,255,255,0.07)]">
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

function SidebarPanelContent({ section }: { section: SidebarSection }) {
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
      return <GraphQLSchemaPanel />;
    case 'gql-collections':
      return <CollectionsPanel protocol="graphql" />;
    case 'gql-history':
      return <HistoryPanel protocol="graphql" />;
    case 'ws-collections':
      return <CollectionsPanel protocol="websocket" />;
    case 'ws-history':
      return <HistoryPanel protocol="websocket" />;
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
