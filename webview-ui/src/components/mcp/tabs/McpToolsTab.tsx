import { useCallback, useState } from 'react';
import { useTabsStore, type McpToolDef } from '../../../store/tabs-store';
import { McpToolIcon, ChevronRightIcon } from '../../../icons';
import { postMsg } from '../../../vscode';

/** Build a form value map from JSON Schema properties */
function getDefaultArgs(inputSchema: Record<string, unknown>): Record<string, unknown> {
  const props = (inputSchema?.properties || {}) as Record<string, { type?: string; default?: unknown }>;
  return Object.fromEntries(
    Object.entries(props).map(([k, v]) => {
      if (v.default !== undefined) return [k, v.default];
      if (v.type === 'boolean') return [k, false];
      if (v.type === 'number' || v.type === 'integer') return [k, 0];
      if (v.type === 'array' || v.type === 'object') return [k, ''];
      return [k, ''];
    })
  );
}

/** Determine if a schema can be rendered as individual form fields */
function isSimpleSchema(inputSchema: Record<string, unknown>): boolean {
  const props = inputSchema?.properties as Record<string, { type?: string }> | undefined;
  if (!props) return false;
  return Object.values(props).every(p =>
    ['string', 'number', 'integer', 'boolean'].includes(p.type || '')
  );
}

/**
 * McpToolsTab — Lists discovered tools from the connected MCP server.
 * Expandable rows show auto-generated parameter forms for each tool.
 */
