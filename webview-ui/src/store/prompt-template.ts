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
  | 'rest.headers.suggest.system';

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
