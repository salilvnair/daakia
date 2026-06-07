import { useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../store/url-suggestions-store';
import { postMsg } from '../../vscode';
import { SplitButton, HighlightedInput, type SplitButtonItem } from '../shared';
import { saveRequest } from '../../services/request';
import { ConnectIcon, DisconnectIcon, SaveIcon } from '../../icons';
import { useMockSuggestions } from '../../hooks/useMockSuggestions';

/**
 * GraphQL URL bar — endpoint input + Connect/Disconnect button.
 * Connect triggers schema introspection. Run is in the query editor.
 */
export function GraphQLUrlBar() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.graphql);
  const mockSuggestions = useMockSuggestions('graphql');

  const isConnected = !!activeTab?.authData?.['gql_connected'];

  const handleConnect = useCallback(() => {
    if (!activeTab) return;
    const endpoint = activeTab.url.trim();
    if (!endpoint) return;

    updateTab(activeTab.id, { authData: { ...activeTab.authData, gql_connected: 'connecting' } });
    postMsg({
      type: 'graphql:connect',
      tabId: activeTab.id,
      endpoint,
      headers: activeTab.headers.filter(h => h.enabled && h.key),
      envId: activeTab.envId,
    });
  }, [activeTab, updateTab]);

  const handleDisconnect = useCallback(() => {
    if (!activeTab) return;
    const { gql_connected, gql_schema, gql_schema_sdl, ...restAuth } = activeTab.authData || {};
    updateTab(activeTab.id, { authData: restAuth });
  }, [activeTab, updateTab]);

  if (!activeTab) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
      {/* Protocol badge */}
      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider text-[var(--color-protocol-graphql)] bg-[rgba(229,53,171,0.1)]">
        GQL
      </span>

      {/* Endpoint input */}
      <HighlightedInput
        value={activeTab.url}
        onChange={(v) => updateTab(activeTab.id, { url: v })}
        onKeyDown={(e) => { if (e.key === 'Enter') isConnected ? handleDisconnect() : handleConnect(); }}
        placeholder="https://api.example.com/graphql"
        disabled={isConnected}
        suggestions={urlSuggestions}
        mockServers={mockSuggestions}
        protocolHints={['http://', 'https://']}
        accentColor="var(--color-protocol-graphql)"
      />

      {/* Connect/Disconnect button */}
      {!isConnected ? (
        <button
          type="button"
          onClick={handleConnect}
          disabled={!activeTab.url.trim() || activeTab.authData?.['gql_connected'] === 'connecting'}
          className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-protocol-graphql)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity flex items-center gap-1.5 flex-shrink-0"
        >
          <ConnectIcon size={12} />
          {activeTab.authData?.['gql_connected'] === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleDisconnect}
          className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[rgba(239,68,68,0.12)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.2)] cursor-pointer transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <DisconnectIcon size={12} />
          Disconnect
        </button>
      )}

      {/* Save SplitButton */}
      <SplitButton
        label="Save"
        variant="secondary"
        onClick={() => {
          const saved = saveRequest(activeTab);
          if (saved) useTabsStore.getState().updateTab(activeTab.id, { dirty: false });
        }}
        icon={<SaveIcon />}
        items={saveItems}
      />
    </div>
  );
}

const saveItems: SplitButtonItem[] = [
  {
    id: 'save-as',
    label: 'Save as',
    icon: <SaveIcon />,
    iconColor: 'var(--color-ctx-close-saved)',
    onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }),
  },
];
