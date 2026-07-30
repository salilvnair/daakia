import { useCallback, useState } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { TextInputView, ToggleSwitchView, ButtonView, ModalView } from '@salilvnair/dui';
import { MdViewer } from '../../shared/display/MdViewer';

const ACCENT = 'var(--color-protocol-mcp)';

const SETUP_DOCS = `
## Daakia as MCP Server

Expose Daakia's request execution engine to external AI clients like **Claude Desktop**, **Cursor**, or any MCP-compatible host.

---

### Available Tools

| Tool | Description |
|------|-------------|
| \`send_request\` | Execute any HTTP request from your Daakia collections |
| \`get_collections\` | List all saved collections and their requests |
| \`run_collection\` | Run an entire request collection in sequence |

---

### Claude Desktop

Edit \`~/Library/Application Support/Claude/claude_desktop_config.json\`:

\`\`\`json
{
  "mcpServers": {
    "daakia": {
      "command": "npx",
      "args": ["-y", "daakia-mcp"]
    }
  }
}
\`\`\`

Restart Claude Desktop after saving the file.

---

### Cursor

Edit \`~/.cursor/mcp.json\` (create if it doesn't exist):

\`\`\`json
{
  "mcpServers": {
    "daakia": {
      "command": "npx",
      "args": ["-y", "daakia-mcp"]
    }
  }
}
\`\`\`

---

### Other MCP Hosts (HTTP transport)

If your client supports HTTP/SSE transport, point it at:

\`\`\`
http://localhost:7878/mcp
\`\`\`

Or with an API key:

\`\`\`json
{
  "mcpServers": {
    "daakia": {
      "url": "http://localhost:7878/mcp",
      "headers": {
        "Authorization": "Bearer <your-daakia-key>"
      }
    }
  }
}
\`\`\`
`;

/**
 * McpSettingsTab — Connection timeouts, auto-reconnect, working directory,
 * and the "Daakia as MCP Server" setup card. All inputs are DUI components.
 */
export function McpSettingsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [showSetup, setShowSetup] = useState(false);

  const settings = activeTab?.mcpSettings || {
    connectionTimeout: 15000,
    requestTimeout: 30000,
    autoReconnect: true,
    maxRetries: 3,
  };

  const updateSetting = useCallback((key: string, value: number | boolean | string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, {
      mcpSettings: { ...settings, [key]: value },
      dirty: true,
    });
  }, [activeTab, updateTab, settings]);

  if (!activeTab) return null;

  return (
    <>
      <div className="flex flex-col px-4 py-3 gap-4 overflow-auto">
        {/* Connection Timeout */}
        <div className="flex items-center">
          <span className="text-[12px] text-[var(--color-text-muted)] w-[140px] flex-shrink-0">Connection Timeout</span>
          <div className="flex items-center gap-2">
            <TextInputView
              type="number"
              value={settings.connectionTimeout}
              onChange={(e) => updateSetting('connectionTimeout', parseInt(e.target.value) || 15000)}
              min={1000}
              max={120000}
              step={1000}
              size="sm"
              className="w-[100px]"
              accentColor={ACCENT}
            />
            <span className="text-[11px] text-[var(--color-text-muted)]">ms</span>
          </div>
        </div>

        {/* Request Timeout */}
        <div className="flex items-center">
          <span className="text-[12px] text-[var(--color-text-muted)] w-[140px] flex-shrink-0">Request Timeout</span>
          <div className="flex items-center gap-2">
            <TextInputView
              type="number"
              value={settings.requestTimeout}
              onChange={(e) => updateSetting('requestTimeout', parseInt(e.target.value) || 30000)}
              min={1000}
              max={300000}
              step={1000}
              size="sm"
              className="w-[100px]"
              accentColor={ACCENT}
            />
            <span className="text-[11px] text-[var(--color-text-muted)]">ms</span>
          </div>
        </div>

        {/* Max Retries */}
        <div className="flex items-center">
          <span className="text-[12px] text-[var(--color-text-muted)] w-[140px] flex-shrink-0">Max Retries</span>
          <TextInputView
            type="number"
            value={settings.maxRetries}
            onChange={(e) => updateSetting('maxRetries', parseInt(e.target.value) || 3)}
            min={0}
            max={10}
            size="sm"
            className="w-[80px]"
            accentColor={ACCENT}
          />
        </div>

        {/* Auto Reconnect */}
        <div className="flex items-center">
          <span className="text-[12px] text-[var(--color-text-muted)] w-[140px] flex-shrink-0">Auto Reconnect</span>
          <ToggleSwitchView
            checked={!!settings.autoReconnect}
            onChange={(v) => updateSetting('autoReconnect', v)}
            size="sm"
            accentColor={ACCENT}
            label={settings.autoReconnect ? 'Enabled' : 'Disabled'}
            labelPosition="right"
          />
        </div>

        {/* Working Directory */}
        <div className="flex items-center">
          <span className="text-[12px] text-[var(--color-text-muted)] w-[140px] flex-shrink-0">Working Directory</span>
          <TextInputView
            value={settings.workingDir || ''}
            onChange={(e) => updateSetting('workingDir', e.target.value)}
            placeholder="Leave blank for workspace root"
            size="sm"
            className="flex-1 max-w-[300px]"
            accentColor={ACCENT}
          />
        </div>

        {/* ── Daakia as MCP Server card ── */}
        <div
          className="mt-2 rounded-lg p-3 border"
          style={{ borderColor: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 5%, var(--color-panel))` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>
              Expose Daakia as MCP Server
            </span>
          </div>
          <p className="text-[11px] mb-2.5" style={{ color: 'var(--color-text-muted)' }}>
            External AI clients (Claude Desktop, Cursor) can use Daakia as an MCP tool server.
            Tools: <code className="text-[10.5px] px-0.5">send_request</code> · <code className="text-[10.5px] px-0.5">get_collections</code> · <code className="text-[10.5px] px-0.5">run_collection</code>
          </p>
          <ButtonView
            label="Show Setup Config"
            variant="accent"
            size="sm"
            accentColor={ACCENT}
            onClick={() => setShowSetup(true)}
          />
        </div>
      </div>

      {/* DUI ModalView popup — Daakia MCP Server setup config */}
      {showSetup && (
        <ModalView
          open
          onClose={() => setShowSetup(false)}
          title="Daakia MCP Server Config"
          size="lg"
          headerColor={ACCENT}
        >
          <div className="p-4 overflow-auto" style={{ maxHeight: '520px' }}>
            <MdViewer content={SETUP_DOCS} className="text-[12px]" />
          </div>
        </ModalView>
      )}
    </>
  );
}
