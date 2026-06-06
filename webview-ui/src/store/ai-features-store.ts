/**
 * AI Features Store — per-feature enable/disable toggles for all AI-powered actions.
 * Persisted to extension host SQLite via postMessage.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

export interface AiFeatureFlags {
  masterAgent: boolean;
  errorDiagnosis: boolean;
  responseExplainer: boolean;
  headerAutocomplete: boolean;
  bodyGenerator: boolean;
  requestNamer: boolean;
  scriptAutocomplete: boolean;
  inlineAssist: boolean;
}

export const AI_FEATURE_DEFAULTS: AiFeatureFlags = {
  masterAgent: true,
  errorDiagnosis: true,
  responseExplainer: true,
  headerAutocomplete: true,
  bodyGenerator: true,
  requestNamer: true,
  scriptAutocomplete: true,
  inlineAssist: true,
};

export const AI_FEATURE_LABELS: Record<keyof AiFeatureFlags, { label: string; description: string }> = {
  masterAgent:         { label: 'Master Agent (Auto-Route)',  description: 'Auto-classify user messages and route to the right AI agent' },
  errorDiagnosis:      { label: 'Error Diagnosis',           description: 'Show "Ask AI why" button when requests fail (4xx/5xx)' },
  responseExplainer:   { label: 'Response Explainer',        description: '"Explain this response" action on any AI response' },
  headerAutocomplete:  { label: 'Header Autocomplete',       description: 'Suggest HTTP headers based on body type and auth context' },
  bodyGenerator:       { label: 'Body Generator',            description: 'Generate request body from natural language description' },
  requestNamer:        { label: 'Request Auto-Namer',        description: 'Suggest meaningful names when saving requests' },
  scriptAutocomplete:  { label: 'Script Autocomplete',       description: 'AI-assisted autocomplete in script/test editors' },
  inlineAssist:        { label: 'Inline AI Assist',          description: 'Context-aware AI suggestions throughout the UI' },
};

interface AiFeaturesState {
  features: AiFeatureFlags;
  loaded: boolean;

  setFeatures: (features: AiFeatureFlags) => void;
  toggleFeature: (key: keyof AiFeatureFlags) => void;
  loadFeatures: () => void;
  isEnabled: (key: keyof AiFeatureFlags) => boolean;
}

function persist(features: AiFeatureFlags) {
  postMsg({ type: 'aiFeatures:save', features });
}

export const useAiFeaturesStore = create<AiFeaturesState>((set, get) => ({
  features: AI_FEATURE_DEFAULTS,
  loaded: false,

  setFeatures: (features) => set({ features, loaded: true }),

  toggleFeature: (key) => {
    const next = { ...get().features, [key]: !get().features[key] };
    set({ features: next });
    persist(next);
  },

  loadFeatures: () => {
    postMsg({ type: 'aiFeatures:load' });
  },

  isEnabled: (key) => get().features[key] ?? true,
}));
