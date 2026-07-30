import { useState, useCallback, useEffect, useRef } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { AuthEditor, ScriptsEditor } from '../shared';
import { postMsg } from '../../vscode';
import { PlayIcon, WandIcon, PlusIcon, SparkleIcon } from '../../icons';
import {
  EditorView,
  KeyValueTableView,
  TabView,
  ButtonView,
  IconButtonView,
  CopyButtonView,
  type TabItem,
} from '@salilvnair/dui';
import { setGraphQLSchema, setActiveGraphQLTab } from '../../services/graphql-completion';
import { formatGraphQLQuery } from '../../services/graphql-formatter';
import { GraphQLSubscription } from './GraphQLSubscription';
import { GraphQLQueryTabs, initMultiQuery } from './GraphQLQueryTabs';
import { AiHeaderSuggest, type AiHeaderSuggestHandle } from '../ai/AiHeaderSuggest';
import { AiRequestFuzzerModal } from '../ai/AiRequestFuzzerModal';
import { AiGqlQueryBuilderDrawer, type AiGqlQueryBuilderDrawerHandle } from '../ai/AiGqlQueryBuilderDrawer';
import { AiGqlSchemaExplainerModal } from '../ai/AiGqlSchemaExplainerModal';
import { logUiEvent } from '../../store/ui-audit-store';
import { useAiFeaturesStore } from '../../store/ai-features-store';

type EditorTab = 'query' | 'variables' | 'headers' | 'authorization' | 'scripts' | 'subscription';

const ACCENT = 'var(--color-protocol-graphql)';

/**
 * GraphQL Editor — Query (with Run/Save toolbar), Variables, Headers (shared KVT), Authorization (shared AuthEditor).
 */
