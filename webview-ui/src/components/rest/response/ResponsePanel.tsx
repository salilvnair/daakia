import { useState, useEffect } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { ScriptResultsView, RequestProgressOverlay } from '../../shared';
import { TabView } from '../../../dui';
import { cancelRequest } from '../../../services/request';
import { ResponseStatusBar } from './ResponseStatusBar';
import { JsonResponseView } from './JsonResponseView';
import { RawResponseView } from './RawResponseView';
import { HeadersView } from './HeadersView';
import { CookiesView } from './CookiesView';
import { TimelineView } from './TimelineView';
import { AiSmartRetryAdvisor } from '../../ai/AiSmartRetryAdvisor';
import { ResponseAiToolbar } from './ResponseAiToolbar';
import { postMsg } from '../../../vscode';
import { useDebugStore } from '../../../store/debug-store';

type ResponseView = 'json' | 'raw' | 'headers' | 'cookies' | 'timeline' | 'tests';

export function ResponsePanel() {
  const { tabs, activeTabId } = useTabsStore();
  const tab = tabs.find(t => t.id === activeTabId);
  const storedView = useUiStateStore(s => s.prefs[`response.subtab.${activeTabId}`]);
  const [activeView, setActiveViewLocal] = useState<ResponseView>((storedView as ResponseView) || 'json');
  const [wrapLines, setWrapLines] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);

  useEffect(() => {
    const pref = useUiStateStore.getState().getPref(`response.subtab.${activeTabId}`, 'json') as ResponseView;
    setActiveViewLocal(pref);
  }, [activeTabId]);

  const setActiveView = (view: ResponseView) => {
    setActiveViewLocal(view);
    useUiStateStore.getState().setPref(`response.subtab.${activeTabId}`, view);
  };

  // Ctrl+F — open filter/search in response panel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        setShowFilter(true);
        if (activeView !== 'json') setActiveView('raw');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

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
          const dbg = useDebugStore.getState();
          if (dbg.active && dbg.tabId === tab.id) {
            postMsg({ type: 'scriptDebug:stop', tabId: tab.id });
            dbg.stopDebug();
          }
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

  const requestMethod = tab.method || 'GET';
  const requestUrl = tab.url || '';
  const requestBody = tab.bodyRaw || undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--color-panel)]">
      {/* Response status bar — includes "Ask AI why" on errors */}
      <ResponseStatusBar
        response={response}
        requestMethod={requestMethod}
        requestUrl={requestUrl}
        requestBody={requestBody}
      />

      {/* Response tabs + AI inline action buttons (right side) */}
      <div className="flex items-center justify-between px-3 pt-2 pb-0 border-b border-[var(--color-surface-border)]">
        <TabView
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
          size="md"
          variant="underline"
        />

        <ResponseAiToolbar
          tabId={tab.id}
          response={response}
          requestMethod={requestMethod}
          requestUrl={requestUrl}
        />
      </div>

      {/* Response content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeView === 'json' && (
          <JsonResponseView
            response={{ ...response, status: response.status }}
            wrapLines={wrapLines}
            setWrapLines={setWrapLines}
            showFilter={showFilter}
            setShowFilter={setShowFilter}
            filterQuery={filterQuery}
            setFilterQuery={setFilterQuery}
            tabId={tab.id}
            requestMethod={requestMethod}
            requestUrl={requestUrl}
          />
        )}

        {activeView === 'raw' && (
          <RawResponseView response={response} wrapLines={wrapLines} setWrapLines={setWrapLines} tabId={tab.id} />
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

      {/* AI Smart Retry Advisor — shown below status bar for error responses */}
      {response.status >= 400 && aiEnabled('smartRetryAdvisor') && (
        <div className="px-3 pt-1.5 pb-0.5">
          <AiSmartRetryAdvisor
            status={response.status}
            responseBody={response.body || ''}
            method={requestMethod}
            url={requestUrl}
          />
        </div>
      )}

    </div>
  );
}
