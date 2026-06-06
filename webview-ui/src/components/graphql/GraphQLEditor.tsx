import { useState, useCallback, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { CodeEditor, KeyValueTable, AuthEditor, ScriptsEditor } from '../shared';
import { postMsg } from '../../vscode';
import { PlayIcon, CopyIcon, WrapLinesIcon, WandIcon, PlusIcon } from '../../icons';
import { setGraphQLSchema, setActiveGraphQLTab } from '../../services/graphql-completion';
import { formatGraphQLQuery } from '../../services/graphql-formatter';
import { GraphQLSubscription } from './GraphQLSubscription';
import { GraphQLQueryTabs, initMultiQuery } from './GraphQLQueryTabs';

type EditorTab = 'query' | 'variables' | 'headers' | 'authorization' | 'scripts' | 'subscription';

/**
 * GraphQL Editor — Query (with Run/Save toolbar), Variables, Headers (shared KVT), Authorization (shared AuthEditor).
 */
export function GraphQLEditor() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);
  const updateTab = useTabsStore(s => s.updateTab);
  const storedSubTab = useUiStateStore(s => s.prefs[`gql.subtab.${activeTabId}`]);
  const [activeSubTab, setActiveSubTabLocal] = useState<EditorTab>((storedSubTab as EditorTab) || 'query');

  useEffect(() => {
    const pref = useUiStateStore.getState().getPref(`gql.subtab.${activeTabId}`, 'query') as EditorTab;
    setActiveSubTabLocal(pref);
  }, [activeTabId]);

  // Sync schema and active tab for GraphQL auto-complete
  const schemaJson = activeTab?.authData?.['gql_schema'] || null;
  useEffect(() => {
    if (activeTabId) {
      setActiveGraphQLTab(activeTabId);
      setGraphQLSchema(activeTabId, schemaJson);
    }
  }, [activeTabId, schemaJson]);

  const setActiveSubTab = (tab: EditorTab) => {
    setActiveSubTabLocal(tab);
    useUiStateStore.getState().setPref(`gql.subtab.${activeTabId}`, tab);
  };

  const handleRun = useCallback(() => {
    if (!activeTab) return;
    const endpoint = activeTab.url.trim();
    if (!endpoint) return;

    updateTab(activeTab.id, { loading: true });
    postMsg({
      type: 'executeGraphQL',
      tabId: activeTab.id,
      endpoint,
      query: activeTab.bodyRaw,
      variables: activeTab.authData?.['gql_variables'] || '',
      headers: activeTab.headers.filter(h => h.enabled && h.key),
      authType: activeTab.authType,
      authData: activeTab.authData,
      envId: activeTab.envId,
      collectionId: activeTab.collectionId,
      preRequestScript: activeTab.preRequestScript || '',
      postResponseScript: activeTab.postResponseScript || '',
    });
  }, [activeTab, updateTab]);

  const handleCopyQuery = useCallback(() => {
    if (!activeTab?.bodyRaw) return;
    navigator.clipboard.writeText(activeTab.bodyRaw);
  }, [activeTab]);

  const handleFormat = useCallback(() => {
    if (!activeTab?.bodyRaw) return;
    const formatted = formatGraphQLQuery(activeTab.bodyRaw);
    updateTab(activeTab.id, { bodyRaw: formatted });
  }, [activeTab, updateTab]);

  const handleAddQueryTab = useCallback(() => {
    if (!activeTab) return;
    initMultiQuery(activeTab.id);
  }, [activeTab]);

  if (!activeTab) return null;

  const query = activeTab.bodyRaw || '';
  const variablesJson = activeTab.authData?.['gql_variables'] || '{}';
  const headersCount = activeTab.headers.filter(h => h.enabled && h.key).length;
  const hasAuth = activeTab.authType !== 'none';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Sub-tabs */}
      <div className="flex items-center border-b border-[var(--color-surface-border)] bg-[var(--color-panel)] px-2">
        {(['query', 'variables', 'headers', 'authorization', 'scripts', 'subscription'] as EditorTab[]).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveSubTab(tab)}
            className={`px-3 py-2 text-[11px] font-medium capitalize cursor-pointer transition-colors border-b-2 ${
              activeSubTab === tab
                ? 'text-[var(--color-protocol-graphql)] border-[var(--color-protocol-graphql)]'
                : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'
            }`}
          >
            {tab === 'authorization' ? 'Authorization' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'headers' && headersCount > 0 ? (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'color-mix(in srgb, #E535AB 15%, transparent)', color: '#E535AB' }}>
                {headersCount}
              </span>
            ) : (tab === 'query' && query.trim()) || (tab === 'variables' && variablesJson !== '{}') || (tab === 'authorization' && hasAuth) || (tab === 'scripts' && (activeTab.preRequestScript?.trim() || activeTab.postResponseScript?.trim())) ? (
              <span className="ml-1 w-1.5 h-1.5 inline-block rounded-full relative -top-[1px] bg-[var(--color-protocol-graphql)]" />
            ) : null}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeSubTab === 'query' && (
          <>
            {/* Query toolbar — label left, action buttons right */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Query</span>
              <div className="flex items-center gap-1">
                {/* Run */}
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={activeTab.loading || !activeTab.url.trim() || !query.trim()}
                  className="h-[26px] px-2.5 text-[11px] font-medium text-[var(--color-success)] hover:bg-[rgba(34,197,94,0.08)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center gap-1.5 rounded-md"
                >
                  <PlayIcon size={11} />
                  {activeTab.loading ? 'Running...' : 'Run'}
                </button>

                {/* Format */}
                <button
                  type="button"
                  onClick={handleFormat}
                  disabled={!query.trim()}
                  title="Prettify query"
                  className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center rounded-md"
                >
                  <WandIcon size={12} />
                </button>

                {/* Copy */}
                <button
                  type="button"
                  onClick={handleCopyQuery}
                  title="Copy query"
                  className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] cursor-pointer transition-colors flex items-center justify-center rounded-md"
                >
                  <CopyIcon size={12} />
                </button>

                {/* Add query tab */}
                {!activeTab.authData?.['gql_queries']?.length && (
                  <button
                    type="button"
                    onClick={handleAddQueryTab}
                    title="Add query tab"
                    className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-protocol-graphql)] hover:bg-[var(--color-hover)] cursor-pointer transition-colors flex items-center justify-center rounded-md"
                  >
                    <PlusIcon size={11} />
                  </button>
                )}
              </div>
            </div>
            {/* Multi-query tabs (shown when enabled) */}
            <GraphQLQueryTabs />
            {/* Monaco editor */}
            <div className="flex-1 min-h-0">
              <CodeEditor
                value={query}
                onChange={(val) => updateTab(activeTab.id, { bodyRaw: val })}
                language="graphql"
                height="100%"
                placeholder="# Write your GraphQL query here&#10;query {&#10;  &#10;}"
              />
            </div>
          </>
        )}

        {activeSubTab === 'variables' && (
          <CodeEditor
            value={variablesJson}
            onChange={(val) => updateTab(activeTab.id, { authData: { ...activeTab.authData, gql_variables: val } })}
            language="json"
            height="100%"
            placeholder='{"key": "value"}'
          />
        )}

        {activeSubTab === 'headers' && (
          <div className="h-full overflow-y-auto [scrollbar-gutter:stable] px-3 py-2">
            <KeyValueTable
              rows={activeTab.headers}
              onChange={(rows) => updateTab(activeTab.id, { headers: rows })}
              placeholder={{ key: 'Header', value: 'Value' }}
              autocompleteKeys
              maskSensitive
              label="Header List"
              accentColor="var(--color-protocol-graphql)"
            />
          </div>
        )}

        {activeSubTab === 'authorization' && (
          <div className="h-full overflow-y-auto [scrollbar-gutter:stable] px-3 py-2">
            <AuthEditor
              authType={activeTab.authType}
              authData={activeTab.authData as Record<string, string>}
              onAuthTypeChange={(v) => updateTab(activeTab.id, { authType: v as typeof activeTab.authType })}
              onAuthDataChange={(data) => updateTab(activeTab.id, { authData: data as any })}
              accentColor="var(--color-protocol-graphql)"
            />
          </div>
        )}

        {activeSubTab === 'scripts' && (
          <div className="flex-1 min-h-0">
            <ScriptsEditor
              preRequestScript={activeTab.preRequestScript || ''}
              postResponseScript={activeTab.postResponseScript || ''}
              onPreRequestScriptChange={(val) => updateTab(activeTab.id, { preRequestScript: val, dirty: true })}
              onPostResponseScriptChange={(val) => updateTab(activeTab.id, { postResponseScript: val, dirty: true })}
              accentColor="var(--color-protocol-graphql)"
            />
          </div>
        )}

        {activeSubTab === 'subscription' && (
          <GraphQLSubscription />
        )}
      </div>
    </div>
  );
}
