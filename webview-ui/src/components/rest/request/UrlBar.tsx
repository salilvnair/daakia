import { useState, useMemo, useRef, useEffect } from 'react';
import { useTabsStore, type HttpMethod } from '../../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../../store/url-suggestions-store';
import { useDebugStore } from '../../../store/debug-store';
import { GenerateCodeModal, ImportCurlModal, AnchoredMenu } from '../../shared';
import { SelectTextInputView, DropDownButtonView, ButtonView, IconButtonView, type ContextMenuItem } from '@salilvnair/dui';
import { useMockSuggestions } from '../../../hooks/useMockSuggestions';
import { postMsg } from '../../../vscode';
import { sendRequest, sendAndDownloadRequest, cancelRequest, saveRequest } from '../../../services/request';
import { METHOD_COLORS } from '../../../colors';
import { SaveIcon, SendIcon, DownloadIcon, CopyIcon, CodeIcon, RefreshIcon, StopSquareIcon, SparkleIcon, MoreVerticalIcon } from '../../../icons';
import { logUiEvent } from '../../../store/ui-audit-store';
import { AiPreflightPopover, countPreflightIssues } from '../../ai/AiPreflightPopover';
import { PatternBaselinePopup } from '../../ai/AiRequestPatternStatus';
import { AiNlRequestBuilderModal } from '../../ai/AiNlRequestBuilderModal';
import { AiAdaptiveLoadTesterModal } from '../../ai/AiAdaptiveLoadTesterModal';
import { AiSchemaDriftModal } from '../../ai/AiSchemaDriftModal';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { isValidProtocolUrl, urlValidationHint } from '../../../services/url-validation';

const METHOD_OPTIONS = [
  { value: 'GET', label: 'GET', color: METHOD_COLORS.GET },
  { value: 'POST', label: 'POST', color: METHOD_COLORS.POST },
  { value: 'PUT', label: 'PUT', color: METHOD_COLORS.PUT },
  { value: 'PATCH', label: 'PATCH', color: METHOD_COLORS.PATCH },
  { value: 'DELETE', label: 'DELETE', color: METHOD_COLORS.DELETE },
  { value: 'HEAD', label: 'HEAD', color: METHOD_COLORS.HEAD },
  { value: 'OPTIONS', label: 'OPTIONS', color: METHOD_COLORS.OPTIONS },
];

