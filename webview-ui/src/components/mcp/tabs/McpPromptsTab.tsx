import { useCallback, useState } from 'react';
import { useTabsStore, type McpPromptDef } from '../../../store/tabs-store';
import { ChevronRightIcon } from '../../../icons';
import { postMsg } from '../../../vscode';

const ACCENT = 'var(--color-warning)';

/**
 * McpPromptsTab — Lists discovered prompts from the connected MCP server.
 * Expandable rows show argument forms for prompts that have parameters.
 */
export function McpPromptsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const prompts: McpPromptDef[] = activeTab?.mcpCapabilities?.prompts || [];
  const connected = activeTab?.mcpConnected || false;

  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [promptArgs, setPromptArgs] = useState<Record<string, Record<string, string>>>({});

  const setArg = (promptName: string, argName: string, value: string) => {
    setPromptArgs(prev => ({
      ...prev,
      [promptName]: { ...(prev[promptName] || {}), [argName]: value },
    }));
  };

  const handleRun = useCallback((prompt: McpPromptDef) => {
    if (!activeTab) return;
    postMsg({
      type: 'mcp:getPrompt',
      tabId: activeTab.id,
      promptName: prompt.name,
      arguments: promptArgs[prompt.name] || {},
    });
    setExpandedPrompt(null);
  }, [activeTab, promptArgs]);

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
    <div className="flex flex-col overflow-auto h-full">
      <div className="px-3 pt-2.5 pb-1">
        <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide">
          {prompts.length} prompt{prompts.length !== 1 ? 's' : ''} discovered
        </span>
      </div>

      <div className="flex flex-col gap-0 pb-2">
        {prompts.map((prompt) => {
          const isExpanded = expandedPrompt === prompt.name;
          const hasArgs = (prompt.arguments || []).length > 0;
          const currentArgs = promptArgs[prompt.name] || {};

          return (
            <div
              key={prompt.name}
              className="border-b last:border-b-0"
              style={{ borderColor: 'var(--color-surface-border)' }}
            >
              {/* Prompt header row */}
              <div
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${isExpanded ? '' : 'hover:bg-[var(--color-surface-hover)]'}`}
                style={isExpanded ? { backgroundColor: `color-mix(in srgb, ${ACCENT} 5%, var(--color-surface-bg))` } : undefined}
                onClick={() => setExpandedPrompt(isExpanded ? null : prompt.name)}
              >
                <span
                  className="transition-transform flex-shrink-0"
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', color: isExpanded ? ACCENT : 'var(--color-text-muted)' }}
                >
                  <ChevronRightIcon size={10} />
                </span>
                <span className="text-[12px] font-mono font-semibold" style={{ color: ACCENT }}>{prompt.name}</span>
                {prompt.description && (
                  <span className="text-[11px] text-[var(--color-text-muted)] truncate flex-1">{prompt.description}</span>
                )}
                {!hasArgs && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRun(prompt); }}
                    className="ml-auto shrink-0 text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors"
                    style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)` }}
                  >
                    Run
                  </button>
                )}
              </div>

              {/* Expanded argument form */}
              {isExpanded && (
                <div
                  className="px-4 pb-3 pt-2 flex flex-col gap-2"
                  style={{ borderTop: `1px solid color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))` }}
                >
                  {hasArgs ? (
                    (prompt.arguments || []).map(arg => (
                      <div key={arg.name}>
                        <label className="flex items-center gap-1 text-[11px] font-medium mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                          {arg.name}
                          {arg.required && <span style={{ color: 'var(--color-error)' }}>*</span>}
                          {arg.description && <span className="font-normal text-[var(--color-text-muted)] ml-1 truncate">{arg.description}</span>}
                        </label>
                        <input
                          type="text"
                          value={currentArgs[arg.name] || ''}
                          onChange={e => setArg(prompt.name, arg.name, e.target.value)}
                          className="w-full h-[28px] px-2 rounded text-[11.5px] outline-none"
                          style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] italic" style={{ color: 'var(--color-text-muted)' }}>No arguments required.</p>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRun(prompt)}
                    className="h-[28px] px-4 text-[11.5px] font-medium rounded text-white cursor-pointer hover:opacity-90 transition-opacity self-start"
                    style={{ backgroundColor: ACCENT }}
                  >
                    ▶ Run Prompt
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
