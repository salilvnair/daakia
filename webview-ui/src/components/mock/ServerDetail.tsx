/**
 * ServerDetail — Thin orchestrator for the mock server detail panel.
 * Delegates protocol-specific config to ./configs/ and Try logic to ./mock-try-handler.
 */
import { useState, useEffect } from 'react';
import { MOCK_PROTOCOL_COLORS, getMockProtocolBg, getMockProtocolLabel } from '../../colors';
import { TrashIcon, CopyIcon, CheckIcon, ExternalLinkIcon } from '../../icons';
import { TabView, TextInputView, MultilineInputView, ButtonView, IconButtonView } from '@salilvnair/dui';
import type { TabItem } from '@salilvnair/dui';
import type { MockServer, MockRoute } from './mock-types';
import { openTryTab } from './mock-try-handler';
import { RestRoutesConfig, GraphQLConfig, WebSocketConfig, SSEConfig, SocketIOConfig, MQTTConfig, GrpcConfig, SoapConfig, AiMockConfig, McpMockConfig } from './configs';
import { postMsg } from '../../vscode';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { useTabsStore } from '../../store/tabs-store';
import { TrafficInspectorPanel } from './wiremock/TrafficInspectorPanel';
import type { MockLogEntry } from './mock-types';
import { ImportPanel } from './wiremock/ImportPanel';
import { ExportPanel } from './wiremock/ExportPanel';
import { ChaosPanel } from './wiremock/ChaosPanel';
import { MockApiCatalog } from './wiremock/MockApiCatalog';
import { SmWorkflowDashboard } from './SmWorkflowDashboard';
import { useSMWorkspaceStore, useSMTabsStore } from '@salilvnair/state-machine';
type ServerTab = 'routes' | 'state' | 'traffic' | 'import' | 'export' | 'chaos' | 'catalog';

// All protocols that get the full WireMock tab bar.
// 'ai' and 'mcp' keep their own standalone layout — they are fundamentally different.
const TABBED_PROTOCOLS = new Set(['rest', 'graphql', 'grpc', 'soap', 'websocket', 'sse', 'socketio', 'mqtt']);

// Label for the first "Config / Routes" tab per protocol
function configTabLabel(protocol: string): string {
  if (protocol === 'rest')      return 'Routes';
  if (protocol === 'graphql')   return 'Schema';
  if (protocol === 'grpc')      return 'Services';
  if (protocol === 'soap')      return 'WSDL';
  if (protocol === 'websocket') return 'Handlers';
  if (protocol === 'sse')       return 'Events';
  if (protocol === 'socketio')  return 'Handlers';
  if (protocol === 'mqtt')      return 'Topics';
  return 'Config';
}

// State Machine tab label — varies by protocol
function stateMachineTabLabel(protocol: string): string {
  if (protocol === 'websocket' || protocol === 'socketio') return 'Flow';
  if (protocol === 'mqtt')    return 'Flow';
  if (protocol === 'sse')     return 'Flow';
  return 'State Machine';
}

// Traffic tab label — varies by protocol
function trafficTabLabel(protocol: string): string {
  if (protocol === 'websocket' || protocol === 'socketio') return 'Messages';
  if (protocol === 'mqtt')   return 'Topics';
  if (protocol === 'sse')    return 'Events';
  return 'Traffic';
}

function serverTabs(protocol: string): { id: ServerTab; label: string }[] {
  return [
    { id: 'routes',  label: configTabLabel(protocol) },
    { id: 'state',   label: stateMachineTabLabel(protocol) },
    { id: 'traffic', label: trafficTabLabel(protocol) },
    { id: 'chaos',   label: '⚡ Chaos' },
    { id: 'import',  label: 'Import' },
    { id: 'export',  label: 'Export' },
    { id: 'catalog', label: '📚 Catalog' },
  ];
}

interface ServerDetailProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
  onToggleRunning: () => void;
  onDelete: () => void;
  onAddRoute: () => void;
  onAddGeneratedRoutes?: (routes: Partial<MockRoute>[]) => void;
  onUpdateRoute: (routeId: string, patch: Partial<MockRoute>) => void;
  onDeleteRoute: (routeId: string) => void;
  editingRoute: string | null;
  onEditRoute: (id: string | null) => void;
  /** Sprint 13.33: live activity logs for the Protocol Traffic Inspector */
  logs?: MockLogEntry[];
}

