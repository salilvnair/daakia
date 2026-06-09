/**
 * AI Features Store — per-feature enable/disable toggles for all AI-powered actions.
 * Persisted to the extension host's `daakia_ai_feature` SQLite table (key | enabled).
 *
 * 47 individual flags — one per distinct AI surface action.
 * Each protocol has its own Explain / Follow-ups / Schema flag so you can disable
 * e.g. "Explain on SOAP" without affecting REST or GraphQL.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import type { AiPromptTemplateKey } from './prompt-template';

export interface AiFeatureFlags {
  // ── Core AI ─────────────────────────────────────────────────────────────────
  masterAgent: boolean;
  errorDiagnosis: boolean;
  smartRetryAdvisor: boolean;
  // ── Response Explain & Follow-ups (per protocol) ─────────────────────────────
  explainRest: boolean;
  followUpsRest: boolean;
  explainGraphql: boolean;
  followUpsGraphql: boolean;
  explainSoap: boolean;
  followUpsSoap: boolean;
  explainGrpc: boolean;
  followUpsGrpc: boolean;
  // ── Response Actions ────────────────────────────────────────────────────────
  assertGeneration: boolean;
  schemaRest: boolean;
  schemaGraphql: boolean;
  schemaSoap: boolean;
  schemaGrpc: boolean;
  semanticValidator: boolean;
  responseTransformer: boolean;
  patternBaseline: boolean;
  recordBaseline: boolean;
  responseDiff: boolean;
  // ── Request Helpers ─────────────────────────────────────────────────────────
  headerAutocomplete: boolean;
  bodyGenerator: boolean;
  requestNamer: boolean;
  requestFuzzer: boolean;
  dataGenerator: boolean;
  preflightCheck: boolean;
  // ── Script & Dev ────────────────────────────────────────────────────────────
  contractTestGenerator: boolean;
  scriptAutocomplete: boolean;
  // ── Collection AI Actions (one flag per action) ──────────────────────────────
  extractVariables: boolean;
  organizeWithAi: boolean;
  buildApiFlow: boolean;
  testWithAiAgent: boolean;
  generateChangelog: boolean;
  dependencyGraph: boolean;
  checkCompliance: boolean;
  generateSdk: boolean;
  optimizeRequests: boolean;
  regressionDetector: boolean;
  importFromScreenshot: boolean;
  importFromLogs: boolean;
  describeWorkflow: boolean;
  generateScenario: boolean;
  reverseEngineer: boolean;
  // ── Mock Server AI ───────────────────────────────────────────────────────────
  mockAiGenerate: boolean;
  aiScenarioManager: boolean;
  // ── AI Chat & Panels ─────────────────────────────────────────────────────────
  daakiaAiChat: boolean;
}

export const AI_FEATURE_DEFAULTS: AiFeatureFlags = {
  // Core AI
  masterAgent: true,
  errorDiagnosis: true,
  smartRetryAdvisor: true,
  // Response Explain & Follow-ups
  explainRest: true,
  followUpsRest: true,
  explainGraphql: true,
  followUpsGraphql: true,
  explainSoap: true,
  followUpsSoap: true,
  explainGrpc: true,
  followUpsGrpc: true,
  // Response Actions
  assertGeneration: true,
  schemaRest: true,
  schemaGraphql: true,
  schemaSoap: true,
  schemaGrpc: true,
  semanticValidator: true,
  responseTransformer: true,
  patternBaseline: true,
  recordBaseline: true,
  responseDiff: true,
  // Request Helpers
  headerAutocomplete: true,
  bodyGenerator: true,
  requestNamer: true,
  requestFuzzer: true,
  dataGenerator: true,
  preflightCheck: true,
  // Script & Dev
  contractTestGenerator: true,
  scriptAutocomplete: true,
  // Collection AI Actions
  extractVariables: true,
  organizeWithAi: true,
  buildApiFlow: true,
  testWithAiAgent: true,
  generateChangelog: true,
  dependencyGraph: true,
  checkCompliance: true,
  generateSdk: true,
  optimizeRequests: true,
  regressionDetector: true,
  importFromScreenshot: true,
  importFromLogs: true,
  describeWorkflow: true,
  generateScenario: true,
  reverseEngineer: true,
  // Mock Server AI
  mockAiGenerate: true,
  aiScenarioManager: true,
  // AI Chat & Panels
  daakiaAiChat: true,
};

// ── Labels shown in Settings → AI Features ───────────────────────────────────

export const AI_FEATURE_LABELS: Record<keyof AiFeatureFlags, {
  label: string;
  description: string;
  group: string;
  gates: string;
}> = {
  // ── Core AI ─────────────────────────────────────────────────────────────────
  masterAgent: {
    label: 'Master Agent (Auto-Route)',
    description: 'Auto-classify messages and route to the right AI agent',
    group: 'Core AI',
    gates: 'Daakia AI chat routing',
  },
  errorDiagnosis: {
    label: 'Ask AI Why',
    description: '"Ask AI Why" button in status bar on 4xx/5xx responses',
    group: 'Core AI',
    gates: '"Ask AI Why ✦" button in response status bar',
  },
  smartRetryAdvisor: {
    label: 'Smart Retry Advisor',
    description: 'Inline AI banner below response suggesting retry strategies on failures',
    group: 'Core AI',
    gates: 'Smart Retry Advisor banner (appears on 4xx/5xx responses)',
  },
  // ── Response Explain & Follow-ups ────────────────────────────────────────────
  explainRest: {
    label: 'Explain Response (REST)',
    description: 'AI explains what the REST response body means in plain English',
    group: 'Response Explain & Follow-ups',
    gates: '"Explain ✦" pill in REST response toolbar',
  },
  followUpsRest: {
    label: 'Follow-up Suggestions (REST)',
    description: 'AI suggests follow-up REST requests to try next',
    group: 'Response Explain & Follow-ups',
    gates: '"Follow-ups ✦" pill in REST response toolbar',
  },
  explainGraphql: {
    label: 'Explain Response (GraphQL)',
    description: 'AI explains the GraphQL response data in plain English',
    group: 'Response Explain & Follow-ups',
    gates: '"Explain ✦" button in GraphQL response toolbar',
  },
  followUpsGraphql: {
    label: 'Follow-up Suggestions (GraphQL)',
    description: 'AI suggests follow-up GraphQL queries to try next',
    group: 'Response Explain & Follow-ups',
    gates: '"Follow-ups ✦" button in GraphQL response toolbar',
  },
  explainSoap: {
    label: 'Explain Response (SOAP)',
    description: 'AI explains the SOAP XML response in plain English',
    group: 'Response Explain & Follow-ups',
    gates: '"Explain ✦" button in SOAP response toolbar',
  },
  followUpsSoap: {
    label: 'Follow-up Suggestions (SOAP)',
    description: 'AI suggests follow-up SOAP operations',
    group: 'Response Explain & Follow-ups',
    gates: '"Follow-ups ✦" button in SOAP response toolbar',
  },
  explainGrpc: {
    label: 'Explain Response (gRPC)',
    description: 'AI explains the gRPC response protobuf in plain English',
    group: 'Response Explain & Follow-ups',
    gates: '"Explain ✦" button in gRPC response toolbar',
  },
  followUpsGrpc: {
    label: 'Follow-up Suggestions (gRPC)',
    description: 'AI suggests follow-up gRPC calls to try',
    group: 'Response Explain & Follow-ups',
    gates: '"Follow-ups ✦" button in gRPC response toolbar',
  },
  // ── Response Actions ────────────────────────────────────────────────────────
  assertGeneration: {
    label: '✦ Assert Generation',
    description: 'Natural language → dk.test() assertions from response body',
    group: 'Response Actions',
    gates: '"Assert (plain English)" in AI Actions ⋮ dropdown',
  },
  schemaRest: {
    label: '✦ Validate Schema / TypeScript (REST)',
    description: 'Generate TypeScript interfaces or validate JSON schema from REST response',
    group: 'Response Actions',
    gates: '"Validate Schema with AI" in AI Actions ⋮ dropdown',
  },
  schemaGraphql: {
    label: '✦ Schema ✦ (GraphQL)',
    description: 'AI-powered SDL / schema viewer for GraphQL responses',
    group: 'Response Actions',
    gates: '"Schema ✦" button in GraphQL response toolbar',
  },
  schemaSoap: {
    label: '✦ Schema ✦ (SOAP)',
    description: 'AI-powered WSDL / XSD schema viewer for SOAP responses',
    group: 'Response Actions',
    gates: '"Schema ✦" button in SOAP response toolbar',
  },
  schemaGrpc: {
    label: '✦ Schema ✦ (gRPC)',
    description: 'AI-powered protobuf schema viewer for gRPC responses',
    group: 'Response Actions',
    gates: '"Schema ✦" button in gRPC response toolbar',
  },
  semanticValidator: {
    label: '✦ Semantic Validator',
    description: 'AI detects semantically wrong data (age: -5, malformed email, etc.)',
    group: 'Response Actions',
    gates: '"Semantic Validate" in AI Actions ⋮ dropdown',
  },
  responseTransformer: {
    label: '✦ Response Transformer',
    description: 'Transform response: JSON→CSV, extract fields, reshape arrays',
    group: 'Response Actions',
    gates: '"Transform Response" in AI Actions ⋮ dropdown',
  },
  patternBaseline: {
    label: '✦ Pattern Baseline (URL bar)',
    description: 'Access the pattern baseline feature from the URL bar AI Tools menu',
    group: 'Response Actions',
    gates: '"Pattern Baseline ✦" in URL bar AI Tools ⋮ overflow menu',
  },
  recordBaseline: {
    label: '✦ Record Baseline (Response bar)',
    description: 'Record current response as a baseline pattern from the response tab bar',
    group: 'Response Actions',
    gates: '"Record Baseline ✦" button in response tab bar',
  },
  responseDiff: {
    label: '✦ Response Diff Analyzer',
    description: 'AI comparison of two API responses — highlights and explains changes',
    group: 'Response Actions',
    gates: '"Compare with AI" in AI Actions ⋮ dropdown',
  },
  // ── Request Helpers ─────────────────────────────────────────────────────────
  headerAutocomplete: {
    label: 'Header Autocomplete',
    description: 'Suggest HTTP headers based on body type and auth context',
    group: 'Request Helpers',
    gates: '"Suggest Headers ✦" toolbar icon in Headers tab',
  },
  bodyGenerator: {
    label: 'Body Generator',
    description: 'Generate request body from natural language description',
    group: 'Request Helpers',
    gates: '"Generate Body ✦" toolbar icon in Body tab',
  },
  requestNamer: {
    label: 'Request Auto-Namer',
    description: 'AI suggests meaningful names when saving requests to collections',
    group: 'Request Helpers',
    gates: 'Auto-name suggestion in Save As modal',
  },
  requestFuzzer: {
    label: 'Request Fuzzer',
    description: 'AI generates edge-case payloads to fuzz-test request bodies',
    group: 'Request Helpers',
    gates: '"Fuzz ✦" button in Body tab toolbar',
  },
  dataGenerator: {
    label: 'Data Generator',
    description: 'AI-powered test data generation from schema or description',
    group: 'Request Helpers',
    gates: 'Data Generator modal',
  },
  preflightCheck: {
    label: 'Pre-flight Check',
    description: 'AI checks for common issues (missing auth, bad URLs) before sending',
    group: 'Request Helpers',
    gates: '"Pre-flight Check ✦" in URL bar AI Tools ⋮ overflow menu',
  },
  // ── Script & Dev ────────────────────────────────────────────────────────────
  contractTestGenerator: {
    label: 'AI Contract Test Generator',
    description: 'Generate dk.test() contract tests from response schema with AI',
    group: 'Script & Dev',
    gates: '"Tests ✦" button in Scripts tab toolbar (post-response mode)',
  },
  scriptAutocomplete: {
    label: 'Script AI Autocomplete',
    description: 'AI-assisted autocomplete in pre-request / post-response script editors',
    group: 'Script & Dev',
    gates: '"AI ✦" autocomplete toggle in Scripts tab toolbar',
  },
  // ── Collection AI Actions ────────────────────────────────────────────────────
  extractVariables: {
    label: 'Extract Variables',
    description: 'AI extracts environment variables (base URL, tokens, IDs) from a collection',
    group: 'Collection AI',
    gates: '"Extract Variables ✦" in collection right-click → AI Actions',
  },
  organizeWithAi: {
    label: 'Organize with AI',
    description: 'AI reorganizes and groups requests into logical folders',
    group: 'Collection AI',
    gates: '"Organize with AI ✦" in collection right-click → AI Actions',
  },
  buildApiFlow: {
    label: 'Build API Flow',
    description: 'AI builds an end-to-end API workflow from collection requests',
    group: 'Collection AI',
    gates: '"Build API Flow ✦" in collection right-click → AI Actions',
  },
  testWithAiAgent: {
    label: 'Test with AI Agent',
    description: 'AI agent runs the collection end-to-end and reports failures',
    group: 'Collection AI',
    gates: '"Test with AI Agent ✦" in collection right-click → AI Actions',
  },
  generateChangelog: {
    label: 'Generate Changelog',
    description: 'AI generates a human-readable changelog from collection history',
    group: 'Collection AI',
    gates: '"Generate Changelog ✦" in collection right-click → AI Actions',
  },
  dependencyGraph: {
    label: 'Dependency Graph',
    description: 'AI builds a visual dependency graph of API calls in the collection',
    group: 'Collection AI',
    gates: '"Dependency Graph ✦" in collection right-click → AI Actions',
  },
  checkCompliance: {
    label: 'Check Compliance',
    description: 'AI checks requests against REST best practices and compliance rules',
    group: 'Collection AI',
    gates: '"Check Compliance ✦" in collection right-click → AI Actions',
  },
  generateSdk: {
    label: 'Generate SDK',
    description: 'AI generates a typed SDK (TypeScript/Python) from the collection',
    group: 'Collection AI',
    gates: '"Generate SDK ✦" in collection right-click → AI Actions',
  },
  optimizeRequests: {
    label: 'Optimize Requests',
    description: 'AI suggests performance and caching improvements for your API calls',
    group: 'Collection AI',
    gates: '"Optimize Requests ✦" in collection right-click → AI Actions',
  },
  regressionDetector: {
    label: 'Regression Detector',
    description: 'AI detects breaking changes and regressions across collection runs',
    group: 'Collection AI',
    gates: '"Regression Detector ✦" in collection right-click → AI Actions',
  },
  importFromScreenshot: {
    label: 'Import from Screenshot',
    description: 'AI reads a screenshot of an API or Postman collection and imports it',
    group: 'Collection AI',
    gates: '"Import from Screenshot (AI) ✦" in Collections header Import menu',
  },
  importFromLogs: {
    label: 'Import from Server Logs',
    description: 'AI parses server access logs and imports detected API endpoints',
    group: 'Collection AI',
    gates: '"Import from Server Logs (AI) ✦" in Collections header Import menu',
  },
  describeWorkflow: {
    label: 'Describe Workflow',
    description: 'AI turns a plain-English workflow description into a collection',
    group: 'Collection AI',
    gates: '"Describe Workflow (AI) ✦" in Collections header Import menu',
  },
  generateScenario: {
    label: 'Generate Scenario',
    description: 'AI generates a test scenario (sequence of requests) for a use case',
    group: 'Collection AI',
    gates: '"Generate Scenario (AI) ✦" in Collections header Import menu',
  },
  reverseEngineer: {
    label: 'Reverse Engineer',
    description: 'AI reverse-engineers an API from HAR/logs/docs into a collection',
    group: 'Collection AI',
    gates: '"Reverse Engineer (AI) ✦" in Collections header Import menu',
  },
  // ── Mock Server AI ───────────────────────────────────────────────────────────
  mockAiGenerate: {
    label: 'Mock AI Route Generator',
    description: 'AI generates mock routes and response schemas for the Mock Server',
    group: 'Mock Server AI',
    gates: '"✨ Generate with AI" button in Mock Server config (REST / GraphQL / SOAP / gRPC / SSE)',
  },
  aiScenarioManager: {
    label: 'AI Scenario Manager',
    description: 'Manage and run AI-generated response scenarios in the Mock Server',
    group: 'Mock Server AI',
    gates: '"AI Scenario Manager ✦" section in Mock Server AI config',
  },
  // ── AI Chat & Panels ─────────────────────────────────────────────────────────
  daakiaAiChat: {
    label: 'Daakia AI Chat Tab',
    description: 'The dedicated full-screen Daakia AI chat panel and "Ask AI" entry points',
    group: 'AI Chat & Panels',
    gates: 'Daakia AI chat icon in sidebar · "Ask AI" in URL bar AI Tools ⋮ menu',
  },
};

// ── Store ─────────────────────────────────────────────────────────────────────

interface AiFeaturesState {
  features: AiFeatureFlags;
  loaded: boolean;

  setFeatures: (features: AiFeatureFlags) => void;
  toggleFeature: (key: keyof AiFeatureFlags) => void;
  /** Set a specific group of keys to enabled=true or enabled=false */
  setGroupEnabled: (keys: (keyof AiFeatureFlags)[], enabled: boolean) => void;
  /** Enable or disable every feature flag */
  setAllEnabled: (enabled: boolean) => void;
  loadFeatures: () => void;
  isEnabled: (key: keyof AiFeatureFlags) => boolean;
}

