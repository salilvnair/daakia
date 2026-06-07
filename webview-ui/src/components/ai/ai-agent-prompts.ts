/**
 * ai-agent-prompts.ts — Default system prompts for Daakia's AI agents.
 *
 * Serves as built-in defaults when no customized prompt exists in the DB.
 * Each scenario supports {{variable}} placeholders resolved at runtime.
 *
 * Pattern mirrors: dmcr_copilot/src/forms/llm/prompts/prompt-template.ts
 */

export type AgentScenario = 'request' | 'mock' | 'test' | 'curl' | 'explain' | 'general';

export type VariableInfo = { description: string; source: string };
export type ScenarioVarMap = Record<string, VariableInfo>;

// ─── Labels & Descriptions ────────────────────────────────────────────────────

export const SCENARIO_LABELS: Record<AgentScenario, string> = {
  request: 'REST API Agent',
  mock:    'Mock Server Agent',
  test:    'Test Script Agent',
  curl:    'cURL Agent',
  explain: 'Knowledge Agent',
  general: 'General Assistant',
};

export const SCENARIO_DESCRIPTIONS: Record<AgentScenario, string> = {
  request: 'Builds structured HTTP requests from natural language',
  mock:    'Designs mock API endpoints with realistic response data',
  test:    'Generates dk.* test assertions for API responses',
  curl:    'Converts cURL commands to structured Daakia requests',
  explain: 'Explains HTTP status codes, headers, and API concepts',
  general: 'Fallback conversational assistant for API questions',
};

// ─── Runtime Variables ────────────────────────────────────────────────────────

export const AGENT_SCENARIO_VARIABLES: Record<AgentScenario, ScenarioVarMap> = {
  request: {
    userIntent:    { description: 'Natural language description of what the user wants', source: 'user input' },
    currentUrl:    { description: 'Active URL in the request tab', source: 'request tab' },
    currentMethod: { description: 'HTTP method (GET, POST, etc.)', source: 'request tab' },
    envVars:       { description: 'Active environment variables as JSON', source: 'environment panel' },
    headers:       { description: 'Current request headers', source: 'request tab' },
  },
  mock: {
    userIntent:     { description: 'Natural language description of the mock endpoint', source: 'user input' },
    existingRoutes: { description: 'Already defined mock routes', source: 'mock server config' },
    dataSchema:     { description: 'Optional JSON schema for realistic data generation', source: 'user input' },
  },
  test: {
    responseStatus: { description: 'HTTP status code of the response', source: 'response data' },
    responseBody:   { description: 'Full response body JSON', source: 'response data' },
    requestMethod:  { description: 'HTTP method used', source: 'request tab' },
    requestUrl:     { description: 'URL that was called', source: 'request tab' },
    contentType:    { description: 'Response Content-Type header', source: 'response headers' },
  },
  curl: {
    curlCommand: { description: 'Raw cURL command string to convert', source: 'user input' },
    envVars:     { description: 'Active environment variables for substitution', source: 'environment panel' },
  },
  explain: {
    responseStatus: { description: 'HTTP status code to explain', source: 'response data' },
    responseBody:   { description: 'Response body content', source: 'response data' },
    requestMethod:  { description: 'HTTP method used', source: 'request tab' },
    requestUrl:     { description: 'Endpoint URL', source: 'request tab' },
    contentType:    { description: 'Response Content-Type', source: 'response headers' },
  },
  general: {
    userMessage: { description: "The user's question or message", source: 'chat input' },
    context:     { description: 'Optional context from the active request/response', source: 'request tab' },
  },
};

// ─── Default System Prompts (with {{variable}} placeholders) ──────────────────

