import { useCallback, useState } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../store/url-suggestions-store';
import { postMsg } from '../../vscode';
import { PlayIcon, SaveIcon, StopSquareIcon, UploadIcon } from '../../icons';
import { SplitButton, HighlightedInput } from '../shared';
import type { SplitButtonItem } from '../shared';
import { saveRequest } from '../../services/request';
import { SoapWsdlImport } from './SoapWsdlImport';
import { SoapOperationSelector } from './SoapOperationSelector';
import { useMockSuggestions } from '../../hooks/useMockSuggestions';

const saveItems: SplitButtonItem[] = [
  { id: 'save-as', label: 'Save as', icon: <SaveIcon size={12} />, iconColor: 'var(--color-ctx-close-saved)', onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }) },
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

/**
 * SoapUrlBar — mirrors GrpcUrlBar layout:
 * [1.1] [WSDL] [endpoint input] [Operation Selector dropdown] [Invoke] [Save]
 */
export function SoapUrlBar() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.soap);
  const mockSuggestions = useMockSuggestions('soap');
  const [wsdlImportOpen, setWsdlImportOpen] = useState(false);

  const soapVersion = activeTab?.soapVersion || '1.1';
  const soapAction = activeTab?.soapAction || '';

  // When user selects a mock server from suggestions, auto-load WSDL
  const handleMockServerSelect = useCallback((url: string) => {
    if (!activeTab) return;
    const wsdlUrl = `${url}?wsdl`;
    postMsg({ type: 'soap:loadWsdl', tabId: activeTab.id, url: wsdlUrl });
  }, [activeTab]);

  const handleInvoke = useCallback(() => {
    if (!activeTab) return;
    const endpoint = activeTab.url.trim();
    if (!endpoint) return;

    const envelope = activeTab.soapEnvelope || (soapVersion === '1.2' ? DEFAULT_ENVELOPE_12 : DEFAULT_ENVELOPE_11);

    // Collect enabled attachments for MTOM
    const enabledAttachments = (activeTab.soapAttachments || [])
      .filter(a => a.enabled && a.base64Data)
      .map(a => ({ contentId: a.contentId, contentType: a.contentType, filename: a.filename, base64Data: a.base64Data }));

    postMsg({
      type: 'soap:invoke',
      tabId: activeTab.id,
      endpoint,
      soapVersion,
      soapAction,
      soapOperation: activeTab.soapOperation || '',
      soapService: activeTab.soapService || '',
      envelope,
      headers: (activeTab.headers || []).filter(h => h.enabled && h.key),
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
    const saved = saveRequest(activeTab);
    if (saved) updateTab(activeTab.id, { dirty: false });
  }, [activeTab, updateTab]);

  const toggleVersion = useCallback(() => {
    if (!activeTab) return;
    const newVersion = soapVersion === '1.1' ? '1.2' : '1.1';
    const currentEnvelope = activeTab.soapEnvelope || '';
    const isDefault = !currentEnvelope || currentEnvelope === DEFAULT_ENVELOPE_11 || currentEnvelope === DEFAULT_ENVELOPE_12;
    updateTab(activeTab.id, {
      soapVersion: newVersion,
      ...(isDefault ? { soapEnvelope: newVersion === '1.2' ? DEFAULT_ENVELOPE_12 : DEFAULT_ENVELOPE_11 } : {}),
      dirty: true,
    });
  }, [activeTab, updateTab, soapVersion]);

  if (!activeTab) return null;

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)]">
        {/* SOAP version pill — taller, wider */}
        <button
          type="button"
          onClick={toggleVersion}
          className="h-[36px] px-3 text-[11px] font-bold rounded-md cursor-pointer transition-colors bg-[color-mix(in_srgb,var(--color-protocol-soap)_15%,transparent)] text-[var(--color-protocol-soap)] hover:bg-[color-mix(in_srgb,var(--color-protocol-soap)_25%,transparent)] flex-shrink-0"
          title={`SOAP ${soapVersion} — click to toggle`}
        >
          {soapVersion}
        </button>

        {/* Import WSDL button — taller, wider */}
        <button
          type="button"
          onClick={() => setWsdlImportOpen(true)}
          className="h-[36px] px-3 text-[11px] font-medium rounded-md cursor-pointer transition-colors border border-[var(--color-surface-border)] bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-protocol-soap)] hover:border-[var(--color-protocol-soap)] flex items-center gap-1.5 flex-shrink-0"
          title="Import WSDL"
        >
          <UploadIcon size={11} />
          WSDL
        </button>

        {/* Endpoint input */}
        <div className="flex-[2] min-w-0">
          <HighlightedInput
            value={activeTab.url}
            onChange={(val) => updateTab(activeTab.id, { url: val, dirty: true })}
            onKeyDown={(e) => { if (e.key === 'Enter') handleInvoke(); }}
            placeholder="http://localhost:8080/soap"
            suggestions={urlSuggestions}
            mockServers={mockSuggestions}
            onMockServerSelect={handleMockServerSelect}
            accentColor="var(--color-protocol-soap)"
            protocolHints={[]}
          />
        </div>

        {/* Operation selector — textbox with dropdown (like GrpcMethodSelector) */}
        <SoapOperationSelector />

        {/* Invoke / Cancel button */}
        {activeTab.loading ? (
          <button
            type="button"
            onClick={handleCancel}
            className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-error)] text-white hover:opacity-90 cursor-pointer transition-opacity flex items-center gap-1.5 flex-shrink-0"
          >
            <StopSquareIcon size={12} />
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={handleInvoke}
            disabled={!activeTab.url.trim()}
            className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-protocol-soap)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity flex items-center gap-1.5 flex-shrink-0"
          >
            <PlayIcon size={12} />
            Invoke
          </button>
        )}

        {/* Save SplitButton */}
        <SplitButton
          label="Save"
          variant="secondary"
          onClick={handleSave}
          icon={<SaveIcon size={13} />}
          items={saveItems}
        />
      </div>

      {/* WSDL Import Modal */}
      <SoapWsdlImport open={wsdlImportOpen} onClose={() => setWsdlImportOpen(false)} />
    </>
  );
}
