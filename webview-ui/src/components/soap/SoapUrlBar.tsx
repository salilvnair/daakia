import { useCallback, useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../store/url-suggestions-store';
import { postMsg } from '../../vscode';
import { PlayIcon, SaveIcon, StopSquareIcon, UploadIcon, MoreVerticalIcon, SparkleIcon } from '../../icons';
import { saveRequest } from '../../services/request';
import { SoapWsdlImport } from './SoapWsdlImport';
import { logUiEvent, isAuditEventEnabled } from '../../store/ui-audit-store';
import { SoapOperationSelector } from './SoapOperationSelector';
import { useMockSuggestions } from '../../hooks/useMockSuggestions';
import { AiPreflightPopover } from '../ai/AiPreflightPopover';
import { PatternBaselinePopup } from '../ai/AiRequestPatternStatus';
import { AiSoapToRestModal } from '../ai/AiSoapToRestModal';
import { AiSoapWsdlExplainerModal } from '../ai/AiSoapWsdlExplainerModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import {
  SelectTextInputView,
  ButtonView,
  DropDownButtonView,
  IconButtonView,
  type ContextMenuItem,
} from '@salilvnair/dui';
import { isValidProtocolUrl, urlValidationHint } from '../../services/url-validation';
import { AnchoredMenu } from '../shared';

const ACCENT = 'var(--color-protocol-soap)';

const SOAP_VERSION_OPTIONS = [
  { value: '1.1', label: '1.1', color: ACCENT },
  { value: '1.2', label: '1.2', color: ACCENT },
];

const DEFAULT_ENVELOPE_11 = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header/>
  <soap:Body>
    <!-- Your request elements here -->
  </soap:Body>
</soap:Envelope>`;

const DEFAULT_ENVELOPE_12 = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Header/>
  <soap:Body>
    <!-- Your request elements here -->
  </soap:Body>
</soap:Envelope>`;

