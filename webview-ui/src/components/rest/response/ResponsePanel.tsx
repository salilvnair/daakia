import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { PillTabs, ScriptResultsView, RequestProgressOverlay } from '../../shared';
import { cancelRequest } from '../../../services/request';
import { ResponseStatusBar } from './ResponseStatusBar';
import { JsonResponseView } from './JsonResponseView';
import { RawResponseView } from './RawResponseView';
import { HeadersView } from './HeadersView';
import { CookiesView } from './CookiesView';
import { TimelineView } from './TimelineView';
import { DataSchemaModal } from './DataSchemaModal';

type ResponseView = 'json' | 'raw' | 'headers' | 'cookies' | 'timeline' | 'tests';

export function ResponsePanel() {
  const { tabs, activeTabId } = useTabsStore();
  const tab = tabs.find(t => t.id === activeTabId);
  const storedView = useUiStateStore(s => s.prefs[`response.subtab.${activeTabId}`]);
  const [activeView, setActiveViewLocal] = useState<ResponseView>((storedView as ResponseView) || 'json');
  const [wrapLines, setWrapLines] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pref = useUiStateStore.getState().getPref(`response.subtab.${activeTabId}`, 'json') as ResponseView;
    setActiveViewLocal(pref);
  }, [activeTabId]);

  const setActiveView = (view: ResponseView) => {
    setActiveViewLocal(view);
    useUiStateStore.getState().setPref(`response.subtab.${activeTabId}`, view);
  };

  if (!tab) return null;

  if (tab.loading) {
    const stages = tab.requestProgress || [
      { id: 'sending-request', label: 'Sending request', status: 'running' as const, startTime: Date.now() },
    ];
    return (
      <RequestProgressOverlay
        stages={stages}
        onCancel={() => {
          cancelRequest(tab.id);
          useTabsStore.getState().updateTab(tab.id, { loading: false, requestProgress: undefined });
        }}
      />
    );
  }

  if (!tab.response) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--color-panel)] text-[var(--color-text-muted)] gap-2">
        <span className="text-[28px] opacity-20">&#10216;/&#10217;</span>
        <p className="text-[12px]">Hit Send to get a response</p>
        <p className="text-[10px] opacity-60">Ctrl+Enter to run</p>
      </div>
    );
  }

  const { response } = tab;
  const headerEntries = Object.entries(response.headers);
  const cookies = response.cookies || [];
  const hasScriptOutput = (response.scriptLogs && response.scriptLogs.length > 0) ||
    (response.scriptErrors && response.scriptErrors.length > 0) ||
    (response.testResults && response.testResults.length > 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--color-panel)]">
      {/* Response status bar */}
      <ResponseStatusBar response={response} />

      {/* Response tabs */}
      <div className="flex items-center justify-between px-3 pt-2 border-b border-[var(--color-surface-border)]">
        <PillTabs
          tabs={[
            { id: 'json', label: 'JSON' },
            { id: 'raw', label: 'Raw' },
            { id: 'headers', label: 'Headers', badge: headerEntries.length },
            { id: 'cookies', label: 'Cookies', badge: cookies.length > 0 ? cookies.length : undefined },
            ...(hasScriptOutput ? [{ id: 'tests', label: 'Tests', badge: response.testResults?.length }] : []),
            { id: 'timeline', label: 'Timeline' },
          ]}
          activeTab={activeView}
          onChange={(v) => setActiveView(v as ResponseView)}
          size="sm"
          variant="underline"
        />
      </div>

      {/* Response content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeView === 'json' && (
          <JsonResponseView
            response={response}
            wrapLines={wrapLines}
            setWrapLines={setWrapLines}
            showFilter={showFilter}
            setShowFilter={setShowFilter}
            filterQuery={filterQuery}
            setFilterQuery={setFilterQuery}
            showMoreMenu={showMoreMenu}
            setShowMoreMenu={setShowMoreMenu}
            moreMenuRef={moreMenuRef}
            tabId={tab.id}
            onShowSchema={() => setShowSchema(true)}
          />
        )}

        {activeView === 'raw' && (
          <RawResponseView response={response} wrapLines={wrapLines} setWrapLines={setWrapLines} />
        )}

        {activeView === 'headers' && (
          <HeadersView headers={headerEntries} />
        )}

        {activeView === 'cookies' && (
          <CookiesView cookies={cookies} />
        )}

        {activeView === 'timeline' && (
          <TimelineView tab={tab} response={response} />
        )}

        {activeView === 'tests' && (
          <ScriptResultsView response={response} />
        )}

      </div>

      {/* Data Schema Modal */}
      {showSchema && response && (
        <DataSchemaModal body={response.body} onClose={() => setShowSchema(false)} />
      )}
    </div>
  );
}