export function ServerDetail({ server, onUpdate, onToggleRunning, onDelete, onAddRoute, onAddGeneratedRoutes, onUpdateRoute, onDeleteRoute, editingRoute, onEditRoute, logs = [] }: ServerDetailProps) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [wsdlCopied, setWsdlCopied] = useState(false);
  const [serverTab, setServerTab] = useState<ServerTab>('routes');
  const aiScenarioEnabled = useAiFeaturesStore(s => s.isEnabled('aiScenarioManager'));

  // Reset to 'routes' if switching to a non-tabbed protocol
  useEffect(() => {
    if (!TABBED_PROTOCOLS.has(server.protocol ?? '')) {
      setServerTab('routes');
    }
  }, [server.protocol]);

  const serverUrl = server.running && server.port
    ? `${server.protocol === 'websocket' || server.protocol === 'socketio' || server.protocol === 'mqtt' ? 'ws' : 'http'}://localhost:${server.port}${server.protocol === 'graphql' ? '/graphql' : server.protocol === 'socketio' ? '/socket.io/' : server.protocol === 'ai' ? '/v1' : server.protocol === 'mcp' ? '/mcp' : ''}`
    : '';

  const hasOAuthRoute = server.routes?.some(r => r.path?.includes('/oauth/authorize'));

  const copyUrl = () => {
    if (!serverUrl) return;
    navigator.clipboard.writeText(serverUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 1500);
  };

  const handleTry = () => openTryTab(server, serverUrl);

  const handleOpenSSO = () => {
    if (!server.running || !server.port) return;
    const ssoUrl = `http://localhost:${server.port}/oauth/authorize?client_id=my-app&redirect_uri=http://localhost:3000/callback&response_type=code&state=xyz123`;
    postMsg({ type: 'openExternalUrl', url: ssoUrl });
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Protocol badge */}
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider"
          style={{ color: MOCK_PROTOCOL_COLORS[server.protocol || 'rest'], backgroundColor: getMockProtocolBg(server.protocol || 'rest') }}
        >
          {getMockProtocolLabel(server.protocol || 'rest')} Mock
        </span>
      </div>

      {/* Server header */}
      <div className="flex items-center gap-2 -mt-2">
        <TextInputView
          value={server.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Server name"
          size="lg"
          className="min-w-0 flex-1 font-semibold"
          accentColor="var(--color-accent)"
        />
        <ButtonView
          variant={server.running ? 'danger' : 'primary'}
          size="lg"
          onClick={onToggleRunning}
          accentColor={server.running ? 'var(--color-error)' : MOCK_PROTOCOL_COLORS[server.protocol || 'rest']}
        >
          {server.running ? '⏹ Stop' : '▶ Start'}
        </ButtonView>
        <ButtonView
          variant="secondary"
          size="lg"
          disabled={!server.running}
          onClick={handleTry}
          iconLeft={<ExternalLinkIcon size={12} />}
          accentColor="var(--color-try-button)"
        >
          Try
        </ButtonView>
        {hasOAuthRoute && (
          <ButtonView
            variant="secondary"
            size="lg"
            disabled={!server.running}
            onClick={handleOpenSSO}
            iconLeft={<ExternalLinkIcon size={12} />}
            accentColor="var(--color-warning)"
          >
            SSO UI
          </ButtonView>
        )}
        <IconButtonView
          icon={<TrashIcon size={14} />}
          size="lg"
          onClick={onDelete}
          tooltip="Delete server"
          accentColor="var(--color-error)"
        />
      </div>

      {/* URL / Status + Copy */}
      <div className="flex flex-col gap-0.5 px-1 -mt-2">
        <div className="flex items-center gap-1.5">
          {server.running && server.port ? (
            <>
              <span className="text-[11px] font-mono text-[var(--color-success)]">{serverUrl}</span>
              <IconButtonView
                icon={urlCopied ? <CheckIcon size={11} className="text-[var(--color-success)]" /> : <CopyIcon size={11} />}
                size="default"
                onClick={copyUrl}
                tooltip="Copy URL"
              />
            </>
          ) : (
            <span className="text-[11px] font-mono text-[var(--color-text-muted)]">Not running</span>
          )}
        </div>
        {server.running && server.port && server.protocol === 'soap' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">WSDL: {serverUrl}?wsdl</span>
            <IconButtonView
              icon={wsdlCopied ? <CheckIcon size={10} className="text-[var(--color-success)]" /> : <CopyIcon size={10} />}
              size="default"
              onClick={() => { navigator.clipboard.writeText(`${serverUrl}?wsdl`); setWsdlCopied(true); setTimeout(() => setWsdlCopied(false), 1500); }}
              tooltip="Copy WSDL URL"
            />
          </div>
        )}
      </div>

      {/* Description — multiline textarea so users can paste full context (user stories, JSON structures, etc.) for AI generation */}
      <MultilineInputView
        value={server.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        placeholder="Description (optional) — paste user stories, JSON request/response examples, or any context to guide AI route generation"
        rows={3}
        size="md"
      />

      {/* ── Tab bar — shown for all tabbed protocols ─────────────────────── */}
      {TABBED_PROTOCOLS.has(server.protocol ?? '') && (
        <div className="flex items-center -mx-4 px-4 pt-0 pb-0 border-b border-[var(--color-surface-border)] overflow-x-auto">
          <TabView
            tabs={serverTabs(server.protocol ?? 'rest') as TabItem[]}
            activeTab={serverTab}
            onChange={(id) => {
              setServerTab(id as ServerTab);
            }}
            variant="underline"
            size="sm"
            accentColor="var(--color-mock-server)"
          />
        </div>
      )}

      {/* ── Protocol config tab ──────────────────────────────────────────── */}
      {TABBED_PROTOCOLS.has(server.protocol ?? '') && serverTab === 'routes' && (
        <ProtocolConfig
          server={server}
          onUpdate={onUpdate}
          onAddRoute={onAddRoute}
          onAddGeneratedRoutes={onAddGeneratedRoutes}
          onUpdateRoute={onUpdateRoute}
          onDeleteRoute={onDeleteRoute}
          editingRoute={editingRoute}
          onEditRoute={onEditRoute}
        />
      )}

      {/* ── State Machine workflow dashboard ─────────────────────────────── */}
      {TABBED_PROTOCOLS.has(server.protocol ?? '') && serverTab === 'state' && (
        <SmWorkflowDashboard
          server={server}
          onOpenEditor={(workflowId) => {
            useTabsStore.getState().openStateMachineTab(server.id)
            if (workflowId) {
              const machine = useSMWorkspaceStore.getState().machines.find((m) => m.id === workflowId)
              if (machine) {
                useSMTabsStore.getState().openWorkflowTab(machine.id, machine.name, machine.color)
              }
            }
          }}
          onConnectNew={() => {
            useTabsStore.getState().openStateMachineTab(server.id)
            const ws = useSMWorkspaceStore.getState()
            const machine = ws.createMachine('Untitled Workflow')
            useSMTabsStore.getState().openWorkflowTab(machine.id, machine.name, machine.color)
            // Signal the SM workspace to open its right SideNav (Workflows panel)
            ws.requestSideNavOpen()
          }}
          onUnlink={() => onUpdate({ stateMachine: undefined, connectedWorkflowId: undefined, connectedWorkflows: [] })}
          onUnlinkWorkflow={(workflowId) => {
            const existing = server.connectedWorkflows ?? []
            const updated = existing.filter(w => w.workflowId !== workflowId)
            const wasLegacy = server.connectedWorkflowId === workflowId
            onUpdate({
              connectedWorkflows: updated,
              ...(wasLegacy ? { stateMachine: undefined, connectedWorkflowId: undefined } : {}),
            })
            postMsg({
              type: 'mockServer:patchStateMachine',
              serverId: server.id,
              connectedWorkflows: updated,
              ...(wasLegacy ? { stateMachine: null, connectedWorkflowId: null } : {}),
            })
          }}
        />
      )}

      {TABBED_PROTOCOLS.has(server.protocol ?? '') && serverTab === 'traffic' && (
        <TrafficInspectorPanel
          server={server}
          onUpdate={onUpdate}
          logs={logs}
          onClearTraffic={() => onUpdate({ recordedTraffic: [] })}
          onImportRecorded={reqs => {
            const newRoutes: MockRoute[] = reqs.map(r => ({
              id: crypto.randomUUID(),
              method: r.method as MockRoute['method'],
              path: r.path,
              statusCode: r.responseStatus,
              headers: r.responseHeaders,
              body: r.responseBody,
              delay: 0,
              enabled: true,
            }));
            onUpdate({ routes: [...(server.routes ?? []), ...newRoutes] });
          }}
        />
      )}

      {/* Import — protocol-aware */}
      {TABBED_PROTOCOLS.has(server.protocol ?? '') && serverTab === 'import' && (
        <ImportPanel
          protocol={server.protocol}
          onImport={(routes, raw) => {
            if (routes.length > 0) onUpdate({ routes: [...(server.routes ?? []), ...routes] });
            // raw (SDL / .proto / WSDL / event JSON) stored in server description as reference
            if (raw) onUpdate({ description: (server.description ? server.description + '\n\n' : '') + raw });
          }}
        />
      )}

      {/* Export — protocol-aware */}
      {TABBED_PROTOCOLS.has(server.protocol ?? '') && serverTab === 'export' && (
        <ExportPanel
          protocol={server.protocol}
          server={server}
          onExport={format => postMsg({ type: 'exportMockServer', serverId: server.id, format })}
        />
      )}

      {/* Chaos — protocol-aware fault options */}
      {TABBED_PROTOCOLS.has(server.protocol ?? '') && serverTab === 'chaos' && (
        <ChaosPanel server={server} onUpdate={onUpdate} protocol={server.protocol ?? 'rest'} />
      )}

      {/* Catalog — protocol-aware */}
      {TABBED_PROTOCOLS.has(server.protocol ?? '') && serverTab === 'catalog' && (
        <MockApiCatalog
          protocol={server.protocol}
          onAddRoutes={(routes, raw) => {
            if (routes.length > 0) onUpdate({ routes: [...(server.routes ?? []), ...routes] });
            if (raw) onUpdate({ description: (server.description ? server.description + '\n\n' : '') + raw });
          }}
        />
      )}

      {/* ── Non-tabbed protocols (AI / MCP keep their own standalone layout) */}
      {server.protocol === 'ai' && aiScenarioEnabled && (
        <AiMockConfig server={server} onUpdate={onUpdate} />
      )}

      {server.protocol === 'mcp' && (
        <McpMockConfig server={server} onUpdate={onUpdate} />
      )}
    </div>
  );
}

