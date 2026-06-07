/**
 * AI Providers Store — manages configurable AI providers and models.
 * Persisted to extension host SQLite via postMessage.
 */
import { create } from 'zustand';
import { AI_PROVIDERS } from '../components/ai/ai-providers';
import { postMsg } from '../vscode';

export interface AiModelConfig {
  id: string;
  name: string;
  enabled: boolean;
}

export interface AiProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  models: AiModelConfig[];
}

interface AiProvidersStoreState {
  providers: AiProviderConfig[];
  loaded: boolean;
  /** ID of the provider used by default for all AI requests and new AI tabs */
  defaultProviderId: string;
  /** Model ID used by default when opening a new AI tab with the default provider */
  defaultModelId: string;

  // Init from extension host or seed defaults
  setProviders: (providers: AiProviderConfig[], defaultProviderId?: string, defaultModelId?: string) => void;
  seedDefaults: () => void;

  // Provider CRUD
  addProvider: (provider: AiProviderConfig) => void;
  updateProvider: (id: string, patch: Partial<Omit<AiProviderConfig, 'models'>>) => void;
  removeProvider: (id: string) => void;
  toggleProvider: (id: string) => void;

  // Default selection — drives AI tab init and all agentic LLM calls
  setDefaultProvider: (providerId: string, modelId: string) => void;

  // Model CRUD
  addModel: (providerId: string, model: AiModelConfig) => void;
  updateModel: (providerId: string, modelId: string, patch: Partial<AiModelConfig>) => void;
  removeModel: (providerId: string, modelId: string) => void;
  toggleModel: (providerId: string, modelId: string) => void;

  // Derived
  getEnabledProviders: () => AiProviderConfig[];
  getEnabledModels: (providerId: string) => AiModelConfig[];
}

function persist(providers: AiProviderConfig[], defaultProviderId: string, defaultModelId: string) {
  postMsg({ type: 'aiProviders:save', providers, defaultProviderId, defaultModelId });
}

function buildDefaults(): AiProviderConfig[] {
  return AI_PROVIDERS.map(p => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    enabled: true,
    models: p.models.map(m => ({
      id: m.id,
      name: m.name,
      enabled: true,
    })),
  }));
}

export const useAiProvidersStore = create<AiProvidersStoreState>((set, get) => ({
  providers: [],
  loaded: false,
  defaultProviderId: 'copilot',
  defaultModelId: 'auto',

  setProviders: (providers, defaultProviderId = 'copilot', defaultModelId = 'auto') =>
    set({ providers, loaded: true, defaultProviderId, defaultModelId }),

  seedDefaults: () => {
    const defaults = buildDefaults();
    set({ providers: defaults, loaded: true, defaultProviderId: 'copilot', defaultModelId: 'auto' });
    persist(defaults, 'copilot', 'auto');
  },

  setDefaultProvider: (providerId, modelId) => {
    set({ defaultProviderId: providerId, defaultModelId: modelId });
    const { providers } = get();
    persist(providers, providerId, modelId);
  },

  addProvider: (provider) => {
    const next = [...get().providers, provider];
    set({ providers: next });
    const { defaultProviderId, defaultModelId } = get();
    persist(next, defaultProviderId, defaultModelId);
  },

  updateProvider: (id, patch) => {
    const next = get().providers.map(p => p.id === id ? { ...p, ...patch } : p);
    set({ providers: next });
    const { defaultProviderId, defaultModelId } = get();
    persist(next, defaultProviderId, defaultModelId);
  },

  removeProvider: (id) => {
    const next = get().providers.filter(p => p.id !== id);
    set({ providers: next });
    const { defaultProviderId, defaultModelId } = get();
    persist(next, defaultProviderId, defaultModelId);
  },

  toggleProvider: (id) => {
    const next = get().providers.map(p =>
      p.id === id ? { ...p, enabled: !p.enabled } : p
    );
    set({ providers: next });
    const { defaultProviderId, defaultModelId } = get();
    persist(next, defaultProviderId, defaultModelId);
  },

  addModel: (providerId, model) => {
    const next = get().providers.map(p =>
      p.id === providerId ? { ...p, models: [...p.models, model] } : p
    );
    set({ providers: next });
    const { defaultProviderId, defaultModelId } = get();
    persist(next, defaultProviderId, defaultModelId);
  },

  updateModel: (providerId, modelId, patch) => {
    const next = get().providers.map(p =>
      p.id === providerId
        ? { ...p, models: p.models.map(m => m.id === modelId ? { ...m, ...patch } : m) }
        : p
    );
    set({ providers: next });
    const { defaultProviderId, defaultModelId } = get();
    persist(next, defaultProviderId, defaultModelId);
  },

  removeModel: (providerId, modelId) => {
    const next = get().providers.map(p =>
      p.id === providerId
        ? { ...p, models: p.models.filter(m => m.id !== modelId) }
        : p
    );
    set({ providers: next });
    const { defaultProviderId, defaultModelId } = get();
    persist(next, defaultProviderId, defaultModelId);
  },

  toggleModel: (providerId, modelId) => {
    const next = get().providers.map(p =>
      p.id === providerId
        ? { ...p, models: p.models.map(m => m.id === modelId ? { ...m, enabled: !m.enabled } : m) }
        : p
    );
    set({ providers: next });
    const { defaultProviderId, defaultModelId } = get();
    persist(next, defaultProviderId, defaultModelId);
  },

  getEnabledProviders: () => get().providers.filter(p => p.enabled),
  getEnabledModels: (providerId) => {
    const p = get().providers.find(pr => pr.id === providerId);
    return p ? p.models.filter(m => m.enabled) : [];
  },
}));
