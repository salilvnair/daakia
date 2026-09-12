/**
 * Which prompt template each AI feature flag drives.
 *
 * Its own module because two things need it and they would otherwise import
 * each other: the settings store, to link a toggle to its Prompt Library
 * entry, and `ai-stage-features.ts`, to tell which AI stages already have a
 * hand-written flag and so need no generated one.
 */
import type { AiFeatureFlags } from './ai-features-store';
import type { AiPromptTemplateKey } from './prompt-template';

// Maps each AI feature flag to its primary prompt template key.
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