export function GraphQLEditor() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);
  const updateTab = useTabsStore(s => s.updateTab);
  const storedSubTab = useUiStateStore(s => s.prefs[`gql.subtab.${activeTabId}`]);
  const [activeSubTab, setActiveSubTabLocal] = useState<EditorTab>((storedSubTab as EditorTab) || 'query');
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const aiHeaderSuggestRef = useRef<AiHeaderSuggestHandle>(null);
  const qbRef = useRef<AiGqlQueryBuilderDrawerHandle>(null);
  const [aiHeaderLoading, setAiHeaderLoading] = useState(false);

  // Modal state
  const [showFuzzer, setShowFuzzer] = useState(false);
  const [showSchemaExplainer, setShowSchemaExplainer] = useState(false);

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

    logUiEvent('graphql.send', { url: endpoint });
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

  const subTabs: TabItem[] = [
    { id: 'query', label: 'Query', dot: !!query.trim() },
    { id: 'variables', label: 'Variables', dot: variablesJson !== '{}' },
    { id: 'headers', label: 'Headers', badge: headersCount || undefined, badgeColor: ACCENT },
    { id: 'authorization', label: 'Authorization', dot: hasAuth, dotColor: ACCENT },
    {
      id: 'scripts', label: 'Scripts',
      dot: !!(activeTab.preRequestScript?.trim() || activeTab.postResponseScript?.trim()),
      dotColor: ACCENT,
    },
    { id: 'subscription', label: 'Subscription' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[var(--color-surface)]">
      {/* Sub-tabs — same padding/size as REST request panel tabs */}
      <div className="flex items-center px-3 pt-2.5 pb-0 border-b border-[var(--color-surface-border)]">
        <div className="flex-1">
          <TabView
            tabs={subTabs}
            activeTab={activeSubTab}
            onChange={(id) => setActiveSubTab(id as EditorTab)}
            variant="underline"
            accentColor={ACCENT}
            size="md"
          />
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-[var(--color-surface)]">
        {activeSubTab === 'query' && (
          <>
            {/* Query toolbar — action buttons right only */}
            <div className="flex items-center justify-end px-3 py-1 border-b border-[var(--color-surface-border)] bg-[var(--color-surface)]">
              <div className="flex items-center gap-1">
                {/* 8.8: Query Builder ✦ — inline drawer above editor */}
                {aiEnabled('gqlQueryBuilder') && (
                  <ButtonView
                    size="xs"
                    variant="ghost"
                    iconLeft={<SparkleIcon size={10} />}
                    title="AI Query Builder — describe what you want, AI writes the query"
                    onClick={() => qbRef.current?.open()}
                    style={{ color: 'var(--color-protocol-ai)' }}
                  >
                    Query Builder
                  </ButtonView>
                )}
                {/* 8.9: Schema Explainer ✦ */}
                {aiEnabled('gqlSchemaExplainer') && activeTab.authData?.['gql_schema'] && (
                  <ButtonView
                    size="xs"
                    variant="ghost"
                    iconLeft={<SparkleIcon size={10} />}
                    title="Schema Explainer — AI explains all types and operations"
                    onClick={() => setShowSchemaExplainer(true)}
                    style={{ color: 'var(--color-protocol-ai)' }}
                  >
                    Schema Explainer
                  </ButtonView>
                )}
                {/* Run — same size/ghost style as AI toolbar buttons, GQL protocol color */}
                <ButtonView
                  size="xs"
                  variant="ghost"
                  iconLeft={<PlayIcon size={10} />}
                  title="Run query"
                  disabled={activeTab.loading || !activeTab.url.trim() || !query.trim()}
                  onClick={handleRun}
                  style={{ color: activeTab.loading ? 'var(--color-text-muted)' : ACCENT }}
                >
                  {activeTab.loading ? 'Running...' : 'Run'}
                </ButtonView>
                {/* Format */}
                <IconButtonView
                  icon={<WandIcon size={10} />}
                  title="Prettify query"
                  size="xs"
                  disabled={!query.trim()}
                  onClick={handleFormat}
                />
                {/* Copy query */}
                <CopyButtonView
                  text={query}
                  size="xs"
                  title="Copy query"
                  accentColor="var(--color-success)"
                />
                {/* Add query tab */}
                {!activeTab.authData?.['gql_queries']?.length && (
                  <IconButtonView
                    icon={<PlusIcon size={10} />}
                    title="Add query tab"
                    size="xs"
                    accentColor={ACCENT}
                    onClick={handleAddQueryTab}
                  />
                )}
              </div>
            </div>
            {/* Multi-query tabs (shown when enabled) */}
            <GraphQLQueryTabs />
            {/* Query Builder inline drawer — shown above editor when active */}
            {aiEnabled('gqlQueryBuilder') && (
              <AiGqlQueryBuilderDrawer
                ref={qbRef}
                tabId={activeTab.id}
                onApply={(q) => updateTab(activeTab.id, { bodyRaw: q })}
              />
            )}
            {/* Monaco editor */}
            <div className="flex-1 min-h-0">
              <EditorView
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
          <div className="flex-1 flex flex-col min-h-0 bg-[var(--color-surface)]">
            {/* Variables toolbar — Fuzz only */}
            {aiEnabled('requestFuzzer') && (
              <div className="flex items-center justify-end px-3 py-[7px] border-b border-[var(--color-surface-border)] bg-[var(--color-surface)]">
                <ButtonView
                  size="xs"
                  variant="ghost"
                  iconLeft={<SparkleIcon size={10} />}
                  title="AI Variable Fuzzer"
                  onClick={() => setShowFuzzer(true)}
                  style={{ color: 'var(--color-protocol-ai)' }}
                >
                  Fuzz
                </ButtonView>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <EditorView
                value={variablesJson}
                onChange={(val) => updateTab(activeTab.id, { authData: { ...activeTab.authData, gql_variables: val } })}
                language="json"
                height="100%"
                placeholder='{"key": "value"}'
              />
            </div>
          </div>
        )}

        {activeSubTab === 'headers' && (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Headers — ditto same as REST HeadersTab: KVT with toolbarExtra sparkle + headless AiHeaderSuggest */}
            <KeyValueTableView
              rows={activeTab.headers}
              onChange={(rows) => updateTab(activeTab.id, { headers: rows })}
              placeholder={{ key: 'Header', value: 'Value' }}
              autocompleteKeys
              maskSensitive
              label="Headers"
              accentColor={ACCENT}
              toolbarExtra={
                aiEnabled('headerAutocomplete') ? (
                  <IconButtonView
                    icon={<SparkleIcon size={13} />}
                    size="md"
                    title="Suggest headers"
                    accentColor="var(--color-protocol-ai)"
                    disabled={aiHeaderLoading}
                    onClick={() => {
                      setAiHeaderLoading(true);
                      aiHeaderSuggestRef.current?.trigger();
                      setTimeout(() => setAiHeaderLoading(false), 300);
                    }}
                  />
                ) : undefined
              }
            />
            {aiEnabled('headerAutocomplete') && (
              <AiHeaderSuggest
                ref={aiHeaderSuggestRef}
                tabId={activeTab.id}
                method="GQL"
                url={activeTab.url || ''}
                bodyContentType="application/json"
                authType={activeTab.authType}
                existingHeaders={activeTab.headers}
                onAddHeader={(key, value) => {
                  const rows = [...activeTab.headers];
                  const empty = rows.findIndex(r => !r.key);
                  if (empty >= 0) {
                    rows[empty] = { ...rows[empty], key, value, enabled: true };
                  } else {
                    rows.push({ id: crypto.randomUUID(), key, value, enabled: true });
                  }
                  updateTab(activeTab.id, { headers: rows });
                }}
              />
            )}
          </div>
        )}

        {activeSubTab === 'authorization' && (
          <div className="h-full overflow-y-auto [scrollbar-gutter:stable] px-3 py-2">
            <AuthEditor
              authType={activeTab.authType}
              authData={activeTab.authData as Record<string, string>}
              onAuthTypeChange={(v) => updateTab(activeTab.id, { authType: v as typeof activeTab.authType })}
              onAuthDataChange={(data) => updateTab(activeTab.id, { authData: data as any })}
              accentColor={ACCENT}
            />
          </div>
        )}

        {activeSubTab === 'scripts' && (
          <div className="flex-1 min-h-0 flex flex-col px-3 pt-2">
            <ScriptsEditor
              preRequestScript={activeTab.preRequestScript || ''}
              postResponseScript={activeTab.postResponseScript || ''}
              onPreRequestScriptChange={(val) => updateTab(activeTab.id, { preRequestScript: val, dirty: true })}
              onPostResponseScriptChange={(val) => updateTab(activeTab.id, { postResponseScript: val, dirty: true })}
              accentColor={ACCENT}
            />
          </div>
        )}

        {activeSubTab === 'subscription' && (
          <GraphQLSubscription />
        )}
      </div>

      {/* Modals */}
      {showFuzzer && <AiRequestFuzzerModal onClose={() => setShowFuzzer(false)} />}
      {showSchemaExplainer && (
        <AiGqlSchemaExplainerModal onClose={() => setShowSchemaExplainer(false)} />
      )}
    </div>
  );
}
