import { useState, useMemo, useRef, useEffect } from 'react';
import { useTabsStore, type HttpMethod } from '../../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../../store/url-suggestions-store';
import { useDebugStore } from '../../../store/debug-store';
import { GenerateCodeModal, ImportCurlModal } from '../../shared';
import { SelectTextInputView, DropDownButtonView, ButtonView, IconButtonView, type ContextMenuItem } from '../../../dui';
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
  const mockSuggestions = useMockSuggestions('rest');
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
  const tab = tabs.find(t => t.id === activeTabId);

  const preflightCounts = useMemo(() => tab ? countPreflightIssues(tab) : { errors: 0, warnings: 0 }, [tab]);

  // Close overflow menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    if (showOverflow) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showOverflow]);

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
    logUiEvent('rest.send', { method: tab.method, url: tab.url });
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

  const sendItems: ContextMenuItem[] = [
    { id: 'send-download', label: 'Send and Download', icon: <DownloadIcon size={13} />, onClick: handleSendAndDownload },
    { id: 'sep-1', label: '', separator: true },
    { id: 'import-curl', label: 'Import cURL', icon: <CopyIcon size={13} />, onClick: () => setShowImportCurl(true) },
    { id: 'show-code', label: 'Show code', icon: <CodeIcon size={13} />, onClick: () => setShowGenerateCode(true) },
    { id: 'sep-2', label: '', separator: true },
    { id: 'clear-all', label: 'Clear all', icon: <RefreshIcon size={13} />, onClick: handleClearAll },
  ];

  const saveItems: ContextMenuItem[] = [
    { id: 'save-as', label: 'Save as', icon: <SaveIcon size={13} />, onClick: () => postMsg({ type: 'openSaveAs', tabId: tab.id }) },
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
      {/* Method + URL — unified DUI component */}
      <div className="flex-[2] min-w-0">
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
        <ButtonView variant="danger" size="lg" onClick={handleSend} iconLeft={<StopSquareIcon size={14} />}>
          Cancel
        </ButtonView>
      ) : (
        <DropDownButtonView
          label="Send"
          icon={<SendIcon size={13} />}
          variant="primary"
          size="lg"
          onPrimaryClick={handleSend}
          disabled={!tab.url.trim()}
          items={sendItems}
        />
      )}

      {/* Save */}
      <DropDownButtonView
        label="Save"
        icon={<SaveIcon size={13} />}
        variant="secondary"
        size="lg"
        onPrimaryClick={handleSave}
        items={saveItems}
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
          <div
            className={`absolute right-0 z-50 rounded-xl border shadow-2xl overflow-hidden min-w-[200px] ${overflowDir === 'up' ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]'}`}
            style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
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
                NL Request Builder ✦
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
                Adaptive Load Tester ✦
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
                Schema Drift Monitor ✦
              </button>
            )}
          </div>
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
            dir={overflowDir}
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
