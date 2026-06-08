/**
 * ServerDetail — Thin orchestrator for the mock server detail panel.
 * Delegates protocol-specific config to ./configs/ and Try logic to ./mock-try-handler.
 */
import { useState } from 'react';
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
import type { MockRoute } from './mock-types';

type ServerTab = 'routes' | 'state' | 'traffic' | 'import' | 'export' | 'chaos' | 'catalog';

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

      {/* WireMock server-level tab bar (REST only) */}
      {server.protocol === 'rest' && (
        <div className="flex items-center gap-0 border-b border-[rgba(255,255,255,0.07)] -mx-4 px-4 flex-wrap">
          {([
            { id: 'routes',  label: 'Routes' },
            { id: 'state',   label: 'State Machine' },
            { id: 'traffic', label: 'Traffic' },
            { id: 'import',  label: 'Import' },
            { id: 'export',  label: 'Export' },
            { id: 'chaos',   label: '⚡ Chaos' },
            { id: 'catalog', label: '📚 Catalog' },
          ] as { id: ServerTab; label: string }[]).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setServerTab(t.id)}
              className="h-[30px] px-3 text-[10px] font-medium cursor-pointer transition-colors flex-shrink-0"
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

      {/* Protocol-specific content */}
      {server.protocol === 'rest' && serverTab === 'routes' && (
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
      )}

      {server.protocol === 'rest' && serverTab === 'state' && (
        <StateMachineEditor
          config={server.stateMachine}
          onUpdate={cfg => onUpdate({ stateMachine: cfg })}
        />
      )}

      {server.protocol === 'rest' && serverTab === 'traffic' && (
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

      {server.protocol === 'rest' && serverTab === 'import' && (
        <ImportPanel
          onImport={routes => onUpdate({ routes: [...(server.routes ?? []), ...routes] })}
        />
      )}

      {server.protocol === 'rest' && serverTab === 'export' && (
        <ExportPanel
          server={server}
          onExport={format => {
            postMsg({ type: 'exportMockServer', serverId: server.id, format });
          }}
        />
      )}

      {server.protocol === 'rest' && serverTab === 'chaos' && (
        <ChaosPanel server={server} onUpdate={onUpdate} />
      )}

      {server.protocol === 'rest' && serverTab === 'catalog' && (
        <MockApiCatalog
          onAddRoutes={routes => onUpdate({ routes: [...(server.routes ?? []), ...routes] })}
        />
      )}

      {server.protocol === 'graphql' && (
        <GraphQLConfig server={server} onUpdate={onUpdate} />
      )}

      {server.protocol === 'websocket' && (
        <WebSocketConfig server={server} onUpdate={onUpdate} />
      )}

      {server.protocol === 'sse' && (
        <SSEConfig server={server} onUpdate={onUpdate} />
      )}

      {server.protocol === 'socketio' && (
        <SocketIOConfig server={server} onUpdate={onUpdate} />
      )}

      {server.protocol === 'mqtt' && (
        <MQTTConfig server={server} onUpdate={onUpdate} />
      )}

      {server.protocol === 'grpc' && (
        <GrpcConfig server={server} onUpdate={onUpdate} />
      )}

      {server.protocol === 'soap' && (
        <SoapConfig server={server} onUpdate={onUpdate} />
      )}

      {server.protocol === 'ai' && (
        <AiMockConfig server={server} onUpdate={onUpdate} />
      )}

      {server.protocol === 'mcp' && (
        <McpMockConfig server={server} onUpdate={onUpdate} />
      )}
    </div>
  );
}
