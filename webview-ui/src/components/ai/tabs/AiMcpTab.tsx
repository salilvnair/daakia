import { useState, useCallback, useEffect, useRef } from 'react';
import { useTabsStore, type McpServerConfig, type McpToolDef } from '../../../store/tabs-store';
import { PlusIcon, TrashIcon, RefreshIcon, McpToolIcon, ConnectIcon, DisconnectIcon } from '../../../icons';
import { StyledDropdown, ConfirmDialog, type DropdownOption } from '../../shared';
import { postMsg } from '../../../vscode';

interface McpServerState {
  connected: boolean;
  connecting: boolean;
  tools: McpToolDef[];
  error?: string;
}

const TRANSPORT_OPTIONS: DropdownOption[] = [
  { value: 'stdio', label: 'stdio (spawn subprocess)' },
  { value: 'http', label: 'http (JSON-RPC POST)' },
];

const ACCENT = 'var(--color-protocol-ai)';

/**
 * AiMcpTab — Configure MCP servers within the AI tab.
 * Connected servers' tools are automatically injected into AI function calling.
 */
export function AiMcpTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const servers: McpServerConfig[] = activeTab?.mcpServerConfigs || [];
  const serverStates = activeTab?.mcpServerStates || {};
  const setServerStates = useCallback((updater: (prev: Record<string, McpServerState>) => Record<string, McpServerState>) => {
    const { tabs, activeTabId } = useTabsStore.getState();
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    const current = tab.mcpServerStates || {};
    useTabsStore.getState().updateTab(tab.id, { mcpServerStates: updater(current) });
  }, []);
  const editingServer = activeTab?.mcpEditingServer ?? null;
  const setEditingServer = useCallback((server: McpServerConfig | null) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { mcpEditingServer: server });
  }, [activeTab, updateTab]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showTools, setShowTools] = useState<string | null>(null);

  // Listen for MCP events from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg) return;
      const { tabs, activeTabId } = useTabsStore.getState();
      const tab = tabs.find(t => t.id === activeTabId);
      if (!tab) return;

      switch (msg.type) {
        case 'ai:mcp:connected': {
          const { serverId, tools } = msg as { serverId: string; tools: McpToolDef[] };
          setServerStates(prev => ({
            ...prev,
            [serverId]: { connected: true, connecting: false, tools: tools || [], error: undefined },
          }));
          break;
        }
        case 'ai:mcp:disconnected': {
          const { serverId } = msg as { serverId: string };
          setServerStates(prev => ({
            ...prev,
            [serverId]: { connected: false, connecting: false, tools: [], error: undefined },
          }));
          break;
        }
        case 'ai:mcp:error': {
          const { serverId, error } = msg as { serverId: string; error: string };
          setServerStates(prev => ({
            ...prev,
            [serverId]: { ...prev[serverId], connected: false, connecting: false, error },
          }));
          break;
        }
        case 'ai:mcp:tools': {
          const { serverId, tools } = msg as { serverId: string; tools: McpToolDef[] };
          setServerStates(prev => ({
            ...prev,
            [serverId]: { ...prev[serverId], tools: tools || [] },
          }));
          break;
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [setServerStates]);

  const handleAddServer = useCallback(() => {
    setEditingServer({
      id: crypto.randomUUID(),
      name: '',
      description: '',
      transport: 'stdio',
      command: '',
      args: [],
      envVars: {},
      workingDir: '',
      enabled: true,
    });
  }, []);

  const handleSaveServer = useCallback(() => {
    if (!activeTab || !editingServer) return;
    if (!editingServer.name.trim()) return;

    const existing = servers.find(s => s.id === editingServer.id);
    const updated = existing
      ? servers.map(s => s.id === editingServer.id ? editingServer : s)
      : [...servers, editingServer];

    updateTab(activeTab.id, { mcpServerConfigs: updated, dirty: true });
    setEditingServer(null);
  }, [activeTab, editingServer, servers, updateTab]);

  const handleDeleteServer = useCallback(() => {
    if (!activeTab || !deleteId) return;
    // Disconnect if connected
    const state = serverStates[deleteId];
    if (state?.connected) {
      postMsg({ type: 'ai:mcp:disconnect', tabId: activeTab.id, serverId: deleteId });
    }
    updateTab(activeTab.id, { mcpServerConfigs: servers.filter(s => s.id !== deleteId), dirty: true });
    setServerStates(prev => { const n = { ...prev }; delete n[deleteId]; return n; });
    setDeleteId(null);
  }, [activeTab, deleteId, servers, serverStates, updateTab]);

  const handleConnect = useCallback((serverId: string) => {
    if (!activeTab) return;
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    setServerStates(prev => ({
      ...prev,
      [serverId]: { connected: false, connecting: true, tools: [], error: undefined },
    }));

    postMsg({
      type: 'ai:mcp:connect',
      tabId: activeTab.id,
      serverId,
      server,
    });
  }, [activeTab, servers]);

  const handleDisconnect = useCallback((serverId: string) => {
    if (!activeTab) return;
    postMsg({ type: 'ai:mcp:disconnect', tabId: activeTab.id, serverId });
    setServerStates(prev => ({
      ...prev,
      [serverId]: { connected: false, connecting: false, tools: [], error: undefined },
    }));
  }, [activeTab]);

  const handleToggleTools = useCallback((serverId: string) => {
    setShowTools(prev => prev === serverId ? null : serverId);
  }, []);

  // Get all connected tools (for AI injection)
  const allConnectedTools = Object.entries(serverStates)
    .filter(([, state]) => state.connected)
    .flatMap(([, state]) => state.tools);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col h-full overflow-auto p-3 gap-3 [scrollbar-gutter:stable]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-[var(--color-text-primary)]">MCP Servers</span>
          {allConnectedTools.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)', color: 'var(--color-protocol-ai)' }}>
              {allConnectedTools.length} tool{allConnectedTools.length !== 1 ? 's' : ''} available
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleAddServer}
          className="h-[26px] px-2.5 text-[11px] font-medium rounded-md cursor-pointer transition-colors flex items-center gap-1.5"
          style={{ color: ACCENT, border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)` }}
        >
          <PlusIcon size={11} />
          Add Server
        </button>
      </div>

      {/* Empty state */}
      {servers.length === 0 && !editingServer && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <span className="text-[28px] opacity-20">🔌</span>
          <span className="text-[12px] text-[var(--color-text-muted)]">
            No MCP servers configured.
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)] opacity-70">
            Add an MCP server to give AI access to external tools (database, filesystem, etc.)
          </span>
        </div>
      )}

      {/* Server list */}
      {servers.map(server => {
        const state = serverStates[server.id] || { connected: false, connecting: false, tools: [] };
        return (
          <div key={server.id} className="border border-[var(--color-surface-border)] rounded-lg overflow-hidden">
            {/* Server row */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-panel)]">
              {/* Connection indicator */}
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-colors ${state.connected ? 'breathing-connected' : ''}`}
                style={{ backgroundColor: state.connected ? 'var(--color-success)' : state.connecting ? 'var(--color-warning)' : 'var(--color-text-muted)', color: state.connected ? 'var(--color-success)' : 'transparent' }}
              />

              {/* Server name */}
              <span className="text-[12px] font-semibold text-[var(--color-text-primary)] flex-1 truncate">
                {server.name || 'Unnamed Server'}
              </span>

              {/* Badges */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wide" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-mcp) 15%, transparent)', color: 'var(--color-protocol-mcp)' }}>
                  {server.transport}
                </span>
                {state.connected && state.tools.length > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }}>
                    ✓ {state.tools.length} tools
                  </span>
                )}
                {state.error && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 15%, transparent)', color: 'var(--color-error)' }}>
                    Error
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-0.5">
                {state.connected ? (
                  <button
                    type="button"
                    onClick={() => handleToggleTools(server.id)}
                    className="h-[24px] px-2 text-[10px] rounded-md cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
                  >
                    {showTools === server.id ? 'Hide' : 'Tools'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => state.connected ? handleDisconnect(server.id) : handleConnect(server.id)}
                  disabled={state.connecting}
                  className={`h-[24px] px-2 text-[10px] rounded-md cursor-pointer transition-colors flex items-center gap-1 ${
                    state.connected
                      ? 'bg-[var(--color-error)] text-white hover:opacity-90'
                      : state.connecting
                      ? 'text-[var(--color-warning)] opacity-70'
                      : 'text-[var(--color-success)] hover:bg-[rgba(34,197,94,0.08)]'
                  }`}
                >
                  {state.connected ? <DisconnectIcon size={11} /> : <ConnectIcon size={11} />}
                  {state.connecting ? 'Connecting...' : state.connected ? 'Disconnect' : 'Connect'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingServer({ ...server })}
                  className="h-[24px] px-2 text-[10px] rounded-md cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(server.id)}
                  className="h-[24px] w-[24px] flex items-center justify-center rounded-md cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]"
                >
                  <TrashIcon size={11} />
                </button>
              </div>
            </div>

            {/* Command/URL preview */}
            <div className="px-3 py-1 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]">
              <code className="text-[10px] text-[var(--color-text-muted)] font-mono truncate block">
                {server.transport === 'stdio'
                  ? `${server.command || '?'} ${(server.args || []).join(' ')}`
                  : server.url || '?'}
              </code>
            </div>

            {/* Error message */}
            {state.error && (
              <div className="px-3 py-1.5 border-t border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.05)]">
                <span className="text-[10px] text-[var(--color-error)]">{state.error}</span>
              </div>
            )}

            {/* Tools list (when expanded) */}
            {showTools === server.id && state.connected && (
              <div className="px-3 py-2 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]">
                {state.tools.length === 0 ? (
                  <span className="text-[11px] text-[var(--color-text-muted)]">No tools advertised.</span>
                ) : (
                  <div className="flex flex-col gap-1">
                    {state.tools.map(tool => (
                      <div key={tool.name} className="flex items-center gap-2 py-1">
                        <McpToolIcon size={14} />
                        <code
                          className="text-[11px] font-semibold px-2 py-0.5 rounded whitespace-nowrap"
                          style={{ color: 'var(--color-protocol-mcp)', backgroundColor: 'color-mix(in srgb, var(--color-protocol-mcp) 12%, transparent)' }}
                        >
                          {tool.name}
                        </code>
                        {tool.description && (
                          <span className="text-[11px] text-[var(--color-text-muted)] italic truncate">{tool.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Edit/Add form */}
      {editingServer && (
        <div className="border border-[var(--color-surface-border)] rounded-lg p-3 bg-[var(--color-panel)] flex flex-col gap-2.5">
          <span className="text-[12px] font-medium text-[var(--color-text-primary)]">
            {servers.find(s => s.id === editingServer.id) ? 'Edit MCP Server' : 'New MCP Server'}
          </span>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--color-text-muted)]">Name</label>
            <input
              type="text"
              value={editingServer.name}
              onChange={(e) => setEditingServer({ ...editingServer, name: e.target.value })}
              placeholder="test-db-server"
              className="h-[28px] px-2.5 text-[12px] bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] rounded-md text-[var(--color-text-primary)] outline-none"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--color-text-muted)]">
              Description <span className="opacity-60">(optional — used as LLM hint)</span>
            </label>
            <input
              type="text"
              value={editingServer.description || ''}
              onChange={(e) => setEditingServer({ ...editingServer, description: e.target.value })}
              placeholder="PostgreSQL schema introspection and query tools"
              className="h-[28px] px-2.5 text-[12px] bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] rounded-md text-[var(--color-text-primary)] outline-none"
            />
          </div>

          {/* Transport */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--color-text-muted)]">Transport</label>
            <StyledDropdown
              options={TRANSPORT_OPTIONS}
              value={editingServer.transport}
              onChange={(v) => setEditingServer({ ...editingServer, transport: v as 'stdio' | 'http' })}
              size="sm"
              accentColor={ACCENT}
            />
          </div>

          {/* STDIO fields */}
          {editingServer.transport === 'stdio' && (
            <>
              {/* Command */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[var(--color-text-muted)]">Command</label>
                <input
                  type="text"
                  value={editingServer.command || ''}
                  onChange={(e) => setEditingServer({ ...editingServer, command: e.target.value })}
                  placeholder="C:\path\to\python.exe"
                  className="h-[28px] px-2.5 text-[12px] bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] rounded-md text-[var(--color-text-primary)] outline-none font-mono"
                />
              </div>

              {/* Arguments */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[var(--color-text-muted)]">Arguments (one per line)</label>
                <ArgsTextarea
                  args={editingServer.args || []}
                  onChange={(args) => setEditingServer({ ...editingServer, args })}
                />
              </div>

              {/* Environment */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[var(--color-text-muted)]">
                  Environment <span className="opacity-60">(KEY=value per line, optional)</span>
                </label>
                <EnvTextarea
                  envVars={editingServer.envVars || {}}
                  onChange={(vars) => setEditingServer({ ...editingServer, envVars: vars })}
                />
              </div>

              {/* Working Directory */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[var(--color-text-muted)]">
                  Working Directory <span className="opacity-60">(optional — for finding config files like app_mcp.yml)</span>
                </label>
                <input
                  type="text"
                  value={editingServer.workingDir || ''}
                  onChange={(e) => setEditingServer({ ...editingServer, workingDir: e.target.value })}
                  placeholder="C:\Users\salilvnair\workspace\experiments\postgres_mcp"
                  className="h-[28px] px-2.5 text-[12px] bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] rounded-md text-[var(--color-text-primary)] outline-none font-mono"
                />
              </div>
            </>
          )}

          {/* HTTP fields */}
          {editingServer.transport === 'http' && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--color-text-muted)]">URL</label>
              <input
                type="text"
                value={editingServer.url || ''}
                onChange={(e) => setEditingServer({ ...editingServer, url: e.target.value })}
                placeholder="http://localhost:3000/mcp"
                className="h-[28px] px-2.5 text-[12px] bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] rounded-md text-[var(--color-text-primary)] outline-none font-mono"
              />
            </div>
          )}

          {/* Form actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditingServer(null)}
              className="h-[28px] px-3 text-[11px] rounded-md cursor-pointer transition-colors text-[var(--color-error)] border border-[rgba(239,68,68,0.3)] hover:bg-[rgba(239,68,68,0.08)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveServer}
              disabled={!editingServer.name.trim()}
              className="h-[28px] px-3 text-[11px] rounded-md cursor-pointer transition-colors text-white disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Info hint */}
      {servers.length > 0 && allConnectedTools.length > 0 && (
        <div className="text-[10px] text-[var(--color-text-muted)] opacity-70 px-1">
          💡 Connected MCP tools are automatically included when sending AI requests. The AI model can call these tools during conversation.
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <ConfirmDialog
          title="Delete MCP Server?"
          message="This server configuration will be removed. If connected, it will be disconnected."
          confirmLabel="Delete"
          onConfirm={handleDeleteServer}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

/**
 * EnvTextarea — local-state textarea that only parses KEY=VALUE on blur.
 * Allows free typing without losing partial input.
 */
function EnvTextarea({ envVars, onChange }: { envVars: Record<string, string>; onChange: (vars: Record<string, string>) => void }) {
  const [text, setText] = useState(() => Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join('\n'));
  const initializedRef = useRef(false);

  // Sync from props when envVars change externally (e.g. server loaded for editing)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    const incoming = Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join('\n');
    setText(incoming);
  }, [envVars]);

  const parseAndSync = useCallback(() => {
    const vars: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const i = line.indexOf('=');
      if (i > 0) vars[line.slice(0, i).trim()] = line.slice(i + 1);
    }
    onChange(vars);
  }, [text, onChange]);

  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={parseAndSync}
      placeholder="GITHUB_TOKEN=ghp_xxx"
      rows={2}
      className="px-2.5 py-1.5 text-[12px] bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] rounded-md text-[var(--color-text-primary)] outline-none font-mono resize-vertical focus:border-[var(--color-protocol-ai)]"
    />
  );
}

/**
 * ArgsTextarea — local-state textarea for multiline args editing.
 * Parses on blur so Enter key works freely.
 */
function ArgsTextarea({ args, onChange }: { args: string[]; onChange: (args: string[]) => void }) {
  const [text, setText] = useState(() => args.join('\n'));
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    setText(args.join('\n'));
  }, [args]);

  const parseAndSync = useCallback(() => {
    onChange(text.split('\n').filter(line => line.trim() !== ''));
  }, [text, onChange]);

  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={parseAndSync}
      placeholder={"-m\napp_mcp.server\n--conn\npostgresql://user:pass@host:5432/db"}
      rows={4}
      className="px-2.5 py-1.5 text-[12px] bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] rounded-md text-[var(--color-text-primary)] outline-none font-mono resize-vertical focus:border-[var(--color-protocol-ai)]"
    />
  );
}