// ─── ProtocolConfig — routes/config tab content per protocol ──────────────────

interface ProtocolConfigProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
  onAddRoute: () => void;
  onAddGeneratedRoutes?: (routes: Partial<MockRoute>[]) => void;
  onUpdateRoute: (routeId: string, patch: Partial<MockRoute>) => void;
  onDeleteRoute: (routeId: string) => void;
  editingRoute: string | null;
  onEditRoute: (id: string | null) => void;
}

function ProtocolConfig({ server, onUpdate, onAddRoute, onAddGeneratedRoutes, onUpdateRoute, onDeleteRoute, editingRoute, onEditRoute }: ProtocolConfigProps) {
  const p = server.protocol ?? 'rest';

  if (p === 'rest') {
    return (
      <RestRoutesConfig
        server={server}
        onUpdate={onUpdate}
        onAddRoute={onAddRoute}
        onAddGeneratedRoutes={onAddGeneratedRoutes}
        onUpdateRoute={onUpdateRoute}
        onDeleteRoute={onDeleteRoute}
        editingRoute={editingRoute}
        onEditRoute={onEditRoute}
      />
    );
  }
  if (p === 'graphql') return <GraphQLConfig server={server} onUpdate={onUpdate} />;
  if (p === 'grpc')    return <GrpcConfig    server={server} onUpdate={onUpdate} />;
  if (p === 'soap')    return <SoapConfig    server={server} onUpdate={onUpdate} />;
  if (p === 'websocket') return <WebSocketConfig server={server} onUpdate={onUpdate} />;
  if (p === 'sse')       return <SSEConfig      server={server} onUpdate={onUpdate} />;
  if (p === 'socketio')  return <SocketIOConfig  server={server} onUpdate={onUpdate} />;
  if (p === 'mqtt')      return <MQTTConfig      server={server} onUpdate={onUpdate} />;
  return null;
}
