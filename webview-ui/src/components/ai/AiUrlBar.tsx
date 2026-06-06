import { useCallback, useEffect, useMemo } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { StyledDropdown, SplitButton, type DropdownOption, type SplitButtonItem } from '../shared';
import { ProtocolAiBadge, SendIcon, SaveIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { saveRequest } from '../../services/request';

const saveItems: SplitButtonItem[] = [
  { id: 'save-as', label: 'Save as', icon: <SaveIcon size={12} />, iconColor: 'var(--color-ctx-close-saved)', onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }) },
];

/**
 * AiUrlBar — Provider selector + Model selector + URL input + Send + Save.
 */
export function AiUrlBar() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const providers = useAiProvidersStore(s => s.providers);

  const provider = activeTab?.aiProvider || 'openai';
  const model = activeTab?.aiModel || '';
  const url = activeTab?.url || '';
  const loading = activeTab?.aiStreaming || activeTab?.loading || false;

  // Auto-initialize defaults for fresh AI tabs
  useEffect(() => {
    if (!activeTab) return;
    if (!activeTab.aiProvider) {
      const first = providers.find(p => p.enabled) || providers[0];
      if (first) {
        const firstModel = first.models.find(m => m.enabled) || first.models[0];
        updateTab(activeTab.id, {
          aiProvider: first.id,
          aiModel: firstModel?.id || '',
          url: first.baseUrl || '',
        });
      }
    }
  }, [activeTab, updateTab, providers]);

  const providerOptions: DropdownOption[] = useMemo(() =>
    providers.filter(p => p.enabled).map(p => ({ value: p.id, label: p.name })),
  [providers]);

  const providerInfo = useMemo(() => providers.find(p => p.id === provider), [providers, provider]);

  const modelOptions: DropdownOption[] = useMemo(() => {
    if (!providerInfo) return [];
    return providerInfo.models.filter(m => m.enabled).map(m => ({ value: m.id, label: m.name }));
  }, [providerInfo]);

  const handleProviderChange = useCallback((val: string) => {
    if (!activeTab) return;
    const info = providers.find(p => p.id === val);
    const enabledModels = info?.models.filter(m => m.enabled) || [];
    const defaultModel = enabledModels[0]?.id || '';
    const defaultUrl = info?.baseUrl || '';
    updateTab(activeTab.id, {
      aiProvider: val,
      aiModel: defaultModel,
      url: defaultUrl,
      dirty: true,
    });
  }, [activeTab, updateTab]);

  const handleModelChange = useCallback((val: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { aiModel: val, dirty: true });
  }, [activeTab, updateTab]);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { url: e.target.value, dirty: true });
  }, [activeTab, updateTab]);

  const handleSend = useCallback(() => {
    if (!activeTab || loading) return;
    const userPrompt = activeTab.aiUserPrompt?.trim();
    if (!userPrompt && (!activeTab.aiConversation || activeTab.aiConversation.length === 0)) return;

    postMsg({
      type: 'ai:send',
      tabId: activeTab.id,
      provider: activeTab.aiProvider || 'openai',
      model: activeTab.aiModel || '',
      baseUrl: activeTab.url || '',
      systemPrompts: activeTab.aiSystemPrompts || [],
      userPrompt: userPrompt || '',
      conversation: activeTab.aiConversation || [],
      tools: activeTab.aiTools || [],
      settings: activeTab.aiSettings || {},
      mcpServerConfigs: activeTab.mcpServerConfigs || [],
      authType: activeTab.authType,
      authData: activeTab.authData,
      envId: activeTab.envId,
    });

    // Add user message to conversation and clear prompt
    if (userPrompt) {
      const userMsg = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: userPrompt,
        timestamp: Date.now(),
      };
      updateTab(activeTab.id, {
        aiConversation: [...(activeTab.aiConversation || []), userMsg],
        aiStreaming: true,
        loading: true,
      });
    } else {
      updateTab(activeTab.id, { aiStreaming: true, loading: true });
    }
  }, [activeTab, updateTab, loading]);

  if (!activeTab) return null;

  return (
    <div className="url-bar">
      {/* Protocol badge */}
      <ProtocolAiBadge size={28} />

      {/* Provider selector — auto width based on content */}
      <div className="shrink-0">
        <StyledDropdown
          options={providerOptions}
          value={provider}
          onChange={handleProviderChange}
          accentColor="var(--color-protocol-ai)"
        />
      </div>

      {/* Model selector — auto width based on content */}
      <div className="shrink-0">
        {modelOptions.length > 0 ? (
          <StyledDropdown
            options={modelOptions}
            value={model}
            onChange={handleModelChange}
            accentColor="var(--color-protocol-ai)"
          />
        ) : (
          <input
            type="text"
            value={model}
            onChange={(e) => activeTab && updateTab(activeTab.id, { aiModel: e.target.value, dirty: true })}
            placeholder="Model name"
            className="url-bar-input w-[140px]"
          />
        )}
      </div>

      {/* URL input — flex-1 takes remaining space */}
      <input
        type="text"
        value={url}
        onChange={handleUrlChange}
        placeholder="API base URL"
        className="url-bar-input ml-1"
      />

      {/* Send button */}
      <button
        type="button"
        onClick={handleSend}
        disabled={loading}
        className="url-bar-send"
        style={{ backgroundColor: 'var(--color-protocol-ai)', paddingLeft: '16px', paddingRight: '16px' }}
      >
        <SendIcon size={13} />
        <span>{loading ? 'Sending...' : 'Send'}</span>
      </button>

      {/* Save SplitButton */}
      <SplitButton
        label="Save"
        variant="secondary"
        onClick={() => {
          if (!activeTab) return;
          const saved = saveRequest(activeTab);
          if (saved) updateTab(activeTab.id, { dirty: false });
        }}
        icon={<SaveIcon size={13} />}
        items={saveItems}
      />
    </div>
  );
}
