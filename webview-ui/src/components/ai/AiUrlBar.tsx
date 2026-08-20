import { useCallback, useEffect, useMemo } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useDevToolsStore } from '../../store/devtools-store';
import { ProtocolAiBadge, SendIcon, SaveIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { saveRequest } from '../../services/request';
import {
  SelectInputView,
  TextInputView,
  HighlightedInputView,
  ButtonView,
  DropDownButtonView,
  type ContextMenuItem,
} from '@salilvnair/dui';
import { useUrlSuggestionsStore } from '../../store/url-suggestions-store';
import { useMockSuggestions } from '../../hooks/useMockSuggestions';

const ACCENT = 'var(--color-protocol-ai)';

const saveItems: ContextMenuItem[] = [
  {
    id: 'save-as',
    label: 'Save as',
    icon: <SaveIcon size={12} />,
    iconColor: 'var(--color-ctx-close-saved)',
    onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }),
  },
];

/**
 * AiUrlBar — Provider selector + Model selector + URL input + Send + Save.
 */
export function AiUrlBar() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const providers = useAiProvidersStore(s => s.providers);
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);

  const provider = activeTab?.aiProvider || defaultProviderId;
  const model = activeTab?.aiModel || (activeTab?.aiProvider ? '' : defaultModelId);
  const url = activeTab?.url || '';
  const loading = activeTab?.aiStreaming || activeTab?.loading || false;
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.ai);
  const mockSuggestions = useMockSuggestions('ai');

  // Sync provider/model from store defaults.
  // Only skips update when the user has manually chosen a provider via the dropdown
  // (aiProviderManual=true). Auto-initialized tabs always follow the stored default.
  useEffect(() => {
    if (!activeTab) return;
    if (activeTab.aiProviderManual) return;

    const defProvider = providers.find(p => p.id === defaultProviderId && p.enabled)
      ?? providers.find(p => p.enabled)
      ?? providers[0];
    if (defProvider) {
      const defModel = defProvider.id === defaultProviderId
        ? (defaultModelId || defProvider.models.find(m => m.enabled)?.id || '')
        : (defProvider.models.find(m => m.enabled)?.id || '');
      const expectedUrl = defProvider.baseUrl || '';
      if (
        activeTab.aiProvider !== defProvider.id ||
        activeTab.aiModel !== defModel ||
        activeTab.url !== expectedUrl
      ) {
        updateTab(activeTab.id, {
          aiProvider: defProvider.id,
          aiModel: defModel,
          url: expectedUrl,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, activeTab?.aiProviderManual, providers, defaultProviderId, defaultModelId]);

  const providerOptions = useMemo(() =>
    providers.filter(p => p.enabled).map(p => ({ value: p.id, label: p.name })),
  [providers]);

  const providerInfo = useMemo(() => providers.find(p => p.id === provider), [providers, provider]);

  // Copilot needs no base URL, so its toolbar renders no URL input — see the layout
  // note on the model field for why that matters to the row's sizing.
  const hasUrlField = provider !== 'copilot';

  const modelOptions = useMemo(() => {
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
      aiProviderManual: true,
      aiModel: defaultModel,
      url: defaultUrl,
      dirty: true,
    });
  }, [activeTab, providers, updateTab]);

  const handleModelChange = useCallback((val: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { aiModel: val, dirty: true });
  }, [activeTab, updateTab]);

  const handleUrlChange = useCallback((val: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { url: val, dirty: true });
  }, [activeTab, updateTab]);

  const handleSend = useCallback(() => {
    if (!activeTab || loading) return;
    const userPrompt = activeTab.aiUserPrompt?.trim();
    if (!userPrompt && (!activeTab.aiConversation || activeTab.aiConversation.length === 0)) return;

    // URL suggestions
    if (url.trim()) useUrlSuggestionsStore.getState().addUrls([url.trim()], 'ai');

    const aiPayload = {
      type: 'ai:send',
      tabId: activeTab.id,
      provider: provider,
      model: model,
      baseUrl: '',
      systemPrompts: activeTab.aiSystemPrompts || [],
      userPrompt: userPrompt || '',
      conversation: activeTab.aiConversation || [],
      tools: activeTab.aiTools || [],
      settings: activeTab.aiSettings || {},
      mcpServerConfigs: activeTab.mcpServerConfigs || [],
      images: activeTab.aiImages || [],
      envId: activeTab.envId,
    };
    postMsg(aiPayload);

    const providerInfoCurrent = useAiProvidersStore.getState().providers.find(p => p.id === provider);
    const modelInfo = providerInfoCurrent?.models.find(m => m.id === model);
    useDevToolsStore.getState().addLog({
      level: 'info',
      args: [
        `📡 AI Request Sent → ${provider}/${model}`,
        {
          provider,
          providerName: providerInfoCurrent?.name || provider,
          model,
          modelName: modelInfo?.name || model,
          systemPrompts: activeTab.aiSystemPrompts || [],
          userPrompt: userPrompt || '',
          conversationLength: (activeTab.aiConversation || []).length,
          tools: (activeTab.aiTools || []).map((t: { name?: string; type?: string }) => t.name || t.type),
          mcpServers: (activeTab.mcpServerConfigs || []).length,
          settings: activeTab.aiSettings || {},
          sentAt: new Date().toISOString(),
        },
      ],
      timestamp: Date.now(),
      requestName: `AI ${provider}/${model}`,
      scriptPhase: 'ai',
    });

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
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0 bg-[var(--color-panel)] overflow-x-auto overflow-y-hidden">
      {/* Protocol badge */}
      <div className="flex-shrink-0"><ProtocolAiBadge size={28} /></div>

      {/* Provider selector */}
      <div className="flex-shrink-0">
        <SelectInputView
          options={providerOptions}
          value={provider}
          onChange={handleProviderChange}
          size="lg"
          accentColor={ACCENT}
        />
      </div>

      {/* Model selector or free-text input.
          Every other protocol's toolbar has one element that grows to fill the row (the URL
          bar). Here the URL input only renders for non-Copilot providers — so with Copilot,
          which is the DEFAULT, nothing flexed and the whole row bunched up on the left with
          dead space to its right. The model field takes over the growing role whenever the
          URL input is absent, so the toolbar spans the full width like the others. */}
      {modelOptions.length > 0 ? (
        <div className={hasUrlField ? 'flex-shrink-0' : 'flex-1 min-w-0'} style={hasUrlField ? undefined : { minWidth: 160 }}>
          <SelectInputView
            options={modelOptions}
            value={model}
            onChange={handleModelChange}
            size="lg"
            accentColor={ACCENT}
            style={hasUrlField ? undefined : { width: '100%' }}
          />
        </div>
      ) : (
        <div className={hasUrlField ? 'flex-shrink-0' : 'flex-1 min-w-0'} style={hasUrlField ? undefined : { minWidth: 160 }}>
          <TextInputView
            value={model}
            onChange={(e) => activeTab && updateTab(activeTab.id, { aiModel: e.target.value, dirty: true })}
            placeholder="Model name"
            size="lg"
            accentColor={ACCENT}
            style={hasUrlField ? { width: 140 } : { width: '100%' }}
          />
        </div>
      )}

      {/* URL input — non-copilot providers only. Shrinks down to minWidth; past that the
          bar scrolls horizontally instead of squeezing/overlapping. */}
      {hasUrlField && (
        <div className="flex-1 min-w-0" style={{ minWidth: 160 }}>
          <HighlightedInputView
            value={url}
            onChange={handleUrlChange}
            placeholder="API base URL"
            suggestions={urlSuggestions}
            mockServers={mockSuggestions}
            size="lg"
            accentColor={ACCENT}
          />
        </div>
      )}

      {/* Send button */}
      <ButtonView
        className="flex-shrink-0"
        label={loading ? 'Sending...' : 'Send'}
        variant="primary"
        size="lg"
        accentColor={ACCENT}
        iconLeft={<SendIcon size={13} />}
        disabled={loading || (hasUrlField && !url.trim())}
        onClick={handleSend}
      />

      {/* Save split button */}
      <DropDownButtonView
        className="flex-shrink-0"
        label="Save"
        icon={<SaveIcon size={13} />}
        variant="secondary"
        size="lg"
        items={saveItems}
        align="right"
        onPrimaryClick={() => {
          if (!activeTab) return;
          const saved = saveRequest(activeTab);
          if (saved) updateTab(activeTab.id, { dirty: false });
        }}
      />
    </div>
  );
}