function persist(features: AiFeatureFlags) {
  postMsg({ type: 'aiFeatures:save', features });
}

export const useAiFeaturesStore = create<AiFeaturesState>((set, get) => ({
  features: AI_FEATURE_DEFAULTS,
  loaded: false,

  setFeatures: (features) => set({
    features: { ...AI_FEATURE_DEFAULTS, ...features },
    loaded: true,
  }),

  toggleFeature: (key) => {
    const next = { ...get().features, [key]: !get().features[key] };
    set({ features: next });
    persist(next);
  },

  setGroupEnabled: (keys, enabled) => {
    const patch: Partial<AiFeatureFlags> = {};
    keys.forEach(k => { patch[k] = enabled; });
    const next = { ...get().features, ...patch };
    set({ features: next });
    persist(next);
  },

  setAllEnabled: (enabled) => {
    const allKeys = Object.keys(get().features) as (keyof AiFeatureFlags)[];
    const patch: Partial<AiFeatureFlags> = {};
    allKeys.forEach(k => { patch[k] = enabled; });
    const next = { ...get().features, ...patch };
    set({ features: next });
    persist(next);
  },

  loadFeatures: () => {
    postMsg({ type: 'aiFeatures:load' });
  },

  isEnabled: (key) => {
    const val = get().features[key];
    return val === undefined ? true : val;
  },
}));

