import { useState, useCallback, useEffect } from 'react';
import { useTabsStore, type McpServerConfig } from '../../../store/tabs-store';
import { ModalView, EditorView, ButtonView } from '@salilvnair/dui';
import { MdViewer } from '../../shared/display/MdViewer';

const ACCENT = 'var(--color-protocol-mcp)';

const EXAMPLE_CONFIG = JSON.stringify({
  mcpServers: {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/files'],
    },
    github: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '<YOUR_TOKEN>' },
    },
  },
}, null, 2);

const FORMAT_DOCS = `
## Config Format

Paste the \`mcpServers\` block from your **Claude Desktop** or **Cursor** config file.

**STDIO** — spawns a subprocess:
\`\`\`json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
\`\`\`

**HTTP** — calls a JSON-RPC endpoint:
\`\`\`json
{
  "mcpServers": {
    "my-api": { "url": "https://example.com/mcp" }
  }
}
\`\`\`

Config file: \`~/Library/Application Support/Claude/claude_desktop_config.json\`
`;

interface McpConfigModalProps {
  onClose: () => void;
}

/**
 * McpConfigModal — DUI popup for importing MCP server configs from
 * Claude Desktop / Cursor JSON format. Uses MdViewer for the format guide.
 */
export function McpConfigModal({ onClose }: McpConfigModalProps) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!activeTab) return;
    const configs = activeTab.mcpServerConfigs || [];
    if (configs.length === 0) {
      setJsonText('');
    } else {
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

    let servers: McpServerConfig[] = [];
    const p = parsed as Record<string, unknown>;
    if (p && typeof p === 'object' && p.mcpServers && typeof p.mcpServers === 'object') {
      const mcpServers = p.mcpServers as Record<string, {
        command?: string; args?: string[]; env?: Record<string, string>; url?: string;
      }>;
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
    setTimeout(() => { setApplied(false); onClose(); }, 1200);
  }, [activeTab, updateTab, jsonText, onClose]);

  return (
    <ModalView
      open
      onClose={onClose}
      title="Import MCP Server Config"
      size="lg"
      headerColor={ACCENT}
      footerLeft={
        <ButtonView
          label="Load Example"
          variant="secondary"
          size="md"
          onClick={() => { setJsonText(EXAMPLE_CONFIG); setError(null); }}
        />
      }
      footerRight={
        <ButtonView
          label={applied ? '✓ Applied' : 'Apply Config'}
          variant="primary"
          size="md"
          accentColor={applied ? 'var(--color-success)' : ACCENT}
          onClick={handleApply}
        />
      }
    >
      <div className="flex flex-col gap-4 p-4 min-h-0">
        {/* Format guide */}
        <div className="rounded-lg border border-[var(--color-surface-border)] overflow-auto max-h-[220px]">
          <MdViewer content={FORMAT_DOCS} className="px-4 pt-3 pb-1 text-[12px]" />
        </div>

        {/* JSON editor */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
            Paste Config JSON
          </span>
          <div style={{ height: 180 }}>
            <EditorView
              value={jsonText}
              onChange={(val) => { setJsonText(val || ''); setError(null); }}
              language="json"
              className="h-full"
              placeholder="Paste your Claude Desktop mcpServers config JSON here..."
            />
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="px-3 py-2 rounded-md text-[11.5px]"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
              color: 'var(--color-error)',
              border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </ModalView>
  );
}
