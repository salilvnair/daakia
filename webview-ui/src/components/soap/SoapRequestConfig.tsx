import { useState, useEffect, useMemo, useRef } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { AuthEditor, ScriptsEditor } from '../shared';
import type { KeyValueRow } from '../shared';
import { SoapFormEditor } from './SoapFormEditor';
import { SoapHeadersEditor } from './SoapHeadersEditor';
import { SoapAssertions } from './SoapAssertions';
import { SoapWsdlBrowser } from './SoapWsdlBrowser';
import { SoapAttachments } from './SoapAttachments';
import { SparkleIcon, WandIcon } from '../../icons';
import { AiHeaderSuggest } from '../ai/AiHeaderSuggest';
import type { AiHeaderSuggestHandle } from '../ai/AiHeaderSuggest';
import { AiBodyGenerate } from '../ai/AiBodyGenerate';
import type { AiBodyGenerateHandle } from '../ai/AiBodyGenerate';
import { AiRequestFuzzerModal } from '../ai/AiRequestFuzzerModal';
import { AiSoapWsdlExplainerModal } from '../ai/AiSoapWsdlExplainerModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import {
  EditorView,
  KeyValueTableView,
  TabView,
  ButtonView,
  IconButtonView,
  type TabItem,
} from '@salilvnair/dui';

const ACCENT = 'var(--color-protocol-soap)';

function prettifyXml(xml: string): string {
  const INDENT = '  ';
  let depth = 0;
  let result = '';
  const tokens = xml.replace(/>\s*</g, '><').split(/(?<=>)(?=<)/);
  for (const token of tokens) {
    const isClosing = /^<\//.test(token);
    const isSelfClosing = /\/>$/.test(token) || /^<!/.test(token) || /^<\?/.test(token);
    if (isClosing) depth = Math.max(0, depth - 1);
    result += INDENT.repeat(depth) + token.trim() + '\n';
    if (!isClosing && !isSelfClosing && /^<[^/!?]/.test(token)) depth++;
  }
  return result.trimEnd();
}

const DEFAULT_ENVELOPE_11 = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header/>
  <soap:Body>
    <!-- Your request elements here -->
  </soap:Body>
