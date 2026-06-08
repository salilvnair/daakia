/**
 * prompt-template.ts — Single source of truth for ALL AI prompts in Daakia.
 *
 * Contains:
 *   1. Agent scenario prompts (system + user, {{variable}} placeholders)
 *   2. AI action templates  (Ask AI Why, Explain, Follow-up, Mock Generate, Header Suggest)
 *   3. Zustand store for template persistence + DB sync
 *
 * Pattern mirrors: dmcr_copilot/src/forms/llm/prompts/prompt-template.ts
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Agent Prompts
// ═══════════════════════════════════════════════════════════════════════════════

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

// ─── Default System Prompts ───────────────────────────────────────────────────

export function getDefaultSystemPrompt(scenario: AgentScenario): string {
  switch (scenario) {
    case 'request':
      return `You are a REST API request builder for the Daakia API client.\n\nThe user wants: {{userIntent}}\nActive URL: {{currentUrl}}\nHTTP Method: {{currentMethod}}\nEnvironment variables: {{envVars}}\nCurrent headers: {{headers}}\n\nYour task:\n1. Determine the correct HTTP method, URL, headers, and body\n2. Return a structured JSON response with the request configuration\n3. Use environment variable references like {{baseUrl}} where appropriate\n4. Include Content-Type headers when a body is present\n5. Provide a brief explanation of what the request does\n\nReturn valid JSON with keys: method, url, headers, body, explanation`;
    case 'mock':
      return `You are a mock API server designer for the Daakia mock server.\n\nUser request: {{userIntent}}\nExisting routes: {{existingRoutes}}\nData schema hint: {{dataSchema}}\n\nYour task:\n1. Design realistic mock endpoint(s) that match the user's intent\n2. Generate realistic sample data that looks like real production data\n3. Include proper HTTP status codes and headers\n4. Consider edge cases (empty arrays, pagination, errors)\n\nDesign endpoints that feel like a real API — use realistic names, IDs, timestamps, and values.`;
    case 'test':
      return `You are a test script generator for Daakia's built-in test framework.\n\nRequest: {{requestMethod}} {{requestUrl}}\nResponse status: {{responseStatus}}\nResponse body: {{responseBody}}\nContent-Type: {{contentType}}\n\nGenerate dk.* assertions to verify:\n1. Status code is correct\n2. Response body structure matches expectations\n3. Required fields are present with correct types\n4. Business logic constraints are satisfied\n\nUse the dk.* API:\n- dk.expect(value).toBe(expected)\n- dk.expect(value).toBeType('string'|'number'|'boolean'|'array'|'object')\n- dk.expect(value).toContain(substring)\n- dk.expect(status).toBe(200)\n- dk.setVariable('name', value)\n\nWrite clear, readable tests with descriptive messages.`;
    case 'curl':
      return `You are a cURL command converter for the Daakia API client.\n\ncURL command: {{curlCommand}}\nEnvironment variables: {{envVars}}\n\nConvert this cURL command to a structured Daakia request:\n1. Extract the HTTP method (from -X flag or infer from -d)\n2. Parse all headers (-H flags)\n3. Extract the request body (-d, --data, --data-raw)\n4. Identify the URL\n5. Replace hardcoded values with environment variable references where sensible\n\nReturn JSON with: method, url, headers (key-value pairs), body, and notes about assumptions.`;
    case 'explain':
      return `You are an HTTP and API expert assistant for the Daakia API client.\n\nRequest: {{requestMethod}} {{requestUrl}}\nStatus: {{responseStatus}}\nContent-Type: {{contentType}}\nResponse body: {{responseBody}}\n\nExplain this API response in plain English:\n1. What the status code means in this context\n2. What data is returned and what each key/field means\n3. Notable patterns, conventions, or design decisions\n4. Any potential issues or things to watch for\n5. Common follow-up actions or related endpoints to try\n\nBe conversational, clear, and avoid unnecessary jargon.`;
    case 'general':
      return `You are a helpful assistant built into the Daakia API client — a VS Code extension for API development and testing.\n\nUser message: {{userMessage}}\nContext: {{context}}\n\nHelp the user with:\n- HTTP methods, status codes, and headers\n- REST API design and best practices\n- Authentication patterns (Bearer, Basic, OAuth, API keys)\n- API testing strategies\n- JSON structure and data formats\n- WebSocket and GraphQL concepts\n- Daakia-specific features and capabilities\n\nBe concise, practical, and provide code examples when helpful.`;
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

export const SCENARIO_COLORS: Record<AgentScenario, string> = {
  request: '#3b82f6',
  mock:    '#8b5cf6',
  test:    '#10b981',
  curl:    '#f59e0b',
  explain: '#06b6d4',
  general: '#ec4899',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — AI Action Templates
// ═══════════════════════════════════════════════════════════════════════════════
//
// Template keys, defaults, labels, variables, colors, categories, and the
// Zustand store for DB persistence. Shared variables:
//   {serverName}  — mock server name
//   {context}     — existing server config summary (description + routes)
//   {method}      — HTTP method
//   {url}         — request URL
//   {status}      — HTTP status code
//   {statusText}  — HTTP status text
//   {body}        — response body preview

// ─── Template keys ────────────────────────────────────────────────────────────

export type AiPromptTemplateKey =
  // ── Response & Diagnostics (user prompts) ──
  | 'askAiWhy'
  | 'explainWithAi'
  | 'followupWithAi'
  // ── Response & Diagnostics (system prompts) ──
  | 'askAiWhy.system'
  | 'explainWithAi.system'
  | 'followupWithAi.system'
  // ── Mock Server — User Prompts ──
  | 'mock.rest.generate'
  | 'mock.graphql.generate'
  | 'mock.grpc.generate'
  | 'mock.soap.generate'
  | 'mock.sse.generate'
  | 'mock.websocket.generate'
  | 'mock.socketio.generate'
  | 'mock.mqtt.generate'
  // ── Mock Server — System Prompts ──
  | 'mock.rest.system'
  | 'mock.graphql.system'
  | 'mock.grpc.system'
  | 'mock.soap.system'
  | 'mock.sse.system'
  | 'mock.websocket.system'
  | 'mock.socketio.system'
  | 'mock.mqtt.system'
  // ── REST — Headers Suggest ──
  | 'rest.headers.suggest.generate'
  | 'rest.headers.suggest.system'
  // ── REST — Body Generate ──
  | 'rest.body.generate'
  | 'rest.body.generate.system'
  // ── REST — Environment Extractor ──
  | 'rest.env.extract'
  | 'rest.env.extract.system'
  // ── Data Generator ──
  | 'data.generate'
  | 'data.generate.system'
  // ── Request Namer ──
  | 'rest.request.name'
  // ── Collection Organizer ──
  | 'rest.collection.organize'
  | 'rest.collection.organize.system'
  // ── cURL Explainer ─────────────────────────────────────────────────────────
  | 'rest.curl.explain'
  | 'rest.curl.explain.system'
  // ── Script Autocomplete ────────────────────────────────────────────────────
  | 'rest.script.autocomplete'
  | 'rest.script.autocomplete.system'
  // ── Contract Testing ───────────────────────────────────────────────────────
  | 'rest.contract.test'
  | 'rest.contract.test.system'
  // ── Response Diff ──────────────────────────────────────────────────────────
  | 'rest.response.diff'
  | 'rest.response.diff.system'
  // ── Schema Validator ───────────────────────────────────────────────────────
  | 'rest.schema.validate'
  | 'rest.schema.validate.system'
  // ── Code to Request ────────────────────────────────────────────────────────
  | 'rest.code.import'
  | 'rest.code.import.system'
  // ── Performance Insights ───────────────────────────────────────────────────
  | 'rest.performance.insights'
  | 'rest.performance.insights.system'
  // ── Natural Language Search ────────────────────────────────────────────────
  | 'rest.collection.search'
  | 'rest.collection.search.system'
  // ── Changelog Generator ────────────────────────────────────────────────────
  | 'rest.changelog.generate'
  | 'rest.changelog.generate.system'
  // ── API Flow Builder ───────────────────────────────────────────────────────
  | 'rest.api.flow'
  | 'rest.api.flow.system'
  // ── AI Agent Workflow ──────────────────────────────────────────────────────
  | 'rest.agent.workflow'
  | 'rest.agent.workflow.system';

// ─── Default templates ────────────────────────────────────────────────────────

export const AI_PROMPT_TEMPLATE_DEFAULTS: Record<AiPromptTemplateKey, string> = {
  // ── Response & Diagnostics — system prompts ───────────────────────────────
  'askAiWhy.system':
    `You are a precise HTTP error diagnosis assistant. Analyze the status code, response body, and request context to identify the root cause and provide actionable fix steps. Be concise and technical. Format with numbered steps.`,
  'explainWithAi.system':
    `You are a helpful API response explainer. Break down HTTP responses in plain, developer-friendly language — explain what data is returned, key field meanings, API patterns, and what to do next. Be clear, structured, and specific.`,
  'followupWithAi.system':
    `You are an API workflow assistant. Given an HTTP response, suggest the most useful follow-up API calls. Use real IDs, slugs, and cursor values from the response body. Be specific and immediately actionable — no placeholder values.`,
  // ── Response & Diagnostics — user prompts ─────────────────────────────────
  askAiWhy:
    `Explain why this HTTP request failed and how to fix it.\n\nMethod: {method}\nURL: {url}\nStatus: {status} {statusText}\nResponse: {body}\n\nProvide:\n1. Root cause of the error\n2. Step-by-step fix\n3. Example corrected request if applicable`,
  explainWithAi:
    `Explain this HTTP response in plain English.\n\nRequest: {method} {url}\nStatus: {status} {statusText}\nResponse body:\n{body}\n\nWalk through:\n1. What this response means — success, partial, or notable state\n2. What data is returned and what each key field represents\n3. Any notable API patterns, pagination, or conventions visible here\n4. Things to watch out for (rate limits, cursor expiry, missing fields)\n5. Logical next requests to make based on this response`,
  followupWithAi:
    `Based on this API response, suggest the most useful follow-up API calls.\n\nRequest: {method} {url}\nResponse body:\n{body}\n\nList 3-5 concrete follow-up requests:\n- HTTP method and exact endpoint path (use realistic IDs/values from the response body)\n- One-line explanation of what this request does and why it's useful\n- Any required headers or body fields for the follow-up\n\nBe specific — use real resource IDs, slugs, or cursor values from the response above.`,
  // ── Mock Server — User Prompts ────────────────────────────────────────────
  'mock.rest.generate':
    `Generate a realistic REST API mock for a server named "{serverName}".\n\nContext:\n{context}\n\nFirst, briefly describe what you're building — what domain is this, what are the key resources, and what does the overall API look like? Keep it to 2-3 conversational sentences, like you're explaining it to a teammate.\n\nThen output the routes as a JSON array in a \`\`\`routes code block:\n\n\`\`\`routes\n[\n  {\n    "method": "GET",\n    "path": "/example",\n    "statusCode": 200,\n    "name": "Short route name",\n    "description": "What this route does",\n    "body": { "key": "realistic value" }\n  }\n]\n\`\`\`\n\nRules:\n- method: GET POST PUT PATCH or DELETE\n- path: starts with / (use :id for dynamic segments, e.g. /users/:id)\n- statusCode: realistic HTTP code (200 201 204 400 404 etc)\n- body: flat JSON object (max 5 fields), real-looking values, never placeholder text\n- Generate up to 6 routes covering the core operations for this domain\n- The \`\`\`routes block must be 100% complete and valid parseable JSON — always close the array`,
  'mock.graphql.generate':
    `Generate a GraphQL SDL schema and mock operations for a server named "{serverName}".\n\n{context}\n\nProvide:\n1. A complete SDL schema with realistic types, queries, and mutations matching the server description above\n2. 3-5 mock operation responses in JSON format (matching the schema)\n\nUse realistic field names and data. No lorem ipsum. If a server description is provided above, base ALL types and operations on that domain — do not invent an unrelated schema.`,
  'mock.grpc.generate':
    `Generate gRPC service definitions for a mock server named "{serverName}".\n\n{context}\n\nProvide:\n1. Service name and 3-5 RPC methods (unary or streaming) matching the server description above\n2. Example JSON request/response for each method\n3. Brief description of each method's purpose\n\nUse realistic proto-style naming. No lorem ipsum. If a server description is provided above, base ALL services and methods on that domain.`,
  'mock.soap.generate':
    `Generate SOAP service operations for a mock server named "{serverName}".\n\n{context}\n\nProvide:\n1. Service name and 3-5 SOAP operations (SOAPAction) matching the server description above\n2. Example XML response body for each operation\n3. Brief description of each operation's purpose\n\nUse realistic SOAP/WSDL naming conventions. If a server description is provided above, base ALL operations on that domain.`,
  'mock.sse.generate':
    `Generate Server-Sent Events (SSE) configuration for a mock server named "{serverName}".\n\n{context}\n\nProvide:\n1. 3-5 SSE event types with realistic event names matching the server description above\n2. Example JSON data payload for each event\n3. Suggested interval (in milliseconds) for repeated events\n4. Brief description of what each event represents\n\nIf a server description is provided above, all event names and payloads must match that domain exactly.`,
  'mock.websocket.generate':
    `Generate WebSocket message handlers for a mock server named "{serverName}".\n\n{context}\n\nProvide:\n1. 3-5 message patterns (trigger → response) matching the server description above\n2. Example JSON for each request message and its response\n3. Brief description of each handler's purpose\n\nUse realistic event-driven naming. If a server description is provided above, base ALL handlers on that domain.`,
  'mock.socketio.generate':
    `Generate Socket.IO event definitions for a mock server named "{serverName}".\n\n{context}\n\nProvide:\n1. 3-5 Socket.IO events (client→server and server→client) matching the server description above\n2. Example JSON payload for each event\n3. Brief description of each event's purpose\n\nUse realistic Socket.IO naming conventions. If a server description is provided above, base ALL events on that domain.`,
  'mock.mqtt.generate':
    `Generate MQTT topic definitions for a mock server named "{serverName}".\n\n{context}\n\nProvide:\n1. 3-5 MQTT topics with realistic topic paths (e.g. sensors/temp/device1) matching the server description above\n2. Example JSON or text payload for each topic\n3. Suggested publish interval\n4. Brief description of each topic\n\nUse realistic IoT/MQTT naming conventions. If a server description is provided above, base ALL topics on that domain.`,
  // ── Mock Server — System Prompts ──────────────────────────────────────────
  'mock.rest.system':
    `You are a mock REST API generator with deep knowledge of real-world API design. You think like a senior backend engineer — you pick sensible resource names, use realistic IDs (UUIDs, slugs, domain-specific codes), generate real-looking timestamps and values, and make data that feels like it came from a production system.\n\nMANDATORY CONTEXT RULE: If the user prompt contains a "Server description" section, you MUST use that description as the PRIMARY context for ALL routes, resource names, and response bodies. The domain described there is non-negotiable — do not generate routes for an unrelated domain. If no description is given, pick a realistic domain based on the server name.\n\nWhen generating routes, lead with a brief genuine explanation of your design: what resources you're creating, why these endpoints, what the data model looks like. Be specific to the domain, not generic.\n\nCRITICAL OUTPUT RULES — follow strictly to avoid cut-off JSON:\n1. Generate at most 6 routes per call. If more are requested, generate 6 representative ones and note what was omitted.\n2. Keep each "body" object flat or at most one level deep — no deeply nested objects. Max 5 fields per body.\n3. The \`\`\`routes JSON block MUST be 100% complete and valid JSON before you finish responding. Never leave the array open.\n4. Every item needs "method", "path", "statusCode", "name", "description", and "body". Missing fields silently drop that route.\n5. Write descriptions in 10 words or fewer.`,
  'mock.graphql.system':
    `You are a mock GraphQL API generator. You design clear, idiomatic GraphQL schemas with realistic types and resolvers.\n\nMANDATORY CONTEXT RULE: If the user prompt contains a "Server description" section, you MUST use that description as the PRIMARY context for ALL types, queries, and mutations. The domain described there is non-negotiable — do not generate an unrelated schema. If no description is given, pick a realistic domain.\n\nRules:\n- Use camelCase for field names, PascalCase for types\n- Include at least one Query and one Mutation type\n- Use realistic scalar types (ID, String, Int, Boolean, Float)\n- Response JSON must match the schema shape exactly\n- Keep schemas concise — 3-5 types maximum\n- Always close SDL blocks and JSON completely before finishing\n\nCRITICAL OUTPUT RULES — follow strictly:\n1. Lead with a brief explanation of your design decisions.\n2. Output the SDL schema in a \`\`\`graphql_sdl code block.\n3. Output operations as a JSON array in a \`\`\`graphql_operations code block with this exact format:\n   [{"operationType":"query","operationName":"getUsers","response":"{\\"data\\":{\\"users\\":[]}}","statusCode":200}]\n4. Generate at most 6 operations. operationType must be "query", "mutation", or "subscription".\n5. The response field must be a JSON string (stringified). Keep it flat — max 5 fields.\n6. Both code blocks MUST be 100% complete before finishing. Never leave JSON open.`,
  'mock.grpc.system':
    `You are a mock gRPC service generator. You design clean proto-style service definitions with realistic request/response messages.\n\nMANDATORY CONTEXT RULE: If the user prompt contains a "Server description" section, you MUST use that description as the PRIMARY context for ALL service names, RPC methods, and message fields. The domain described there is non-negotiable — do not generate services for an unrelated domain. If no description is given, pick a realistic domain.\n\nRules:\n- Use PascalCase for service and message names, snake_case for field names\n- Generate 1-3 services with 2-4 RPC methods each (unary preferred)\n- Include both request and response message examples as JSON\n- Use realistic domain-appropriate field names and values\n- Keep message types flat — avoid deeply nested protos\n\nCRITICAL OUTPUT RULES — follow strictly:\n1. Lead with a brief explanation of your design decisions.\n2. Output services as a JSON array in a \`\`\`grpc_services code block with this exact format:\n   [{"service":"UserService","methods":[{"method":"GetUser","type":"unary","response":"{\\"id\\":\\"1\\",\\"name\\":\\"Alice\\"}"}]}]\n3. type must be one of: "unary", "server_streaming", "client_streaming", "bidi_streaming".\n4. Generate at most 3 services. The code block MUST be 100% complete before finishing.`,
  'mock.soap.system':
    `You are a mock SOAP service generator. You produce clean, standards-compliant SOAP 1.1 service definitions.\n\nMANDATORY CONTEXT RULE: If the user prompt contains a "Server description" section, you MUST use that description as the PRIMARY context for ALL service names and operations. The domain described there is non-negotiable — do not generate operations for an unrelated domain. If no description is given, pick a realistic domain.\n\nRules:\n- Use PascalCase for operation names and element names\n- Generate 1-2 services with 2-4 operations each\n- Include realistic XML response body examples\n- Use proper SOAP namespace conventions\n- Keep responses concise — 3-5 elements per response message\n\nCRITICAL OUTPUT RULES — follow strictly:\n1. Lead with a brief explanation of your design decisions.\n2. Output services as a JSON array in a \`\`\`soap_services code block with this exact format:\n   [{"service":"UserService","operations":[{"operation":"GetUser","soapAction":"/GetUser","response":"<GetUserResponse><UserId>1</UserId><UserName>Alice</UserName></GetUserResponse>"}]}]\n3. The response field contains the SOAP response XML body (inner elements only, no envelope).\n4. Generate at most 3 services. The code block MUST be 100% complete before finishing.`,
  'mock.sse.system':
    `You are a mock Server-Sent Events (SSE) generator. You design realistic event streams for real-time web applications.\n\nMANDATORY CONTEXT RULE: If the user prompt contains a "Server description" section, you MUST use that description as the PRIMARY context for ALL event names and payloads. The domain described there is non-negotiable — all events must make sense for that domain. If no description is given, pick a realistic domain.\n\nRules:\n- Generate 3-5 distinct event types with realistic event names\n- Use camelCase or kebab-case event names\n- JSON payloads should be flat and realistic (e.g. sensor readings, stock ticks, notifications)\n- Suggest realistic intervals (e.g. 1000ms for real-time data, 5000ms for status updates)\n- Each event should have a clear, specific purpose\n\nCRITICAL OUTPUT RULES — follow strictly:\n1. Lead with a brief explanation of your design decisions.\n2. Output events as a JSON array in a \`\`\`sse_events code block with this exact format:\n   [{"eventName":"userCreated","data":"{\\"id\\":\\"1\\",\\"name\\":\\"Alice\\"}","intervalMs":5000}]\n3. eventName should be camelCase. data must be a JSON string (stringified). intervalMs is milliseconds.\n4. Generate at most 6 events. The code block MUST be 100% complete before finishing.`,
  'mock.websocket.system':
    `You are a mock WebSocket server generator. You design realistic bidirectional message patterns for real-time applications.\n\nMANDATORY CONTEXT RULE: If the user prompt contains a "Server description" section, you MUST use that description as the PRIMARY context for ALL handler names, trigger messages, and response payloads. The domain described there is non-negotiable — all handlers must make sense for that domain. If no description is given, pick a realistic domain.\n\nRules:\n- Generate 3-5 distinct message handler patterns\n- Each pattern shows: trigger message → server response\n- Use realistic event-driven naming (e.g. "subscribe", "ping", "auth")\n- JSON payloads should be flat and concise\n- Include both client→server and server→client message shapes\n\nCRITICAL OUTPUT RULES — follow strictly:\n1. Lead with a brief explanation of your design decisions.\n2. Output handlers as a JSON array in a \`\`\`websocket_handlers code block with this exact format:\n   [{"type":"connect","name":"onConnect","matchPattern":"","response":"{\\"status\\":\\"connected\\"}"},{"type":"message","name":"onMessage","matchPattern":"ping","response":"{\\"status\\":\\"pong\\"}"},{"type":"disconnect","name":"onDisconnect","matchPattern":"","response":"{\\"status\\":\\"bye\\"}"}]\n3. type must be one of: "connect", "message", "disconnect".\n4. name is a short handler identifier. matchPattern is the message trigger (empty string for connect/disconnect).\n5. response must be a JSON string (stringified). Generate at most 5 handlers.\n6. The code block MUST be 100% complete before finishing. Never leave JSON open.`,
  'mock.socketio.system':
    `You are a mock Socket.IO server generator. You design realistic event-driven communication patterns.\n\nMANDATORY CONTEXT RULE: If the user prompt contains a "Server description" section, you MUST use that description as the PRIMARY context for ALL event names and payloads. The domain described there is non-negotiable — all events must make sense for that domain. If no description is given, pick a realistic domain.\n\nRules:\n- Generate 3-5 Socket.IO events\n- Clearly distinguish client-emitted vs server-emitted events\n- Use realistic event names following Socket.IO conventions\n- JSON payloads should be flat and practical\n- Include examples of acknowledgements where relevant\n\nCRITICAL OUTPUT RULES — follow strictly:\n1. Lead with a brief explanation of your design decisions.\n2. Output handlers as a JSON array in a \`\`\`sio_handlers code block with this exact format:\n   [{"listenEvent":"chat:message","emitEvent":"chat:reply","response":"{\\"text\\":\\"received\\"}","type":"message"}]\n3. type must be one of: "connection", "message", "disconnect".\n4. Generate at most 6 handlers. The code block MUST be 100% complete before finishing.`,
  'mock.mqtt.system':
    `You are a mock MQTT broker generator. You design realistic IoT and messaging topic hierarchies.\n\nMANDATORY CONTEXT RULE: If the user prompt contains a "Server description" section, you MUST use that description as the PRIMARY context for ALL topic paths and payloads. The domain described there is non-negotiable — all topics must make sense for that domain. If no description is given, pick a realistic IoT domain.\n\nRules:\n- Generate 3-5 MQTT topics with realistic hierarchical paths (e.g. devices/sensor01/temperature)\n- Payloads can be JSON or plain numeric values\n- Suggest realistic publish intervals (e.g. 1000ms for sensors, 30000ms for status)\n- Use lowercase with slashes for topic paths — no spaces\n- Keep JSON payloads to 2-4 fields\n\nCRITICAL OUTPUT RULES — follow strictly:\n1. Lead with a brief explanation of your design decisions.\n2. Output topics as a JSON array in a \`\`\`mqtt_topics code block with this exact format:\n   [{"topic":"devices/sensor01/temperature","payload":"{\\"value\\":23.5,\\"unit\\":\\"C\\"}","qos":0,"intervalMs":1000}]\n3. qos must be 0, 1, or 2. payload must be a JSON string (stringified). intervalMs is milliseconds.\n4. Generate at most 6 topics. The code block MUST be 100% complete before finishing.`,
  // ── REST — Headers Suggest ────────────────────────────────────────────────
  'rest.headers.suggest.generate':
    `Suggest HTTP request headers for this API call.\n\nRequest context:\n- Method: {method}\n- URL: {url}\n- Body Content-Type: {contentType}\n- Auth: {authType}\n- Headers already set: {existing}\n\nReturn ONLY a JSON array. No markdown, no explanation, no code fences. Example format:\n[{"key":"Accept","value":"application/json","reason":"Specify expected response format"},{"key":"X-Request-ID","value":"{{$random.uuid}}","reason":"Correlation ID for distributed tracing"}]\n\nRules:\n- Suggest 3 to 6 headers\n- Skip any header already in the "Headers already set" list\n- Skip Content-Type if it is already set or if method is GET/HEAD\n- Skip Authorization if auth is already configured\n- Tailor suggestions to the URL pattern and method (e.g. pagination headers for GET lists, idempotency keys for POST)\n- Use Daakia variable syntax {{$random.uuid}} for dynamic IDs\n- Keep reason to one short sentence`,
  'rest.headers.suggest.system':
    `You are a precise HTTP header suggestion assistant. Always return valid JSON arrays only — never explanatory text, never markdown fences, never partial output. If you cannot suggest headers, return an empty array [].`,
  // ── REST — Body Generate ──────────────────────────────────────────────────
  'rest.body.generate':
    `Generate a realistic HTTP request body for this API call.\n\nRequest context:\n- Method: {method}\n- URL: {url}\n- Content-Type: {contentType}\n- User description: {description}\n\nReturn ONLY the raw request body. No explanation, no markdown fences, no preamble.\n\nFormat rules by Content-Type:\n- application/json or json: Return a valid JSON object with realistic field names and values\n- application/xml or text/xml: Return a valid XML document\n- application/x-www-form-urlencoded: Return URL-encoded key=value pairs (e.g. name=Alice&age=30)\n- text/plain: Return plain text matching the description\n- Default (unknown): Return a JSON object\n\nField values must be realistic — use real-looking names, emails, UUIDs, timestamps, amounts. Never use "string", "number", "value" as values.`,
  'rest.body.generate.system':
    `You are a precise HTTP request body generator. Return only the raw body content — no explanation, no markdown code fences, no preamble text. Output must be valid and directly usable as a request body. Generate realistic, production-looking values.`,
  // ── Collection Organizer ──────────────────────────────────────────────────
  'rest.collection.organize':
    `Suggest a folder structure for this API collection.\n\nCollection: {collectionName}\n\nRequests (id | method | name | url):\n{requests}\n\nReturn ONLY a JSON object. No markdown, no explanation, no code fences.\n\nFormat:\n{"folders":[{"name":"FolderName","requestIds":["id1","id2"]}],"uncategorized":["id3"]}\n\nRules:\n- Group requests by REST resource (e.g. /users → "Users", /auth → "Auth", /products → "Products")\n- Each folder name should be a short noun phrase (2-3 words max), Title Case\n- Do NOT create a folder with only 1 request unless it's a well-known resource (Auth, Health, etc.)\n- Put requests that don't fit any group in "uncategorized" array\n- Use the exact request IDs provided — do not invent or modify them\n- Return at least 2 folders, at most 10 folders\n- All request IDs must appear exactly once (either in a folder or uncategorized)`,
  'rest.collection.organize.system':
    `You are a precise REST API collection organizer. Analyze URL patterns to group requests into logical folders. Return only valid JSON — never explanatory text, never markdown fences. Ensure every request ID appears exactly once in the output.`,
  // ── Request Namer ─────────────────────────────────────────────────────────
  'rest.request.name':
    `Suggest a short, descriptive name for this HTTP request.\n\nMethod: {method}\nURL: {url}\nBody preview: {bodyPreview}\n\nReturn ONLY the name — no quotes, no explanation, no punctuation at the end. Max 60 characters.\n\nGood examples:\n- "Create User"\n- "Get Order by ID"\n- "Update Product Price"\n- "Delete Session"\n- "Search Products"\n- "Refresh Access Token"\n\nRules:\n- Start with an action verb (Get, Create, Update, Delete, List, Search, Upload, Send, etc.)\n- Be specific about the resource and operation\n- Use title case\n- Do NOT include the HTTP method in the name (it's already shown in the UI)\n- Do NOT include the base URL or domain`,
  // ── Data Generator ───────────────────────────────────────────────────────
  'data.generate':
    `Generate {count} realistic test data records of type: {dataType}.\n\n{customDescription}\n\nOutput format: {format}\n\nRules:\n- Return ONLY the raw data — no explanation, no markdown fences\n- JSON array format: [{...}, {...}] — valid, complete JSON\n- CSV format: first row is headers, subsequent rows are data\n- All values must be realistic and production-looking:\n  - Names: diverse, international names\n  - Emails: realistic domains (gmail.com, outlook.com, company.com)\n  - Phone numbers: valid formats with country code\n  - Addresses: real street name patterns with city/state/zip\n  - UUIDs: proper v4 format (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)\n  - Dates: ISO 8601 format (2024-03-15T14:22:00Z)\n  - Credit cards: Luhn-valid FAKE numbers (start with 4111 for Visa test numbers)\n  - Prices/amounts: realistic decimal values\n- Never use placeholder text like "string", "example", "test", "foo"\n- Vary values realistically — not the same city for every record`,
  'data.generate.system':
    `You are a precise test data generator. Return only the raw data output — no explanation, no markdown code fences, no preamble. Output must be valid and directly usable. All values must look production-realistic. For credit cards always use well-known test numbers (Visa: 4111111111111111, MC: 5500005555555559).`,
  // ── Contract Testing ─────────────────────────────────────────────────────
  'rest.contract.test':
    `Generate a complete set of dk.* contract test assertions for this API response.\n\nEndpoint: {method} {url}\nStatus: {status}\nResponse body:\n\`\`\`json\n{responseBody}\n\`\`\`\n\n{schemaContext}\n\nGenerate a post-response test script using the dk.test() and dk.expect() API. Include:\n1. Status code assertion\n2. Response time assertion (< 2000ms)\n3. Field presence assertions for all required fields\n4. Type assertions for key fields\n5. Value/range assertions where appropriate\n6. Schema compliance if schema is provided\n\nReturn ONLY the JavaScript code — no explanation, no markdown fences.`,
  'rest.contract.test.system':
    `You are an expert API contract test generator. Generate concise, comprehensive dk.* test scripts for Daakia. Return ONLY valid JavaScript — no explanation, no code fences. Use dk.test(), dk.expect(), dk.response.json(), dk.response.status, dk.response.time. Keep each test atomic and descriptive.`,
  // ── Response Diff ────────────────────────────────────────────────────────
  'rest.response.diff':
    `Compare these two API responses and explain what changed.\n\nResponse A ({labelA}):\n\`\`\`json\n{responseA}\n\`\`\`\n\nResponse B ({labelB}):\n\`\`\`json\n{responseB}\n\`\`\`\n\nProvide a concise analysis:\n1. What fields were added or removed?\n2. What values changed significantly?\n3. What might have caused these changes?\n4. Are there any potential issues or regressions to watch for?`,
  'rest.response.diff.system':
    `You are an API response diff analyst. Compare two API responses and provide a clear, actionable analysis of what changed. Focus on semantic changes that matter to developers — not just structural diffs. Be concise and specific.`,
  // ── Schema Validator ─────────────────────────────────────────────────────
  'rest.schema.validate':
    `Validate this API response against the provided schema and explain any mismatches.\n\nEndpoint: {method} {url}\nStatus: {status}\nResponse body:\n\`\`\`json\n{responseBody}\n\`\`\`\n\nSchema / Spec:\n\`\`\`\n{schema}\n\`\`\`\n\nFor each field in the response:\n1. Does it match the schema type and format?\n2. Are required fields present?\n3. Are there unexpected extra fields?\n4. Are there value constraint violations?\n\nBe specific about which fields fail and why.`,
  'rest.schema.validate.system':
    `You are an API schema validation expert. Analyze API responses against JSON Schema or OpenAPI specs. Be precise about violations — specify field path, expected type/value, actual type/value. Provide actionable suggestions for fixing each violation.`,
  // ── Code to Request ──────────────────────────────────────────────────────
  'rest.code.import':
    `Extract a Daakia HTTP request configuration from this code snippet.\n\nCode:\n\`\`\`\n{code}\n\`\`\`\n\nExtract and return ONLY a JSON object with this exact structure:\n{\n  "method": "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS",\n  "url": "the full URL or template",\n  "headers": [{"key": "...", "value": "..."}],\n  "bodyMode": "raw|form-data|urlencoded|none",\n  "bodyRaw": "body content as string (if applicable)",\n  "bodyFormData": [{"key": "...", "value": "..."}],\n  "bodyUrlEncoded": [{"key": "...", "value": "..."}],\n  "name": "descriptive request name"\n}\n\nRules:\n- Detect fetch(), axios, requests, got, node-fetch, XMLHttpRequest\n- Preserve all headers\n- For JSON bodies: stringify as raw with Content-Type application/json\n- Return ONLY valid JSON — no explanation, no fences`,
  'rest.code.import.system':
    `You are an HTTP request extractor. Parse code written in any language (JavaScript fetch/axios, Python requests, curl, etc.) and extract the HTTP request configuration. Return ONLY valid JSON matching the specified schema. Never include explanation or markdown.`,
  // ── Performance Insights ─────────────────────────────────────────────────
  'rest.performance.insights':
    `Analyze these API request performance metrics and suggest optimizations.\n\nCollection: {collectionName}\nRun metrics:\n{metrics}\n\nProvide:\n1. Summary of overall performance (p50, p90, p99 response times)\n2. Slowest endpoints and likely causes\n3. Specific optimization suggestions (caching, pagination, field filtering, batching)\n4. Any suspicious patterns (timeouts, high variance, etc.)\n5. Priority order for fixes (most impactful first)`,
  'rest.performance.insights.system':
    `You are an API performance analyst. Analyze collection run metrics and provide actionable optimization recommendations. Be specific about which endpoints are slow, why they might be slow, and concrete suggestions to fix them.`,
  // ── Natural Language Search ──────────────────────────────────────────────
  'rest.collection.search':
    `Given these API requests, find the ones that best match this natural language query.\n\nQuery: {query}\n\nRequests (id | method | name | url):\n{requests}\n\nReturn ONLY a JSON array of request IDs that match, ordered by relevance (most relevant first). Max 10 results.\nFormat: ["id1", "id2", "id3"]\n\nRules:\n- Match by intent (e.g. "create order" matches POST /orders)\n- Match by name keywords\n- Match by URL path segments\n- Return [] if nothing matches`,
  'rest.collection.search.system':
    `You are a semantic API search engine. Match natural language queries to HTTP requests by understanding intent, not just keywords. Return only valid JSON arrays of IDs. Never include explanation.`,
  // ── Changelog Generator ──────────────────────────────────────────────────
  'rest.changelog.generate':
    `Compare these two versions of an API collection and generate a human-readable changelog.\n\nPrevious version:\n{previousCollection}\n\nCurrent version:\n{currentCollection}\n\nGenerate a structured changelog:\n## Breaking Changes\n- List removed endpoints or changed response schemas\n\n## New Endpoints\n- List new routes\n\n## Modified Endpoints\n- List changes to existing routes (new params, changed responses, etc.)\n\n## Removed Endpoints\n- List deleted routes\n\nKeep each item concise. Use endpoint names or paths.`,
  'rest.changelog.generate.system':
    `You are an API changelog expert. Compare collections and generate a clear, developer-friendly changelog. Use standard changelog conventions (Breaking Changes, New, Modified, Removed). Be specific about HTTP methods and paths.`,
  // ── API Flow Builder ─────────────────────────────────────────────────────
  'rest.api.flow':
    `Generate a step-by-step API request chain for this workflow.\n\nWorkflow: {description}\nBase URL: {baseUrl}\n\nReturn ONLY a JSON object with this structure:\n{\n  "name": "Workflow name (short, descriptive)",\n  "description": "One-line summary of the workflow",\n  "steps": [\n    {\n      "step": 1,\n      "name": "Step name",\n      "method": "GET|POST|PUT|PATCH|DELETE",\n      "url": "{{baseUrl}}/path",\n      "headers": [{"key": "Content-Type", "value": "application/json", "enabled": true}],\n      "bodyMode": "raw|none|form-data|x-www-form-urlencoded",\n      "bodyRaw": "JSON or text body string, empty string if not applicable",\n      "variableExtractions": [\n        {"variable": "variableName", "path": "$.field.path", "description": "What this variable stores"}\n      ],\n      "description": "What this step does and why"\n    }\n  ]\n}\n\nRules:\n- Use {{baseUrl}} for the base URL prefix\n- Use {{variableName}} in subsequent steps when referencing extracted values (e.g. {{authToken}}, {{userId}})\n- variableExtractions: use JSONPath ($.field) to specify where to extract values from the response\n- For auth flows: extract token in step 1, use {{token}} in Authorization header for steps 2+\n- For CRUD flows: extract created resource ID in POST step, use it in GET/PUT/DELETE steps\n- bodyRaw for JSON: stringify JSON object as a string\n- Return ONLY valid JSON — no explanation, no markdown fences`,
  'rest.api.flow.system':
    `You are an API workflow architect. Given a natural language description, generate a complete, ordered request chain that implements the workflow. Use chained variables ({{variableName}}) to pass data between steps. Always use JSONPath for variable extraction. Return ONLY valid JSON — never include markdown, explanations, or code fences.`,
  // ── AI Agent Workflow ────────────────────────────────────────────────────
  'rest.agent.workflow':
    `You are an AI testing agent. A collection of API requests was just executed. Analyze the results and provide actionable diagnostics.\n\nCollection: {collectionName}\nEnvironment: {environment}\n\nTest Results:\n{results}\n\nFor each FAILED request, diagnose the root cause and suggest a specific fix.\nFor PASSED requests, flag anything unusual (unexpected status codes, slow responses, suspicious patterns).\n\nFormat your response as:\n\n## Test Summary\n<Brief overall assessment — pass rate, critical issues, overall API health>\n\n## Failed Request Analysis\n<For each failure:>\n### {METHOD} {endpoint} — Status {statusCode}\n- **Root Cause**: <likely cause>\n- **Fix**: <specific, actionable fix — include example if helpful>\n- **Category**: Auth / Data / Server / Config / Network\n\n## Performance Notes\n<Note any requests that took over 2 seconds or had unusually large/small responses>\n\n## Recommendations\n<2–5 overall recommendations to improve test reliability, API design, or error handling>`,
  'rest.agent.workflow.system':
    `You are a senior API testing agent embedded in Daakia API Client. When given collection run results, analyze them as a QA expert would: diagnose failures with precision, suggest concrete fixes (with code examples when helpful), and flag performance or design concerns. Be concise but actionable. Use markdown for structure. Never hallucinate request details — only reference what's in the results.`,
  // ── Script Autocomplete ──────────────────────────────────────────────────
  'rest.script.autocomplete':
    `Complete the following JavaScript code snippet used in an API testing script.\n\nFull script context:\n\`\`\`javascript\n{surroundingCode}\n\`\`\`\n\nComplete starting from this cursor position (code up to cursor):\n\`\`\`javascript\n{codePrefix}\n\`\`\`\n\nAvailable dk.* API:\n{dkContext}\n\nReturn ONLY the completion text — the exact characters to insert at the cursor. Do NOT repeat the prefix. Do NOT wrap in code fences. Keep it to one line or a short logical block (max 5 lines). If nothing useful can be completed, return empty string.`,
  'rest.script.autocomplete.system':
    `You are an expert JavaScript inline autocomplete assistant for API testing scripts in Daakia. You complete code at the cursor position. Rules:\n1. Return ONLY the completion text — characters to insert at cursor, never repeat what's already there\n2. Keep suggestions short: one line or a compact logical block (max 5 lines)\n3. Prefer dk.* API calls when the context suggests checking response data or setting variables\n4. Understand common patterns: dk.response.json(), dk.expect(), dk.env.set(), dk.globals\n5. Never add markdown, backticks, or explanations — raw JavaScript only\n6. If nothing useful can be completed, return an empty string`,
  // ── cURL Explainer ───────────────────────────────────────────────────────
  'rest.curl.explain':
    `Explain this cURL command in plain English. Break it down component by component.\n\n\`\`\`\n{curlCommand}\n\`\`\`\n\nFor each part of the command (URL, method, headers, body, flags), write a short bullet point explaining what it does and why it matters. Use simple, non-technical language where possible. Start with a one-line summary of what the whole command does.`,
  'rest.curl.explain.system':
    `You are a cURL expert and API educator. When given a cURL command, return a clear, concise breakdown:\n1. One-line summary of what the command does\n2. Bullet list — one bullet per meaningful component (--request, --url, --header, --data, --user, --cert, etc.)\n3. For each bullet: component name in backticks, then a plain-English explanation\n4. Keep each explanation to 1-2 sentences max\n5. If you spot potential issues (missing auth, insecure flags, etc.) add a brief ⚠️ note at the end\nNever use jargon without explaining it. Format in plain text or minimal markdown.`,
  // ── REST — Environment Extractor ─────────────────────────────────────────
  'rest.env.extract':
    `Analyze these API collection requests and identify hardcoded values that should be environment variables.\n\nCollection: {collectionName}\nRequests:\n{requests}\n\nReturn ONLY a JSON array. No markdown, no explanation, no code fences. Each object has:\n- name: short camelCase variable name (e.g. baseUrl, apiKey, userId)\n- value: the actual hardcoded value found in the requests\n- reason: one sentence explaining what it is and why it should be a variable\n- occurrences: number of requests where this value appears\n\nExample:\n[{"name":"baseUrl","value":"https://api.example.com","reason":"Base URL repeated in every request endpoint","occurrences":8},{"name":"apiKey","value":"sk-abc123","reason":"API key hardcoded in Authorization header","occurrences":3}]\n\nRules:\n- Only suggest values that appear in multiple requests OR are sensitive (keys, tokens, passwords)\n- Base URL / hostname: always suggest if repeated\n- API keys, tokens, passwords: always suggest even if seen once\n- IDs or resource-specific values that appear only once: skip\n- Keep name concise — max 3 words camelCase\n- Keep reason to one short sentence`,
  'rest.env.extract.system':
    `You are a precise REST API environment variable extraction assistant. Analyze request URLs, headers, and body data to identify hardcoded values that should be parameterized as {{variables}}. Always return valid JSON arrays only — never explanatory text, never markdown fences, never partial output.`,
};

// ─── Labels for UI ────────────────────────────────────────────────────────────

export const AI_PROMPT_TEMPLATE_LABELS: Record<AiPromptTemplateKey, { label: string; description: string }> = {
  askAiWhy:               { label: 'Ask AI Why (Error Diagnosis)', description: 'Prompt used when "Ask AI why" is clicked on a failed HTTP response' },
  explainWithAi:          { label: 'Explain with AI',              description: 'Prompt used when "Explain" is clicked on a successful HTTP response' },
  followupWithAi:         { label: 'Follow-up with AI',            description: 'Prompt used when "Follow-up Requests" is clicked to suggest next API calls' },
  'askAiWhy.system':      { label: 'Ask AI Why — System',        description: 'Behavioral rules for the error diagnosis AI (tone, format, analysis depth)' },
  'explainWithAi.system': { label: 'Explain with AI — System',   description: 'Behavioral rules for the response explainer AI' },
  'followupWithAi.system':{ label: 'Follow-up with AI — System', description: 'Behavioral rules for the follow-up suggestions AI' },
  'mock.rest.generate':      { label: 'REST',       description: 'System + user prompts for REST API mock route generation' },
  'mock.graphql.generate':   { label: 'GraphQL',   description: 'System + user prompts for GraphQL schema + operation generation' },
  'mock.grpc.generate':      { label: 'gRPC',      description: 'System + user prompts for gRPC service definition generation' },
  'mock.soap.generate':      { label: 'SOAP',      description: 'System + user prompts for SOAP operation generation' },
  'mock.sse.generate':       { label: 'SSE',       description: 'System + user prompts for Server-Sent Events generation' },
  'mock.websocket.generate': { label: 'WebSocket', description: 'System + user prompts for WebSocket handler generation' },
  'mock.socketio.generate':  { label: 'Socket.IO', description: 'System + user prompts for Socket.IO event generation' },
  'mock.mqtt.generate':      { label: 'MQTT',      description: 'System + user prompts for MQTT topic generation' },
  'rest.headers.suggest.generate': { label: 'Suggest Headers',          description: 'User prompt sent when "Suggest headers" AI button is clicked on the Headers tab' },
  'rest.headers.suggest.system':   { label: 'Suggest Headers — System', description: 'Behavioral rules for the AI header suggestion assistant (format: JSON array only)' },
  'rest.body.generate':        { label: 'Generate Body',          description: 'User prompt sent when the ✨ AI body generate button is clicked in the Body tab' },
  'rest.body.generate.system': { label: 'Generate Body — System', description: 'Behavioral rules for the AI body generator (format: raw body only, no fences)' },
  'rest.env.extract':          { label: 'Extract Variables',          description: 'User prompt sent when "Extract Variables with AI" is chosen in the collection context menu' },
  'rest.env.extract.system':   { label: 'Extract Variables — System', description: 'Behavioral rules for the AI environment extractor (format: JSON array only)' },
  'data.generate':        { label: 'Generate Test Data',          description: 'User prompt sent when generating test data fixtures with AI' },
  'data.generate.system': { label: 'Generate Test Data — System', description: 'Behavioral rules for the AI data generator (format: raw JSON array only)' },
  'rest.request.name':    { label: 'Request Namer',              description: 'Prompt for AI-suggested request names in Save As modal' },
  'rest.collection.organize':        { label: 'Organize Collection',          description: 'Prompt for AI-suggested folder structure for flat collections' },
  'rest.collection.organize.system': { label: 'Organize Collection — System', description: 'Behavioral rules for the collection organizer (format: JSON only)' },
  'rest.curl.explain':               { label: 'cURL Explainer',                description: 'Prompt for AI-powered plain-English breakdown of cURL commands' },
  'rest.curl.explain.system':        { label: 'cURL Explainer — System',       description: 'Behavioral rules for the cURL explainer (component-by-component format)' },
  'rest.script.autocomplete':        { label: 'Script Autocomplete',           description: 'Prompt for AI inline code completion in pre/post-request script editors' },
  'rest.script.autocomplete.system': { label: 'Script Autocomplete — System',  description: 'Behavioral rules for AI script autocomplete (return completion text only)' },
  'rest.contract.test':        { label: 'Contract Test Generator',       description: 'Generates dk.* contract test assertions from response + schema' },
  'rest.contract.test.system': { label: 'Contract Test Generator — System', description: 'Behavioral rules for contract test generator (JavaScript only)' },
  'rest.response.diff':        { label: 'Response Diff Analyzer',        description: 'Explains what changed between two API responses' },
  'rest.response.diff.system': { label: 'Response Diff — System',        description: 'Behavioral rules for response diff analyzer' },
  'rest.schema.validate':        { label: 'Schema Validator',             description: 'Validates response against JSON Schema/OpenAPI spec and explains mismatches' },
  'rest.schema.validate.system': { label: 'Schema Validator — System',   description: 'Behavioral rules for schema validator' },
  'rest.code.import':        { label: 'Code to Request',                  description: 'Extracts HTTP request config from fetch/axios/requests code' },
  'rest.code.import.system': { label: 'Code to Request — System',        description: 'Behavioral rules for code importer (return JSON only)' },
  'rest.performance.insights':        { label: 'Performance Insights',   description: 'Analyzes collection run metrics and suggests optimizations' },
  'rest.performance.insights.system': { label: 'Performance Insights — System', description: 'Behavioral rules for performance analyst' },
  'rest.collection.search':        { label: 'Natural Language Search',    description: 'Finds requests matching a natural language query' },
  'rest.collection.search.system': { label: 'NL Search — System',        description: 'Behavioral rules for NL collection search (return JSON ID array only)' },
  'rest.changelog.generate':        { label: 'Changelog Generator',       description: 'Compares collection versions and generates human-readable changelog' },
  'rest.changelog.generate.system': { label: 'Changelog Generator — System', description: 'Behavioral rules for changelog generator' },
  'rest.api.flow':        { label: 'API Flow Builder',        description: 'Generates a chained request workflow from a natural language description' },
  'rest.api.flow.system': { label: 'API Flow Builder — System', description: 'Behavioral rules for API flow builder (JSON only, chained variables)' },
  'rest.agent.workflow':        { label: 'AI Agent Workflow',        description: 'Runs a collection, diagnoses failures, and suggests fixes' },
  'rest.agent.workflow.system': { label: 'AI Agent Workflow — System', description: 'Behavioral rules for the AI testing agent (diagnosis, fixes, recommendations)' },
  'mock.rest.system':        { label: 'REST — System',       description: 'AI behavioral rules for REST route generation (format, limits, JSON completeness)' },
  'mock.graphql.system':     { label: 'GraphQL — System',   description: 'AI behavioral rules for GraphQL schema generation' },
  'mock.grpc.system':        { label: 'gRPC — System',      description: 'AI behavioral rules for gRPC service definition generation' },
  'mock.soap.system':        { label: 'SOAP — System',      description: 'AI behavioral rules for SOAP operation generation' },
  'mock.sse.system':         { label: 'SSE — System',       description: 'AI behavioral rules for SSE event generation' },
  'mock.websocket.system':   { label: 'WebSocket — System', description: 'AI behavioral rules for WebSocket handler generation' },
  'mock.socketio.system':    { label: 'Socket.IO — System', description: 'AI behavioral rules for Socket.IO event generation' },
  'mock.mqtt.system':        { label: 'MQTT — System',      description: 'AI behavioral rules for MQTT topic generation' },
};

// ─── Variables available per template ────────────────────────────────────────

export const AI_PROMPT_TEMPLATE_VARIABLES: Record<AiPromptTemplateKey, string[]> = {
  askAiWhy:               ['{method}', '{url}', '{status}', '{statusText}', '{body}'],
  explainWithAi:          ['{method}', '{url}', '{status}', '{statusText}', '{body}'],
  followupWithAi:         ['{method}', '{url}', '{body}'],
  'askAiWhy.system':      [],
  'explainWithAi.system': [],
  'followupWithAi.system':[],
  'mock.rest.generate':      ['{serverName}', '{context}'],
  'mock.graphql.generate':   ['{serverName}', '{context}'],
  'mock.grpc.generate':      ['{serverName}', '{context}'],
  'mock.soap.generate':      ['{serverName}', '{context}'],
  'mock.sse.generate':       ['{serverName}', '{context}'],
  'mock.websocket.generate': ['{serverName}', '{context}'],
  'mock.socketio.generate':  ['{serverName}', '{context}'],
  'mock.mqtt.generate':      ['{serverName}', '{context}'],
  'rest.headers.suggest.generate': ['{method}', '{url}', '{contentType}', '{authType}', '{existing}'],
  'rest.headers.suggest.system':   [],
  'rest.body.generate':        ['{method}', '{url}', '{contentType}', '{description}'],
  'rest.body.generate.system': [],
  'rest.env.extract':          ['{collectionName}', '{requests}'],
  'rest.env.extract.system':   [],
  'data.generate':        ['{dataType}', '{count}', '{format}', '{customDescription}'],
  'data.generate.system': [],
  'rest.request.name':    ['{method}', '{url}', '{bodyPreview}'],
  'rest.collection.organize':        ['{collectionName}', '{requests}'],
  'rest.collection.organize.system': [],
  'rest.curl.explain':               ['{curlCommand}'],
  'rest.curl.explain.system':        [],
  'rest.script.autocomplete':        ['{codePrefix}', '{surroundingCode}', '{dkContext}'],
  'rest.script.autocomplete.system': [],
  'rest.contract.test':        ['{method}', '{url}', '{status}', '{responseBody}', '{schemaContext}'],
  'rest.contract.test.system': [],
  'rest.response.diff':        ['{labelA}', '{responseA}', '{labelB}', '{responseB}'],
  'rest.response.diff.system': [],
  'rest.schema.validate':        ['{method}', '{url}', '{status}', '{responseBody}', '{schema}'],
  'rest.schema.validate.system': [],
  'rest.code.import':        ['{code}'],
  'rest.code.import.system': [],
  'rest.performance.insights':        ['{collectionName}', '{metrics}'],
  'rest.performance.insights.system': [],
  'rest.collection.search':        ['{query}', '{requests}'],
  'rest.collection.search.system': [],
  'rest.changelog.generate':        ['{previousCollection}', '{currentCollection}'],
  'rest.changelog.generate.system': [],
  'rest.api.flow':        ['{description}', '{baseUrl}'],
  'rest.api.flow.system': [],
  'rest.agent.workflow':        ['{collectionName}', '{environment}', '{results}'],
  'rest.agent.workflow.system': [],
  'mock.rest.system':        [],
  'mock.graphql.system':     [],
  'mock.grpc.system':        [],
  'mock.soap.system':        [],
  'mock.sse.system':         [],
  'mock.websocket.system':   [],
  'mock.socketio.system':    [],
  'mock.mqtt.system':        [],
};

// ─── Prompt Library sidebar categories ───────────────────────────────────────
//
// kind: 'template' — single-tab editor (legacy; no current categories use this)
// kind: 'mock'     — dual-tab editor (System + User, like agents)
//                    key = user-prompt key; system key = toSystemKey(key)
// Note: system keys are NOT listed here — storage-only, exposed via the System tab.

export const AI_TEMPLATE_CATEGORIES: {
  id: string;
  label: string;
  kind: 'template' | 'mock';
  keys: AiPromptTemplateKey[];
}[] = [
  {
    id: 'diagnostics',
    label: 'Response & Diagnostics',
    kind: 'mock',   // dual-tab: System + User — identical to Agent prompts layout
    keys: ['askAiWhy', 'explainWithAi', 'followupWithAi'],
  },
  {
    id: 'mock-generate',
    label: 'Mock Server — Generate',
    kind: 'mock',
    keys: [
      'mock.rest.generate', 'mock.graphql.generate', 'mock.grpc.generate',
      'mock.soap.generate', 'mock.sse.generate', 'mock.websocket.generate',
      'mock.socketio.generate', 'mock.mqtt.generate',
    ],
  },
  {
    id: 'headers-suggest',
    label: 'REST — Headers',
    kind: 'mock',
    keys: ['rest.headers.suggest.generate'],
  },
  {
    id: 'body-generate',
    label: 'REST — Body',
    kind: 'mock',
    keys: ['rest.body.generate'],
  },
  {
    id: 'env-extract',
    label: 'REST — Env Extractor',
    kind: 'mock',
    keys: ['rest.env.extract'],
  },
  {
    id: 'data-generate',
    label: 'Data Generator',
    kind: 'mock',
    keys: ['data.generate'],
  },
  {
    id: 'collection-organize',
    label: 'Collection Organizer',
    kind: 'mock',
    keys: ['rest.collection.organize'],
  },
  {
    id: 'curl-explain',
    label: 'cURL Explainer',
    kind: 'mock',
    keys: ['rest.curl.explain'],
  },
  {
    id: 'script-autocomplete',
    label: 'Script Autocomplete',
    kind: 'mock',
    keys: ['rest.script.autocomplete'],
  },
  {
    id: 'contract-test',
    label: 'Contract Test Generator',
    kind: 'mock',
    keys: ['rest.contract.test'],
  },
  {
    id: 'response-diff',
    label: 'Response Diff Analyzer',
    kind: 'mock',
    keys: ['rest.response.diff'],
  },
  {
    id: 'schema-validate',
    label: 'Schema Validator',
    kind: 'mock',
    keys: ['rest.schema.validate'],
  },
  {
    id: 'code-import',
    label: 'Code to Request',
    kind: 'mock',
    keys: ['rest.code.import'],
  },
  {
    id: 'performance-insights',
    label: 'Performance Insights',
    kind: 'mock',
    keys: ['rest.performance.insights'],
  },
  {
    id: 'collection-search',
    label: 'NL Collection Search',
    kind: 'mock',
    keys: ['rest.collection.search'],
  },
  {
    id: 'changelog-generate',
    label: 'Changelog Generator',
    kind: 'mock',
    keys: ['rest.changelog.generate'],
  },
  {
    id: 'api-flow-builder',
    label: 'API Flow Builder',
    kind: 'mock',
    keys: ['rest.api.flow'],
  },
  {
    id: 'agent-workflow',
    label: 'AI Agent Workflow',
    kind: 'mock',
    keys: ['rest.agent.workflow'],
  },
];

export const AI_TEMPLATE_COLORS: Record<AiPromptTemplateKey, string> = {
  askAiWhy:               '#ef4444',
  explainWithAi:          '#06b6d4',
  followupWithAi:         '#10b981',
  'askAiWhy.system':      '#ef4444',
  'explainWithAi.system': '#06b6d4',
  'followupWithAi.system':'#10b981',
  'mock.rest.generate':      '#3b82f6',
  'mock.graphql.generate':   '#ec4899',
  'mock.grpc.generate':      '#f97316',
  'mock.soap.generate':      '#8b5cf6',
  'mock.sse.generate':       '#10b981',
  'mock.websocket.generate':  '#f59e0b',
  'mock.socketio.generate':   '#ef4444',
  'mock.mqtt.generate':      '#06b6d4',
  'rest.headers.suggest.generate': '#a855f7',
  'rest.headers.suggest.system':   '#a855f7',
  'rest.body.generate':        '#f59e0b',
  'rest.body.generate.system': '#f59e0b',
  'rest.env.extract':          '#22c55e',
  'rest.env.extract.system':   '#22c55e',
  'data.generate':        '#0ea5e9',
  'data.generate.system': '#0ea5e9',
  'rest.request.name':    '#a855f7',
  'rest.collection.organize':        '#f97316',
  'rest.collection.organize.system': '#f97316',
  'rest.curl.explain':               '#06b6d4',
  'rest.curl.explain.system':        '#06b6d4',
  'rest.script.autocomplete':        '#a78bfa',
  'rest.script.autocomplete.system': '#a78bfa',
  'rest.contract.test':        '#10b981',
  'rest.contract.test.system': '#10b981',
  'rest.response.diff':        '#f59e0b',
  'rest.response.diff.system': '#f59e0b',
  'rest.schema.validate':        '#06b6d4',
  'rest.schema.validate.system': '#06b6d4',
  'rest.code.import':        '#8b5cf6',
  'rest.code.import.system': '#8b5cf6',
  'rest.performance.insights':        '#ef4444',
  'rest.performance.insights.system': '#ef4444',
  'rest.collection.search':        '#3b82f6',
  'rest.collection.search.system': '#3b82f6',
  'rest.changelog.generate':        '#f97316',
  'rest.changelog.generate.system': '#f97316',
  'rest.api.flow':        '#8b5cf6',
  'rest.api.flow.system': '#8b5cf6',
  'rest.agent.workflow':        '#10b981',
  'rest.agent.workflow.system': '#10b981',
  'mock.rest.system':        '#3b82f6',
  'mock.graphql.system':     '#ec4899',
  'mock.grpc.system':        '#f97316',
  'mock.soap.system':        '#8b5cf6',
  'mock.sse.system':         '#10b981',
  'mock.websocket.system':   '#f59e0b',
  'mock.socketio.system':    '#ef4444',
  'mock.mqtt.system':        '#06b6d4',
};

// ─── Interpolation helper ─────────────────────────────────────────────────────

export function interpolateTemplate(
  template: string,
  vars: Partial<Record<string, string>>,
): string {
  return template.replace(/\{(\w+(?:\.\w+)*)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Zustand Store
// ═══════════════════════════════════════════════════════════════════════════════

export type AiPromptTemplates = Record<AiPromptTemplateKey, string>;

interface AiPromptTemplatesState {
  templates: AiPromptTemplates;
  loaded: boolean;
  setTemplates: (templates: AiPromptTemplates) => void;
  setTemplate: (key: AiPromptTemplateKey, value: string) => void;
  resetTemplate: (key: AiPromptTemplateKey) => void;
  loadTemplates: () => void;
  /** Resolve a template with variables substituted */
  resolve: (key: AiPromptTemplateKey, vars?: Partial<Record<string, string>>) => string;
}

function persistTemplates(templates: AiPromptTemplates) {
  postMsg({ type: 'aiPromptTemplates:save', templates });
}

export const useAiPromptTemplatesStore = create<AiPromptTemplatesState>((set, get) => ({
  templates: { ...AI_PROMPT_TEMPLATE_DEFAULTS },
  loaded: false,

  setTemplates: (templates) => set({ templates, loaded: true }),

  setTemplate: (key, value) => {
    const next = { ...get().templates, [key]: value };
    set({ templates: next });
    persistTemplates(next);
  },

  resetTemplate: (key) => {
    const next = { ...get().templates, [key]: AI_PROMPT_TEMPLATE_DEFAULTS[key] };
    set({ templates: next });
    persistTemplates(next);
  },

  loadTemplates: () => {
    postMsg({ type: 'aiPromptTemplates:load' });
  },

  resolve: (key, vars = {}) => {
    const template = get().templates[key] ?? AI_PROMPT_TEMPLATE_DEFAULTS[key] ?? '';
    return interpolateTemplate(template, vars);
  },
}));
