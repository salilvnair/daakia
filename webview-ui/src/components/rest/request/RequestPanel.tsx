import { useState, useEffect, useCallback } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useScrollRestore } from '../../../hooks/useScrollRestore';
import { useToastStore } from '../../../store/toast-store';
import { KeyValueTable, AuthEditor, ScriptsEditor } from '../../shared';
import { TabView, type TabItem, KeyValueTableView, type KeyValueTableRow } from '../../../dui';
import { postMsg } from '../../../vscode';
import { computeAuthRows } from './requestUtils';
import { HeadersTab } from './HeadersTab';
import { BodyEditor } from './BodyEditor';
import { RequestAiToolbar } from './RequestAiToolbar';

const CONFIG_TABS: TabItem[] = [
  { id: 'params', label: 'Params' },
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Auth' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'variables', label: 'Variables' },
];

export function RequestPanel() {
  const { tabs, activeTabId, updateTab } = useTabsStore();
  const tab = tabs.find(t => t.id === activeTabId);
  const storedSection = useUiStateStore(s => s.prefs[`rest.subtab.${activeTabId}`]);
  const [activeSection, setActiveSectionLocal] = useState(storedSection || 'params');
  const [oauth2Loading, setOauth2Loading] = useState(false);
  const [cookieJarRows, setCookieJarRows] = useState<{ key: string; value: string }[]>([]);
  const [showFuzzer, setShowFuzzer] = useState(false);

  // Sync tab preference when active tab changes
  useEffect(() => {
    const pref = useUiStateStore.getState().getPref(`rest.subtab.${activeTabId}`, 'params');
    setActiveSectionLocal(pref!);
  }, [activeTabId]);

  const setActiveSection = (section: string) => {
    setActiveSectionLocal(section);
    useUiStateStore.getState().setPref(`rest.subtab.${activeTabId}`, section);
  };

  const scrollRef = useScrollRestore(`requestConfig.${activeTabId}.${activeSection}`, [activeTabId, activeSection]);

  // Fetch cookies for the current URL domain when on the headers tab
  useEffect(() => {
    if (activeSection !== 'headers') return;
    const rawUrl = tab?.url?.trim();
    if (!rawUrl) { setCookieJarRows([]); return; }
    try {
      const u = new URL(rawUrl.match(/^https?:\/\//) ? rawUrl : 'http://' + rawUrl);
      postMsg({ type: 'getCookiesForDomain', domain: u.hostname });
    } catch { setCookieJarRows([]); }
  }, [activeSection, tab?.url, activeTabId]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'cookiesForDomain') {
        const cookies = (msg.cookies as { name: string; value: string }[]) || [];
        setCookieJarRows(
          cookies.length > 0
            ? [{ key: 'Cookie', value: cookies.map(c => `${c.name}=${c.value}`).join('; ') }]
            : [],
        );
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

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

  const authHeaderCount = computeAuthRows(tab.authType, tab.authData).length;
  const hiddenHeadersCount = authHeaderCount + cookieJarRows.length;

  const tabsWithBadges = CONFIG_TABS.map(t => {
    switch (t.id) {
      case 'params':    return { ...t, badge: tab.params.filter(p => p.enabled && p.key).length };
      case 'headers':   return { ...t, badge: tab.headers.filter(h => h.enabled && h.key).length + hiddenHeadersCount };
      case 'variables': return { ...t, badge: tab.variables?.filter((v: any) => v.enabled && v.key).length || 0 };
      case 'body':      return { ...t, dot: !!(tab.bodyRaw?.trim()) || !!(tab.bodyFormData?.some((f: any) => f.key)) };
      case 'auth':      return { ...t, dot: tab.authType !== 'none' };
      case 'scripts':   return { ...t, dot: !!(tab.preRequestScript?.trim()) || !!(tab.postResponseScript?.trim()) };
      default:          return t;
    }
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--color-surface)]">
      <div className="flex items-center px-3 pt-2.5 pb-0 border-b border-[var(--color-surface-border)]">
        <div className="flex-1">
          <TabView
            tabs={tabsWithBadges}
            activeTab={activeSection}
            onChange={setActiveSection}
            size="md"
            variant="underline"
          />
        </div>
        <RequestAiToolbar tab={tab} activeSection={activeSection} onOpenFuzzer={() => setShowFuzzer(true)} />
      </div>

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
          <HeadersTab tab={tab} cookieJarRows={cookieJarRows} />
        )}

        {activeSection === 'body' && (
          <BodyEditor tab={tab} showFuzzer={showFuzzer} onCloseFuzzer={() => setShowFuzzer(false)} />
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
          <KeyValueTableView
            rows={tab.variables as KeyValueTableRow[]}
            onChange={(rows) => updateTab(tab.id, { variables: rows as typeof tab.variables })}
            placeholder={{ key: 'Variable', value: 'Value' }}
            showDescription
            label="Request Variables"
          />
        )}
      </div>
    </div>
  );
}
