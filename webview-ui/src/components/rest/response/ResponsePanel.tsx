import { useState, useEffect } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { ScriptResultsView, RequestProgressOverlay } from '../../shared';
import { TabView } from '@salilvnair/dui';
import { cancelRequest } from '../../../services/request';
import { ResponseStatusBar } from './ResponseStatusBar';
import { JsonResponseView } from './JsonResponseView';
import { RawResponseView } from './RawResponseView';
import { HeadersView } from './HeadersView';
import { CookiesView } from './CookiesView';
import { TimelineView } from './TimelineView';
import { ResponseAiToolbar } from './ResponseAiToolbar';
import { ResponseVisualization, canVisualize } from '../../power/ResponseVisualization';
import { ResponseAssertionsBuilder } from '../../power/ResponseAssertionsBuilder';
import { ExamplesView } from './ExamplesView';
import { addExample, defaultName, toExample } from '../../../services/request/examples';
import { useToastStore } from '../../../store/toast-store';
import { logUiEvent } from '../../../store/ui-audit-store';
import { ActionButtonView } from '@salilvnair/dui';
import { SaveIcon } from '../../../icons';
import { postMsg } from '../../../vscode';
import { useDebugStore } from '../../../store/debug-store';

type ResponseView = 'json' | 'raw' | 'visualize' | 'assert' | 'examples' | 'headers' | 'cookies' | 'timeline' | 'tests';

/** A body we can build assertions against by clicking it. */
function isJsonObject(body: string): boolean {
  try {
    const v = JSON.parse(body);
    return v !== null && typeof v === 'object';
  } catch { return false; }
}

export function ResponsePanel() {
  const { tabs, activeTabId } = useTabsStore();
  const tab = tabs.find(t => t.id === activeTabId);
  const storedView = useUiStateStore(s => s.prefs[`response.subtab.${activeTabId}`]);
  const [activeView, setActiveViewLocal] = useState<ResponseView>((storedView as ResponseView) || 'json');
  const [wrapLines, setWrapLines] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);
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

  /*
    The remembered view has to still exist for this response.

    Visualize and Assert come and go with the body's shape, and the choice is
    remembered per tab — so a run that returns a list and then an object would
    have left the panel on a tab that is no longer in the row, showing
    nothing at all.
  */
  const examples = tab.examples ?? [];

  /*
    Saving is on the response, not in a menu three levels down: it is the
    thing you want the moment you are looking at a response worth keeping.
  */
  const saveExample = () => {
    const next = addExample(examples, toExample(response, defaultName(response, examples)));
    logUiEvent('rest.example_save', { status: response.status, count: next.length });
    useTabsStore.getState().updateTab(tab.id, { examples: next });
    useToastStore.getState().addToast({
      type: 'success',
      message: next.length === examples.length
        // The cap dropped the oldest rather than refusing the click.
        ? `Saved — keeping the last ${next.length} examples`
        : `Saved as “${next[0]!.name}”`,
    });
    setActiveView('examples');
  };

  const canShow: Record<string, boolean> = {
    visualize: canVisualize(response.body, response.contentType),
    assert: isJsonObject(response.body),
    examples: examples.length > 0,
    tests: !!hasScriptOutput,
  };
  const view: ResponseView = canShow[activeView] === false ? 'json' : activeView;

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
            /*
              Both of these are offered only when they have something to do.

              Visualize renders an array of objects as a table, or an image or
              PDF inline; on a single JSON object there is nothing for it to
              draw. Assert wants a JSON body to click through. A tab that is
              present and empty on most responses is one people learn to skip,
              which is how these two spent a release written but unreachable.
            */
            ...(canVisualize(response.body, response.contentType)
              ? [{ id: 'visualize', label: 'Visualize' }] : []),
            ...(isJsonObject(response.body)
              ? [{ id: 'assert', label: 'Assert' }] : []),
            // Always present once anything is saved, because its content does
            // not depend on the response currently on screen.
            ...(examples.length ? [{ id: 'examples', label: 'Examples', badge: examples.length }] : []),
            { id: 'headers', label: 'Headers', badge: headerEntries.length },
            { id: 'cookies', label: 'Cookies', badge: cookies.length > 0 ? cookies.length : undefined },
            ...(hasScriptOutput ? [{ id: 'tests', label: 'Tests', badge: response.testResults?.length }] : []),
            { id: 'timeline', label: 'Timeline' },
          ]}
          activeTab={view}
          onChange={(v) => setActiveView(v as ResponseView)}
          size="md"
          variant="underline"
        />

        {/*
          Aligned to the AI buttons it sits beside, not merely near them.

          It first shipped in a bare wrapper: the label wrapped onto two lines,
          and once that was fixed it still sat 2.5px lower with a 3px corner
          against their 5px, because the AI toolbar carries `pb-1.5` and this
          did not. Four buttons on one line that disagree about their baseline
          and their radius read as a mistake before anyone reads the labels.
        */}
        {/*
          One flex line for all four buttons, sharing its gap.

          They were two sibling groups in a row with no gap between them, so
          the AI buttons sat 6px apart from each other and flush against Save
          example — three even gaps and one zero, which reads as a button
          stuck to the wrong group. Same container, same `gap-1.5`, same
          `pb-1.5`: one row of four.
        */}
        {/*
          One row of four buttons, all the same object.

          This was a `ButtonView` beside three `AIButtonView`s: a heavier
          fill, a different border, a different weight, and — because the two
          groups were separate flex lines — a different baseline and no gap
          between them. dui grew `ActionButtonView`, which is the AI button's
          box without the sparkle, so the odd one out is now the same
          component the other three are built from.
        */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* The wrapper mirrors the AI toolbar's own box — `flex items-center
              pb-1.5` — so both children are the same height and centre their
              20px buttons identically. A bare wrapper beside it sits 2.4px
              low, which is the whole reason this comment exists. */}
          <div className="flex items-center pb-1.5">
            <ActionButtonView
              size="xs"
              onClick={saveExample}
              accentColor="var(--color-protocol-rest, var(--color-accent))"
              /* Sized by the button, exactly as the sparkles beside it are —
                 a hand-picked number here is how a row of four comes to
                 disagree by a pixel. */
              icon={(iconSize) => <SaveIcon size={iconSize} style={{ flexShrink: 0 }} />}
              label="Save example"
            />
          </div>

          <ResponseAiToolbar
            tabId={tab.id}
            response={response}
            requestMethod={requestMethod}
            requestUrl={requestUrl}
          />
        </div>
      </div>

      {/* Response content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {view === 'json' && (
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

        {view === 'raw' && (
          <RawResponseView response={response} wrapLines={wrapLines} setWrapLines={setWrapLines} tabId={tab.id} />
        )}

        {view === 'visualize' && (
          <div className="flex-1 overflow-hidden">
            <ResponseVisualization responseBody={response.body} contentType={response.contentType} />
          </div>
        )}

        {/* Click a field, get a `dk.expect(...)` — the assertions land in the
            request's post-response script, where the runner reads them. */}
        {view === 'assert' && (
          <ResponseAssertionsBuilder responseBody={response.body} tabId={tab.id} />
        )}

        {view === 'examples' && (
          <ExamplesView tabId={tab.id} examples={examples} />
        )}

        {view === 'headers' && (
          <HeadersView headers={headerEntries} />
        )}

        {view === 'cookies' && (
          <CookiesView cookies={cookies} />
        )}

        {view === 'timeline' && (
          <TimelineView tab={tab} response={response} />
        )}

        {view === 'tests' && (
          <ScriptResultsView response={response} />
        )}
      </div>

    </div>
  );
}