// ── Feature → Prompt Template mapping ────────────────────────────────────────
// Maps each AI feature flag to its primary prompt template key.
// Used to navigate from AI Features settings to the matching Prompt Library entry.

export const FEATURE_TO_TEMPLATE_KEY: Partial<Record<keyof AiFeatureFlags, AiPromptTemplateKey>> = {
  masterAgent:            'agent.master',
  errorDiagnosis:         'askAiWhy',
  smartRetryAdvisor:      'rest.smart.retry',
  explainRest:            'explainWithAi',
  followUpsRest:          'followupWithAi',
  explainGraphql:         'explainWithAi',
  followUpsGraphql:       'followupWithAi',
  explainSoap:            'explainWithAi',
  followUpsSoap:          'followupWithAi',
  explainGrpc:            'explainWithAi',
  followUpsGrpc:          'followupWithAi',
  assertGeneration:       'rest.assert.generate',
  schemaRest:             'rest.schema.validate',
  schemaGraphql:          'graphql.schema.view',
  schemaSoap:             'soap.schema.view',
  schemaGrpc:             'grpc.schema.view',
  semanticValidator:      'rest.semantic.validate',
  responseTransformer:    'rest.response.transform',
  patternBaseline:        'rest.pattern.baseline',
  recordBaseline:         'rest.record.baseline',
  responseDiff:           'rest.response.diff',
  headerAutocomplete:     'rest.headers.suggest.generate',
  bodyGenerator:          'rest.body.generate',
  requestNamer:           'rest.request.name',
  requestFuzzer:          'rest.request.fuzz',
  preflightCheck:         'rest.preflight',
  contractTestGenerator:  'rest.contract.test',
  scriptAutocomplete:     'rest.script.autocomplete',
  extractVariables:       'rest.env.extract',
  organizeWithAi:         'rest.collection.organize',
  buildApiFlow:           'rest.api.flow',
  testWithAiAgent:        'rest.agent.workflow',
  generateChangelog:      'rest.changelog.generate',
  dependencyGraph:        'collection.dependency.graph',
  checkCompliance:        'collection.compliance',
  generateSdk:            'collection.sdk.generate',
  optimizeRequests:       'collection.optimize',
  regressionDetector:     'collection.regression',
  importFromScreenshot:   'import.screenshot',
  importFromLogs:         'import.logs',
  describeWorkflow:       'import.describe.workflow',
  generateScenario:       'import.scenario.generate',
  reverseEngineer:        'import.reverse.engineer',
  mockAiGenerate:         'mock.rest.generate',
  aiScenarioManager:      'mock.scenario.manager',
  daakiaAiChat:           'agent.master',
};

// Inverse map: prompt template key → primary feature flag key
export const TEMPLATE_TO_FEATURE_KEY: Partial<Record<AiPromptTemplateKey, keyof AiFeatureFlags>> =
  Object.fromEntries(
    Object.entries(FEATURE_TO_TEMPLATE_KEY)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [v, k as keyof AiFeatureFlags])
  ) as Partial<Record<AiPromptTemplateKey, keyof AiFeatureFlags>>;
