import { useCallback } from 'react';
import { useTabsStore, type McpToolDef } from '../../../store/tabs-store';
import { McpToolIcon } from '../../../icons';
import { postMsg } from '../../../vscode';

/**
 * McpToolsTab — Lists discovered tools from the connected MCP server, with invoke capability.
 */
export function McpToolsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const tools: McpToolDef[] = activeTab?.mcpCapabilities?.tools || [];
  const connected = activeTab?.mcpConnected || false;

  const handleInvoke = useCallback((tool: McpToolDef) => {
    if (!activeTab) return;
    postMsg({
      type: 'mcp:callTool',
      tabId: activeTab.id,
      toolName: tool.name,
      arguments: {},
    });
  }, [activeTab]);

  if (!connected) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 px-6 text-center">
        <span className="text-[13px] text-[var(--color-text-muted)]">Not connected</span>
        <span className="text-[11px] text-[var(--color-text-muted)] opacity-70">
          Connect to an MCP server to discover available tools.
        </span>
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 px-6 text-center">
        <span className="text-[13px] text-[var(--color-text-muted)]">No tools available</span>
        <span className="text-[11px] text-[var(--color-text-muted)] opacity-70">
          This server does not expose any tools.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-3 gap-1.5 overflow-auto h-full">
      <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
        {tools.length} tool{tools.length !== 1 ? 's' : ''} discovered
      </span>

      {tools.map((tool) => (
        <div
          key={tool.name}
          className="flex items-center gap-2.5 py-1.5 px-1"
        >
          <McpToolIcon size={14} />
          <code
            className="text-[12px] font-semibold px-2 py-0.5 rounded"
            style={{ color: 'var(--color-protocol-mcp)', backgroundColor: 'color-mix(in srgb, var(--color-protocol-mcp) 12%, transparent)' }}
          >
            {tool.name}
          </code>
          {tool.description && (
            <span className="text-[11px] text-[var(--color-text-muted)] truncate">{tool.description}</span>
          )}
          <button
            type="button"
            onClick={() => handleInvoke(tool)}
            className="ml-auto shrink-0 text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors text-[var(--color-protocol-mcp)] hover:bg-[color-mix(in_srgb,var(--color-protocol-mcp)_10%,transparent)]"
          >
            Run
          </button>
        </div>
      ))}
    </div>
  );
}
