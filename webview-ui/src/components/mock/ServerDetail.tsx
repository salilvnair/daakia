/**
 * ServerDetail — Thin orchestrator for the mock server detail panel.
 * Delegates protocol-specific config to ./configs/ and Try logic to ./mock-try-handler.
 */
import { useState, useEffect } from 'react';
import { MOCK_PROTOCOL_COLORS, getMockProtocolBg, getMockProtocolLabel } from '../../colors';
import { TrashIcon, CopyIcon, CheckIcon, ExternalLinkIcon } from '../../icons';
import type { MockServer, MockRoute } from './mock-types';
import { openTryTab } from './mock-try-handler';
import { RestRoutesConfig, GraphQLConfig, WebSocketConfig, SSEConfig, SocketIOConfig, MQTTConfig, GrpcConfig, SoapConfig, AiMockConfig, McpMockConfig } from './configs';
import { postMsg } from '../../vscode';
import { StateMachineEditor } from './wiremock/StateMachinePanel';
import { TrafficInspectorPanel } from './wiremock/TrafficInspectorPanel';
import { ImportPanel } from './wiremock/ImportPanel';
import { ExportPanel } from './wiremock/ExportPanel';
import { ChaosPanel } from './wiremock/ChaosPanel';
import { MockApiCatalog } from './wiremock/MockApiCatalog';
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
  return 'Config'; // websocket / sse / socketio / mqtt
}

// All tabbed protocols now get all 7 tabs — Import/Export/Catalog are protocol-aware.
function serverTabs(protocol: string): { id: ServerTab; label: string }[] {
  return [
    { id: 'routes',  label: configTabLabel(protocol) },
    { id: 'state',   label: 'State Machine' },
    { id: 'traffic', label: 'Traffic' },
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
}

export function ServerDetail({ server, onUpdate, onToggleRunning, onDelete, onAddRoute, onAddGeneratedRoutes, onUpdateRoute, onDeleteRoute, editingRoute, onEditRoute }: ServerDetailProps) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [wsdlCopied, setWsdlCopied] = useState(false);
  const [serverTab, setServerTab] = useState<ServerTab>('routes');

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
        <input
          type="text"
          value={server.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Server name"
          className="min-w-0 flex-1 h-[32px] px-3 text-[14px] font-semibold rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="button"
          onClick={onToggleRunning}
          className={`h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer transition-colors flex-shrink-0 ${
            server.running
              ? 'bg-[rgba(239,68,68,0.12)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.2)]'
              : 'bg-[rgba(34,197,94,0.12)] text-[var(--color-success)] hover:bg-[rgba(34,197,94,0.2)]'
          }`}
        >
          {server.running ? '⏹ Stop' : '▶ Start'}
        </button>
        <button
          type="button"
          onClick={handleTry}
          disabled={!server.running}
          className="h-[32px] px-3.5 text-[12px] font-medium rounded-md cursor-pointer transition-colors flex-shrink-0 flex items-center gap-1.5 bg-[rgba(99,102,241,0.12)] text-[var(--color-try-button)] hover:bg-[rgba(99,102,241,0.2)] disabled:opacity-40 disabled:cursor-not-allowed"
          title="Open a new tab to test this mock server"
        >
          <ExternalLinkIcon size={12} />
          Try
        </button>
        {hasOAuthRoute && (
          <button
            type="button"
            onClick={handleOpenSSO}
            disabled={!server.running}
            className="h-[32px] px-3.5 text-[12px] font-medium rounded-md cursor-pointer transition-colors flex-shrink-0 flex items-center gap-1.5 bg-[rgba(251,146,60,0.12)] text-[var(--color-warning)] hover:bg-[rgba(251,146,60,0.2)] disabled:opacity-40 disabled:cursor-not-allowed"
            title="Open OAuth SSO login page in browser"
          >
            <ExternalLinkIcon size={12} />
            SSO UI
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="h-[32px] w-[32px] flex items-center justify-center flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-colors rounded-md hover:bg-[rgba(239,68,68,0.08)]"
          title="Delete server"
        >
          <TrashIcon size={14} />
        </button>
      </div>

      {/* URL / Status + Copy */}
      <div className="flex flex-col gap-0.5 px-1 -mt-2">
        <div className="flex items-center gap-1.5">
          {server.running && server.port ? (
            <>
              <span className="text-[11px] font-mono text-[var(--color-success)]">{serverUrl}</span>
              <button
                type="button"
                onClick={copyUrl}
                className="w-4 h-4 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
                title="Copy URL"
              >
                {urlCopied ? <CheckIcon size={11} className="text-[var(--color-success)]" /> : <CopyIcon size={11} />}
              </button>
            </>
          ) : (
            <span className="text-[11px] font-mono text-[var(--color-text-muted)]">Not running</span>
          )}
        </div>
        {server.running && server.port && server.protocol === 'soap' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-[var(--color-text-muted)]">WSDL: {serverUrl}?wsdl</span>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(`${serverUrl}?wsdl`); setWsdlCopied(true); setTimeout(() => setWsdlCopied(false), 1500); }}
              className="w-4 h-4 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
              title="Copy WSDL URL"
            >
              {wsdlCopied ? <CheckIcon size={10} className="text-[var(--color-success)]" /> : <CopyIcon size={10} />}
            </button>
          </div>
        )}
      </div>

      {/* Description — multiline textarea so users can paste full context (user stories, JSON structures, etc.) for AI generation */}
      <textarea
        value={server.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        placeholder="Description (optional) — paste user stories, JSON request/response examples, or any context to guide AI route generation"
        rows={3}
        className="w-full px-2.5 py-2 text-[12px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] resize-y leading-relaxed min-h-[60px]"
        style={{ fontFamily: 'inherit' }}
      />

      {/* ── Tab bar — shown for all tabbed protocols ─────────────────────── */}
      {TABBED_PROTOCOLS.has(server.protocol ?? '') && (
        <div className="flex items-center gap-0 border-b border-[rgba(255,255,255,0.07)] -mx-4 px-4 overflow-x-auto">
          {serverTabs(server.protocol ?? 'rest').map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setServerTab(t.id)}
              className="h-[30px] px-3 text-[10px] font-medium cursor-pointer transition-colors flex-shrink-0 whitespace-nowrap"
              style={{
                borderBottom: serverTab === t.id ? '2px solid var(--color-mock-server)' : '2px solid transparent',
                color: serverTab === t.id ? 'var(--color-mock-server)' : 'var(--color-text-muted)',
                marginBottom: '-1px',
              }}
            >
              {t.label}
            </button>
          ))}
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

      {/* ── Shared WireMock tabs (all tabbed protocols) ──────────────────── */}
      {TABBED_PROTOCOLS.has(server.protocol ?? '') && serverTab === 'state' && (
        <StateMachineEditor
          config={server.stateMachine}
          onUpdate={cfg => onUpdate({ stateMachine: cfg })}
        />
      )}

      {TABBED_PROTOCOLS.has(server.protocol ?? '') && serverTab === 'traffic' && (
        <TrafficInspectorPanel
          server={server}
          onUpdate={onUpdate}
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

      {/* Chaos — universal */}
      {TABBED_PROTOCOLS.has(server.protocol ?? '') && serverTab === 'chaos' && (
        <ChaosPanel server={server} onUpdate={onUpdate} />
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
      {server.protocol === 'ai' && (
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
