import { useState, useCallback, useEffect } from 'react';
import { useTabsStore, type McpServerConfig } from '../../../store/tabs-store';
import { CodeEditor } from '../../shared';

const ACCENT = 'var(--color-protocol-mcp)';

const EXAMPLE_CONFIG = JSON.stringify({
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
      }
    }
  }
}, null, 2);

/**
 * McpConfigTab — Full Monaco JSON editor for mcpServerConfigs.
 * Paste Claude Desktop / Cursor MCP config JSON and apply it.
 */
export function McpConfigTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  // Initialize from current mcpServerConfigs
  useEffect(() => {
    if (!activeTab) return;
    const configs = activeTab.mcpServerConfigs || [];
    if (configs.length === 0) {
      setJsonText('');
    } else {
      // Convert array back to claude-desktop format
      const obj: Record<string, unknown> = {};
      for (const cfg of configs) {
        obj[cfg.name] = cfg.transport === 'http'
          ? { url: cfg.url }
          : { command: cfg.command || '', args: cfg.args || [], env: cfg.envVars || {} };
      }
      setJsonText(JSON.stringify({ mcpServers: obj }, null, 2));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id]);

  const handleApply = useCallback(() => {
    if (!activeTab) return;
    setError(null);
    setApplied(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setError(`Invalid JSON: ${(e as Error).message}`);
      return;
    }

    // Accept either { mcpServers: {...} } (Claude Desktop format) or an array of McpServerConfig
    let servers: McpServerConfig[] = [];
    const p = parsed as Record<string, unknown>;
    if (p && typeof p === 'object' && p.mcpServers && typeof p.mcpServers === 'object') {
      const mcpServers = p.mcpServers as Record<string, { command?: string; args?: string[]; env?: Record<string, string>; url?: string }>;
      servers = Object.entries(mcpServers).map(([name, cfg]) => ({
        id: crypto.randomUUID(),
        name,
        transport: (cfg.url ? 'http' : 'stdio') as 'stdio' | 'http',
        command: cfg.command,
        args: cfg.args || [],
        url: cfg.url,
        envVars: cfg.env || {},
        enabled: true,
      }));
    } else if (Array.isArray(parsed)) {
      servers = parsed as McpServerConfig[];
    } else {
      setError('Expected { mcpServers: { ... } } format or an array of server configs.');
      return;
    }

    updateTab(activeTab.id, { mcpServerConfigs: servers, dirty: true });
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  }, [activeTab, updateTab, jsonText]);

  const handleLoadExample = useCallback(() => {
    setJsonText(EXAMPLE_CONFIG);
    setError(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (jsonText) {
      navigator.clipboard.writeText(jsonText).catch(() => {});
    }
  }, [jsonText]);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
        <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide flex-1">
          MCP Server Config (Claude Desktop format)
        </span>
        <button
          type="button"
          onClick={handleLoadExample}
          className="text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors"
          style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}
        >
          Load Example
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!jsonText}
          className="text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}
        >
          Copy
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="text-[11px] px-3 py-0.5 rounded cursor-pointer transition-colors text-white"
          style={{ backgroundColor: applied ? 'var(--color-success)' : ACCENT }}
        >
          {applied ? '✓ Applied' : 'Apply Config'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 text-[11.5px] shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)', borderBottom: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)' }}>
          {error}
        </div>
      )}

      {/* Monaco editor */}
      <div className="flex-1 overflow-hidden">
        <CodeEditor
          value={jsonText}
          onChange={(val) => { setJsonText(val || ''); setError(null); }}
          language="json"
          height="100%"
          placeholder='Paste your Claude Desktop / Cursor mcpServers config JSON here...'
        />
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
        <p className="text-[10.5px] text-[var(--color-text-muted)] opacity-70">
          Paste the full <code className="text-[10px]">mcpServers</code> block from <code className="text-[10px]">claude_desktop_config.json</code>. Click <strong>Apply Config</strong> to update the server list.
        </p>
      </div>
    </div>
  );
}
