import { useRef, useEffect, useCallback, useState } from 'react';
import { useTabsStore, type McpConversationEntry } from '../../store/tabs-store';
import { TrashIcon } from '../../icons';
import { JsonTreeViewer } from '../shared/display/JsonTreeViewer';

/**
 * McpResponsePanel — Shows the MCP invocation log (tool calls, resource reads, prompt runs).
 */
export function McpResponsePanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const conversation: McpConversationEntry[] = activeTab?.mcpConversation || [];
  const connected = activeTab?.mcpConnected || false;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.length]);

  const handleClear = useCallback(() => {
    if (!activeTab) return;
    updateTab(activeTab.id, { mcpConversation: [] });
  }, [activeTab, updateTab]);

  if (!connected && conversation.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 px-6 text-center border-t border-[var(--color-surface-border)]">
        <span className="text-[13px] text-[var(--color-text-muted)]">No activity yet</span>
        <span className="text-[11px] text-[var(--color-text-muted)] opacity-70">
          Connect to a server and invoke tools, read resources, or run prompts.
        </span>
      </div>
    );
  }

  const typeColors: Record<string, string> = {
    'tool-call': 'var(--color-protocol-mcp)',
    'tool-result': 'var(--color-success)',
    'prompt-run': 'var(--color-warning)',
    'resource-read': 'var(--color-info)',
    'error': 'var(--color-error)',
  };

  const typeLabels: Record<string, string> = {
    'tool-call': 'TOOL',
    'tool-result': 'RESULT',
    'prompt-run': 'PROMPT',
    'resource-read': 'RESOURCE',
    'error': 'ERROR',
  };

  return (
    <div className="flex flex-col h-full border-t border-[var(--color-surface-border)]">
      {/* Header with clear button */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] flex-shrink-0 bg-[var(--color-panel)]">
        <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Activity Log</span>
        {conversation.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="h-[22px] w-[22px] flex items-center justify-center rounded hover:bg-[rgba(239,68,68,0.08)] text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-colors"
            title="Clear log"
          >
            <TrashIcon size={12} />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-3 flex flex-col gap-2">
        {/* Connection status badge */}
        {connected && (
          <div className="flex items-center gap-2 pb-1.5 mb-1 border-b border-[var(--color-surface-border)]">
            <span className="w-[6px] h-[6px] rounded-full bg-[var(--color-success)] breathing-connected" style={{ color: 'var(--color-success)' }} />
            <span className="text-[11px] text-[var(--color-text-muted)]">Connected</span>
          </div>
        )}

        {conversation.map((entry) => (
          <McpLogEntry key={entry.id} entry={entry} typeColors={typeColors} typeLabels={typeLabels} />
        ))}
      </div>
    </div>
  );
}

/** Individual log entry with Raw/JSON toggle for output */
function McpLogEntry({ entry, typeColors, typeLabels }: { entry: McpConversationEntry; typeColors: Record<string, string>; typeLabels: Record<string, string> }) {
  const [viewMode, setViewMode] = useState<'raw' | 'json'>('json');
  const parsedJson = tryParseJson(entry.output);
  const hasJson = parsedJson !== null;

  return (
    <div
      className={`flex flex-col gap-1.5 p-2.5 rounded-md border ${
        entry.success !== false ? 'border-[var(--color-surface-border)]' : 'border-[rgba(239,68,68,0.4)]'
      } bg-[var(--color-surface-raised)]`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded"
          style={{ color: typeColors[entry.type] || 'var(--color-text-muted)', backgroundColor: `color-mix(in srgb, ${typeColors[entry.type] || 'var(--color-text-muted)'} 12%, transparent)` }}
        >
          {typeLabels[entry.type] || entry.type}
        </span>
        <span className="text-[12px] font-mono font-medium text-[var(--color-text-primary)] truncate flex-1">
          {entry.name}
        </span>
        {entry.duration != null && (
          <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
            {entry.duration}ms
          </span>
        )}
      </div>

      {/* Output with Raw/JSON toggle */}
      {entry.output && (
        <div className="flex flex-col gap-1">
          {/* Toggle buttons */}
          {hasJson && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setViewMode('raw')}
                className={`px-2 py-0.5 text-[9px] font-medium rounded cursor-pointer transition-colors ${
                  viewMode === 'raw'
                    ? 'bg-[var(--color-input-bg)] text-[var(--color-text-primary)] border border-[var(--color-surface-border)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Raw
              </button>
              <button
                onClick={() => setViewMode('json')}
                className={`px-2 py-0.5 text-[9px] font-medium rounded cursor-pointer transition-colors ${
                  viewMode === 'json'
                    ? 'bg-[var(--color-input-bg)] text-[var(--color-text-primary)] border border-[var(--color-surface-border)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                JSON
              </button>
            </div>
          )}

          {/* Content */}
          {hasJson && viewMode === 'json' ? (
            <div className="rounded bg-[var(--color-surface)] p-2 max-h-[200px] overflow-auto text-[11px] font-mono">
              <JsonTreeViewer data={parsedJson} maxInitialDepth={3} />
            </div>
          ) : (
            <pre className="text-[11px] font-mono text-[var(--color-text-primary)] whitespace-pre-wrap max-h-[200px] overflow-auto bg-[var(--color-surface)] rounded p-2">
              {entry.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function tryParseJson(str?: string): unknown | null {
  if (!str) return null;
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
    return null;
  } catch {
    return null;
  }
}
