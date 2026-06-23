import { useState, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { TabView } from '@salilvnair/dui';
import type { TabItem } from '@salilvnair/dui';
import { McpToolsTab } from './tabs/McpToolsTab';
import { McpResourcesTab } from './tabs/McpResourcesTab';
import { McpPromptsTab } from './tabs/McpPromptsTab';
import { McpArgsTab } from './tabs/McpArgsTab';
import { McpEnvTab } from './tabs/McpEnvTab';
import { McpSettingsTab } from './tabs/McpSettingsTab';
import { McpAuthTab } from './tabs/McpAuthTab';
import { McpConfigTab } from './tabs/McpConfigTab';
import { McpCatalogTab } from './tabs/McpCatalogTab';
import { McpServersTab } from './tabs/McpServersTab';

const ACCENT = 'var(--color-protocol-mcp)';

const TABS: TabItem[] = [
  { id: 'servers', label: 'Servers' },
  { id: 'tools', label: 'Tools' },
  { id: 'resources', label: 'Resources' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'args', label: 'Args' },
  { id: 'env', label: 'Environment' },
  { id: 'auth', label: 'Auth' },
  { id: 'config', label: 'Config' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'settings', label: 'Settings' },
];

/**
 * McpRequestTabs — PillTabs switching between Tools, Resources, Prompts, Env, Settings.
 */
export function McpRequestTabs() {
  const activeTabId = useTabsStore(s => s.activeTabId);
  const storedSubTab = useUiStateStore(s => s.prefs[`mcp.subtab.${activeTabId}`]);
  const [activeTab, setActiveTabLocal] = useState(storedSubTab || 'tools');

  useEffect(() => {
    const pref = useUiStateStore.getState().getPref(`mcp.subtab.${activeTabId}`, 'tools');
    setActiveTabLocal(pref!);
  }, [activeTabId]);

  const setActiveTab = (tab: string) => {
    setActiveTabLocal(tab);
    useUiStateStore.getState().setPref(`mcp.subtab.${activeTabId}`, tab);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab header */}
      <div className="flex items-center px-3 pt-1.5 pb-0 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
        <TabView
          tabs={TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          variant="underline"
          size="sm"
          accentColor={ACCENT}
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'servers' && <McpServersTab />}
        {activeTab === 'tools' && <McpToolsTab />}
        {activeTab === 'resources' && <McpResourcesTab />}
        {activeTab === 'prompts' && <McpPromptsTab />}
        {activeTab === 'args' && <McpArgsTab />}
        {activeTab === 'env' && <McpEnvTab />}
        {activeTab === 'auth' && <McpAuthTab />}
        {activeTab === 'config' && <McpConfigTab />}
        {activeTab === 'catalog' && <McpCatalogTab />}
        {activeTab === 'settings' && <McpSettingsTab />}
      </div>
    </div>
  );
}
