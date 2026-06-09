import { useState, useMemo, useRef, useEffect } from 'react';
import { useTabsStore, type HttpMethod } from '../../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../../store/url-suggestions-store';
import { useDebugStore } from '../../../store/debug-store';
import { StyledDropdown, SplitButton, GenerateCodeModal, ImportCurlModal, HighlightedInput, type DropdownOption, type SplitButtonItem } from '../../shared';
import { useMockSuggestions } from '../../../hooks/useMockSuggestions';
import { postMsg } from '../../../vscode';
import { sendRequest, sendAndDownloadRequest, cancelRequest, saveRequest } from '../../../services/request';
import { METHOD_COLORS } from '../../../colors';
import { SaveIcon, SendIcon, DownloadIcon, CopyIcon, CodeIcon, RefreshIcon, StopSquareIcon, SparkleIcon, MoreVerticalIcon } from '../../../icons';
import { AiPreflightPopover, countPreflightIssues } from '../../ai/AiPreflightPopover';
import { PatternBaselinePopup } from '../../ai/AiRequestPatternStatus';
import { useAiFeaturesStore } from '../../../store/ai-features-store';

const METHOD_OPTIONS: DropdownOption[] = [
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
  const [overflowDir, setOverflowDir] = useState<'down' | 'up'>('down');
  const overflowRef = useRef<HTMLDivElement>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);
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
    sendRequest(tab);
    updateTab(tab.id, { loading: true });
  };

  const handleSendAndDownload = () => {
    sendAndDownloadRequest(tab);
    updateTab(tab.id, { loading: true });
  };

  const handleClearAll = () => {
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
    const savedInPlace = saveRequest(tab);
    if (savedInPlace) updateTab(tab.id, { dirty: false });
  };

  const sendItems: SplitButtonItem[] = [
    { id: 'send-download', label: 'Send and Download', icon: <DownloadIcon />, onClick: handleSendAndDownload },
    { id: 'import-curl', label: 'Import cURL', icon: <CopyIcon style={{ color: '#ffa726' }} />, shortcut: 'C', dividerBefore: true, onClick: () => setShowImportCurl(true) },
    { id: 'show-code', label: 'Show code', icon: <CodeIcon style={{ color: '#4fc3f7' }} />, shortcut: 'S', onClick: () => setShowGenerateCode(true) },
    { id: 'clear-all', label: 'Clear all', icon: <RefreshIcon style={{ color: '#ef5350' }} />, shortcut: '⌫', dividerBefore: true, onClick: handleClearAll },
  ];

  const saveItems: SplitButtonItem[] = [
    { id: 'save-as', label: 'Save as', icon: <SaveIcon />, iconColor: 'var(--color-ctx-close-saved)', onClick: () => postMsg({ type: 'openSaveAs', tabId: tab.id }) },
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
      {/* Method selector */}
      <StyledDropdown
        options={METHOD_OPTIONS}
        value={tab.method}
        onChange={(v) => updateTab(tab.id, { method: v as HttpMethod })}
        className="url-bar-method"
      />

      {/* URL input */}
      <div className="flex-[2] min-w-0">
        <HighlightedInput
          value={tab.url}
          onChange={(v) => updateTab(tab.id, { url: v })}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Enter a URL or paste a cURL command"
          suggestions={urlSuggestions}
          mockServers={mockSuggestions}
        />
      </div>

      {/* ── Send / Cancel ── */}
      {tab.loading ? (
        <button
          type="button"
          onClick={handleSend}
          className="h-[36px] px-4 text-[13px] font-medium rounded-md bg-[var(--color-error)] text-white hover:brightness-110 cursor-pointer transition-all flex items-center gap-1.5 select-none"
        >
          <StopSquareIcon size={13} />
          <span>Cancel</span>
        </button>
      ) : (
        <SplitButton
          label="Send"
          variant="primary"
          onClick={handleSend}
          disabled={!tab.url.trim()}
          icon={<SendIcon size={14} />}
          items={sendItems}
        />
      )}

      {/* ── Save ── */}
      <SplitButton
        label="Save"
        variant="secondary"
        onClick={handleSave}
        icon={<SaveIcon />}
        items={saveItems}
      />

      {/* ── AI Tools ⋮ — always visible, no border, hover gray ─────────────── */}
      <div className="flex-shrink-0 relative" ref={overflowRef}>
        <button
          ref={overflowBtnRef}
          type="button"
          onClick={() => {
            if (!showOverflow && overflowBtnRef.current) {
              const rect = overflowBtnRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              setOverflowDir(spaceBelow < 180 ? 'up' : 'down');
            }
            setShowOverflow(p => !p);
          }}
          title="AI tools"
          className="flex items-center justify-center w-[36px] h-[36px] rounded-md cursor-pointer transition-colors"
          style={{
            color: showOverflow ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            backgroundColor: showOverflow ? 'rgba(255,255,255,0.08)' : 'transparent',
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = showOverflow ? 'rgba(255,255,255,0.08)' : 'transparent'; e.currentTarget.style.color = showOverflow ? 'var(--color-text-primary)' : 'var(--color-text-muted)'; }}
        >
          <MoreVerticalIcon size={15} />
        </button>

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
    </div>
  );
}
