import { useCallback, useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SelectInputView, DropDownButtonView, ButtonView, HighlightedInputView, IconButtonView } from '@salilvnair/dui';
import type { SelectOption, ContextMenuItem } from '@salilvnair/dui';
import { ProtocolMcpBadge, ConnectIcon, DisconnectIcon, SaveIcon, SparkleIcon, CloseIcon, MoreVerticalIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { saveRequest } from '../../services/request';
import { AiMcpPromptBuilderModal } from '../ai/AiMcpPromptBuilderModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { logUiEvent } from '../../store/ui-audit-store';
import { useUrlSuggestionsStore } from '../../store/url-suggestions-store';
import { useMockSuggestions } from '../../hooks/useMockSuggestions';

const ACCENT = 'var(--color-protocol-mcp)';

const TRANSPORT_OPTIONS: SelectOption[] = [
  { value: 'stdio', label: 'STDIO' },
  { value: 'http', label: 'HTTP/SSE' },
];

const saveItems: ContextMenuItem[] = [
  { id: 'save-as', label: 'Save as', icon: <SaveIcon size={12} />, iconColor: 'var(--color-ctx-close-saved)', onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }) },
];

/**
 * McpUrlBar — Transport selector + command/URL input + Connect button.
 */
export function McpUrlBar() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [overflowDir, setOverflowDir] = useState<'down' | 'up'>('down');
  const overflowRef = useRef<HTMLDivElement>(null);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.mcp);
  const mockSuggestions = useMockSuggestions('mcp');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    if (showOverflow) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showOverflow]);

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

  const handleCommandChange = useCallback((val: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { mcpCommand: val, dirty: true });
  }, [activeTab, updateTab]);

  const handleUrlChange = useCallback((val: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { url: val, dirty: true });
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
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0 bg-[var(--color-panel)] overflow-x-auto overflow-y-hidden">
        {/* Protocol badge */}
        <div className="flex-shrink-0"><ProtocolMcpBadge size={28} /></div>

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

        {/* STDIO: command input — shrinks down to minWidth; past that the bar scrolls
            horizontally instead of squeezing/overlapping. */}
        {transport === 'stdio' && (
          <div className="flex-1 min-w-0" style={{ minWidth: 160 }}>
            <HighlightedInputView
              value={command}
              onChange={handleCommandChange}
              placeholder="npx @modelcontextprotocol/server-name"
              suggestions={urlSuggestions}
              mockServers={mockSuggestions}
              size="lg"
              accentColor={ACCENT}
            />
          </div>
        )}

        {/* HTTP/SSE: URL input — shrinks down to minWidth; past that the bar scrolls
            horizontally instead of squeezing/overlapping. */}
        {transport === 'http' && (
          <div className="flex-1 min-w-0" style={{ minWidth: 160 }}>
            <HighlightedInputView
              value={url}
              onChange={handleUrlChange}
              placeholder="http://localhost:3000/mcp/sse"
              suggestions={urlSuggestions}
              mockServers={mockSuggestions}
              size="lg"
              accentColor={ACCENT}
            />
          </div>
        )}

        {/* Connect/Disconnect button */}
        <ButtonView
          className="flex-shrink-0"
          variant="primary"
          size="lg"
          onClick={handleConnect}
          iconLeft={connected ? <DisconnectIcon size={13} /> : <ConnectIcon size={13} />}
          accentColor={connected || loading ? 'var(--color-error)' : ACCENT}
          disabled={!connected && !loading && (transport === 'stdio' ? !command.trim() : !url.trim())}
        >
          {loading ? 'Cancel' : connected ? 'Disconnect' : 'Connect'}
        </ButtonView>

        {/* Save */}
        <DropDownButtonView
          className="flex-shrink-0"
          label="Save"
          icon={<SaveIcon size={13} />}
          variant="secondary"
          size="lg"
          onPrimaryClick={() => {
            if (!activeTab) return;
            const saved = saveRequest(activeTab);
            if (saved) updateTab(activeTab.id, { dirty: false });
          }}
          items={saveItems}
          align="right"
        />

        {/* AI Tools ⋮ menu */}
        <div className="flex-shrink-0 relative" ref={overflowRef}>
          <IconButtonView
            icon={<MoreVerticalIcon size={15} />}
            title="AI tools"
            size="lg"
            active={showOverflow}
            onClick={() => {
              if (!showOverflow && overflowRef.current) {
                const rect = overflowRef.current.getBoundingClientRect();
                setOverflowDir((window.innerHeight - rect.bottom) < 180 ? 'up' : 'down');
              }
              setShowOverflow(p => !p);
            }}
          />

          {showOverflow && (
            <div
              className={`absolute right-0 z-50 rounded-xl border shadow-2xl overflow-hidden min-w-[200px] ${overflowDir === 'up' ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]'}`}
              style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
            >
              <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
                <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>AI Tools</p>
              </div>
              {aiEnabled('mcpPromptBuilder') && (
                <button type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                  style={{ color: 'var(--color-protocol-ai)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  onClick={() => { setShowPromptBuilder(true); setShowOverflow(false); }}
                >
                  <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                  Prompt Builder
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {showPromptBuilder && <AiMcpPromptBuilderModal onClose={() => setShowPromptBuilder(false)} />}
    </>
  );
}
