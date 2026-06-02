import { useCallback } from 'react';
import { useTabsStore, type McpPromptDef } from '../../../store/tabs-store';
import { postMsg } from '../../../vscode';

/**
 * McpPromptsTab — Lists discovered prompts from the connected MCP server.
 */
export function McpPromptsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const prompts: McpPromptDef[] = activeTab?.mcpCapabilities?.prompts || [];
  const connected = activeTab?.mcpConnected || false;

  const handleRun = useCallback((prompt: McpPromptDef) => {
    if (!activeTab) return;
    postMsg({
      type: 'mcp:getPrompt',
      tabId: activeTab.id,
      promptName: prompt.name,
      arguments: {},
    });
  }, [activeTab]);

  if (!connected) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 px-6 text-center">
        <span className="text-[13px] text-[var(--color-text-muted)]">Not connected</span>
        <span className="text-[11px] text-[var(--color-text-muted)] opacity-70">
          Connect to an MCP server to discover available prompts.
        </span>
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 px-6 text-center">
        <span className="text-[13px] text-[var(--color-text-muted)]">No prompts available</span>
        <span className="text-[11px] text-[var(--color-text-muted)] opacity-70">
          This server does not expose any prompts.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-3 gap-2 overflow-auto h-full">
      <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide">
        {prompts.length} prompt{prompts.length !== 1 ? 's' : ''} discovered
      </span>

      {prompts.map((prompt) => (
        <div
          key={prompt.name}
          className="flex items-start gap-2 p-2.5 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-raised)]"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-mono font-medium text-[var(--color-text-primary)] truncate">
              {prompt.name}
            </div>
            {prompt.description && (
              <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 line-clamp-2">
                {prompt.description}
              </div>
            )}
            {prompt.arguments && prompt.arguments.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {prompt.arguments.map((arg) => (
                  <span
                    key={arg.name}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] font-mono"
                  >
                    {arg.name}{arg.required ? '*' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleRun(prompt)}
            className="shrink-0 text-[11px] px-2 py-1 rounded bg-[var(--color-protocol-mcp)] text-white cursor-pointer hover:opacity-90 transition-opacity"
          >
            Run
          </button>
        </div>
      ))}
    </div>
  );
}
