import { useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { StyledDropdown, SplitButton, type DropdownOption, type SplitButtonItem } from '../shared';
import { ProtocolMcpBadge, ConnectIcon, DisconnectIcon, SaveIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { saveRequest } from '../../services/request';

const TRANSPORT_OPTIONS: DropdownOption[] = [
  { value: 'stdio', label: 'STDIO' },
  { value: 'http', label: 'HTTP/SSE' },
];

const saveItems: SplitButtonItem[] = [
  { id: 'save-as', label: 'Save as', icon: <SaveIcon size={12} />, iconColor: 'var(--color-ctx-close-saved)', onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }) },
];

/**
 * McpUrlBar — Transport selector + command/URL input + Connect button.
 */
export function McpUrlBar() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const transport = activeTab?.mcpTransport || 'stdio';
  const command = activeTab?.mcpCommand || '';
  const url = activeTab?.url || '';
  const connected = activeTab?.mcpConnected || false;
  const loading = activeTab?.loading || false;
  const connectionError = activeTab?.mcpConnectionError;

  const handleTransportChange = useCallback((val: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { mcpTransport: val as 'stdio' | 'http', dirty: true });
  }, [activeTab, updateTab]);

  const handleCommandChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { mcpCommand: e.target.value, dirty: true });
  }, [activeTab, updateTab]);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { url: e.target.value, dirty: true });
  }, [activeTab, updateTab]);

  const handleConnect = useCallback(() => {
    if (!activeTab) return;

    if (connected || loading) {
      // Disconnect / Cancel
      postMsg({ type: 'mcp:disconnect', tabId: activeTab.id });
      updateTab(activeTab.id, { mcpConnected: false, mcpCapabilities: undefined, loading: false });
    } else {
      // Connect
      postMsg({
        type: 'mcp:connect',
        tabId: activeTab.id,
        transport,
        command: command,
        args: activeTab.mcpArgs || [],
        url: url,
        envVars: activeTab.mcpEnvVars || {},
        settings: activeTab.mcpSettings || {},
      });
      updateTab(activeTab.id, { loading: true });
    }
  }, [activeTab, updateTab, connected, transport, command, url, loading]);

  const handleRetry = useCallback(() => {
    if (!activeTab) return;
    updateTab(activeTab.id, { mcpConnectionError: undefined });
    handleConnect();
  }, [activeTab, updateTab, handleConnect]);

  if (!activeTab) return null;

  return (
    <>
    {connectionError && (
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)', color: 'var(--color-error)' }}>
        <span className="flex-1 truncate">⚠ {connectionError}</span>
        <button
          type="button"
          onClick={handleRetry}
          className="shrink-0 text-[10.5px] px-2 py-0.5 rounded cursor-pointer border transition-colors"
          style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
        >
          Retry
        </button>
        <button
          type="button"
          onClick={() => updateTab(activeTab.id, { mcpConnectionError: undefined })}
          className="shrink-0 cursor-pointer text-[var(--color-error)] opacity-70 hover:opacity-100"
        >
          ×
        </button>
      </div>
    )}
    <div className="url-bar">
      {/* Protocol badge */}
      <ProtocolMcpBadge size={28} />

      {/* Transport selector — auto width based on content */}
      <div className="shrink-0">
        <StyledDropdown
          options={TRANSPORT_OPTIONS}
          value={transport}
          onChange={handleTransportChange}
          accentColor="var(--color-protocol-mcp)"
        />
      </div>

      {/* STDIO: command input */}
      {transport === 'stdio' && (
        <input
          type="text"
          value={command}
          onChange={handleCommandChange}
          placeholder="npx @modelcontextprotocol/server-name"
          className="url-bar-input ml-1"
        />
      )}

      {/* HTTP/SSE: URL input */}
      {transport === 'http' && (
        <input
          type="text"
          value={url}
          onChange={handleUrlChange}
          placeholder="http://localhost:3000/mcp/sse"
          className="url-bar-input ml-1"
        />
      )}

      {/* Connect/Disconnect button */}
      <button
        type="button"
        onClick={handleConnect}
        className="url-bar-send cursor-pointer"
        style={{ backgroundColor: connected || loading ? 'var(--color-error)' : 'var(--color-protocol-mcp)' }}
      >
        {connected ? <DisconnectIcon size={13} /> : <ConnectIcon size={13} />}
        <span>{loading ? 'Cancel' : connected ? 'Disconnect' : 'Connect'}</span>
      </button>

      {/* Save SplitButton */}
      <SplitButton
        label="Save"
        variant="secondary"
        onClick={() => {
          if (!activeTab) return;
          const saved = saveRequest(activeTab);
          if (saved) updateTab(activeTab.id, { dirty: false });
        }}
        icon={<SaveIcon size={13} />}
        items={saveItems}
      />
    </div>
    </>
  );
}