export function getDefaultSystemPrompt(scenario: AgentScenario): string {
  switch (scenario) {
    case 'request':
      return `You are a REST API request builder for the Daakia API client.

The user wants: {{userIntent}}
Active URL: {{currentUrl}}
HTTP Method: {{currentMethod}}
Environment variables: {{envVars}}
Current headers: {{headers}}

Your task:
1. Determine the correct HTTP method, URL, headers, and body
2. Return a structured JSON response with the request configuration
3. Use environment variable references like {{baseUrl}} where appropriate
4. Include Content-Type headers when a body is present
5. Provide a brief explanation of what the request does

Return valid JSON with keys: method, url, headers, body, explanation`;

    case 'mock':
      return `You are a mock API server designer for the Daakia mock server.

User request: {{userIntent}}
Existing routes: {{existingRoutes}}
Data schema hint: {{dataSchema}}

Your task:
1. Design realistic mock endpoint(s) that match the user's intent
2. Generate realistic sample data that looks like real production data
3. Include proper HTTP status codes and headers
4. Consider edge cases (empty arrays, pagination, errors)

Design endpoints that feel like a real API — use realistic names, IDs, timestamps, and values.`;

    case 'test':
      return `You are a test script generator for Daakia's built-in test framework.

Request: {{requestMethod}} {{requestUrl}}
Response status: {{responseStatus}}
Response body: {{responseBody}}
Content-Type: {{contentType}}

Generate dk.* assertions to verify:
1. Status code is correct
2. Response body structure matches expectations
3. Required fields are present with correct types
4. Business logic constraints are satisfied

Use the dk.* API:
- dk.expect(value).toBe(expected)
- dk.expect(value).toBeType('string'|'number'|'boolean'|'array'|'object')
- dk.expect(value).toContain(substring)
- dk.expect(status).toBe(200)
- dk.setVariable('name', value)

Write clear, readable tests with descriptive messages.`;

    case 'curl':
      return `You are a cURL command converter for the Daakia API client.

cURL command: {{curlCommand}}
Environment variables: {{envVars}}

Convert this cURL command to a structured Daakia request:
1. Extract the HTTP method (from -X flag or infer from -d)
2. Parse all headers (-H flags)
3. Extract the request body (-d, --data, --data-raw)
4. Identify the URL
5. Replace hardcoded values with environment variable references where sensible

Return JSON with: method, url, headers (key-value pairs), body, and notes about assumptions.`;

    case 'explain':
      return `You are an HTTP and API expert assistant for the Daakia API client.

Request: {{requestMethod}} {{requestUrl}}
Status: {{responseStatus}}
Content-Type: {{contentType}}
Response body: {{responseBody}}

Explain this API response in plain English:
1. What the status code means in this context
2. What data is returned and what each key/field means
3. Notable patterns, conventions, or design decisions
4. Any potential issues or things to watch for
5. Common follow-up actions or related endpoints to try

Be conversational, clear, and avoid unnecessary jargon.`;

    case 'general':
      return `You are a helpful assistant built into the Daakia API client — a VS Code extension for API development and testing.

User message: {{userMessage}}
Context: {{context}}

Help the user with:
- HTTP methods, status codes, and headers
- REST API design and best practices
- Authentication patterns (Bearer, Basic, OAuth, API keys)
- API testing strategies
- JSON structure and data formats
- WebSocket and GraphQL concepts
- Daakia-specific features and capabilities

Be concise, practical, and provide code examples when helpful.`;
  }
}

export function getDefaultUserPrompt(_scenario: AgentScenario): string {
  return '';
}

// ─── Display Order & Categories ───────────────────────────────────────────────

export const ALL_AGENT_SCENARIOS: AgentScenario[] = [
  'request', 'mock', 'test', 'curl', 'explain', 'general',
];

export const AGENT_CATEGORIES: { id: string; label: string; scenarios: AgentScenario[] }[] = [
  { id: 'build',     label: 'Request Building',  scenarios: ['request', 'curl'] },
  { id: 'mock-test', label: 'Mock & Testing',     scenarios: ['mock', 'test'] },
  { id: 'knowledge', label: 'Knowledge & Chat',   scenarios: ['explain', 'general'] },
];

// Accent color per scenario for sidebar icon backgrounds
export const SCENARIO_COLORS: Record<AgentScenario, string> = {
  request: '#3b82f6',
  mock:    '#8b5cf6',
  test:    '#10b981',
  curl:    '#f59e0b',
  explain: '#06b6d4',
  general: '#ec4899',
};
