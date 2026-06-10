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
  // ── Protocol-Specific AI (Sprint 8-10) ───────────────────────────────────────
  gqlQueryBuilder: boolean;
  gqlSchemaExplainer: boolean;
  grpcProtoExplainer: boolean;
  soapWsdlExplainer: boolean;
  wsTrafficAnalyzer: boolean;
  sseTrafficAnalyzer: boolean;
  sseEventSuggester: boolean;
  mqttTopicSuggester: boolean;
  sioTrafficAnalyzer: boolean;
  mcpPromptBuilder: boolean;
  // ── Platform AI (Sprint 10 platform tasks) ───────────────────────────────────
  openApiGenerator: boolean;
  securityAudit: boolean;
  mockIntelligence: boolean;
  postmanTranslator: boolean;
  soapToRest: boolean;
  gqlFederation: boolean;
  webhookDebugger: boolean;
  requestClustering: boolean;
  // ── Sprint 11 — AI Agents & Autonomous Intelligence ───────────────────────────
  autoDiscovery: boolean;
  nlRequestBuilder: boolean;
  sequenceComposer: boolean;
  collectionOptimizer: boolean;
  apiKnowledgeGraph: boolean;
  regressionGuardian: boolean;
  schemaDriftMonitor: boolean;
  adaptiveLoadTester: boolean;
  // ── Sprint 12 — AI Analytics, Security & Documentation ────────────────────────
  intelligenceDashboard: boolean;
  performanceAnomalyDetector: boolean;
  apiChangelogMonitor: boolean;
  compatibilityScorer: boolean;
  deepSecurityAudit: boolean;
  docAutoGenerator: boolean;
  smartTestSuiteGen: boolean;
  // ── Sprint 14 — Multi-Agent Orchestration & AI Mock Intelligence ──────────────
  crossProtocolOrchestrator: boolean;
  chaosEngineeringPlanner: boolean;
  contractNegotiator: boolean;
  adaptiveMockLearning: boolean;
  aiScenarioComposer: boolean;
  liveTrafficMirror: boolean;
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
  // Protocol-Specific AI (Sprint 8-10)
  gqlQueryBuilder: true,
  gqlSchemaExplainer: true,
  grpcProtoExplainer: true,
  soapWsdlExplainer: true,
  wsTrafficAnalyzer: true,
  sseTrafficAnalyzer: true,
  sseEventSuggester: true,
  mqttTopicSuggester: true,
  sioTrafficAnalyzer: true,
  mcpPromptBuilder: true,
  // Platform AI
  openApiGenerator: true,
  securityAudit: true,
  mockIntelligence: true,
  postmanTranslator: true,
  soapToRest: true,
  gqlFederation: true,
  webhookDebugger: true,
  requestClustering: true,
  // Sprint 11
  autoDiscovery: true,
  nlRequestBuilder: true,
  sequenceComposer: true,
  collectionOptimizer: true,
  apiKnowledgeGraph: true,
  regressionGuardian: true,
  schemaDriftMonitor: true,
  adaptiveLoadTester: true,
  // Sprint 12
  intelligenceDashboard: true,
  performanceAnomalyDetector: true,
  apiChangelogMonitor: true,
  compatibilityScorer: true,
  deepSecurityAudit: true,
  docAutoGenerator: true,
  smartTestSuiteGen: true,
  // Sprint 14
  crossProtocolOrchestrator: true,
  chaosEngineeringPlanner: true,
  contractNegotiator: true,
  adaptiveMockLearning: true,
  aiScenarioComposer: true,
  liveTrafficMirror: true,
};

// ── Labels shown in Settings → AI Features ───────────────────────────────────

