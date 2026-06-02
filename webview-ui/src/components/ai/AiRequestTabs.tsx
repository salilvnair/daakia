import { useState, useEffect } from 'react';
import { PillTabs, type PillTab } from '../shared';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { AiPromptTab } from './tabs/AiPromptTab';
import { AiAuthTab } from './tabs/AiAuthTab';
import { AiToolsTab } from './tabs/AiToolsTab';
import { AiSettingsTab } from './tabs/AiSettingsTab';
import { AiMcpTab } from './tabs/AiMcpTab';

const ACCENT = 'var(--color-protocol-ai)';

const TABS: PillTab[] = [
  { id: 'prompt', label: 'Prompt' },
  { id: 'auth', label: 'Authorization' },
  { id: 'tools', label: 'Tools' },
  { id: 'mcp', label: 'MCP' },
  { id: 'settings', label: 'Settings' },
];

/**
 * AiRequestTabs — PillTabs switching between Prompt, Authorization, Tools, MCP, Settings.
 */
export function AiRequestTabs() {
  const activeTabId = useTabsStore(s => s.activeTabId);
  const storedSubTab = useUiStateStore(s => s.prefs[`ai.subtab.${activeTabId}`]);
  const [activeTab, setActiveTabLocal] = useState(storedSubTab || 'prompt');

  useEffect(() => {
    const pref = useUiStateStore.getState().getPref(`ai.subtab.${activeTabId}`, 'prompt');
    setActiveTabLocal(pref!);
  }, [activeTabId]);

  const setActiveTab = (tab: string) => {
    setActiveTabLocal(tab);
    useUiStateStore.getState().setPref(`ai.subtab.${activeTabId}`, tab);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab header */}
      <div className="px-3 pt-2.5 pb-0 border-b border-[var(--color-surface-border)]">
        <PillTabs
          tabs={TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          size="sm"
          variant="underline"
          accentColor={ACCENT}
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'prompt' && <AiPromptTab />}
        {activeTab === 'auth' && <AiAuthTab />}
        {activeTab === 'tools' && <AiToolsTab />}
        {activeTab === 'mcp' && <AiMcpTab />}
        {activeTab === 'settings' && <AiSettingsTab />}
      </div>
    </div>
  );
}
