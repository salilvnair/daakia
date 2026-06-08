import { useState, useRef, useEffect, useCallback } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useScrollRestore } from '../../../hooks/useScrollRestore';
import { useToastStore } from '../../../store/toast-store';
import { PillTabs, KeyValueTable, FormDataTable, CodeEditor, StyledDropdown, ConfirmDialog, AuthEditor, ScriptsEditor, type PillTab } from '../../shared';
import { TrashIcon, BulkEditIcon, PlusIcon, SparkleIcon, WandIcon, FileUploadIcon, CookieIcon, DiceIcon } from '../../../icons';
import { postMsg } from '../../../vscode';
import { AiHeaderSuggest, type AiHeaderSuggestHandle } from '../../ai/AiHeaderSuggest';
import { ComputedHeaderList } from './ComputedHeaderList';
import { AiBodyGenerate, type AiBodyGenerateHandle } from '../../ai/AiBodyGenerate';
import { AiDataGeneratorModal } from '../../ai/AiDataGeneratorModal';
import { AiRequestFuzzerModal } from '../../ai/AiRequestFuzzerModal';

// ── Computed auth header rows (Task 7) ──────────────────────────────────────
function computeAuthRows(authType: string, authData: Record<string, string>): { key: string; value: string }[] {
  if (authType === 'bearer' && authData.token) {
    return [{ key: 'Authorization', value: `Bearer ${authData.token}` }];
  }
  if (authType === 'basic' && authData.username) {
    const encoded = btoa(`${authData.username}:${authData.password || ''}`);
    return [{ key: 'Authorization', value: `Basic ${encoded}` }];
  }
  if (authType === 'api-key' && authData.apiKeyName && (!authData.addTo || authData.addTo === 'header')) {
    return [{ key: authData.apiKeyName, value: authData.apiKeyValue || '' }];
  }
  if (authType === 'oauth2' && authData.accessToken) {
    return [{ key: 'Authorization', value: `Bearer ${authData.accessToken}` }];
  }
  return [];
}


const CONFIG_TABS: PillTab[] = [
  { id: 'params', label: 'Params' },
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Auth' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'variables', label: 'Variables' },
];