export function McpToolsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const tools: McpToolDef[] = activeTab?.mcpCapabilities?.tools || [];
  const connected = activeTab?.mcpConnected || false;

  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [toolArgs, setToolArgs] = useState<Record<string, Record<string, unknown>>>({});

  const getArgs = (toolName: string, schema: Record<string, unknown>) => {
    return toolArgs[toolName] || getDefaultArgs(schema);
  };

  const setArg = (toolName: string, key: string, value: unknown) => {
    setToolArgs(prev => ({
      ...prev,
      [toolName]: { ...getArgs(toolName, {}), [key]: value },
    }));
  };

  const handleInvoke = useCallback((tool: McpToolDef) => {
    if (!activeTab) return;
    const args = toolArgs[tool.name] || getDefaultArgs(tool.inputSchema);

    // Parse string values for object/array fields
    const finalArgs: Record<string, unknown> = {};
    const props = (tool.inputSchema?.properties || {}) as Record<string, { type?: string }>;
    for (const [k, v] of Object.entries(args)) {
      const propType = props[k]?.type;
      if ((propType === 'object' || propType === 'array') && typeof v === 'string') {
        try { finalArgs[k] = JSON.parse(v || '{}'); } catch { finalArgs[k] = v; }
      } else if (propType === 'number' || propType === 'integer') {
        finalArgs[k] = Number(v);
      } else if (propType === 'boolean') {
        finalArgs[k] = Boolean(v);
      } else {
        finalArgs[k] = v;
      }
    }

    postMsg({
      type: 'mcp:callTool',
      tabId: activeTab.id,
      toolName: tool.name,
      arguments: finalArgs,
    });

    setExpandedTool(null);
  }, [activeTab, toolArgs]);

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

  const ACCENT = 'var(--color-protocol-mcp)';

  return (
    <div className="flex flex-col overflow-auto h-full">
      <div className="px-3 pt-2.5 pb-1">
        <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide">
          {tools.length} tool{tools.length !== 1 ? 's' : ''} discovered
        </span>
      </div>

      <div className="flex flex-col gap-0 pb-2">
        {tools.map((tool) => {
          const isExpanded = expandedTool === tool.name;
          const props = (tool.inputSchema?.properties || {}) as Record<string, { type?: string; description?: string }>;
          const required = (tool.inputSchema?.required || []) as string[];
          const propKeys = Object.keys(props);
          const simple = isSimpleSchema(tool.inputSchema);
          const hasParams = propKeys.length > 0;
          const currentArgs = getArgs(tool.name, tool.inputSchema);

          return (
            <div
              key={tool.name}
              className="border-b last:border-b-0"
              style={{ borderColor: 'var(--color-surface-border)' }}
            >
              {/* Tool header row */}
              <div
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${isExpanded ? '' : 'hover:bg-[var(--color-surface-hover)]'}`}
                style={isExpanded ? { backgroundColor: `color-mix(in srgb, ${ACCENT} 5%, var(--color-surface-bg))` } : undefined}
                onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
              >
                {/* Expand chevron */}
                <span
                  className="transition-transform flex-shrink-0"
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', color: isExpanded ? ACCENT : 'var(--color-text-muted)' }}
                >
                  <ChevronRightIcon size={10} />
                </span>
                <McpToolIcon size={13} style={{ color: ACCENT, flexShrink: 0 }} />
                <code
                  className="text-[12px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, transparent)` }}
                >
                  {tool.name}
                </code>
                {tool.description && (
                  <span className="text-[11px] text-[var(--color-text-muted)] truncate flex-1">{tool.description}</span>
                )}
                {!hasParams && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleInvoke(tool); }}
                    className="ml-auto shrink-0 text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors"
                    style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)` }}
                  >
                    Run
                  </button>
                )}
              </div>

              {/* Expanded parameter form */}
              {isExpanded && (
                <div
                  className="px-4 pb-3 pt-2 flex flex-col gap-2"
                  style={{ borderTop: `1px solid color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))` }}
                >
                  {hasParams ? (
                    <>
                      {simple ? (
                        /* Individual field inputs */
                        propKeys.map(key => {
                          const prop = props[key];
                          const isRequired = required.includes(key);
                          const value = currentArgs[key] as string | number | boolean ?? '';

                          return (
                            <div key={key}>
                              <label className="flex items-center gap-1 text-[11px] font-medium mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                                {key}
                                {isRequired && <span style={{ color: 'var(--color-error)' }}>*</span>}
                                {prop.description && <span className="font-normal text-[var(--color-text-muted)] ml-1 truncate">{prop.description}</span>}
                              </label>
                              {prop.type === 'boolean' ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(value)}
                                    onChange={e => setArg(tool.name, key, e.target.checked)}
                                    className="cursor-pointer"
                                    style={{ accentColor: ACCENT }}
                                  />
                                  <span className="text-[11px] text-[var(--color-text-muted)]">{Boolean(value) ? 'true' : 'false'}</span>
                                </div>
                              ) : (
                                <input
                                  type={prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text'}
                                  value={String(value)}
                                  onChange={e => setArg(tool.name, key, e.target.value)}
                                  className="w-full h-[28px] px-2 rounded text-[11.5px] outline-none"
                                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
                                />
                              )}
                            </div>
                          );
                        })
                      ) : (
                        /* JSON textarea for complex schemas */
                        <div>
                          <label className="block text-[11px] font-medium mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                            Arguments (JSON)
                          </label>
                          <textarea
                            rows={4}
                            value={typeof currentArgs === 'object' && !Array.isArray(currentArgs)
                              ? JSON.stringify(Object.fromEntries(Object.entries(currentArgs).filter(([, v]) => v !== '')), null, 2)
                              : '{}'}
                            onChange={e => {
                              try {
                                const parsed = JSON.parse(e.target.value);
                                setToolArgs(prev => ({ ...prev, [tool.name]: parsed }));
                              } catch {
                                // allow invalid JSON while editing
                              }
                            }}
                            className="w-full px-2 py-1.5 rounded text-[11px] font-mono resize-none outline-none"
                            style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
                          />
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            Schema: {JSON.stringify(Object.fromEntries(propKeys.map(k => [k, props[k].type || 'any'])))}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] italic" style={{ color: 'var(--color-text-muted)' }}>No parameters required.</p>
                  )}

                  {/* Invoke button */}
                  <button
                    type="button"
                    onClick={() => handleInvoke(tool)}
                    className="h-[28px] px-4 text-[11.5px] font-medium rounded text-white cursor-pointer hover:opacity-90 transition-opacity self-start"
                    style={{ backgroundColor: ACCENT }}
                  >
                    ▶ Invoke
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
