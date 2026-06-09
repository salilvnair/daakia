/**
 * AI Features Store — per-feature enable/disable toggles for all AI-powered actions.
 * Persisted to extension host SQLite via postMessage.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

export interface AiFeatureFlags {
  // Core AI
  masterAgent: boolean;
  errorDiagnosis: boolean;
  responseExplainer: boolean;
  followUps: boolean;
  // Response actions
  assertGeneration: boolean;
  typescriptTypes: boolean;
  semanticValidator: boolean;
  responseTransformer: boolean;
  patternLearning: boolean;
  // Request helpers
  headerAutocomplete: boolean;
  bodyGenerator: boolean;
  requestNamer: boolean;
  // Script/dev helpers
  scriptAutocomplete: boolean;
  inlineAssist: boolean;
  // Mock AI
  mockAiGenerate: boolean;
}

export const AI_FEATURE_DEFAULTS: AiFeatureFlags = {
  masterAgent: true,
  errorDiagnosis: true,
  responseExplainer: true,
  followUps: true,
  assertGeneration: true,
  typescriptTypes: true,
  semanticValidator: true,
  responseTransformer: true,
  patternLearning: true,
  headerAutocomplete: true,
  bodyGenerator: true,
  requestNamer: true,
  scriptAutocomplete: true,
  inlineAssist: true,
  mockAiGenerate: true,
};

export const AI_FEATURE_LABELS: Record<keyof AiFeatureFlags, { label: string; description: string; group: string }> = {
  masterAgent:        { label: 'Master Agent (Auto-Route)',  description: 'Auto-classify user messages and route to the right AI agent', group: 'Core AI' },
  errorDiagnosis:     { label: 'Error Diagnosis',           description: 'Show "Ask AI why" button when requests return 4xx/5xx errors', group: 'Core AI' },
  responseExplainer:  { label: 'Response Explainer',        description: '"Explain this response" action in the response toolbar', group: 'Core AI' },
  followUps:          { label: 'Follow-up Suggestions',     description: '"Follow-ups" button — AI suggests next requests to try', group: 'Core AI' },
  assertGeneration:   { label: '✦ Assert Generation',       description: 'Natural language → dk.test() assertions from response', group: 'Response Actions' },
  typescriptTypes:    { label: '✦ TypeScript Types',        description: 'Generate TypeScript interfaces from JSON response body', group: 'Response Actions' },
  semanticValidator:  { label: '✦ Semantic Validator',      description: 'AI detects semantically wrong data (e.g. age: -5, malformed email)', group: 'Response Actions' },
  responseTransformer:{ label: '✦ Response Transformer',    description: 'Transform response: JSON→CSV, extract fields, reshape arrays', group: 'Response Actions' },
  patternLearning:    { label: '✦ Pattern Learning',        description: 'Record response patterns and flag anomalies in future responses', group: 'Response Actions' },
  headerAutocomplete: { label: 'Header Autocomplete',       description: 'Suggest HTTP headers based on body type and auth context', group: 'Request Helpers' },
  bodyGenerator:      { label: 'Body Generator',            description: 'Generate request body from natural language description', group: 'Request Helpers' },
  requestNamer:       { label: 'Request Auto-Namer',        description: 'Suggest meaningful names when saving requests to collections', group: 'Request Helpers' },
  scriptAutocomplete: { label: 'Script Autocomplete',       description: 'AI-assisted autocomplete in pre/post-request script editors', group: 'Script & Dev' },
  inlineAssist:       { label: 'Inline AI Assist',          description: 'Context-aware AI suggestions throughout the UI', group: 'Script & Dev' },
  mockAiGenerate:     { label: 'Mock AI Generation',        description: 'AI-powered mock route/schema generation in the Mock Server', group: 'Script & Dev' },
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

  setFeatures: (features) => set({ features: { ...AI_FEATURE_DEFAULTS, ...features }, loaded: true }),

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
