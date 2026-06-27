import { useCallback, useState } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SelectInputView, SplitButtonView, ButtonView, TextInputView, IconButtonView } from '@salilvnair/dui';
import type { SelectOption, SplitButtonViewItem } from '@salilvnair/dui';
import { ProtocolMcpBadge, ConnectIcon, DisconnectIcon, SaveIcon, SparkleIcon, CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { saveRequest } from '../../services/request';
import { AiMcpPromptBuilderModal } from '../ai/AiMcpPromptBuilderModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { logUiEvent } from '../../store/ui-audit-store';

const ACCENT = 'var(--color-protocol-mcp)';

const TRANSPORT_OPTIONS: SelectOption[] = [
  { value: 'stdio', label: 'STDIO' },
  { value: 'http', label: 'HTTP/SSE' },
];

const saveItems: SplitButtonViewItem[] = [
  { id: 'save-as', label: 'Save as', icon: <SaveIcon size={12} />, iconColor: 'var(--color-ctx-close-saved)', onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }) },
];

/**
 * McpUrlBar — Transport selector + command/URL input + Connect button.
 */
export function McpUrlBar() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);

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
      logUiEvent('mcp.disconnect');
      postMsg({ type: 'mcp:disconnect', tabId: activeTab.id });
      updateTab(activeTab.id, { mcpConnected: false, mcpCapabilities: undefined, loading: false });
    } else {
      logUiEvent('mcp.connect', { transport });
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
          <ButtonView
            variant="secondary"
            size="sm"
            onClick={handleRetry}
            accentColor="var(--color-error)"
            color="var(--color-error)"
          >
            Retry
          </ButtonView>
          <IconButtonView
            icon={<CloseIcon size={11} />}
            size="sm"
            accentColor="var(--color-error)"
            onClick={() => updateTab(activeTab.id, { mcpConnectionError: undefined })}
          />
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0 bg-[var(--color-panel)]">
        {/* Protocol badge */}
        <ProtocolMcpBadge size={28} />

        {/* Transport selector */}
        <div className="shrink-0">
          <SelectInputView
            options={TRANSPORT_OPTIONS}
            value={transport}
            onChange={handleTransportChange}
            size="lg"
            accentColor={ACCENT}
          />
        </div>

        {/* STDIO: command input */}
        {transport === 'stdio' && (
          <TextInputView
            value={command}
            onChange={handleCommandChange}
            placeholder="npx @modelcontextprotocol/server-name"
            size="lg"
            className="flex-1"
            accentColor={ACCENT}
          />
        )}

        {/* HTTP/SSE: URL input */}
        {transport === 'http' && (
          <TextInputView
            value={url}
            onChange={handleUrlChange}
            placeholder="http://localhost:3000/mcp/sse"
            size="lg"
            className="flex-1"
            accentColor={ACCENT}
          />
        )}

        {/* Connect/Disconnect button */}
        <ButtonView
          variant="primary"
          size="lg"
          onClick={handleConnect}
          iconLeft={connected ? <DisconnectIcon size={13} /> : <ConnectIcon size={13} />}
          accentColor={connected || loading ? 'var(--color-error)' : ACCENT}
          disabled={!connected && !loading && (transport === 'stdio' ? !command.trim() : !url.trim())}
        >
          {loading ? 'Cancel' : connected ? 'Disconnect' : 'Connect'}
        </ButtonView>

        {/* Save SplitButton */}
        <SplitButtonView
          label="Save"
          variant="secondary"
          size="lg"
          onClick={() => {
            if (!activeTab) return;
            const saved = saveRequest(activeTab);
            if (saved) updateTab(activeTab.id, { dirty: false });
          }}
          icon={<SaveIcon size={13} />}
          items={saveItems}
        />

        {/* Prompt Builder ✦ */}
        {aiEnabled('mcpPromptBuilder') && (
          <ButtonView
            variant="secondary"
            size="lg"
            onClick={() => setShowPromptBuilder(true)}
            iconLeft={<SparkleIcon size={11} />}
            accentColor={ACCENT}
            color={ACCENT}
          >
            Prompt Builder ✦
          </ButtonView>
        )}
      </div>
      {showPromptBuilder && <AiMcpPromptBuilderModal onClose={() => setShowPromptBuilder(false)} />}
    </>
  );
}