export function RequestConfig() {
  const { tabs, activeTabId, updateTab } = useTabsStore();
  const tab = tabs.find(t => t.id === activeTabId);
  const storedSection = useUiStateStore(s => s.prefs[`rest.subtab.${activeTabId}`]);
  const [activeSection, setActiveSectionLocal] = useState(storedSection || 'params');
  const [oauth2Loading, setOauth2Loading] = useState(false);
  const [aiHeaderLoading, setAiHeaderLoading] = useState(false);
  const aiHeaderSuggestRef = useRef<AiHeaderSuggestHandle>(null);
  // Task 8: cookie jar rows for the current URL's domain
  const [cookieJarRows, setCookieJarRows] = useState<{ key: string; value: string }[]>([]);

  // Sync from store when tab changes
  useEffect(() => {
    const pref = useUiStateStore.getState().getPref(`rest.subtab.${activeTabId}`, 'params');
    setActiveSectionLocal(pref!);
  }, [activeTabId]);

  const setActiveSection = (section: string) => {
    setActiveSectionLocal(section);
    useUiStateStore.getState().setPref(`rest.subtab.${activeTabId}`, section);
  };

  // Scroll position persistence
  const scrollRef = useScrollRestore(`requestConfig.${activeTabId}.${activeSection}`, [activeTabId, activeSection]);

  // Task 8: fetch cookies for current URL's domain when on headers tab or URL changes
  useEffect(() => {
    if (activeSection !== 'headers') return;
    const rawUrl = tab?.url?.trim();
    if (!rawUrl) { setCookieJarRows([]); return; }
    try {
      const u = new URL(rawUrl.match(/^https?:\/\//) ? rawUrl : 'http://' + rawUrl);
      postMsg({ type: 'getCookiesForDomain', domain: u.hostname });
    } catch { setCookieJarRows([]); }
  }, [activeSection, tab?.url, activeTabId]);

  // Task 8: listen for cookiesForDomain response
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'cookiesForDomain') {
        const cookies = (msg.cookies as { name: string; value: string }[]) || [];
        if (cookies.length > 0) {
          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          setCookieJarRows([{ key: 'Cookie', value: cookieStr }]);
        } else {
          setCookieJarRows([]);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Listen for OAuth2 token result
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'oauth2TokenResult' && msg.tabId === tab?.id) {
        setOauth2Loading(false);
        if (msg.success && msg.accessToken) {
          updateTab(msg.tabId, { authData: { ...tab?.authData, accessToken: msg.accessToken } });
          useToastStore.getState().addToast({ message: 'Token fetched successfully', type: 'success' });
        } else {
          useToastStore.getState().addToast({ message: msg.error || 'Failed to get token', type: 'error' });
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [tab?.id, tab?.authData, updateTab]);

  const handleGetOAuth2Token = useCallback(() => {
    if (!tab) return;
    setOauth2Loading(true);
    postMsg({
      type: 'getOAuth2Token',
      tabId: tab.id,
      config: {
        grantType: tab.authData.oauth2GrantType || 'authorization_code',
        authUrl: tab.authData.oauth2AuthUrl,
        tokenUrl: tab.authData.oauth2TokenUrl,
        clientId: tab.authData.oauth2ClientId,
        clientSecret: tab.authData.oauth2ClientSecret,
        scope: tab.authData.oauth2Scope,
        redirectUri: tab.authData.oauth2RedirectUri,
        username: tab.authData.oauth2Username,
        password: tab.authData.oauth2Password,
        usePkce: tab.authData.oauth2UsePkce === 'true',
      },
    });
  }, [tab]);

  if (!tab) return null;

  // Add badge counts
  const tabsWithBadges = CONFIG_TABS.map(t => {
    switch (t.id) {
      case 'params': return { ...t, badge: tab.params.filter(p => p.enabled && p.key).length };
      case 'headers': return { ...t, badge: tab.headers.filter(h => h.enabled && h.key).length };
      case 'variables': return { ...t, badge: tab.variables?.filter((v: any) => v.enabled && v.key).length || 0 };
      case 'body': return { ...t, dot: !!(tab.bodyRaw?.trim()) || !!(tab.bodyFormData?.some((f: any) => f.key)) };
      case 'auth': return { ...t, dot: tab.authType !== 'none' };
      case 'scripts': return { ...t, dot: !!(tab.preRequestScript?.trim()) || !!(tab.postResponseScript?.trim()) };
      default: return t;
    }
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--color-surface)]">
      {/* Section tabs */}
      <div className="flex items-center px-3 pt-2.5 pb-0 border-b border-[var(--color-surface-border)]">
        <div className="flex-1">
          <PillTabs
            tabs={tabsWithBadges}
            activeTab={activeSection}
            onChange={setActiveSection}
            size="sm"
            variant="underline"
          />
        </div>
        {/* AI Fuzzer trigger — only visible on Body tab */}
        {activeSection === 'body' && tab.bodyRaw?.trim() && (
          <button
            type="button"
            onClick={() => setShowFuzzer(true)}
            title="AI Request Fuzzer — generate edge-case payloads"
            className="flex-shrink-0 h-[22px] px-2 mb-1 text-[10px] font-medium rounded cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-1"
            style={{ backgroundColor: '#ef444418', color: '#ef4444', border: '1px solid #ef444440' }}
          >
            <SparkleIcon size={9} />
            Fuzz
          </button>
        )}
      </div>

      {/* Section content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-3 py-2 flex flex-col min-h-0">
        {activeSection === 'params' && (
          <KeyValueTable
            rows={tab.params}
            onChange={(rows) => updateTab(tab.id, { params: rows })}
            placeholder={{ key: 'Parameter', value: 'Value' }}
            label="Query Parameters"
          />
        )}

        {activeSection === 'headers' && (
          <>
            {/* Computed headers: auth + cookie jar */}
            <ComputedHeaderList
              rows={[
                ...computeAuthRows(tab.authType, tab.authData).map((row, i) => ({
                  id: `auth-${i}`,
                  key: row.key,
                  value: row.value,
                  badge: 'auth',
                  badgeColor: 'var(--color-primary)',
                  masked: true,
                  onDelete: () => updateTab(tab.id, { authType: 'none' as typeof tab.authType, authData: {} }),
                  deleteTitle: 'Clear auth (sets auth type to None)',
                })),
                ...cookieJarRows.map((row, i) => ({
                  id: `cookie-${i}`,
                  key: row.key,
                  value: row.value,
                  badge: 'cookie jar',
                  badgeColor: 'var(--color-warning)',
                  icon: <CookieIcon size={13} />,
                })),
              ]}
            />
            <KeyValueTable
              rows={tab.headers}
              onChange={(rows) => updateTab(tab.id, { headers: rows })}
              placeholder={{ key: 'Header', value: 'Value' }}
              autocompleteKeys
              maskSensitive
              label="Header List"
              toolbarExtra={
                <button
                  type="button"
                  title="Suggest headers"
                  disabled={aiHeaderLoading}
                  onClick={() => {
                    setAiHeaderLoading(true);
                    aiHeaderSuggestRef.current?.trigger();
                    setTimeout(() => setAiHeaderLoading(false), 300);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors text-[var(--color-text-muted)] hover:bg-[rgba(168,85,247,0.08)]"
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-protocol-ai)')}
                  onMouseLeave={e => (e.currentTarget.style.color = '')}
                >
                  <SparkleIcon size={13} />
                </button>
              }
            />
            <AiHeaderSuggest
              ref={aiHeaderSuggestRef}
              tabId={tab.id}
              method={tab.method}
              url={tab.url}
              bodyContentType={tab.bodyContentType}
              authType={tab.authType}
              existingHeaders={tab.headers}
              onAddHeader={(key, value) => {
                const rows = tab.headers.filter(r => r.key || r.value);
                const newRow = { id: crypto.randomUUID(), key, value, description: '', enabled: true };
                updateTab(tab.id, { headers: [...rows, newRow] });
              }}
            />
          </>
        )}

        {activeSection === 'body' && (
          <BodyEditor tab={tab} />
        )}

        {activeSection === 'auth' && (
          <AuthEditor
            authType={tab.authType}
            authData={tab.authData}
            onAuthTypeChange={(v) => updateTab(tab.id, { authType: v as typeof tab.authType })}
            onAuthDataChange={(data) => updateTab(tab.id, { authData: data as Record<string, string> })}
            onGetOAuth2Token={handleGetOAuth2Token}
            oauth2Loading={oauth2Loading}
          />
        )}

        {activeSection === 'scripts' && (
          <ScriptsEditor
            preRequestScript={tab.preRequestScript}
            postResponseScript={tab.postResponseScript}
            onPreRequestScriptChange={(val) => updateTab(tab.id, { preRequestScript: val })}
            onPostResponseScriptChange={(val) => updateTab(tab.id, { postResponseScript: val })}
          />
        )}

        {activeSection === 'variables' && (
          <KeyValueTable
            rows={tab.variables}
            onChange={(rows) => updateTab(tab.id, { variables: rows })}
            placeholder={{ key: 'Variable', value: 'Value' }}
            label="Request Variables"
          />
        )}
      </div>
    </div>
  );
}

// ────────── Body Editor ──────────

/** Content type → bodyMode mapping */
const CONTENT_TYPE_MODE: Record<string, string> = {
  'none': 'none',
  'application/json': 'json',
  'application/ld+json': 'json',
  'application/hal+json': 'json',
  'application/vnd.api+json': 'json',
  'application/xml': 'raw',
  'text/xml': 'raw',
  'application/soap+xml': 'raw',
  'application/x-www-form-urlencoded': 'x-www-form-urlencoded',
  'multipart/form-data': 'form-data',
  'application/octet-stream': 'binary',
  'text/html': 'raw',
  'text/plain': 'raw',
  'text/css': 'raw',
  'text/csv': 'raw',
  'text/markdown': 'raw',
  'application/javascript': 'raw',
  'application/graphql': 'raw',
  'application/yaml': 'raw',
  'application/msgpack': 'binary',
};

/** Content type → Monaco editor language */
const CONTENT_TYPE_LANG: Record<string, string> = {
  'application/json': 'json',
  'application/ld+json': 'json',
  'application/hal+json': 'json',
  'application/vnd.api+json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/soap+xml': 'xml',
  'text/html': 'html',
  'text/plain': 'plaintext',
  'text/css': 'css',
  'text/csv': 'plaintext',
  'text/markdown': 'markdown',
  'application/javascript': 'javascript',
  'application/graphql': 'graphql',
  'application/yaml': 'yaml',
};

/** Content type → placeholder text shown when editor is empty (Task 9) */
const CONTENT_TYPE_PLACEHOLDER: Record<string, string> = {
  'application/json': '{\n  "key": "value"\n}',
  'application/ld+json': '{\n  "@context": "https://schema.org",\n  "@type": "Thing",\n  "name": "value"\n}',
  'application/hal+json': '{\n  "_links": {\n    "self": { "href": "/resource/1" }\n  },\n  "key": "value"\n}',
  'application/vnd.api+json': '{\n  "data": {\n    "type": "articles",\n    "id": "1",\n    "attributes": {\n      "title": "value"\n    }\n  }\n}',
  'application/xml': '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <element>value</element>\n</root>',
  'text/xml': '<root>\n  <element>value</element>\n</root>',
  'application/soap+xml': '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">\n  <soapenv:Header/>\n  <soapenv:Body>\n    <!-- Your operation here -->\n  </soapenv:Body>\n</soapenv:Envelope>',
  'text/html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>',
  'text/plain': 'Plain text content here',
  'text/css': '/* CSS Styles */\nbody {\n  margin: 0;\n  padding: 0;\n}',
  'text/csv': 'column1,column2,column3\nvalue1,value2,value3',
  'text/markdown': '# Title\n\n> Blockquote\n\nContent here',
  'application/javascript': '// JavaScript code\nconst data = {};\nconsole.log(data);',
  'application/graphql': '{\n  # Your GraphQL query\n  query {\n    field\n  }\n}',
  'application/yaml': '# YAML content\nkey: value\nlist:\n  - item1\n  - item2',
};

/** Grouped content type options for dropdown */
const CONTENT_TYPE_OPTIONS = [
  { value: 'none', label: 'None', isHeader: false },
  { value: '_h_json', label: 'JSON', isHeader: true },
  { value: 'application/json', label: 'application/json', isHeader: false },
  { value: 'application/ld+json', label: 'application/ld+json', isHeader: false },
  { value: 'application/hal+json', label: 'application/hal+json', isHeader: false },
  { value: 'application/vnd.api+json', label: 'application/vnd.api+json', isHeader: false },
  { value: '_h_xml', label: 'XML', isHeader: true },
  { value: 'application/xml', label: 'application/xml', isHeader: false },
  { value: 'text/xml', label: 'text/xml', isHeader: false },
  { value: 'application/soap+xml', label: 'application/soap+xml', isHeader: false },
  { value: '_h_text', label: 'Text', isHeader: true },
  { value: 'text/plain', label: 'text/plain', isHeader: false },
  { value: 'text/html', label: 'text/html', isHeader: false },
  { value: 'text/css', label: 'text/css', isHeader: false },
  { value: 'text/csv', label: 'text/csv', isHeader: false },
  { value: 'text/markdown', label: 'text/markdown', isHeader: false },
  { value: '_h_code', label: 'Code', isHeader: true },
  { value: 'application/javascript', label: 'application/javascript', isHeader: false },
  { value: 'application/graphql', label: 'application/graphql', isHeader: false },
  { value: 'application/yaml', label: 'application/yaml', isHeader: false },
  { value: '_h_structured', label: 'Structured', isHeader: true },
  { value: 'application/x-www-form-urlencoded', label: 'application/x-www-form-urlencoded', isHeader: false },
  { value: 'multipart/form-data', label: 'multipart/form-data', isHeader: false },
  { value: '_h_binary', label: 'Binary', isHeader: true },
  { value: 'application/octet-stream', label: 'application/octet-stream', isHeader: false },
  { value: 'application/msgpack', label: 'application/msgpack', isHeader: false },
];

function BodyEditor({ tab }: { tab: ReturnType<typeof useTabsStore.getState>['tabs'][0] }) {
  const { updateTab } = useTabsStore();
  const { addToast } = useToastStore();
  const [bulkEdit, setBulkEdit] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const bulkTextRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const binaryFileInputRef = useRef<HTMLInputElement>(null);
  const [binaryFileName, setBinaryFileName] = useState('');
  const aiBodyGenerateRef = useRef<AiBodyGenerateHandle>(null);
  const [showDataGenerator, setShowDataGenerator] = useState(false);
  const [showFuzzer, setShowFuzzer] = useState(false);

  const contentType = tab.bodyContentType || 'application/json';
  const bodyMode = tab.bodyMode;

  const handleContentTypeChange = (ct: string) => {
    const mode = (CONTENT_TYPE_MODE[ct] || 'raw') as typeof tab.bodyMode;
    updateTab(tab.id, { bodyContentType: ct, bodyMode: mode });
    setBulkEdit(false);
  };

  // Derive effective dropdown value from bodyMode when bodyContentType is not set
  const dropdownValue = contentType === 'application/json' && bodyMode === 'none' ? 'none' : (bodyMode === 'none' ? 'none' : contentType);

  const isTableMode = bodyMode === 'form-data' || bodyMode === 'x-www-form-urlencoded';
  const isCodeMode = bodyMode === 'json' || bodyMode === 'raw';
  const isBinaryMode = bodyMode === 'binary';
  const tableRows = bodyMode === 'form-data' ? tab.bodyFormData : tab.bodyUrlEncoded;
  const hasContent = isTableMode
    ? tableRows.some(r => r.key || r.value)
    : isCodeMode ? tab.bodyRaw.trim().length > 0
    : isBinaryMode ? !!tab.bodyRaw
    : false;

  const editorLanguage = (CONTENT_TYPE_LANG[contentType] || (bodyMode === 'json' ? 'json' : 'plaintext')) as import('../../shared/editors/CodeEditor').CodeLanguage;

  const handleClearAll = () => {
    if (bodyMode === 'form-data') {
      updateTab(tab.id, { bodyFormData: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true, type: 'text' }] });
    } else if (bodyMode === 'x-www-form-urlencoded') {
      updateTab(tab.id, { bodyUrlEncoded: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }] });
    } else {
      updateTab(tab.id, { bodyRaw: '' });
      setBinaryFileName('');
    }
    setShowClearConfirm(false);
    setBulkEdit(false);
  };

  const handlePrettify = () => {
    if (tab.bodyMode === 'json') {
      try {
        const formatted = JSON.stringify(JSON.parse(tab.bodyRaw), null, 2);
        updateTab(tab.id, { bodyRaw: formatted });
      } catch { /* ignore invalid JSON */ }
    }
  };

  const toBulkText = () => {
    return tableRows
      .filter(r => r.key || r.value)
      .map(r => `${!r.enabled ? '# ' : ''}${r.key}: ${r.value}`)
      .join('\n');
  };

  const fromBulkText = (text: string) => {
    const parsed = text.split('\n').map(line => {
      const disabled = line.startsWith('# ');
      const clean = disabled ? line.slice(2) : line;
      const colonIdx = clean.indexOf(':');
      const key = colonIdx >= 0 ? clean.slice(0, colonIdx).trim() : clean.trim();
      const value = colonIdx >= 0 ? clean.slice(colonIdx + 1).trim() : '';
      return { id: crypto.randomUUID(), key, value, description: '', enabled: !disabled, type: 'text' as const };
    }).filter(r => r.key || r.value);
    const rows = parsed.length === 0
      ? [{ id: crypto.randomUUID(), key: '', value: '', enabled: true, type: 'text' as const }]
      : parsed;
    if (tab.bodyMode === 'form-data') {
      updateTab(tab.id, { bodyFormData: rows });
    } else {
      updateTab(tab.id, { bodyUrlEncoded: rows });
    }
  };

  const addRow = () => {
    const newRow = { id: crypto.randomUUID(), key: '', value: '', enabled: true, type: 'text' as const };
    if (tab.bodyMode === 'form-data') {
      updateTab(tab.id, { bodyFormData: [...tab.bodyFormData, newRow] });
    } else {
      updateTab(tab.id, { bodyUrlEncoded: [...tab.bodyUrlEncoded, newRow] });
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {/* Content Type row */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-[12px] text-[var(--color-text-muted)]">Content Type</span>
        <StyledDropdown
          options={CONTENT_TYPE_OPTIONS}
          value={dropdownValue}
          onChange={handleContentTypeChange}
          size="sm"
        />
        {bodyMode !== 'none' && contentType !== 'none' && bodyMode !== 'form-data' && bodyMode !== 'x-www-form-urlencoded' && (
          <span className="text-[12px] text-[var(--color-text-muted)] opacity-60">Override</span>
        )}
      </div>

      {bodyMode === 'none' && (
        <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">
          This request does not have a body.
        </p>
      )}

      {/* Request Body label + toolbar icons */}
      {bodyMode !== 'none' && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[12px] text-[var(--color-primary)] font-medium">
            {isBinaryMode ? 'File Upload' : 'Raw Request Body'}
          </span>
          <div className="flex items-center gap-1">
            {hasContent && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
                title="Clear all"
              >
                <TrashIcon size={14} />
              </button>
            )}
            {isTableMode && (
              <>
                <button
                  type="button"
                  onClick={() => { if (bulkEdit) fromBulkText(bulkTextRef.current); setBulkEdit(!bulkEdit); }}
                  className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${
                    bulkEdit
                      ? 'text-[var(--color-primary)] bg-[rgba(99,102,241,0.12)]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)]'
                  }`}
                  title="Bulk edit"
                >
                  <BulkEditIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={addRow}
                  className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[rgba(99,102,241,0.08)] cursor-pointer transition-colors"
                  title="Add new row"
                >
                  <PlusIcon size={14} />
                </button>
              </>
            )}
            {isCodeMode && (
              <>
                {editorLanguage === 'json' && (
                  <button
                    type="button"
                    onClick={handlePrettify}
                    className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer transition-colors"
                    title="Prettify"
                  >
                    <WandIcon size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => aiBodyGenerateRef.current?.open()}
                  className="w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors"
                  style={{
                    color: aiBodyGenerateRef.current?.loading
                      ? 'var(--color-protocol-ai)'
                      : 'var(--color-text-muted)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-protocol-ai)')}
                  onMouseLeave={e => { if (!aiBodyGenerateRef.current?.loading) e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                  title="Generate body with AI"
                >
                  <SparkleIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDataGenerator(true)}
                  className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-info)] hover:bg-[rgba(14,165,233,0.08)] cursor-pointer transition-colors"
                  title="Generate test data with AI"
                >
                  <DiceIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer transition-colors"
                  title="Import from file"
                >
                  <FileUploadIcon size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Binary file picker */}
      {isBinaryMode && (
        <div className="flex items-center gap-3 px-1 py-3">
          <button
            type="button"
            onClick={() => binaryFileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-md bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] text-[12px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
          >
            Choose File
          </button>
          <span className="text-[12px] text-[var(--color-text-muted)]">
            {binaryFileName || 'No file chosen'}
          </span>
        </div>
      )}

      {/* AI Body Generator panel */}
      {isCodeMode && !bulkEdit && tab && (
        <AiBodyGenerate
          ref={aiBodyGenerateRef}
          tabId={tab.id}
          method={tab.method || 'GET'}
          url={tab.url || ''}
          contentType={contentType}
          onApply={(body) => updateTab(tab.id, { bodyRaw: body })}
        />
      )}

      {/* Code editor (json, raw, xml, html, plain) */}
      {isCodeMode && !bulkEdit && (
        <div className="flex-1 min-h-0">
          <CodeEditor
            value={tab.bodyRaw}
            onChange={(val) => updateTab(tab.id, { bodyRaw: val })}
            language={editorLanguage}
            placeholder={CONTENT_TYPE_PLACEHOLDER[contentType] ?? 'Raw Request Body'}
            height="100%"
          />
        </div>
      )}

      {tab.bodyMode === 'form-data' && !bulkEdit && (
        <FormDataTable
          rows={tab.bodyFormData}
          onChange={(rows) => updateTab(tab.id, { bodyFormData: rows })}
          hideToolbar
        />
      )}

      {tab.bodyMode === 'x-www-form-urlencoded' && !bulkEdit && (
        <KeyValueTable
          rows={tab.bodyUrlEncoded}
          onChange={(rows) => updateTab(tab.id, { bodyUrlEncoded: rows })}
          placeholder={{ key: 'Field', value: 'Value' }}
          hideToolbar
        />
      )}

      {/* Bulk edit textarea (table modes) */}
      {isTableMode && bulkEdit && (
        <BodyBulkEditArea defaultValue={toBulkText()} onChangeRef={bulkTextRef} />
      )}

      {/* Clear confirm */}
      {showClearConfirm && (
        <ConfirmDialog
          title="Clear All?"
          message="All body content will be permanently deleted. This cannot be undone."
          confirmLabel="Clear All"
          danger
          onConfirm={handleClearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

      {/* Hidden file input for text import */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".json,.xml,.txt,.html,.csv,.yaml,.yml"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const content = reader.result as string;
            updateTab(tab.id, { bodyRaw: content });
            addToast({ type: 'success', message: `Imported ${file.name}` });
          };
          reader.readAsText(file);
          e.target.value = '';
        }}
      />

      {/* Hidden file input for binary upload */}
      <input
        ref={binaryFileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1] || '';
            updateTab(tab.id, { bodyRaw: base64 });
            setBinaryFileName(file.name);
            addToast({ type: 'success', message: `Selected ${file.name} (${(file.size / 1024).toFixed(1)} KB)` });
          };
          reader.readAsDataURL(file);
          e.target.value = '';
        }}
      />

      {/* AI Data Generator Modal */}
      {showDataGenerator && tab && (
        <AiDataGeneratorModal
          tabId={tab.id}
          onApply={(data) => updateTab(tab.id, { bodyRaw: data })}
          onClose={() => setShowDataGenerator(false)}
        />
      )}
      {showFuzzer && (
        <AiRequestFuzzerModal
          onClose={() => setShowFuzzer(false)}
        />
      )}
    </div>
  );
}

function BodyBulkEditArea({ defaultValue, onChangeRef }: { defaultValue: string; onChangeRef: React.MutableRefObject<string> }) {
  const [text, setText] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  onChangeRef.current = text;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-[var(--color-text-muted)] px-1">
        Entries are separated by newline. Keys and values are separated by <code style={{ color: 'var(--color-primary)' }}>:</code>. Prepend <code style={{ color: 'var(--color-primary)' }}>#</code> to disable a row.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full min-h-[160px] px-3 py-2.5 rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[13px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none resize-y"
        style={focused ? { borderColor: 'var(--color-primary)' } : undefined}
        placeholder={`field1: value1\nfield2: value2\n# disabled_field: value3`}
        spellCheck={false}
      />
    </div>
  );
}

// (AuthEditor and ScriptsEditor extracted to shared/)