export function SoapUrlBar() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const openDaakiaAiTab = useTabsStore(s => s.openDaakiaAiTab);
  const updateTab = useTabsStore(s => s.updateTab);
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.soap);
  const mockSuggestions = useMockSuggestions('soap');
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const [wsdlImportOpen, setWsdlImportOpen] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [overflowDir, setOverflowDir] = useState<'down' | 'up'>('down');
  const [showPreflight, setShowPreflight] = useState(false);
  const [showPatternStatus, setShowPatternStatus] = useState(false);
  const [showSoapToRest, setShowSoapToRest] = useState(false);
  const [showWsdlExplainer, setShowWsdlExplainer] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // NOTE: the old "close overflow menu on outside click" effect that lived here has been
  // removed. It tested `overflowRef.contains(target)`, which worked only while the menu was a
  // DOM child of that ref. AnchoredMenu portals the menu to <body>, so a click on a menu ITEM
  // no longer counted as "inside" — the effect fired on mousedown and unmounted the menu
  // before mouseup, meaning no click event ever reached the item and its action silently never
  // ran. AnchoredMenu owns outside-click and Escape itself, and correctly treats both its own
  // content and the anchor as inside.

  const soapVersion = activeTab?.soapVersion || '1.1';
  const soapAction = activeTab?.soapAction || '';

  const handleMockServerSelect = useCallback((url: string) => {
    if (!activeTab) return;
    postMsg({ type: 'soap:loadWsdl', tabId: activeTab.id, url: `${url}?wsdl` });
  }, [activeTab]);

  const handleInvoke = useCallback(() => {
    if (!activeTab) return;
    const endpoint = activeTab.url.trim();
    if (!endpoint) return;

    // Audited by the extension host once the response arrives, where the
    // headers, status and timing exist. Logging on click as well produced
    // two rows per request, the click-time one nearly empty.
    const envelope = activeTab.soapEnvelope || (soapVersion === '1.2' ? DEFAULT_ENVELOPE_12 : DEFAULT_ENVELOPE_11);

    const enabledAttachments = (activeTab.soapAttachments || [])
      .filter(a => a.enabled && a.base64Data)
      .map(a => ({ contentId: a.contentId, contentType: a.contentType, filename: a.filename, base64Data: a.base64Data }));

    postMsg({
      type: 'soap:invoke',
      tabId: activeTab.id,
      // The per-event audit toggle lives in the webview; the host writes the
      // record, so the decision travels with the request.
      auditEnabled: isAuditEventEnabled('soap.invoke'),
      endpoint,
      soapVersion,
      soapAction,
      soapOperation: activeTab.soapOperation || '',
      soapService: activeTab.soapService || '',
      envelope,
      headers: (activeTab.headers || []).filter(h => h.enabled && h.key),
      authType: activeTab.authType,
      authData: activeTab.authData,
      wsSecurity: activeTab.soapWsSecurity,
      assertions: activeTab.soapAssertions,
      preRequestScript: activeTab.preRequestScript,
      postResponseScript: activeTab.postResponseScript,
      ...(enabledAttachments.length > 0 ? { attachments: enabledAttachments } : {}),
    });

    updateTab(activeTab.id, { loading: true, requestProgress: [
      { id: 'pre-request-script', label: 'Executing pre-request script', status: 'running', startTime: Date.now() },
      { id: 'rendering-request', label: 'Rendering request', status: 'pending' },
      { id: 'sending-request', label: 'Sending request', status: 'pending' },
    ] });
  }, [activeTab, updateTab, soapVersion, soapAction]);

  const handleCancel = useCallback(() => {
    if (!activeTab) return;
    postMsg({ type: 'soap:cancel', tabId: activeTab.id });
    updateTab(activeTab.id, { loading: false, requestProgress: undefined });
  }, [activeTab, updateTab]);

  const handleSave = useCallback(() => {
    if (!activeTab) return;
    logUiEvent('soap.save', { url: activeTab.url });
    const saved = saveRequest(activeTab);
    if (saved) updateTab(activeTab.id, { dirty: false });
  }, [activeTab, updateTab]);

  const handleVersionChange = useCallback((v: string) => {
    if (!activeTab) return;
    const newVersion = v as '1.1' | '1.2';
    const currentEnvelope = activeTab.soapEnvelope || '';
    const isDefault = !currentEnvelope || currentEnvelope === DEFAULT_ENVELOPE_11 || currentEnvelope === DEFAULT_ENVELOPE_12;
    updateTab(activeTab.id, {
      soapVersion: newVersion,
      ...(isDefault ? { soapEnvelope: newVersion === '1.2' ? DEFAULT_ENVELOPE_12 : DEFAULT_ENVELOPE_11 } : {}),
      dirty: true,
    });
  }, [activeTab, updateTab]);

  if (!activeTab) return null;

  const saveItems: ContextMenuItem[] = [
    {
      id: 'save-as',
      label: 'Save as',
      icon: <SaveIcon size={13} />,
      iconColor: 'var(--color-ctx-close-saved)',
      onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }),
    },
  ];

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 bg-[var(--color-panel)] overflow-x-auto overflow-y-hidden">
        {/* Import WSDL button */}
        <ButtonView
          className="flex-shrink-0"
          label="WSDL"
          iconLeft={<UploadIcon size={11} />}
          variant="secondary"
          size="lg"
          onClick={() => { logUiEvent('soap.import_wsdl'); setWsdlImportOpen(true); }}
          title="Import WSDL"
        />

        {/* Version (1.1 / 1.2) + Endpoint URL — unified DUI component. Shrinks down to
            minWidth; past that the bar scrolls horizontally instead of squeezing/overlapping. */}
        <div className="flex-[2] min-w-0" style={{ minWidth: 140 }}>
          <SelectTextInputView
            selectOptions={SOAP_VERSION_OPTIONS}
            selectValue={soapVersion}
            onSelectChange={handleVersionChange}
            inputValue={activeTab.url}
            onInputChange={(val) => updateTab(activeTab.id, { url: val, dirty: true })}
            onMockServerSelect={handleMockServerSelect}
            onKeyDown={(e) => { if (e.key === 'Enter') handleInvoke(); }}
            placeholder="http://localhost:8080/soap"
            suggestions={urlSuggestions}
            mockServers={mockSuggestions}
            accentColor={ACCENT}
            size="lg"
            width="fullWidth"
          />
        </div>

        {/* Operation selector */}
        <SoapOperationSelector />

        {/* Invoke / Cancel */}
        {activeTab.loading ? (
          <ButtonView
            className="flex-shrink-0"
            label="Cancel"
            iconLeft={<StopSquareIcon size={12} />}
            variant="danger"
            size="lg"
            onClick={handleCancel}
          />
        ) : (
          <ButtonView
            className="flex-shrink-0"
            label="Invoke"
            iconLeft={<PlayIcon size={12} />}
            variant="primary"
            size="lg"
            accentColor={ACCENT}
            disabled={!isValidProtocolUrl(activeTab.url, 'soap')}
          title={urlValidationHint(activeTab.url, 'soap') ?? undefined}
            onClick={handleInvoke}
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

        {/* AI Tools ⋮ menu */}
        <div className="flex-shrink-0 relative" ref={overflowRef}>
          <IconButtonView
            icon={<MoreVerticalIcon size={15} />}
            title="AI tools"
            size="lg"
            active={showOverflow}
            onClick={() => {
              if (!showOverflow && overflowRef.current) {
                const rect = overflowRef.current.getBoundingClientRect();
                setOverflowDir((window.innerHeight - rect.bottom) < 180 ? 'up' : 'down');
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
              {activeTab.url.trim() && aiEnabled('preflightCheck') && (
                <button type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                  style={{ color: 'var(--color-protocol-ai)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  onClick={() => { setShowPreflight(true); setShowOverflow(false); }}
                >
                  <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                  Pre-flight Check
                </button>
              )}
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
              {activeTab.url.trim() && aiEnabled('patternBaseline') && (
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
              {aiEnabled('soapWsdlExplainer') && (
                <button type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                  style={{ color: 'var(--color-protocol-ai)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  onClick={() => { setShowWsdlExplainer(true); setShowOverflow(false); }}
                >
                  <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                  WSDL Explainer
                </button>
              )}
              {aiEnabled('soapToRest') && (
                <button type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                  style={{ color: 'var(--color-protocol-ai)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  onClick={() => { setShowSoapToRest(true); setShowOverflow(false); }}
                >
                  <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                  SOAP → REST Migrator
                </button>
              )}
            </AnchoredMenu>
          )}

          {showPreflight && activeTab.url.trim() && (
            <AiPreflightPopover tab={activeTab} onClose={() => setShowPreflight(false)} />
          )}
          {showPatternStatus && activeTab.url.trim() && aiEnabled('patternBaseline') && (
            <PatternBaselinePopup
              method="SOAP"
              url={activeTab.url}
              onClose={() => setShowPatternStatus(false)}
            />
          )}
        </div>
      </div>

      <SoapWsdlImport open={wsdlImportOpen} onClose={() => setWsdlImportOpen(false)} />
      {showWsdlExplainer && <AiSoapWsdlExplainerModal onClose={() => setShowWsdlExplainer(false)} />}
      {showSoapToRest && <AiSoapToRestModal onClose={() => setShowSoapToRest(false)} />}
    </>
  );
}
