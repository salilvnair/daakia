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

  // Init from extension host or seed defaults
  setProviders: (providers: AiProviderConfig[]) => void;
  seedDefaults: () => void;

  // Provider CRUD
  addProvider: (provider: AiProviderConfig) => void;
  updateProvider: (id: string, patch: Partial<Omit<AiProviderConfig, 'models'>>) => void;
  removeProvider: (id: string) => void;
  toggleProvider: (id: string) => void;

  // Model CRUD
  addModel: (providerId: string, model: AiModelConfig) => void;
  updateModel: (providerId: string, modelId: string, patch: Partial<AiModelConfig>) => void;
  removeModel: (providerId: string, modelId: string) => void;
  toggleModel: (providerId: string, modelId: string) => void;

  // Derived
  getEnabledProviders: () => AiProviderConfig[];
  getEnabledModels: (providerId: string) => AiModelConfig[];
}

function persist(providers: AiProviderConfig[]) {
  postMsg({ type: 'aiProviders:save', providers });
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

  setProviders: (providers) => set({ providers, loaded: true }),

  seedDefaults: () => {
    const defaults = buildDefaults();
    set({ providers: defaults, loaded: true });
    persist(defaults);
  },

  addProvider: (provider) => {
    const next = [...get().providers, provider];
    set({ providers: next });
    persist(next);
  },

  updateProvider: (id, patch) => {
    const next = get().providers.map(p =>
      p.id === id ? { ...p, ...patch } : p
    );
    set({ providers: next });
    persist(next);
  },

  removeProvider: (id) => {
    const next = get().providers.filter(p => p.id !== id);
    set({ providers: next });
    persist(next);
  },

  toggleProvider: (id) => {
    const next = get().providers.map(p =>
      p.id === id ? { ...p, enabled: !p.enabled } : p
    );
    set({ providers: next });
    persist(next);
  },

  addModel: (providerId, model) => {
    const next = get().providers.map(p =>
      p.id === providerId ? { ...p, models: [...p.models, model] } : p
    );
    set({ providers: next });
    persist(next);
  },

  updateModel: (providerId, modelId, patch) => {
    const next = get().providers.map(p =>
      p.id === providerId
        ? { ...p, models: p.models.map(m => m.id === modelId ? { ...m, ...patch } : m) }
        : p
    );
    set({ providers: next });
    persist(next);
  },

  removeModel: (providerId, modelId) => {
    const next = get().providers.map(p =>
      p.id === providerId
        ? { ...p, models: p.models.filter(m => m.id !== modelId) }
        : p
    );
    set({ providers: next });
    persist(next);
  },

  toggleModel: (providerId, modelId) => {
    const next = get().providers.map(p =>
      p.id === providerId
        ? { ...p, models: p.models.map(m => m.id === modelId ? { ...m, enabled: !m.enabled } : m) }
        : p
    );
    set({ providers: next });
    persist(next);
  },

  getEnabledProviders: () => get().providers.filter(p => p.enabled),
  getEnabledModels: (providerId) => {
    const p = get().providers.find(pr => pr.id === providerId);
    return p ? p.models.filter(m => m.enabled) : [];
  },
}));
