import { useCallback } from 'react';
import { useTabsStore, type McpResourceDef } from '../../../store/tabs-store';
import { postMsg } from '../../../vscode';

/**
 * McpResourcesTab — Lists discovered resources from the connected MCP server.
 */
export function McpResourcesTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const resources: McpResourceDef[] = activeTab?.mcpCapabilities?.resources || [];
  const connected = activeTab?.mcpConnected || false;

  const handleRead = useCallback((resource: McpResourceDef) => {
    if (!activeTab) return;
    postMsg({
      type: 'mcp:readResource',
      tabId: activeTab.id,
      uri: resource.uri,
    });
  }, [activeTab]);

  if (!connected) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 px-6 text-center">
        <span className="text-[13px] text-[var(--color-text-muted)]">Not connected</span>
        <span className="text-[11px] text-[var(--color-text-muted)] opacity-70">
          Connect to an MCP server to discover available resources.
        </span>
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 px-6 text-center">
        <span className="text-[13px] text-[var(--color-text-muted)]">No resources available</span>
        <span className="text-[11px] text-[var(--color-text-muted)] opacity-70">
          This server does not expose any resources.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-3 gap-2 overflow-auto h-full">
      <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide">
        {resources.length} resource{resources.length !== 1 ? 's' : ''} discovered
      </span>

      {resources.map((res) => (
        <div
          key={res.uri}
          className="flex items-start gap-2 p-2.5 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-raised)]"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
              {res.name}
            </div>
            <div className="text-[11px] font-mono text-[var(--color-text-muted)] truncate">
              {res.uri}
            </div>
            {res.description && (
              <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 line-clamp-2">
                {res.description}
              </div>
            )}
            {res.mimeType && (
              <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]">
                {res.mimeType}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleRead(res)}
            className="shrink-0 text-[11px] px-2 py-1 rounded bg-[var(--color-protocol-mcp)] text-white cursor-pointer hover:opacity-90 transition-opacity"
          >
            Read
          </button>
        </div>
      ))}
    </div>
  );
}
