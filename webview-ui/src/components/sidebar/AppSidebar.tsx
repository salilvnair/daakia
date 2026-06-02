import { CollectionsPanel } from '../rest/sidebar/CollectionsPanel';
import { HistoryPanel } from '../rest/sidebar/HistoryPanel';
import { EnvironmentsPanel } from '../rest/sidebar/EnvironmentsPanel';
import { GraphQLDocumentationPanel, GraphQLSchemaPanel } from '../graphql';
import { RunAndDebugPanel } from '../shared/debugger';
import { CollectionsFolderIcon, ClockIcon, LayersIcon, SettingsIcon, DocumentIcon, CodeIcon, BugIcon, GrpcIcon, SoapIcon } from '../../icons';
import { useTabsStore } from '../../store/tabs-store';
import { useDebugStore } from '../../store/debug-store';
import { useEffect } from 'react';

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
  const showRestSidebar = !isMockServer && (activeProtocol === 'rest' || activeTab?.type === 'settings');
  const showGraphqlSidebar = !isMockServer && activeProtocol === 'graphql';
  const showWebsocketSidebar = !isMockServer && activeProtocol === 'websocket';
  const showGrpcSidebar = !isMockServer && activeProtocol === 'grpc';
  const showSoapSidebar = !isMockServer && activeProtocol === 'soap';
  const showAiSidebar = !isMockServer && activeProtocol === 'ai';
  const showMcpSidebar = !isMockServer && activeProtocol === 'mcp';

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
