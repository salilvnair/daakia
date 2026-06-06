import { useState, useEffect, useMemo } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { PillTabs, KeyValueTable, CodeEditor, AuthEditor, ScriptsEditor } from '../shared';
import type { PillTab, KeyValueRow } from '../shared';
import { SoapFormEditor } from './SoapFormEditor';
import { SoapHeadersEditor } from './SoapHeadersEditor';
import { SoapAssertions } from './SoapAssertions';
import { SoapWsdlBrowser } from './SoapWsdlBrowser';
import { SoapAttachments } from './SoapAttachments';

const ACCENT = 'var(--color-protocol-soap)';

const DEFAULT_ENVELOPE_11 = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header/>
  <soap:Body>
    <!-- Your request elements here -->
  </soap:Body>
</soap:Envelope>`;

const tabs: PillTab[] = [
  { id: 'envelope', label: 'Envelope' },
  { id: 'form', label: 'Form' },
  { id: 'headers', label: 'Headers' },
  { id: 'wssecurity', label: 'WS-Security' },
  { id: 'auth', label: 'Auth' },
  { id: 'assertions', label: 'Assertions' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'wsdl', label: 'WSDL' },
];

/**
 * SoapRequestConfig — sub-tabs: Envelope (XML editor), Headers (KV table),
 * Auth (shared AuthEditor), Scripts (shared ScriptsEditor).
 */
export function SoapRequestConfig() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);
  const updateTab = useTabsStore(s => s.updateTab);
  const storedSubTab = useUiStateStore(s => s.prefs[`soap.subtab.${activeTabId}`]);
  const [activeSubTab, setActiveSubTabLocal] = useState(storedSubTab || 'envelope');

  useEffect(() => {
    const pref = useUiStateStore.getState().getPref(`soap.subtab.${activeTabId}`, 'envelope');
    setActiveSubTabLocal(pref!);
  }, [activeTabId]);

  const setActiveSubTab = (tab: string) => {
    setActiveSubTabLocal(tab);
    useUiStateStore.getState().setPref(`soap.subtab.${activeTabId}`, tab);
  };

  if (!activeTab) return null;

  // Add dot/badge indicators
  const tabsWithBadges = useMemo(() => tabs.map(t => {
    switch (t.id) {
      case 'headers': return { ...t, badge: (activeTab.headers || []).filter(h => h.enabled && h.key).length };
      case 'wssecurity': return { ...t, dot: !!activeTab.soapWsSecurity };
      case 'auth': return { ...t, dot: activeTab.authType !== 'none' };
      case 'assertions': return { ...t, badge: (activeTab.soapAssertions || []).length };
      case 'attachments': return { ...t, badge: (activeTab.soapAttachments || []).filter(a => a.enabled).length };
      case 'scripts': return { ...t, dot: !!(activeTab.preRequestScript?.trim()) || !!(activeTab.postResponseScript?.trim()) };
      default: return t;
    }
  }), [activeTab]);

  const handleHeadersChange = (rows: KeyValueRow[]) => {
    updateTab(activeTab.id, { headers: rows, dirty: true });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[var(--color-surface)]">
      {/* Sub-tabs */}
      <div className="px-3 pt-2.5 pb-0 border-b border-[var(--color-surface-border)]">
        <PillTabs
          tabs={tabsWithBadges}
          activeTab={activeSubTab}
          onChange={setActiveSubTab}
          size="sm"
          variant="underline"
          accentColor={ACCENT}
        />
      </div>

      {/* Content */}
      <div className={`flex-1 min-h-0 ${activeSubTab === 'envelope' ? '' : 'overflow-y-auto [scrollbar-gutter:stable]'}`}>
        {activeSubTab === 'envelope' && (
          <div className="h-full">
            <CodeEditor
              value={activeTab.soapEnvelope || DEFAULT_ENVELOPE_11}
              onChange={(val) => updateTab(activeTab.id, { soapEnvelope: val, dirty: true })}
              language="xml"
              height="100%"
            />
          </div>
        )}

        {activeSubTab === 'form' && (
          <SoapFormEditor onGenerated={() => setActiveSubTab('envelope')} />
        )}

        {activeSubTab === 'headers' && (
          <div className="p-3">
            <KeyValueTable
              rows={activeTab.headers || [{ id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true }]}
              onChange={handleHeadersChange}
              showDescription={false}
              placeholder={{ key: 'header-name', value: 'header-value' }}
              accentColor={ACCENT}
            />
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
              onAuthTypeChange={(t) => updateTab(activeTab.id, { authType: t, dirty: true })}
              onAuthDataChange={(d) => updateTab(activeTab.id, { authData: d, dirty: true })}
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
          <div className="h-full flex flex-col">
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
          <SoapWsdlBrowser />
        )}
      </div>
    </div>
  );
}
