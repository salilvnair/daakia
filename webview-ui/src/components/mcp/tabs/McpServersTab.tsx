import { useCallback, useState } from 'react';
import { useTabsStore, type McpServerConfig } from '../../../store/tabs-store';
import { TrashIcon, ConnectIcon, DisconnectIcon } from '../../../icons';
import { StyledDropdown, type DropdownOption } from '../../shared';
import { postMsg } from '../../../vscode';

const ACCENT = 'var(--color-protocol-mcp)';

const TRANSPORT_OPTIONS: DropdownOption[] = [
  { value: 'stdio', label: 'STDIO' },
  { value: 'http', label: 'HTTP/SSE' },
];

function emptyServer(): McpServerConfig {
  return { id: crypto.randomUUID(), name: '', transport: 'stdio', command: '', args: [], envVars: {}, enabled: true };
}

/**
 * McpServersTab — Multi-server management (6E.18).
 * Shows all configured servers. Each can be independently connected/disconnected.
 */
export function McpServersTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const servers: McpServerConfig[] = activeTab?.mcpServerConfigs || [];
  const serverStates = activeTab?.mcpServerStates || {};
  const [editingId, setEditingId] = useState<string | null>(null);

  const setServers = useCallback((newServers: McpServerConfig[]) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { mcpServerConfigs: newServers, dirty: true });
  }, [activeTab, updateTab]);

  const handleAdd = useCallback(() => {
    const s = emptyServer();
    setServers([...servers, s]);
    setEditingId(s.id);
  }, [servers, setServers]);

  const handleRemove = useCallback((id: string) => {
    // Disconnect if connected
    if (activeTab && serverStates[id]?.connected) {
      postMsg({ type: 'mcp:disconnectServer', tabId: activeTab.id, serverId: id });
    }
    setServers(servers.filter(s => s.id !== id));
    if (editingId === id) setEditingId(null);
  }, [activeTab, servers, serverStates, setServers, editingId]);

  const updateServer = useCallback((id: string, patch: Partial<McpServerConfig>) => {
    setServers(servers.map(s => s.id === id ? { ...s, ...patch } : s));
  }, [servers, setServers]);

  const handleConnect = useCallback((server: McpServerConfig) => {
    if (!activeTab) return;
    const state = serverStates[server.id];
    if (state?.connected || state?.connecting) {
      postMsg({ type: 'mcp:disconnectServer', tabId: activeTab.id, serverId: server.id });
    } else {
      postMsg({
        type: 'mcp:connectServer',
        tabId: activeTab.id,
        serverId: server.id,
        transport: server.transport,
        command: server.command || '',
        args: server.args || [],
        url: server.url || '',
        envVars: server.envVars || {},
        settings: activeTab.mcpSettings || {},
        envId: activeTab.envId,
      });
    }
  }, [activeTab, serverStates]);

  if (!activeTab) return null;

  const connectedCount = Object.values(serverStates).filter(s => s.connected).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
        <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide">
          {servers.length} server{servers.length !== 1 ? 's' : ''}
          {connectedCount > 0 && (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }}>
              {connectedCount} connected
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={handleAdd}
          className="text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors"
          style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: ACCENT }}
        >
          + Add Server
        </button>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-auto">
        {servers.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
            <span className="text-[13px] text-[var(--color-text-muted)]">No servers configured</span>
            <span className="text-[11px] text-[var(--color-text-muted)] opacity-70">
              Click "+ Add Server" or paste config in the Config tab.
            </span>
          </div>
        )}

        {servers.map((server) => {
          const state = serverStates[server.id] || { connected: false, connecting: false, tools: [] };
          const isEditing = editingId === server.id;

          return (
            <div key={server.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--color-surface-border)' }}>
              {/* Server row header */}
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors"
                onClick={() => setEditingId(isEditing ? null : server.id)}
              >
                {/* Status dot */}
                <span
                  className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: state.connected ? 'var(--color-success)'
                      : state.connecting ? 'var(--color-warning)'
                      : state.error ? 'var(--color-error)'
                      : 'var(--color-text-muted)',
                  }}
                />
                <span className="flex-1 text-[12px] font-medium text-[var(--color-text-primary)] truncate">
                  {server.name || <em className="text-[var(--color-text-muted)] font-normal">unnamed</em>}
                </span>
                <span className="text-[10px] px-1 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}>
                  {server.transport.toUpperCase()}
                </span>
                {state.tools && state.tools.length > 0 && (
                  <span className="text-[10px] shrink-0" style={{ color: ACCENT }}>
                    {state.tools.length} tools
                  </span>
                )}
                {/* Connect button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleConnect(server); }}
                  className="shrink-0 flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded cursor-pointer transition-colors"
                  style={{
                    backgroundColor: state.connected || state.connecting
                      ? 'color-mix(in srgb, var(--color-error) 10%, transparent)'
                      : `color-mix(in srgb, ${ACCENT} 10%, transparent)`,
                    color: state.connected || state.connecting ? 'var(--color-error)' : ACCENT,
                  }}
                >
                  {state.connected || state.connecting ? <DisconnectIcon size={10} /> : <ConnectIcon size={10} />}
                  {state.connecting ? 'Cancel' : state.connected ? 'Disconnect' : 'Connect'}
                </button>
                {/* Remove */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemove(server.id); }}
                  className="shrink-0 p-0.5 cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                >
                  <TrashIcon size={12} />
                </button>
              </div>

              {/* Error */}
              {state.error && (
                <div className="px-3 pb-1 text-[11px]" style={{ color: 'var(--color-error)' }}>
                  ⚠ {state.error}
                </div>
              )}

              {/* Edit form */}
              {isEditing && (
                <div className="px-3 pb-3 flex flex-col gap-2" style={{ borderTop: `1px solid color-mix(in srgb, ${ACCENT} 15%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))` }}>
                  <div className="flex flex-col gap-1 pt-2">
                    <label className="text-[11px] text-[var(--color-text-muted)]">Name</label>
                    <input
                      type="text"
                      value={server.name}
                      onChange={(e) => updateServer(server.id, { name: e.target.value })}
                      placeholder="e.g. filesystem"
                      className="h-[26px] px-2 rounded text-[12px] focus:outline-none"
                      style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-[var(--color-text-muted)] w-[60px]">Transport</label>
                    <StyledDropdown
                      options={TRANSPORT_OPTIONS}
                      value={server.transport}
                      onChange={(val) => updateServer(server.id, { transport: val as 'stdio' | 'http' })}
                      accentColor={ACCENT}
                    />
                  </div>
                  {server.transport === 'stdio' ? (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[var(--color-text-muted)]">Command</label>
                        <input
                          type="text"
                          value={server.command || ''}
                          onChange={(e) => updateServer(server.id, { command: e.target.value })}
                          placeholder="npx @modelcontextprotocol/server-name"
                          className="h-[26px] px-2 rounded text-[12px] font-mono focus:outline-none"
                          style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[var(--color-text-muted)]">Args (space-separated)</label>
                        <input
                          type="text"
                          value={(server.args || []).join(' ')}
                          onChange={(e) => updateServer(server.id, { args: e.target.value.split(' ').filter(Boolean) })}
                          placeholder="-y --flag value"
                          className="h-[26px] px-2 rounded text-[12px] font-mono focus:outline-none"
                          style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-[var(--color-text-muted)]">URL</label>
                      <input
                        type="text"
                        value={server.url || ''}
                        onChange={(e) => updateServer(server.id, { url: e.target.value })}
                        placeholder="http://localhost:3000/mcp/sse"
                        className="h-[26px] px-2 rounded text-[12px] font-mono focus:outline-none"
                        style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