export function UrlBar() {
  const { tabs, activeTabId, updateTab, openDaakiaAiTab } = useTabsStore();
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.rest);
  const tab = tabs.find(t => t.id === activeTabId);
  const mockSuggestions = useMockSuggestions('rest', tab?.method);
  const [showImportCurl, setShowImportCurl] = useState(false);
  const [showGenerateCode, setShowGenerateCode] = useState(false);
  const [showPreflight, setShowPreflight] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showPatternStatus, setShowPatternStatus] = useState(false);
  const [showNlRequestBuilder, setShowNlRequestBuilder] = useState(false);
  const [showAdaptiveLoadTester, setShowAdaptiveLoadTester] = useState(false);
  const [showSchemaDrift, setShowSchemaDrift] = useState(false);
  const [overflowDir, setOverflowDir] = useState<'down' | 'up'>('down');
  const overflowRef = useRef<HTMLDivElement>(null);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);

  const preflightCounts = useMemo(() => tab ? countPreflightIssues(tab) : { errors: 0, warnings: 0 }, [tab]);

  // NOTE: the old "close overflow menu on outside click" effect that lived here has been
  // removed. It tested `overflowRef.contains(target)`, which worked only while the menu was a
  // DOM child of that ref. AnchoredMenu portals the menu to <body>, so a click on a menu ITEM
  // no longer counted as "inside" — the effect fired on mousedown and unmounted the menu
  // before mouseup, meaning no click event ever reached the item and its action silently never
  // ran. AnchoredMenu owns outside-click and Escape itself, and correctly treats both its own
  // content and the anchor as inside.

  if (!tab) return null;

  const handleSend = () => {
    if (tab.loading) {
      cancelRequest(tab.id);
      updateTab(tab.id, { loading: false, requestProgress: undefined });
      const dbg = useDebugStore.getState();
      if (dbg.active && dbg.tabId === tab.id) {
        postMsg({ type: 'scriptDebug:stop', tabId: tab.id });
        dbg.stopDebug();
      }
      return;
    }
    // rest.send is audited by the extension host after the response, where the
    // headers, timing, routing and status actually exist. Logging it here as
    // well produced two rows per request, the click-time one nearly empty.
    sendRequest(tab);
    updateTab(tab.id, { loading: true });
  };

  const handleSendAndDownload = () => {
    logUiEvent('rest.download', { method: tab.method, url: tab.url });
    sendAndDownloadRequest(tab);
    updateTab(tab.id, { loading: true });
  };

  const handleClearAll = () => {
    logUiEvent('rest.clear');
    updateTab(tab.id, {
      url: '',
      headers: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
      params: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
      bodyMode: 'none',
      bodyRaw: '',
      bodyFormData: [{ id: crypto.randomUUID(), key: '', value: '', type: 'text', enabled: true }],
      bodyUrlEncoded: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
      authType: 'none',
      authData: {},
      response: null,
    });
  };

  const handleSave = () => {
    logUiEvent('rest.save', { url: tab.url });
    const savedInPlace = saveRequest(tab);
    if (savedInPlace) updateTab(tab.id, { dirty: false });
  };

  // The menu items do NOT share one precondition, so they can't share one gate:
  //   • Send and Download / Show code both need a real URL — they either fire the request or
  //     generate code for it, so with an invalid URL they'd fail or emit nonsense.
  //   • Import cURL and Clear all are exactly how you GET out of an invalid state, so gating
  //     them on a valid URL would be the trap this whole fix exists to remove.
  const urlUsable = isValidProtocolUrl(tab.url, 'rest');
  const sendItems: ContextMenuItem[] = [
    { id: 'send-download', label: 'Send and Download', icon: <DownloadIcon size={13} style={{ color: 'var(--color-info)' }} />, disabled: !urlUsable, onClick: handleSendAndDownload },
    { id: 'sep-1', label: '', separator: true },
    { id: 'import-curl', label: 'Import cURL', icon: <CopyIcon size={13} style={{ color: 'var(--color-success)' }} />, onClick: () => { logUiEvent('rest.import_curl'); setShowImportCurl(true); } },
    { id: 'show-code', label: 'Show code', icon: <CodeIcon size={13} style={{ color: 'var(--color-primary)' }} />, disabled: !urlUsable, onClick: () => { logUiEvent('rest.show_code'); setShowGenerateCode(true); } },
    { id: 'sep-2', label: '', separator: true },
    { id: 'clear-all', label: 'Clear all', icon: <RefreshIcon size={13} style={{ color: 'var(--color-ctx-close-batch)' }} />, onClick: handleClearAll },
  ];

  const saveItems: ContextMenuItem[] = [
    { id: 'save-as', label: 'Save as', icon: <SaveIcon size={13} style={{ color: 'var(--color-ctx-close-saved)' }} />, onClick: () => { logUiEvent('rest.save_as'); postMsg({ type: 'openSaveAs', tabId: tab.id }); } },
  ];

  // Pre-flight internals for dropdown item color
  const hasErr  = preflightCounts.errors > 0;
  const hasWarn = preflightCounts.warnings > 0;
  const preflightColor = hasErr ? 'var(--color-error)' : hasWarn ? 'var(--color-warning)' : 'var(--color-success)';
  const preflightLabel = hasErr
    ? `${preflightCounts.errors} error${preflightCounts.errors > 1 ? 's' : ''}`
    : hasWarn
      ? `${preflightCounts.warnings} warning${preflightCounts.warnings > 1 ? 's' : ''}`
      : 'Pre-flight';
  const preflightIcon = hasErr || hasWarn ? '⚠' : '✓';

  return (
    <div className="url-bar">
      {/* Method + URL — unified DUI component. Shrinks down to minWidth; past that the
          bar scrolls horizontally rather than squeezing this illegibly small. */}
      <div className="flex-[2] min-w-0" style={{ minWidth: 160 }}>
        <SelectTextInputView
          selectOptions={METHOD_OPTIONS}
          selectValue={tab.method}
          onSelectChange={(v) => updateTab(tab.id, { method: v as HttpMethod })}
          inputValue={tab.url}
          onInputChange={(v) => updateTab(tab.id, { url: v })}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Enter a URL or paste a cURL command"
          suggestions={urlSuggestions}
          mockServers={mockSuggestions}
          accentColor={METHOD_COLORS[tab.method] || 'var(--color-primary)'}
          size="lg"
          width="fullWidth"
        />
      </div>

      {/* Send / Cancel */}
      {tab.loading ? (
        <ButtonView className="flex-shrink-0" variant="danger" size="lg" onClick={handleSend} iconLeft={<StopSquareIcon size={14} />}>
          Cancel
        </ButtonView>
      ) : (
        <DropDownButtonView
          className="flex-shrink-0"
          label="Send"
          icon={<SendIcon size={13} />}
          variant="primary"
          size="lg"
          onPrimaryClick={handleSend}
          primaryDisabled={!urlUsable}
          items={sendItems}
          align="right"
        />
      )}

      {/* Save */}
      <DropDownButtonView
        className="flex-shrink-0"
        label="Save"
        icon={<SaveIcon size={13} />}
        variant="secondary"
        size="lg"
        onPrimaryClick={handleSave}
        items={saveItems}
        align="right"
      />

      {/* AI Tools ⋮ */}
      <div className="flex-shrink-0 relative" ref={overflowRef}>
        <IconButtonView
          icon={<MoreVerticalIcon size={15} />}
          title="AI tools"
          size="lg"
          active={showOverflow}
          onClick={() => {
            if (!showOverflow && overflowRef.current) {
              const rect = overflowRef.current.getBoundingClientRect();
              setOverflowDir(window.innerHeight - rect.bottom < 180 ? 'up' : 'down');
            }
            setShowOverflow(p => !p);
          }}
        />

        {showOverflow && (
          <AnchoredMenu
            anchorRef={overflowRef}
            open={showOverflow}
            onClose={() => setShowOverflow(false)}
            side="bottom"
            align="end"
            minWidth={200}
          >
            <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
              <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>AI Tools</p>
            </div>

            {/* Pre-flight — gated by preflightCheck flag */}
            {tab.url.trim() && aiEnabled('preflightCheck') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: preflightColor }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${preflightColor} 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { setShowPreflight(true); setShowOverflow(false); }}
              >
                <span className="text-[11px] w-[14px] text-center">{preflightIcon}</span>
                {preflightLabel}
              </button>
            )}

            {/* Ask AI — gated by daakiaAiChat feature flag */}
            {aiEnabled('daakiaAiChat') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: 'var(--color-protocol-ai)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { openDaakiaAiTab(); setShowOverflow(false); }}
              >
                <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                Ask AI
              </button>
            )}

            {/* Pattern Baseline */}
            {tab.url.trim() && aiEnabled('patternBaseline') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: 'var(--color-protocol-ai)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { setShowPatternStatus(p => !p); setShowOverflow(false); }}
              >
                <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                Pattern Baseline
              </button>
            )}

            {/* NL Request Builder — Sprint 11.2 */}
            {aiEnabled('nlRequestBuilder') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: 'var(--color-protocol-ai)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { setShowNlRequestBuilder(true); setShowOverflow(false); }}
              >
                <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                NL Request Builder
              </button>
            )}

            {/* Adaptive Load Tester — Sprint 11.8 */}
            {tab.url.trim() && aiEnabled('adaptiveLoadTester') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: 'var(--color-protocol-rest)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-rest) 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { setShowAdaptiveLoadTester(true); setShowOverflow(false); }}
              >
                <SparkleIcon size={12} style={{ color: 'var(--color-protocol-rest)', flexShrink: 0 }} />
                Adaptive Load Tester
              </button>
            )}

            {/* Schema Drift Monitor — Sprint 11.7 */}
            {aiEnabled('schemaDriftMonitor') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: 'var(--color-warning)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-warning) 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { setShowSchemaDrift(true); setShowOverflow(false); }}
              >
                <SparkleIcon size={12} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                Schema Drift Monitor
              </button>
            )}
          </AnchoredMenu>
        )}

        {/* Pre-flight popup — same parent as overflow, positions identically */}
        {showPreflight && tab.url.trim() && (
          <AiPreflightPopover tab={tab} onClose={() => setShowPreflight(false)} />
        )}

        {/* Pattern Baseline popup — same parent, same absolute position as Pre-flight */}
        {showPatternStatus && tab.url.trim() && aiEnabled('patternBaseline') && (
          <PatternBaselinePopup
            method={tab.method || 'GET'}
            url={tab.url}
            onClose={() => setShowPatternStatus(false)}
          />
        )}
      </div>

      {/* Modals */}
      <GenerateCodeModal open={showGenerateCode} tab={tab} onClose={() => setShowGenerateCode(false)} />
      <ImportCurlModal open={showImportCurl} onClose={() => setShowImportCurl(false)} />
      {showNlRequestBuilder && (
        <AiNlRequestBuilderModal
          protocol="rest"
          currentUrl={tab.url}
          onClose={() => setShowNlRequestBuilder(false)}
        />
      )}
      {showAdaptiveLoadTester && (
        <AiAdaptiveLoadTesterModal onClose={() => setShowAdaptiveLoadTester(false)} />
      )}
      {showSchemaDrift && (
        <AiSchemaDriftModal onClose={() => setShowSchemaDrift(false)} />
      )}
    </div>
  );
}