</soap:Envelope>`;

export function SoapRequestConfig() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);
  const updateTab = useTabsStore(s => s.updateTab);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const storedSubTab = useUiStateStore(s => s.prefs[`soap.subtab.${activeTabId}`]);
  const [activeSubTab, setActiveSubTabLocal] = useState(storedSubTab || 'envelope');
  const [showFuzzer, setShowFuzzer] = useState(false);
  const [showWsdlExplainer, setShowWsdlExplainer] = useState(false);
  const [aiHeaderLoading, setAiHeaderLoading] = useState(false);
  const bodyGenRef = useRef<AiBodyGenerateHandle>(null);
  const aiHeaderSuggestRef = useRef<AiHeaderSuggestHandle>(null);

  useEffect(() => {
    const pref = useUiStateStore.getState().getPref(`soap.subtab.${activeTabId}`, 'envelope');
    setActiveSubTabLocal(pref!);
  }, [activeTabId]);

  const setActiveSubTab = (tab: string) => {
    setActiveSubTabLocal(tab);
    useUiStateStore.getState().setPref(`soap.subtab.${activeTabId}`, tab);
  };

  if (!activeTab) return null;

  const tabItems: TabItem[] = [
    { id: 'envelope', label: 'Envelope' },
    { id: 'form', label: 'Form' },
    {
      id: 'headers',
      label: 'Headers',
      badge: (activeTab.headers || []).filter(h => h.enabled && h.key).length || undefined,
      badgeColor: ACCENT,
    },
    { id: 'wssecurity', label: 'WS-Security', dot: !!activeTab.soapWsSecurity, dotColor: ACCENT },
    { id: 'auth', label: 'Authorization', dot: activeTab.authType !== 'none', dotColor: ACCENT },
    {
      id: 'assertions',
      label: 'Assertions',
      badge: (activeTab.soapAssertions || []).length || undefined,
      badgeColor: ACCENT,
    },
    {
      id: 'attachments',
      label: 'Attachments',
      badge: (activeTab.soapAttachments || []).filter(a => a.enabled).length || undefined,
      badgeColor: ACCENT,
    },
    {
      id: 'scripts',
      label: 'Scripts',
      dot: !!(activeTab.preRequestScript?.trim()) || !!(activeTab.postResponseScript?.trim()),
      dotColor: ACCENT,
    },
    { id: 'wsdl', label: 'WSDL' },
  ];

  const handleHeadersChange = (rows: KeyValueRow[]) => {
    updateTab(activeTab.id, { headers: rows, dirty: true });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[var(--color-surface)]">
      {/* Sub-tabs — same padding/size as REST/GQL request panel tabs */}
      <div className="flex items-center px-3 pt-2.5 pb-0 border-b border-[var(--color-surface-border)]">
        <div className="flex-1">
          <TabView
            tabs={tabItems}
            activeTab={activeSubTab}
            onChange={setActiveSubTab}
            variant="underline"
            accentColor={ACCENT}
            size="md"
          />
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 min-h-0 ${activeSubTab === 'envelope' ? 'flex flex-col' : 'overflow-y-auto [scrollbar-gutter:stable]'}`}>
        {activeSubTab === 'envelope' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Envelope toolbar — always visible */}
            <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--color-surface-border)] flex-shrink-0 bg-[var(--color-surface)]">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">SOAP Envelope (XML)</span>
              <div className="flex items-center gap-1">
                <IconButtonView
                  icon={<WandIcon size={12} />}
                  size="sm"
                  title="Prettify XML"
                  onClick={() => {
                    const raw = activeTab.soapEnvelope || DEFAULT_ENVELOPE_11;
                    try {
                      const formatted = prettifyXml(raw);
                      updateTab(activeTab.id, { soapEnvelope: formatted, dirty: true });
                    } catch { /* malformed XML */ }
                  }}
                />
                {aiEnabled('bodyGenerator') && (
                  <ButtonView
                    size="xs"
                    variant="ghost"
                    iconLeft={<SparkleIcon size={10} />}
                    title="AI Envelope Generator"
                    onClick={() => bodyGenRef.current?.open()}
                    style={{ color: 'var(--color-protocol-ai)' }}
                  >
                    Generate ✦
                  </ButtonView>
                )}
                {aiEnabled('requestFuzzer') && (
                  <ButtonView
                    size="xs"
                    variant="ghost"
                    iconLeft={<SparkleIcon size={10} />}
                    title="AI XML Fuzzer"
                    onClick={() => setShowFuzzer(true)}
                    style={{ color: 'var(--color-protocol-ai)' }}
                  >
                    Fuzz ✦
                  </ButtonView>
                )}
              </div>
            </div>
            {aiEnabled('bodyGenerator') && (
              <AiBodyGenerate
                ref={bodyGenRef}
                tabId={activeTab.id}
                method="SOAP"
                url={activeTab.url || ''}
                contentType="text/xml"
                onApply={(body) => updateTab(activeTab.id, { soapEnvelope: body, dirty: true })}
              />
            )}
            <div className="flex-1 min-h-0">
              <EditorView
                value={activeTab.soapEnvelope || DEFAULT_ENVELOPE_11}
                onChange={(val) => updateTab(activeTab.id, { soapEnvelope: val, dirty: true })}
                language="xml"
                height="100%"
              />
            </div>
          </div>
        )}

        {activeSubTab === 'form' && (
          <SoapFormEditor onGenerated={() => setActiveSubTab('envelope')} />
        )}

        {activeSubTab === 'headers' && (
          <div className="h-full flex flex-col overflow-hidden">
            <KeyValueTableView
              rows={activeTab.headers || []}
              onChange={handleHeadersChange}
              placeholder={{ key: 'header-name', value: 'header-value' }}
              autocompleteKeys
              maskSensitive
              label="Headers"
              accentColor={ACCENT}
              toolbarExtra={
                aiEnabled('headerAutocomplete') ? (
                  <IconButtonView
                    icon={<SparkleIcon size={13} />}
                    size="md"
                    title="Suggest headers"
                    accentColor="var(--color-protocol-ai)"
                    disabled={aiHeaderLoading}
                    onClick={() => {
                      setAiHeaderLoading(true);
                      aiHeaderSuggestRef.current?.trigger();
                      setTimeout(() => setAiHeaderLoading(false), 300);
                    }}
                  />
                ) : undefined
              }
            />
            {aiEnabled('headerAutocomplete') && (
              <AiHeaderSuggest
                ref={aiHeaderSuggestRef}
                tabId={activeTab.id}
                method="SOAP"
                url={activeTab.url || ''}
                bodyContentType="text/xml"
                authType={activeTab.authType}
                existingHeaders={activeTab.headers || []}
                onAddHeader={(key, value) => {
                  const rows = [...(activeTab.headers || [])];
                  const empty = rows.findIndex(r => !r.key);
                  if (empty >= 0) {
                    rows[empty] = { ...rows[empty], key, value, enabled: true };
                  } else {
                    rows.push({ id: crypto.randomUUID(), key, value, description: '', enabled: true });
                  }
                  updateTab(activeTab.id, { headers: rows, dirty: true });
                }}
              />
            )}
          </div>
        )}

        {activeSubTab === 'wssecurity' && (
          <SoapHeadersEditor />
        )}

        {activeSubTab === 'auth' && (
          <div className="p-3">
            <AuthEditor
              authType={activeTab.authType}
              authData={activeTab.authData}
              onAuthTypeChange={(t) => updateTab(activeTab.id, { authType: t as import('../../store/tabs-store').AuthType, dirty: true })}
              onAuthDataChange={(d) => updateTab(activeTab.id, { authData: d as Record<string, string>, dirty: true })}
              accentColor={ACCENT}
            />
          </div>
        )}

        {activeSubTab === 'assertions' && (
          <SoapAssertions />
        )}

        {activeSubTab === 'attachments' && (
          <SoapAttachments />
        )}

        {activeSubTab === 'scripts' && (
          <div className="flex-1 min-h-0 flex flex-col px-3 pt-2">
            <ScriptsEditor
              preRequestScript={activeTab.preRequestScript}
              postResponseScript={activeTab.postResponseScript}
              onPreRequestScriptChange={(v) => updateTab(activeTab.id, { preRequestScript: v, dirty: true })}
              onPostResponseScriptChange={(v) => updateTab(activeTab.id, { postResponseScript: v, dirty: true })}
              accentColor={ACCENT}
            />
          </div>
        )}

        {activeSubTab === 'wsdl' && (
          <div className="h-full flex flex-col min-h-0">
            {aiEnabled('soapWsdlExplainer') && (activeTab.soapServices?.length || activeTab.soapService) && (
              <div className="flex items-center justify-end px-3 py-1 border-b border-[var(--color-surface-border)] flex-shrink-0 bg-[var(--color-surface)]">
                <ButtonView
                  size="xs"
                  variant="ghost"
                  iconLeft={<SparkleIcon size={10} />}
                  title="AI WSDL Explainer — plain-English explanation of all operations"
                  onClick={() => setShowWsdlExplainer(true)}
                  style={{ color: 'var(--color-protocol-ai)' }}
                >
                  WSDL Explainer ✦
                </ButtonView>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
              <SoapWsdlBrowser />
            </div>
          </div>
        )}
      </div>

      {showFuzzer && <AiRequestFuzzerModal onClose={() => setShowFuzzer(false)} />}
      {showWsdlExplainer && <AiSoapWsdlExplainerModal onClose={() => setShowWsdlExplainer(false)} />}
    </div>
  );
}
