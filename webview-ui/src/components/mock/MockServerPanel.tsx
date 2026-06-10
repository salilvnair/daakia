/**
 * MockServerPanel — orchestrator that composes ServerList + ServerDetail + MockLogPanel.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { ConfirmDialog, StyledDropdown } from '../shared';
import { postMsg } from '../../vscode';
import { useUiStateStore } from '../../store/ui-state-store';
import { useMockStore } from '../../store/mock-store';
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut';
import { MOCK_PROTOCOL_COLORS, getMockProtocolBg, getMockProtocolLabel } from '../../colors';
import { ServerIcon, WebSocketIcon, SSEIcon, SocketIOIcon, MQTTIcon, ProtocolRestBadge, ProtocolGraphQLBadge, ProtocolGrpcBadge, ProtocolSoapBadge, ProtocolAiBadge, ProtocolMcpBadge } from '../../icons';
import { logUiEvent } from '../../store/ui-audit-store';
import { ServerList } from './ServerList';
import { ServerDetail } from './ServerDetail';
import { MockLogPanel } from './MockLogPanel';
import type { MockServer, MockRoute, MockServerProtocol } from './mock-types';
import { createDefaultRoute, createDefaultServer, createOAuthSampleServer, createCrudSampleServer } from './mock-types';

export { type MockServer, type MockRoute } from './mock-types';

// ────────── Mock Server Panel ──────────

export function MockServerPanel() {
  // Initialize from store cache to prevent flicker on remount
  const cachedServers = useMockStore(s => s.servers);
  const serversLoaded = useMockStore(s => s.serversLoaded);
  const [servers, setServersLocal] = useState<MockServer[]>(cachedServers);
  const storedActiveServer = useUiStateStore(s => s.prefs['mock.activeServerId']);
  const storedEditingRoute = useUiStateStore(s => s.prefs['mock.editingRouteId']);
  const [activeServerId, setActiveServerIdLocal] = useState<string | null>(storedActiveServer || null);
  const [editingRoute, setEditingRouteLocal] = useState<string | null>(storedEditingRoute || null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerProtocol, setNewServerProtocol] = useState<MockServerProtocol>('rest');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; running: boolean; port: number | null } | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const logs = useMockStore(s => s.logs);
  const storedMockSplit = useUiStateStore(s => s.panelHeights['split.mock.activity']);
  const storedLogMinimized = useUiStateStore(s => s.panelHeights['mock.log.minimized']);
  const [splitPercent, setSplitPercent] = useState(storedMockSplit ?? 60);
  const [isDragging, setIsDragging] = useState(false);
  const [logMinimized, setLogMinimized] = useState(storedLogMinimized === 1);
  const splitRef = useRef<HTMLDivElement>(null);
  const serversRef = useRef(servers);
  serversRef.current = servers;

  // Wrapper that updates both local state and Zustand cache
  const setServers: React.Dispatch<React.SetStateAction<MockServer[]>> = useCallback((action) => {
    setServersLocal(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      useMockStore.getState().setServers(next);
      return next;
    });
  }, []);

  const setActiveServerId = (id: string | null) => {
    setActiveServerIdLocal(id);
    useUiStateStore.getState().setPref('mock.activeServerId', id || '');
  };

  const setEditingRoute = (id: string | null) => {
    setEditingRouteLocal(id);
    useUiStateStore.getState().setPref('mock.editingRouteId', id || '');
  };

  const activeServer = servers.find(s => s.id === activeServerId) || null;

  // Listen for messages from extension host
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let loaded = false;

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case 'mockServersInit': {
          loaded = true;
          if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
          const restored: MockServer[] = (msg.configs || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            description: c.description || '',
            protocol: c.protocol || 'rest',
            port: null,
            routes: c.routes || [],
            graphqlSchema: c.graphqlSchema || '',
            graphqlOperations: c.graphqlOperations || [],
            wsHandlers: c.wsHandlers || [],
            sseEvents: c.sseEvents || [],
            socketioHandlers: c.socketioHandlers || [],
            mqttTopics: c.mqttTopics || [],
            grpcMethods: c.grpcMethods || [],
            grpcProtoFile: c.grpcProtoFile || '',
            soapOperations: c.soapOperations || [],
            aiScenarios: c.aiScenarios || [],
            mcpTools: c.mcpTools || [],
            running: false,
            createdAt: c.createdAt || Date.now(),
          }));
          if (msg.running) {
            for (const r of msg.running) {
              const s = restored.find(x => x.id === r.id);
              if (s) { s.running = true; s.port = r.port; }
            }
          }
          setServers(restored);
          // Restore persisted active server if still valid, otherwise default to first
          const persisted = useUiStateStore.getState().getPref('mock.activeServerId');
          const validId = persisted && restored.some(s => s.id === persisted) ? persisted : (restored[0]?.id ?? null);
          setActiveServerIdLocal(validId);
          break;
        }
        case 'mockServer:started': {
          setServers(prev => prev.map(s => s.id === msg.id ? { ...s, running: true, port: msg.port } : s));
          break;
        }
        case 'mockServer:stopped': {
          setServers(prev => prev.map(s => s.id === msg.id ? { ...s, running: false, port: null } : s));
          break;
        }
        case 'mockServer:error': {
          setServers(prev => prev.map(s => s.id === msg.id ? { ...s, running: false } : s));
          break;
        }
      }
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'mockServer:getAll' });
    retryTimer = setTimeout(() => { if (!loaded) postMsg({ type: 'mockServer:getAll' }); }, 300);
    return () => {
      window.removeEventListener('message', handler);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  // Persist to extension on changes (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistConfigs = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      postMsg({
        type: 'mockServer:saveAll',
        configs: serversRef.current.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          protocol: s.protocol,
          routes: s.routes,
          graphqlSchema: s.graphqlSchema,
          graphqlOperations: s.graphqlOperations,
          wsHandlers: s.wsHandlers,
          sseEvents: s.sseEvents,
          socketioHandlers: s.socketioHandlers,
          mqttTopics: s.mqttTopics,
          grpcMethods: s.grpcMethods,
          grpcProtoFile: s.grpcProtoFile,
          soapOperations: s.soapOperations,
          aiScenarios: s.aiScenarios,
          mcpTools: s.mcpTools,
        })),
      });
    }, 500);
  }, []);

  const addServer = useCallback(() => {
    const name = newServerName.trim() || 'Untitled Mock Server';
    const server = createDefaultServer(name, newServerProtocol);
    setServers(prev => [...prev, server]);
    setActiveServerId(server.id);
    setShowNewDialog(false);
    setNewServerName('');
    setNewServerProtocol('rest');
    setTimeout(persistConfigs, 10);
  }, [newServerName, newServerProtocol, persistConfigs]);

  const addOAuthSample = useCallback(() => {
    const server = createOAuthSampleServer();
    setServers(prev => [...prev, server]);
    setActiveServerId(server.id);
    setShowNewDialog(false);
    setNewServerName('');
    setNewServerProtocol('rest');
    setTimeout(persistConfigs, 10);
  }, [persistConfigs]);

  const addCrudSample = useCallback(() => {
    const server = createCrudSampleServer();
    setServers(prev => [...prev, server]);
    setActiveServerId(server.id);
    setShowNewDialog(false);
    setNewServerName('');
    setNewServerProtocol('rest');
    setTimeout(persistConfigs, 10);
  }, [persistConfigs]);

  const deleteServer = useCallback((id: string) => {
    const s = serversRef.current.find(x => x.id === id);
    if (s?.running) postMsg({ type: 'mockServer:stop', id });
    setServers(prev => prev.filter(x => x.id !== id));
    if (activeServerId === id) setActiveServerId(null);
    setTimeout(persistConfigs, 10);
  }, [activeServerId, persistConfigs]);

  const deleteAllServers = useCallback(() => {
    serversRef.current.forEach(s => { if (s.running) postMsg({ type: 'mockServer:stop', id: s.id }); });
    setServers([]);
    setActiveServerId(null);
    setDeleteAllConfirm(false);
    setTimeout(persistConfigs, 10);
  }, [persistConfigs]);

  const updateServer = useCallback((id: string, patch: Partial<MockServer>) => {
    setServers(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    persistConfigs();
    // Hot-update running SOAP/gRPC servers
    const server = serversRef.current.find(s => s.id === id);
    if (server?.running) {
      setTimeout(() => {
        const updated = serversRef.current.find(s => s.id === id);
        if (!updated) return;
        if (updated.protocol === 'soap' && patch.soapOperations !== undefined) {
          postMsg({ type: 'mockServer:updateSoapOps', id, operations: updated.soapOperations || [] });
        }
        if (updated.protocol === 'grpc' && patch.grpcMethods !== undefined) {
          postMsg({ type: 'mockServer:updateGrpcMethods', id, methods: updated.grpcMethods || [] });
        }
      }, 50);
    }
  }, [persistConfigs]);

  const toggleRunning = useCallback((id: string) => {
    const server = serversRef.current.find(s => s.id === id);
    if (!server) return;
    if (server.running) {
      logUiEvent('mock.stop', { serverId: id, serverName: server.name });
      postMsg({ type: 'mockServer:stop', id });
    } else {
      logUiEvent('mock.start', { serverId: id, serverName: server.name });
      postMsg({
        type: 'mockServer:start',
        config: {
          id: server.id, name: server.name, description: server.description,
          protocol: server.protocol, routes: server.routes,
          graphqlSchema: server.graphqlSchema, graphqlOperations: server.graphqlOperations,
          wsHandlers: server.wsHandlers, sseEvents: server.sseEvents,
          socketioHandlers: server.socketioHandlers, mqttTopics: server.mqttTopics,
          grpcMethods: server.grpcMethods, grpcProtoFile: server.grpcProtoFile,
          soapOperations: server.soapOperations,
          aiScenarios: server.aiScenarios,
          mcpTools: server.mcpTools,
        },
      });
    }
  }, []);

  const addRoute = useCallback((serverId: string) => {
    setServers(prev => prev.map(s => s.id === serverId ? { ...s, routes: [...s.routes, createDefaultRoute()] } : s));
    persistConfigs();
    const server = serversRef.current.find(s => s.id === serverId);
    if (server?.running) {
      setTimeout(() => {
        const updated = serversRef.current.find(s => s.id === serverId);
        if (updated) postMsg({ type: 'mockServer:updateRoutes', id: serverId, routes: updated.routes });
      }, 50);
    }
  }, [persistConfigs]);

  const updateRoute = useCallback((serverId: string, routeId: string, patch: Partial<MockRoute>) => {
    setServers(prev => prev.map(s => s.id === serverId
      ? { ...s, routes: s.routes.map(r => r.id === routeId ? { ...r, ...patch } : r) }
      : s
    ));
    persistConfigs();
    const server = serversRef.current.find(s => s.id === serverId);
    if (server?.running) {
      setTimeout(() => {
        const updated = serversRef.current.find(s => s.id === serverId);
        if (updated) postMsg({ type: 'mockServer:updateRoutes', id: serverId, routes: updated.routes });
      }, 50);
    }
  }, [persistConfigs]);

  const deleteRoute = useCallback((serverId: string, routeId: string) => {
    setServers(prev => prev.map(s => s.id === serverId ? { ...s, routes: s.routes.filter(r => r.id !== routeId) } : s));
    persistConfigs();
    const server = serversRef.current.find(s => s.id === serverId);
    if (server?.running) {
      setTimeout(() => {
        const updated = serversRef.current.find(s => s.id === serverId);
        if (updated) postMsg({ type: 'mockServer:updateRoutes', id: serverId, routes: updated.routes });
      }, 50);
    }
  }, [persistConfigs]);

  /** Add one or more AI-generated routes to the server, each pre-filled with the parsed route data */
  const addGeneratedRoutes = useCallback((serverId: string, patches: Partial<MockRoute>[]) => {
    const newRoutes: MockRoute[] = patches.map(p => ({
      ...createDefaultRoute(),
      ...p,
      id: crypto.randomUUID(),
    }));
    setServers(prev => prev.map(s => s.id === serverId ? { ...s, routes: [...s.routes, ...newRoutes] } : s));
    persistConfigs();
    const server = serversRef.current.find(s => s.id === serverId);
    if (server?.running) {
      setTimeout(() => {
        const updated = serversRef.current.find(s => s.id === serverId);
        if (updated) postMsg({ type: 'mockServer:updateRoutes', id: serverId, routes: updated.routes });
      }, 50);
    }
  }, [persistConfigs]);

  // Splitter drag handlers
  const handleSplitterDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleSplitterMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    const pct = ((e.clientY - rect.top) / rect.height) * 100;
    setSplitPercent(Math.max(20, Math.min(80, pct)));
  }, [isDragging]);

  const handleSplitterUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    useUiStateStore.getState().setHeight('split.mock.activity', splitPercent);
  }, [splitPercent]);

  // Toggle + persist minimized state
  const toggleLogMinimized = useCallback(() => {
    setLogMinimized(prev => {
      const next = !prev;
      useUiStateStore.getState().setHeight('mock.log.minimized', next ? 1 : 0);
      return next;
    });
  }, []);

  // Alt+/ shortcut to toggle activity log
  useKeyboardShortcut('mock.toggle-log', { key: '/', altKey: true }, (e) => {
    e.preventDefault();
    toggleLogMinimized();
  }, 'Toggle activity log', [toggleLogMinimized]);

  // ─── Empty State (only show if we've confirmed empty from DB, not during initial load) ───
  if (servers.length === 0 && serversLoaded && !showNewDialog) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[var(--color-text-muted)]">
        <ServerIcon size={56} className="opacity-20" strokeWidth={1.2} />
        <p className="text-[14px] text-[var(--color-text-muted)]">No mock servers found</p>
        <button
          type="button"
          onClick={() => setShowNewDialog(true)}
          className="mt-1 h-[30px] px-3 text-[12px] rounded-md bg-[var(--color-mock-server)] text-[#1a1a1a] font-medium hover:opacity-90 cursor-pointer transition-opacity"
        >
          + Create Mock Server
        </button>
      </div>
    );
  }

  // Filter logs for active server
  const serverLogs = activeServer ? logs.filter(l => l.serverId === activeServer.id) : [];

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* Left: Server list */}
      <ServerList
        servers={servers}
        activeServerId={activeServerId}
        onSelect={setActiveServerId}
        onNew={() => setShowNewDialog(true)}
        onRename={(id, name) => { updateServer(id, { name }); }}
        onToggleRunning={toggleRunning}
        onDelete={(server) => setDeleteConfirm({ id: server.id, name: server.name, running: server.running, port: server.port })}
        onDeleteAll={() => setDeleteAllConfirm(true)}
      />

      {/* Right: Server detail + Log */}
      <div ref={splitRef} className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeServer ? (
          <>
            {/* Top: Server detail */}
            <div className={`overflow-y-auto scrollbar-gutter-stable ${logMinimized ? 'flex-1' : ''}`} style={{ height: logMinimized ? undefined : `${splitPercent}%`, minHeight: 100 }}>
              <ServerDetail
                server={activeServer}
                onUpdate={(patch) => updateServer(activeServer.id, patch)}
                onToggleRunning={() => toggleRunning(activeServer.id)}
                onDelete={() => setDeleteConfirm({ id: activeServer.id, name: activeServer.name, running: activeServer.running, port: activeServer.port })}
                onAddRoute={() => addRoute(activeServer.id)}
                onAddGeneratedRoutes={(patches) => addGeneratedRoutes(activeServer.id, patches)}
                onUpdateRoute={(routeId, patch) => updateRoute(activeServer.id, routeId, patch)}
                onDeleteRoute={(routeId) => deleteRoute(activeServer.id, routeId)}
                editingRoute={editingRoute}
                onEditRoute={setEditingRoute}
              />
            </div>

            {/* Splitter — draggable border line */}
            <div
              className="relative h-[6px] flex-shrink-0 cursor-row-resize group select-none"
              onPointerDown={handleSplitterDown}
              onPointerMove={handleSplitterMove}
              onPointerUp={handleSplitterUp}
            >
              <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] transition-colors ${
                isDragging ? 'bg-[var(--color-mock-server)]' : 'bg-[var(--color-surface-border)] group-hover:bg-[var(--color-mock-server)]'
              }`} />
            </div>

            {/* Bottom: Activity Log */}
            {!logMinimized && (
              <div className="flex-1 min-h-[80px] flex flex-col overflow-hidden">
                <MockLogPanel logs={serverLogs} onClear={() => useMockStore.getState().clearLogs(activeServer?.id)} minimized={logMinimized} onToggleMinimize={toggleLogMinimized} />
              </div>
            )}
            {logMinimized && (
              <MockLogPanel logs={serverLogs} onClear={() => useMockStore.getState().clearLogs(activeServer?.id)} minimized={logMinimized} onToggleMinimize={toggleLogMinimized} />
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
            <ServerIcon size={40} className="opacity-20" strokeWidth={1.2} />
            <p className="text-[13px]">Select a mock server to configure</p>
          </div>
        )}
      </div>

      {/* New Server Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-lg shadow-xl p-5 w-[360px]">
            <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] mb-3">Create Mock Server</h3>
            <input
              type="text"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              placeholder="Mock server name"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') addServer(); if (e.key === 'Escape') { setShowNewDialog(false); setNewServerProtocol('rest'); } }}
              className="w-full h-[32px] px-3 py-1 text-[13px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            />
            <div className="flex items-end justify-between mt-3">
              <div>
                <label className="text-[11px] text-[var(--color-text-muted)] mb-1 block">Protocol</label>
                <StyledDropdown
                  options={[
                    { value: 'rest', label: 'REST', icon: <ProtocolRestBadge size={14} />, color: MOCK_PROTOCOL_COLORS.rest },
                    { value: 'graphql', label: 'GraphQL', icon: <ProtocolGraphQLBadge size={14} />, color: MOCK_PROTOCOL_COLORS.graphql },
                    { value: 'websocket', label: 'WebSocket', icon: <WebSocketIcon size={12} style={{ color: MOCK_PROTOCOL_COLORS.websocket }} />, color: MOCK_PROTOCOL_COLORS.websocket },
                    { value: 'sse', label: 'SSE', icon: <SSEIcon size={12} style={{ color: MOCK_PROTOCOL_COLORS.sse }} />, color: MOCK_PROTOCOL_COLORS.sse },
                    { value: 'socketio', label: 'Socket.IO', icon: <SocketIOIcon size={12} style={{ color: MOCK_PROTOCOL_COLORS.socketio }} />, color: MOCK_PROTOCOL_COLORS.socketio },
                    { value: 'mqtt', label: 'MQTT', icon: <MQTTIcon size={12} style={{ color: MOCK_PROTOCOL_COLORS.mqtt }} />, color: MOCK_PROTOCOL_COLORS.mqtt },
                    { value: 'grpc', label: 'gRPC', icon: <ProtocolGrpcBadge size={14} />, color: MOCK_PROTOCOL_COLORS.grpc },
                    { value: 'soap', label: 'SOAP', icon: <ProtocolSoapBadge size={14} />, color: MOCK_PROTOCOL_COLORS.soap },
                    { value: 'ai', label: 'AI', icon: <ProtocolAiBadge size={14} />, color: MOCK_PROTOCOL_COLORS.ai },
                    { value: 'mcp', label: 'MCP', icon: <ProtocolMcpBadge size={14} />, color: MOCK_PROTOCOL_COLORS.mcp },
                  ]}
                  value={newServerProtocol}
                  onChange={(v) => setNewServerProtocol(v as MockServerProtocol)}
                  size="sm"
                  accentColor="var(--color-mock-server)"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowNewDialog(false); setNewServerName(''); setNewServerProtocol('rest'); }}
                  className="px-3 py-1.5 text-[12px] rounded-md bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] text-[#f87171] hover:bg-[rgba(239,68,68,0.15)] cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addServer}
                  className="h-[30px] px-3 text-[12px] rounded-md bg-[var(--color-mock-server)] text-[#1a1a1a] font-medium hover:opacity-90 cursor-pointer transition-opacity"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete single server confirm */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Mock Server?"
          message={`"${deleteConfirm.name}" will be permanently deleted.${deleteConfirm.running ? ` The server running on port ${deleteConfirm.port} will be stopped.` : ''}`}
          confirmLabel="Delete"
          danger
          onConfirm={() => { deleteServer(deleteConfirm.id); setDeleteConfirm(null); }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Delete all servers confirm */}
      {deleteAllConfirm && (
        <ConfirmDialog
          title="Delete All Mock Servers?"
          message={`All ${servers.length} mock server(s) will be permanently deleted.${servers.some(s => s.running) ? ' All running servers will be stopped and their ports released.' : ''}`}
          confirmLabel="Delete All"
          danger
          onConfirm={deleteAllServers}
          onCancel={() => setDeleteAllConfirm(false)}
        />
      )}
    </div>
  );
}
