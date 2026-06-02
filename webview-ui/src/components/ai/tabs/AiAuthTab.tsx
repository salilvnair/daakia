import { useCallback } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { AuthEditor } from '../../shared';

/**
 * AiAuthTab — Uses shared AuthEditor (same as REST).
 */
export function AiAuthTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const authType = activeTab?.authType || 'none';
  const authData = activeTab?.authData || {};

  const handleAuthTypeChange = useCallback((val: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { authType: val, dirty: true });
  }, [activeTab, updateTab]);

  const handleAuthDataChange = useCallback((data: Record<string, unknown>) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { authData: data, dirty: true });
  }, [activeTab, updateTab]);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col p-3">
      <AuthEditor
        authType={authType}
        authData={authData}
        onAuthTypeChange={handleAuthTypeChange}
        onAuthDataChange={handleAuthDataChange}
        accentColor="var(--color-protocol-ai)"
      />
    </div>
  );
}
