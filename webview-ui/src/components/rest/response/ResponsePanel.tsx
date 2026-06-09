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
import { AiActionButton, type AssistMode } from '../../ai/AiAssistPopover';
import { AiNaturalAssertPopover } from '../../ai/AiNaturalAssertPopover';
import { AiResponseToTypescript } from '../../ai/AiResponseToTypescript';
import { AiSemanticValidatorModal } from '../../ai/AiSemanticValidatorModal';
import { AiResponseTransformer } from '../../ai/AiResponseTransformer';
import { AiSmartRetryAdvisor } from '../../ai/AiSmartRetryAdvisor';
import { AiResponsePatternLearning } from '../../ai/AiResponsePatternLearning';
import { useAiFeaturesStore } from '../../../store/ai-features-store';

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
  const [activePopup, setActivePopup] = useState<AssistMode | null>(null);
  const [showNaturalAssert, setShowNaturalAssert] = useState(false);
  const [showTsGen, setShowTsGen] = useState(false);
  const [showSemanticVal, setShowSemanticVal] = useState(false);
  const [showTransformer, setShowTransformer] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);

  useEffect(() => {
    const pref = useUiStateStore.getState().getPref(`response.subtab.${activeTabId}`, 'json') as ResponseView;
    setActiveViewLocal(pref);
  }, [activeTabId]);

  const setActiveView = (view: ResponseView) => {
    setActiveViewLocal(view);
    useUiStateStore.getState().setPref(`response.subtab.${activeTabId}`, view);
  };

  // Ctrl+F — open filter/search in response panel (5.4.2)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
        // Only intercept when response panel area is focused or not in an input
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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

  // Request context for AI actions
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

      {/* Response tabs + AI toolbar buttons */}
      <div className="flex items-center justify-between px-3 pt-2 pb-0 border-b border-[var(--color-surface-border)]">
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

        {/* AI inline actions — always visible when there is a response */}
        <div className="flex items-center gap-1.5 pb-1.5 flex-shrink-0">
          {aiEnabled('responseExplainer') && (
            <AiActionButton
              mode="explain"
              label="Explain"
              response={response}
              requestMethod={requestMethod}
              requestUrl={requestUrl}
              open={activePopup === 'explain'}
              onOpen={() => { setActivePopup(p => p === 'explain' ? null : 'explain'); setShowNaturalAssert(false); }}
            />
          )}
          {aiEnabled('followUps') && (
            <AiActionButton
              mode="follow-up"
              label="Follow-ups"
              response={response}
              requestMethod={requestMethod}
              requestUrl={requestUrl}
              open={activePopup === 'follow-up'}
              onOpen={() => { setActivePopup(p => p === 'follow-up' ? null : 'follow-up'); setShowNaturalAssert(false); }}
            />
          )}
          {/* AI Natural Language Assertions (4.6.3) */}
          {aiEnabled('assertGeneration') && (
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowNaturalAssert(p => !p); setActivePopup(null); }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] cursor-pointer transition-all border"
                style={{
                  color: 'var(--color-protocol-ai)',
                  borderColor: showNaturalAssert ? 'var(--color-protocol-ai)' : 'color-mix(in srgb, var(--color-protocol-ai) 25%, transparent)',
                  backgroundColor: showNaturalAssert ? 'color-mix(in srgb, var(--color-protocol-ai) 10%, transparent)' : 'transparent',
                }}
                title="Write test assertions in plain English"
              >
                ✦ Assert
              </button>
              {showNaturalAssert && (
                <AiNaturalAssertPopover
                  response={{ body: response.body, status: response.status, contentType: response.contentType }}
                  requestMethod={requestMethod}
                  requestUrl={requestUrl}
                  onClose={() => setShowNaturalAssert(false)}
                />
              )}
            </div>
          )}
          {/* AI Response → TypeScript (4.6.8) */}
          {aiEnabled('typescriptTypes') && (
            <button
              type="button"
              onClick={() => { setShowTsGen(true); setActivePopup(null); setShowNaturalAssert(false); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] cursor-pointer transition-all border"
              style={{
                color: 'var(--color-protocol-ai)',
                borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 25%, transparent)',
              }}
              title="Generate TypeScript interfaces from response"
            >
              ✦ TS
            </button>
          )}
          {/* AI Semantic Validator (4.6.15) */}
          {aiEnabled('semanticValidator') && (
            <button
              type="button"
              onClick={() => { setShowSemanticVal(true); setActivePopup(null); setShowNaturalAssert(false); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] cursor-pointer transition-all border"
              style={{
                color: 'var(--color-protocol-ai)',
                borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 25%, transparent)',
              }}
              title="AI semantic validation (age: -5 is wrong, email without @ is suspicious)"
            >
              ✦ Semantic
            </button>
          )}
          {/* AI Response Transformer (4.6.18) */}
          {aiEnabled('responseTransformer') && (
            <button
              type="button"
              onClick={() => { setShowTransformer(true); setActivePopup(null); setShowNaturalAssert(false); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] cursor-pointer transition-all border"
              style={{
                color: 'var(--color-protocol-ai)',
                borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 25%, transparent)',
              }}
              title="Transform response: JSON→CSV, extract emails, reshape"
            >
              ✦ Transform
            </button>
          )}
          {/* AI Pattern Learning (4.6.6) — inline record/anomaly for successful responses */}
          <div className="relative">
            <AiResponsePatternLearning
              responseBody={response.body || ''}
              method={requestMethod}
              url={requestUrl}
              status={response.status}
            />
          </div>
        </div>
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

      {/* AI Smart Retry Advisor (4.6.17) — shown below status bar for error responses */}
      {response.status >= 400 && (
        <div className="px-3 pt-1.5 pb-0.5">
          <AiSmartRetryAdvisor
            status={response.status}
            responseBody={response.body || ''}
            method={requestMethod}
            url={requestUrl}
          />
        </div>
      )}

      {/* Data Schema Modal */}
      {showSchema && response && (
        <DataSchemaModal body={response.body} onClose={() => setShowSchema(false)} />
      )}

      {/* AI Response → TypeScript Modal (4.6.8) */}
      {showTsGen && (
        <AiResponseToTypescript
          responseBody={response.body || ''}
          method={requestMethod}
          url={requestUrl}
          onClose={() => setShowTsGen(false)}
        />
      )}

      {/* AI Semantic Validator Modal (4.6.15) */}
      {showSemanticVal && (
        <AiSemanticValidatorModal
          responseBody={response.body || ''}
          method={requestMethod}
          url={requestUrl}
          status={String(response.status)}
          onClose={() => setShowSemanticVal(false)}
        />
      )}

      {/* AI Response Transformer Modal (4.6.18) */}
      {showTransformer && (
        <AiResponseTransformer
          responseBody={response.body || ''}
          contentType={response.contentType}
          method={requestMethod}
          url={requestUrl}
          onClose={() => setShowTransformer(false)}
        />
      )}
    </div>
  );
}