export const AI_FEATURE_LABELS: Record<keyof AiFeatureFlags, {
  label: string;
  description: string;
  group: string;
  gates: string;
}> = {
  // ── Response & Diagnostics ────────────────────────────────────────────────────
  masterAgent: {
    label: 'Master Agent (Auto-Route)',
    description: 'Auto-classify messages and route to the right AI agent',
    group: 'Response & Diagnostics',
    gates: 'Daakia AI tab → auto-routes all messages to the right specialized agent',
  },
  errorDiagnosis: {
    label: 'Ask AI Why',
    description: '"Ask AI Why" button on 4xx/5xx responses across all protocols',
    group: 'Response & Diagnostics',
    gates: '"Ask AI Why ✦" button in response status bar (REST, GraphQL, gRPC, SOAP)',
  },
  smartRetryAdvisor: {
    label: 'Smart Retry Advisor',
    description: 'Inline AI banner suggesting retry strategies on failed responses',
    group: 'Response & Diagnostics',
    gates: 'Smart Retry Advisor banner below error responses in all protocol tabs',
  },
  daakiaAiChat: {
    label: 'Daakia AI Chat Tab',
    description: 'The dedicated full-screen Daakia AI chat panel and "Ask AI" entry points',
    group: 'Response & Diagnostics',
    gates: 'Daakia AI tab (sparkle icon in sidebar) · "Ask AI" in URL bar ⋮ AI Tools menu (all protocols)',
  },
  patternBaseline: {
    label: '✦ Pattern Baseline',
    description: 'Access the pattern baseline feature from the URL bar AI Tools menu',
    group: 'Response & Diagnostics',
    gates: '"Pattern Baseline ✦" in REST tab URL bar → ⋮ AI Tools menu',
  },
  recordBaseline: {
    label: '✦ Record Baseline',
    description: 'Record current response as a baseline pattern from the response tab bar',
    group: 'Response & Diagnostics',
    gates: '"Record Baseline ✦" button in REST / GraphQL / gRPC / SOAP response tab bar',
  },
  responseDiff: {
    label: '✦ Response Diff Analyzer',
    description: 'AI comparison of two API responses — highlights and explains changes',
    group: 'Response & Diagnostics',
    gates: '"Compare with AI" in REST response tab → ⋮ AI Actions dropdown',
  },
  intelligenceDashboard: {
    label: 'AI Intelligence Dashboard ✦',
    description: 'Analyses request history: slowest endpoints, error rates, anomalies, weekly insight reports',
    group: 'Response & Diagnostics',
    gates: 'Developer Tools → "AI Insights" subtab',
  },
  performanceAnomalyDetector: {
    label: 'Performance Anomaly Detector ✦',
    description: 'AI learns your API latency baseline; alerts when an endpoint degrades beyond 2σ with likely cause',
    group: 'Response & Diagnostics',
    gates: 'Status bar badge + AiPerfAnomalyModal',
  },
  // ── REST Toolkit ──────────────────────────────────────────────────────────────
  explainRest: {
    label: 'Explain Response (REST)',
    description: 'AI explains what the REST response body means in plain English',
    group: 'REST Toolkit',
    gates: '"Explain ✦" pill button in REST tab response toolbar',
  },
  followUpsRest: {
    label: 'Follow-up Suggestions (REST)',
    description: 'AI suggests follow-up REST requests to try next',
    group: 'REST Toolkit',
    gates: '"Follow-ups ✦" pill button in REST tab response toolbar',
  },
  assertGeneration: {
    label: '✦ Assert Generation',
    description: 'Natural language → dk.test() assertions from response body (REST, GraphQL, gRPC, SOAP)',
    group: 'REST Toolkit',
    gates: '"Assert (plain English)" in REST / GraphQL / gRPC / SOAP response tab → ⋮ AI Actions dropdown',
  },
  responseTransformer: {
    label: '✦ Response Transformer',
    description: 'Transform response: JSON→CSV, extract fields, reshape arrays — all protocols',
    group: 'REST Toolkit',
    gates: '"Transform Response" in REST / GraphQL / gRPC / SOAP response tab → ⋮ AI Actions dropdown',
  },
  headerAutocomplete: {
    label: 'Header Autocomplete',
    description: 'Suggest HTTP headers based on body type and auth context',
    group: 'REST Toolkit',
    gates: '"Suggest Headers ✦" button in REST / GraphQL / gRPC / SOAP → Headers tab toolbar',
  },
  bodyGenerator: {
    label: 'Body Generator',
    description: 'Generate request body from natural language description',
    group: 'REST Toolkit',
    gates: '"Generate Body ✦" button in REST Body tab toolbar (also GraphQL Variables, gRPC Request JSON, SOAP Envelope tabs)',
  },
  requestNamer: {
    label: 'Request Auto-Namer',
    description: 'AI suggests meaningful names when saving requests to collections',
    group: 'REST Toolkit',
    gates: 'Auto-name suggestion in REST / any protocol → Save As modal',
  },
  requestFuzzer: {
    label: 'Request Fuzzer',
    description: 'AI generates edge-case payloads to fuzz-test request bodies',
    group: 'REST Toolkit',
    gates: '"Fuzz ✦" button in REST Body tab toolbar (also GraphQL Variables, gRPC Request JSON)',
  },
  dataGenerator: {
    label: 'Data Generator',
    description: 'AI-powered test data generation from schema or description',
    group: 'REST Toolkit',
    gates: 'Data Generator modal (accessible from REST / any protocol tab)',
  },
  preflightCheck: {
    label: 'Pre-flight Check',
    description: 'AI checks for common issues (missing auth, bad URLs) before sending',
    group: 'REST Toolkit',
    gates: '"Pre-flight Check ✦" in REST / any protocol URL bar → ⋮ AI Tools menu',
  },
  scriptAutocomplete: {
    label: 'Script AI Autocomplete',
    description: 'AI-assisted autocomplete in pre-request / post-response script editors',
    group: 'REST Toolkit',
    gates: '"AI ✦" autocomplete toggle in REST / any protocol → Scripts tab toolbar',
  },
  nlRequestBuilder: {
    label: 'Natural Language Request Builder ✦',
    description: '"Get all admin users created after Jan 1st" → AI builds exact request: method, URL, params, headers, body',
    group: 'REST Toolkit',
    gates: 'URL bar sparkle button → AiNlRequestBuilderModal (REST, GraphQL, gRPC, SOAP)',
  },
  adaptiveLoadTester: {
    label: 'Adaptive Load Tester ✦',
    description: 'AI ramps load dynamically to find exact breaking point; generates performance report with latency graphs',
    group: 'REST Toolkit',
    gates: 'AiAdaptiveLoadTesterModal via DevTools or URL bar AI Tools menu',
  },
  // ── Schema & Contracts ────────────────────────────────────────────────────────
  schemaRest: {
    label: '✦ Validate Schema / TypeScript (REST)',
    description: 'Generate TypeScript interfaces or validate JSON schema from REST response',
    group: 'Schema & Contracts',
    gates: '"Validate Schema with AI" in REST response tab → ⋮ AI Actions dropdown',
  },
  semanticValidator: {
    label: '✦ Semantic Validator',
    description: 'AI detects semantically wrong data (age: -5, malformed email, etc.) — all protocols',
    group: 'Schema & Contracts',
    gates: '"Semantic Validate" in REST / GraphQL / gRPC / SOAP response tab → ⋮ AI Actions dropdown',
  },
  contractTestGenerator: {
    label: 'AI Contract Test Generator',
    description: 'Generate dk.test() contract tests from response schema with AI',
    group: 'Schema & Contracts',
    gates: '"Tests ✦" button in REST tab → Scripts tab toolbar (post-response mode)',
  },
  schemaDriftMonitor: {
    label: 'Schema Drift Monitor ✦',
    description: 'Background agent watches your API; instant alert with field-level diff when a response shape changes',
    group: 'Schema & Contracts',
    gates: 'Status bar indicator + AiSchemaDriftModal',
  },
  compatibilityScorer: {
    label: 'API Compatibility Scorer ✦',
    description: 'Compare two API versions; AI scores breaking change severity, generates migration guide, suggests adapter patterns',
    group: 'Schema & Contracts',
    gates: 'Collections ⋮ menu → "Compare Versions" → AiCompatibilityScorerModal',
  },
  smartTestSuiteGen: {
    label: 'Smart Test Suite Generator ✦',
    description: 'Describe what to test in plain English → AI writes full test suite: happy path, edge cases, auth tests',
    group: 'Schema & Contracts',
    gates: 'AiSmartTestSuiteModal via Collections ⋮ menu or response AI Actions',
  },
  contractNegotiator: {
    label: 'AI Contract Negotiator ✦',
    description: "Given two teams' OpenAPI specs, AI identifies incompatibilities, proposes resolutions, generates adapter stub mocks",
    group: 'Schema & Contracts',
    gates: 'AiContractNegotiatorModal',
  },
  // ── Collections & Workflow ────────────────────────────────────────────────────
  extractVariables: {
    label: 'Extract Variables',
    description: 'AI extracts environment variables (base URL, tokens, IDs) from a collection',
    group: 'Collections & Workflow',
    gates: '"Extract Variables ✦" in Collections sidebar → right-click collection → AI Actions',
  },
  organizeWithAi: {
    label: 'Organize with AI',
    description: 'AI reorganizes and groups requests into logical folders',
    group: 'Collections & Workflow',
    gates: '"Organize with AI ✦" in Collections sidebar → right-click collection → AI Actions',
  },
  buildApiFlow: {
    label: 'Build API Flow',
    description: 'AI builds an end-to-end API workflow from collection requests',
    group: 'Collections & Workflow',
    gates: '"Build API Flow ✦" in Collections sidebar → right-click collection → AI Actions',
  },
  testWithAiAgent: {
    label: 'Test with AI Agent',
    description: 'AI agent runs the collection end-to-end and reports failures',
    group: 'Collections & Workflow',
    gates: '"Test with AI Agent ✦" in Collections sidebar → right-click collection → AI Actions',
  },
  generateChangelog: {
    label: 'Generate Changelog',
    description: 'AI generates a human-readable changelog from collection history',
    group: 'Collections & Workflow',
    gates: '"Generate Changelog ✦" in Collections sidebar → right-click collection → AI Actions',
  },
  dependencyGraph: {
    label: 'Dependency Graph',
    description: 'AI builds a visual dependency graph of API calls in the collection',
    group: 'Collections & Workflow',
    gates: '"Dependency Graph ✦" in Collections sidebar → right-click collection → AI Actions',
  },
  checkCompliance: {
    label: 'Check Compliance',
    description: 'AI checks requests against REST best practices and compliance rules',
    group: 'Collections & Workflow',
    gates: '"Check Compliance ✦" in Collections sidebar → right-click collection → AI Actions',
  },
  generateSdk: {
    label: 'Generate SDK',
    description: 'AI generates a typed SDK (TypeScript/Python) from the collection',
    group: 'Collections & Workflow',
    gates: '"Generate SDK ✦" in Collections sidebar → right-click collection → AI Actions',
  },
  optimizeRequests: {
    label: 'Optimize Requests',
    description: 'AI suggests performance and caching improvements for your API calls',
    group: 'Collections & Workflow',
    gates: '"Optimize Requests ✦" in Collections sidebar → right-click collection → AI Actions',
  },
  regressionDetector: {
    label: 'Regression Detector',
    description: 'AI detects breaking changes and regressions across collection runs',
    group: 'Collections & Workflow',
    gates: '"Regression Detector ✦" in Collections sidebar → right-click collection → AI Actions',
  },
  autoDiscovery: {
    label: 'Auto-Discovery Agent ✦',
    description: 'Give a base URL → AI crawls JS bundles, tries REST patterns, reads robots.txt/sitemap, detects OpenAPI → auto-generates collection',
    group: 'Collections & Workflow',
    gates: 'Collections sidebar → "AI Discover" → AiAutoDiscoveryModal',
  },
  sequenceComposer: {
    label: 'Sequence Composer ✦',
    description: '"Login → create order → checkout" → AI generates chained request sequence with variable extraction between steps',
    group: 'Collections & Workflow',
    gates: 'Collections sidebar + AiSequenceComposerModal',
  },
  collectionOptimizer: {
    label: 'Collection Optimizer Agent ✦',
    description: 'AI audits your collection: merges duplicates, extracts hardcoded values, reorganizes structure, removes dead requests. One-click apply.',
    group: 'Collections & Workflow',
    gates: 'Collections ⋮ menu → "AI Optimize"',
  },
  apiKnowledgeGraph: {
    label: 'API Knowledge Graph ✦',
    description: 'AI maps relationships between endpoints: POST /users → userId used by GET /users/{id}. Visual queryable graph.',
    group: 'Collections & Workflow',
    gates: 'Collections sidebar → Graph view → AiApiKnowledgeGraphModal',
  },
  regressionGuardian: {
    label: 'Regression Guardian ✦',
    description: 'Run collection before each push; AI compares responses vs recorded baseline, flags behavioral changes with severity scores',
    group: 'Collections & Workflow',
    gates: 'Collections ⋮ menu → "Run Regression Guard" → AiRegressionGuardianModal',
  },
  apiChangelogMonitor: {
    label: 'API Changelog Monitor ✦',
    description: 'AI runs collection over time, detects response shape changes, generates human-readable changelog entries automatically',
    group: 'Collections & Workflow',
    gates: 'AiChangelogMonitorModal',
  },
  // ── Import & Reverse Engineer ─────────────────────────────────────────────────
  importFromScreenshot: {
    label: 'Import from Screenshot',
    description: 'AI reads a screenshot of an API or Postman collection and imports it',
    group: 'Import & Reverse Engineer',
    gates: '"Import from Screenshot (AI) ✦" in Collections panel header → Import menu',
  },
  importFromLogs: {
    label: 'Import from Server Logs',
    description: 'AI parses server access logs and imports detected API endpoints',
    group: 'Import & Reverse Engineer',
    gates: '"Import from Server Logs (AI) ✦" in Collections panel header → Import menu',
  },
  describeWorkflow: {
    label: 'Describe Workflow',
    description: 'AI turns a plain-English workflow description into a collection',
    group: 'Import & Reverse Engineer',
    gates: '"Describe Workflow (AI) ✦" in Collections panel header → Import menu',
  },
  generateScenario: {
    label: 'Generate Scenario',
    description: 'AI generates a test scenario (sequence of requests) for a use case',
    group: 'Import & Reverse Engineer',
    gates: '"Generate Scenario (AI) ✦" in Collections panel header → Import menu',
  },
  reverseEngineer: {
    label: 'Reverse Engineer',
    description: 'AI reverse-engineers an API from HAR/logs/docs into a collection',
    group: 'Import & Reverse Engineer',
    gates: '"Reverse Engineer (AI) ✦" in Collections panel header → Import menu',
  },
  // ── Mock Generation ───────────────────────────────────────────────────────────
  mockAiGenerate: {
    label: 'Mock AI Route Generator',
    description: 'AI generates mock routes and response schemas for the Mock Server',
    group: 'Mock Generation',
    gates: '"✨ Generate with AI" button in Mock Server tab → REST / GraphQL / SOAP / gRPC / SSE config',
  },
  aiScenarioManager: {
    label: 'AI Scenario Manager',
    description: 'Manage and run AI-generated response scenarios in the Mock Server',
    group: 'Mock Generation',
    gates: '"AI Scenario Manager ✦" section in Mock Server tab → AI config panel',
  },
  mockIntelligence: {
    label: 'AI Mock Intelligence ✦',
    description: 'Learn from real API responses and auto-generate realistic mock rules',
    group: 'Mock Generation',
    gates: '"Mock Intelligence ✦" button in Mock Server tab → AI config panel',
  },
  adaptiveMockLearning: {
    label: 'Adaptive Mock Learning ✦',
    description: 'Point at real API, hit Record for N minutes; AI observes traffic and builds intelligent mock that generalises to unseen inputs',
    group: 'Mock Generation',
    gates: 'Mock Server → "AI Learn" button → AiAdaptiveMockLearningModal',
  },
  aiScenarioComposer: {
    label: 'AI Scenario Composer for Mocks ✦',
    description: 'Describe complex multi-protocol scenario in plain English → AI builds full mock configuration: state machine, sequences, fault rules, webhooks',
    group: 'Mock Generation',
    gates: 'Mock Server → AiScenarioComposerModal',
  },
  // ── GraphQL AI ────────────────────────────────────────────────────────────────
  explainGraphql: {
    label: 'Explain Response (GraphQL)',
    description: 'AI explains the GraphQL response data in plain English',
    group: 'GraphQL AI',
    gates: '"Explain ✦" button in GraphQL tab response toolbar',
  },
  followUpsGraphql: {
    label: 'Follow-up Suggestions (GraphQL)',
    description: 'AI suggests follow-up GraphQL queries to try next',
    group: 'GraphQL AI',
    gates: '"Follow-ups ✦" button in GraphQL tab response toolbar',
  },
  schemaGraphql: {
    label: '✦ Schema Viewer (GraphQL)',
    description: 'AI-powered SDL / schema viewer for GraphQL responses',
    group: 'GraphQL AI',
    gates: '"Schema ✦" button in GraphQL tab response toolbar',
  },
  gqlQueryBuilder: {
    label: 'GQL Query Builder ✦',
    description: 'Describe a GraphQL operation in plain English → AI generates the exact query/mutation/subscription',
    group: 'GraphQL AI',
    gates: '"Query Builder ✦" button in GraphQL tab → query editor toolbar',
  },
  gqlSchemaExplainer: {
    label: 'GQL Schema Explainer ✦',
    description: 'AI explains every type, field, and relationship in the GraphQL schema in plain English',
    group: 'GraphQL AI',
    gates: '"Schema Explainer ✦" button in GraphQL tab → schema/docs area',
  },
  gqlFederation: {
    label: 'AI GraphQL Federation Explorer ✦',
    description: 'Understand cross-subgraph queries, entity resolution, @key directives',
    group: 'GraphQL AI',
    gates: '"Federation ✦" button in GraphQL tab → URL bar ⋮ AI Tools menu',
  },
  // ── gRPC AI ───────────────────────────────────────────────────────────────────
  explainGrpc: {
    label: 'Explain Response (gRPC)',
    description: 'AI explains the gRPC response protobuf in plain English',
    group: 'gRPC AI',
    gates: '"Explain ✦" button in gRPC tab response toolbar',
  },
  followUpsGrpc: {
    label: 'Follow-up Suggestions (gRPC)',
    description: 'AI suggests follow-up gRPC calls to try',
    group: 'gRPC AI',
    gates: '"Follow-ups ✦" button in gRPC tab response toolbar',
  },
  schemaGrpc: {
    label: '✦ Schema Viewer (gRPC)',
    description: 'AI-powered protobuf schema viewer for gRPC responses',
    group: 'gRPC AI',
    gates: '"Schema ✦" button in gRPC tab response toolbar',
  },
  grpcProtoExplainer: {
    label: 'gRPC Proto Explainer ✦',
    description: 'AI explains every service, RPC method, and message type in the proto file in plain English',
    group: 'gRPC AI',
    gates: '"Proto Explainer ✦" button in gRPC tab → URL bar ⋮ AI Tools menu',
  },
  // ── SOAP AI ───────────────────────────────────────────────────────────────────
  explainSoap: {
    label: 'Explain Response (SOAP)',
    description: 'AI explains the SOAP XML response in plain English',
    group: 'SOAP AI',
    gates: '"Explain ✦" button in SOAP tab response toolbar',
  },
  followUpsSoap: {
    label: 'Follow-up Suggestions (SOAP)',
    description: 'AI suggests follow-up SOAP operations',
    group: 'SOAP AI',
    gates: '"Follow-ups ✦" button in SOAP tab response toolbar',
  },
  schemaSoap: {
    label: '✦ Schema Viewer (SOAP)',
    description: 'AI-powered WSDL / XSD schema viewer for SOAP responses',
    group: 'SOAP AI',
    gates: '"Schema ✦" button in SOAP tab response toolbar',
  },
  soapWsdlExplainer: {
    label: 'SOAP WSDL Explainer ✦',
    description: 'AI explains every operation, binding, port, and type in the WSDL in plain English',
    group: 'SOAP AI',
    gates: '"WSDL Explainer ✦" in SOAP tab → URL bar ⋮ AI Tools menu',
  },
  soapToRest: {
    label: 'AI SOAP → REST Migrator ✦',
    description: 'Convert SOAP WSDL operations to equivalent REST endpoints with OpenAPI 3.1 output',
    group: 'SOAP AI',
    gates: '"SOAP→REST ✦" button in SOAP tab → URL bar ⋮ AI Tools menu',
  },
  // ── Realtime Protocols ────────────────────────────────────────────────────────
  wsTrafficAnalyzer: {
    label: 'WS Traffic Analyzer ✦',
    description: 'AI analyzes the full WebSocket message stream: detects schema, patterns, anomalies, frequency',
    group: 'Realtime Protocols',
    gates: '"Traffic Analyzer ✦" button in WebSocket tab → message log toolbar',
  },
  sseTrafficAnalyzer: {
    label: 'SSE Traffic Analyzer ✦',
    description: 'AI analyzes SSE event stream for patterns, anomalies, and schema evolution',
    group: 'Realtime Protocols',
    gates: '"Traffic Analyzer ✦" button in SSE tab → event log toolbar',
  },
  sseEventSuggester: {
    label: 'SSE Event Suggester ✦',
    description: 'AI suggests related event types to subscribe to based on the observed event stream',
    group: 'Realtime Protocols',
    gates: '"Event Suggester ✦" button in SSE tab → event log toolbar',
  },
  mqttTopicSuggester: {
    label: 'MQTT Topic Suggester ✦',
    description: 'AI suggests related MQTT topic patterns (wildcards, siblings, parent topics)',
    group: 'Realtime Protocols',
    gates: '"Topic Suggester ✦" button in MQTT tab → subscribe/publish toolbar',
  },
  sioTrafficAnalyzer: {
    label: 'Socket.IO Traffic Analyzer ✦',
    description: 'AI analyzes Socket.IO event log: detects session patterns, anomalies, schema per event type',
    group: 'Realtime Protocols',
    gates: '"Traffic Analyzer ✦" button in Socket.IO tab → event log toolbar',
  },
  // ── MCP & Platform AI ─────────────────────────────────────────────────────────
  mcpPromptBuilder: {
    label: 'MCP AI Prompt Builder ✦',
    description: 'Natural language description → structured MCP prompt with tool call sequences',
    group: 'MCP & Platform AI',
    gates: '"Prompt Builder ✦" button in MCP tab → tools area',
  },
  openApiGenerator: {
    label: 'AI OpenAPI 3.1 Generator ✦',
    description: 'Generate a full OpenAPI 3.1 spec from any collection with schemas, examples, auth',
    group: 'MCP & Platform AI',
    gates: '"OpenAPI ✦" button in Daakia AI tab → platform tools action bar',
  },
  securityAudit: {
    label: 'AI Security Audit ✦',
    description: 'Scan all open tabs for missing auth, plain-text secrets, no HTTPS, exposed PII',
    group: 'MCP & Platform AI',
    gates: '"Security Audit ✦" button in Daakia AI tab → platform tools action bar',
  },
  postmanTranslator: {
    label: 'AI Postman Script Translator ✦',
    description: 'Translate Postman pm.* test scripts to Daakia dk.* automatically',
    group: 'MCP & Platform AI',
    gates: '"pm→dk ✦" translate button in Daakia AI tab → platform tools action bar',
  },
  webhookDebugger: {
    label: 'AI Webhook Debugger ✦',
    description: 'Analyze webhook payloads, validate HMAC signatures, explain structure',
    group: 'MCP & Platform AI',
    gates: '"Webhook ✦" button in Daakia AI tab → platform tools action bar',
  },
  requestClustering: {
    label: 'AI Request Clustering ✦',
    description: 'AI groups request history into logical API domains → auto-organize into collections',
    group: 'MCP & Platform AI',
    gates: '"Cluster ✦" button in Daakia AI tab → platform tools action bar',
  },
  deepSecurityAudit: {
    label: 'Deep Security Audit ✦',
    description: 'Deep OWASP Top 10 scan: exposed tokens, injection surfaces, missing auth, CORS misconfig. Generates pentest checklist with PoC payloads.',
    group: 'MCP & Platform AI',
    gates: 'Collections ⋮ menu → "Security Audit" → AiDeepSecurityAuditModal',
  },
  docAutoGenerator: {
    label: 'Documentation Auto-Generator ✦',
    description: 'AI generates polished API docs from your collection: endpoint descriptions, parameter tables, examples, auth guide. Exports to Markdown, HTML, OpenAPI.',
    group: 'MCP & Platform AI',
    gates: 'Collections ⋮ menu → "Generate Docs" → AiDocGeneratorModal',
  },
  crossProtocolOrchestrator: {
    label: 'Cross-Protocol Test Orchestrator ✦',
    description: 'Describe a multi-protocol user journey → AI coordinates execution: REST auth → WebSocket push → SSE event → gRPC state. Single timeline view.',
    group: 'MCP & Platform AI',
    gates: 'AiCrossProtocolOrchestratorModal',
  },
  chaosEngineeringPlanner: {
    label: 'AI Chaos Engineering Planner ✦',
    description: 'AI designs a full chaos test plan: fault scenarios, order, probability, across protocols. Generates risk matrix and resilience report.',
    group: 'MCP & Platform AI',
    gates: 'AiChaosEngineeringModal',
  },
  liveTrafficMirror: {
    label: 'Live Traffic Mirror & AI Analysis ✦',
    description: 'Proxy mode: mirror real API traffic across all protocols. AI analyses patterns in real-time, auto-updates mocks, flags anomalies.',
    group: 'MCP & Platform AI',
    gates: 'Proxy settings + AiLiveTrafficMirrorModal',
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
  dataGenerator:          'data.generate',
  gqlQueryBuilder:        'gql.query.builder',
  gqlSchemaExplainer:     'gql.schema.explainer',
  grpcProtoExplainer:     'grpc.proto.explainer',
  soapWsdlExplainer:      'soap.wsdl.explainer',
  wsTrafficAnalyzer:      'ws.traffic.analyzer',
  sseTrafficAnalyzer:     'sse.traffic.analyzer',
  sseEventSuggester:      'sse.event.suggester',
  mqttTopicSuggester:     'mqtt.topic.suggester',
  sioTrafficAnalyzer:     'sio.traffic.analyzer',
  mcpPromptBuilder:       'mcp.prompt.builder',
  openApiGenerator:       'platform.openapi.generator',
  securityAudit:          'platform.security.audit',
  mockIntelligence:       'platform.mock.intelligence',
  postmanTranslator:      'platform.postman.translator',
  soapToRest:             'platform.soap.to.rest',
  gqlFederation:          'platform.gql.federation',
  webhookDebugger:        'platform.webhook.debugger',
  requestClustering:      'platform.request.clustering',
  // Sprint 11
  autoDiscovery:          'import.reverse.engineer',
  nlRequestBuilder:       'rest.body.generate',
  sequenceComposer:       'rest.api.flow',
  collectionOptimizer:    'collection.optimize',
  apiKnowledgeGraph:      'collection.dependency.graph',
  regressionGuardian:     'collection.regression',
  schemaDriftMonitor:     'rest.schema.validate',
  adaptiveLoadTester:     'rest.preflight',
  // Sprint 12
  intelligenceDashboard:  'rest.performance.insights',
  performanceAnomalyDetector: 'rest.performance.insights',
  apiChangelogMonitor:    'rest.changelog.generate',
  compatibilityScorer:    'rest.schema.validate',
  deepSecurityAudit:      'platform.security.audit',
  docAutoGenerator:       'platform.openapi.generator',
  smartTestSuiteGen:      'rest.contract.test',
  // Sprint 14
  crossProtocolOrchestrator: 'agent.master',
  chaosEngineeringPlanner:   'rest.request.fuzz',
  contractNegotiator:        'rest.contract.test',
  adaptiveMockLearning:      'mock.scenario.manager',
  aiScenarioComposer:        'mock.scenario.manager',
  liveTrafficMirror:         'platform.mock.intelligence',
};

// Inverse map: prompt template key → primary feature flag key
export const TEMPLATE_TO_FEATURE_KEY: Partial<Record<AiPromptTemplateKey, keyof AiFeatureFlags>> =
  Object.fromEntries(
    Object.entries(FEATURE_TO_TEMPLATE_KEY)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [v, k as keyof AiFeatureFlags])
  ) as Partial<Record<AiPromptTemplateKey, keyof AiFeatureFlags>>;
