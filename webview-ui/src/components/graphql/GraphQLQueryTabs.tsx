import { useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { PlusIcon, CloseIcon } from '../../icons';

export interface QueryTab {
  id: string;
  name: string;
  query: string;
  variables: string;
}

/**
 * GraphQL Query Tabs — inner tabs within the Query sub-tab for multiple queries per connection.
 * Stored in tab.authData['gql_queries'] and tab.authData['gql_active_query'].
 */
export function GraphQLQueryTabs() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  if (!activeTab) return null;

  const queries: QueryTab[] = activeTab.authData?.['gql_queries'] || [];
  const activeQueryId: string = activeTab.authData?.['gql_active_query'] || '';

  // If no query tabs exist, don't render the bar (single-query mode)
  if (queries.length === 0) return null;

  const handleSelectQuery = useCallback((queryId: string) => {
    if (!activeTab) return;
    const queries: QueryTab[] = activeTab.authData?.['gql_queries'] || [];
    const currentActive = activeTab.authData?.['gql_active_query'] || '';

    // Save current query content to the currently active query tab
    const updated = queries.map(q =>
      q.id === currentActive
        ? { ...q, query: activeTab.bodyRaw || '', variables: activeTab.authData?.['gql_variables'] || '{}' }
        : q
    );

    // Load the selected query tab content
    const selected = updated.find(q => q.id === queryId);
    if (!selected) return;

    updateTab(activeTab.id, {
      bodyRaw: selected.query,
      authData: {
        ...activeTab.authData,
        gql_queries: updated,
        gql_active_query: queryId,
        gql_variables: selected.variables,
      },
    });
  }, [activeTab, updateTab]);

  const handleAddQuery = useCallback(() => {
    if (!activeTab) return;
    const queries: QueryTab[] = activeTab.authData?.['gql_queries'] || [];
    const currentActive = activeTab.authData?.['gql_active_query'] || '';

    // Save current content
    const updated = queries.map(q =>
      q.id === currentActive
        ? { ...q, query: activeTab.bodyRaw || '', variables: activeTab.authData?.['gql_variables'] || '{}' }
        : q
    );

    const newId = crypto.randomUUID();
    const newQuery: QueryTab = {
      id: newId,
      name: `Query ${updated.length + 1}`,
      query: '',
      variables: '{}',
    };

    updateTab(activeTab.id, {
      bodyRaw: '',
      authData: {
        ...activeTab.authData,
        gql_queries: [...updated, newQuery],
        gql_active_query: newId,
        gql_variables: '{}',
      },
    });
  }, [activeTab, updateTab]);

  const handleCloseQuery = useCallback((e: React.MouseEvent, queryId: string) => {
    e.stopPropagation();
    if (!activeTab) return;
    const queries: QueryTab[] = activeTab.authData?.['gql_queries'] || [];

    // Don't allow closing the last query tab
    if (queries.length <= 1) return;

    const remaining = queries.filter(q => q.id !== queryId);
    const wasActive = activeTab.authData?.['gql_active_query'] === queryId;

    if (wasActive) {
      // Switch to first remaining tab
      const next = remaining[0];
      updateTab(activeTab.id, {
        bodyRaw: next.query,
        authData: {
          ...activeTab.authData,
          gql_queries: remaining,
          gql_active_query: next.id,
          gql_variables: next.variables,
        },
      });
    } else {
      updateTab(activeTab.id, {
        authData: { ...activeTab.authData, gql_queries: remaining },
      });
    }
  }, [activeTab, updateTab]);

  const handleRenameQuery = useCallback((queryId: string, name: string) => {
    if (!activeTab) return;
    const queries: QueryTab[] = activeTab.authData?.['gql_queries'] || [];
    const updated = queries.map(q => q.id === queryId ? { ...q, name } : q);
    updateTab(activeTab.id, {
      authData: { ...activeTab.authData, gql_queries: updated },
    });
  }, [activeTab, updateTab]);

  return (
    <div className="flex items-center gap-0 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)] px-1 overflow-x-auto [scrollbar-width:none]">
      {queries.map(q => (
        <div
          key={q.id}
          onClick={() => handleSelectQuery(q.id)}
          className={`group flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium cursor-pointer transition-colors border-b-2 max-w-[140px] ${
            q.id === activeQueryId
              ? 'text-[var(--color-protocol-graphql)] border-[var(--color-protocol-graphql)] bg-[rgba(229,53,171,0.04)]'
              : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
          }`}
        >
          <span
            className="truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              const newName = prompt('Rename query tab:', q.name);
              if (newName?.trim()) handleRenameQuery(q.id, newName.trim());
            }}
          >
            {q.name}
          </span>
          {queries.length > 1 && (
            <button
              type="button"
              onClick={(e) => handleCloseQuery(e, q.id)}
              className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-opacity flex-shrink-0"
            >
              <CloseIcon size={10} />
            </button>
          )}
        </div>
      ))}
      {/* Add query tab */}
      <button
        type="button"
        onClick={handleAddQuery}
        title="Add query tab"
        className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-protocol-graphql)] hover:bg-[var(--color-hover)] cursor-pointer transition-colors flex items-center justify-center rounded-md flex-shrink-0 ml-0.5"
      >
        <PlusIcon size={11} />
      </button>
    </div>
  );
}

/**
 * Initialize multi-query mode for a tab. Call this when user adds the first extra query tab.
 * If gql_queries is already set, does nothing.
 */
export function initMultiQuery(tabId: string) {
  const { tabs, updateTab } = useTabsStore.getState();
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  if (tab.authData?.['gql_queries']?.length) return; // already initialized

  const firstQuery: QueryTab = {
    id: crypto.randomUUID(),
    name: 'Query 1',
    query: tab.bodyRaw || '',
    variables: tab.authData?.['gql_variables'] || '{}',
  };

  const secondQuery: QueryTab = {
    id: crypto.randomUUID(),
    name: 'Query 2',
    query: '',
    variables: '{}',
  };

  updateTab(tabId, {
    authData: {
      ...tab.authData,
      gql_queries: [firstQuery, secondQuery],
      gql_active_query: secondQuery.id,
    },
    bodyRaw: '',
  });
}
