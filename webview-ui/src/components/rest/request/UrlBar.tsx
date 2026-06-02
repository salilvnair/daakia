import { useState } from 'react';
import { useTabsStore, type HttpMethod } from '../../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../../store/url-suggestions-store';
import { useDebugStore } from '../../../store/debug-store';
import { StyledDropdown, SplitButton, GenerateCodeModal, ImportCurlModal, HighlightedInput, type DropdownOption, type SplitButtonItem } from '../../shared';
import { useMockSuggestions } from '../../../hooks/useMockSuggestions';
import { postMsg } from '../../../vscode';
import { sendRequest, sendAndDownloadRequest, cancelRequest, saveRequest } from '../../../services/request';
import { METHOD_COLORS } from '../../../colors';
import { SaveIcon, SendIcon, DownloadIcon, CopyIcon, CodeIcon, RefreshIcon, StopSquareIcon } from '../../../icons';

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
  const { tabs, activeTabId, updateTab } = useTabsStore();
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.rest);
  const mockSuggestions = useMockSuggestions('rest');
  const [showImportCurl, setShowImportCurl] = useState(false);
  const [showGenerateCode, setShowGenerateCode] = useState(false);
  const tab = tabs.find(t => t.id === activeTabId);

  if (!tab) return null;

  const handleSend = () => {
    if (tab.loading) {
      cancelRequest(tab.id);
      updateTab(tab.id, { loading: false, requestProgress: undefined });
      // Also stop debugger if active for this tab
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
    {
      id: 'send-download',
      label: 'Send and Download',
      icon: <DownloadIcon />,
      onClick: handleSendAndDownload,
    },
    {
      id: 'import-curl',
      label: 'Import cURL',
      icon: <CopyIcon style={{ color: '#ffa726' }} />,
      shortcut: 'C',
      dividerBefore: true,
      onClick: () => setShowImportCurl(true),
    },
    {
      id: 'show-code',
      label: 'Show code',
      icon: <CodeIcon style={{ color: '#4fc3f7' }} />,
      shortcut: 'S',
      onClick: () => setShowGenerateCode(true),
    },
    {
      id: 'clear-all',
      label: 'Clear all',
      icon: <RefreshIcon style={{ color: '#ef5350' }} />,
      shortcut: '⌫',
      dividerBefore: true,
      onClick: handleClearAll,
    },
  ];

  const saveItems: SplitButtonItem[] = [
    {
      id: 'save-as',
      label: 'Save as',
      icon: <SaveIcon />,
      iconColor: 'var(--color-ctx-close-saved)',
      onClick: () => postMsg({ type: 'openSaveAs', tabId: tab.id }),
    },
  ];

  return (
    <div className="url-bar">
      {/* Method selector */}
      <StyledDropdown
        options={METHOD_OPTIONS}
        value={tab.method}
        onChange={(v) => updateTab(tab.id, { method: v as HttpMethod })}
        className="url-bar-method"
      />

      {/* URL input with variable highlighting */}
      <HighlightedInput
        value={tab.url}
        onChange={(v) => updateTab(tab.id, { url: v })}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
        placeholder="Enter a URL or paste a cURL command"
        suggestions={urlSuggestions}
        mockServers={mockSuggestions}
      />

      {/* Send / Cancel */}
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

      {/* Save SplitButton */}
      <SplitButton
        label="Save"
        variant="secondary"
        onClick={handleSave}
        icon={<SaveIcon />}
        items={saveItems}
      />

      {/* Modals */}
      <GenerateCodeModal open={showGenerateCode} tab={tab} onClose={() => setShowGenerateCode(false)} />
      <ImportCurlModal open={showImportCurl} onClose={() => setShowImportCurl(false)} />
    </div>
  );
}
