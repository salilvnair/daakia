/**
 * AI Prompt Templates Store — user-editable prompt templates for all AI actions.
 *
 * Templates are persisted to SQLite via the extension host.
 * Each template supports {placeholder} variables resolved at runtime.
 *
 * Source of truth for ALL AI prompt defaults (user prompts + system prompts).
 * The Prompt Library Settings tab lets users override any template; DB value
 * takes precedence, falling back to the defaults defined here.
 *
 * Shared variables across templates:
 *   {serverName}  — mock server name
 *   {context}     — existing server config summary (description + routes)
 *   {method}      — HTTP method
 *   {url}         — request URL
 *   {status}      — HTTP status code
 *   {statusText}  — HTTP status text
 *   {body}        — response body preview
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

// ─── Template keys ────────────────────────────────────────────────────────────

export type AiPromptTemplateKey =
  // ── Response & Diagnostics (user prompts) ──
  | 'askAiWhy'
  | 'explainWithAi'
  | 'followupWithAi'
  // ── Mock Server — User Prompts (what context gets injected per protocol) ──
  | 'mock.rest.generate'
  | 'mock.graphql.generate'
  | 'mock.grpc.generate'
  | 'mock.soap.generate'
  | 'mock.sse.generate'
  | 'mock.websocket.generate'
  | 'mock.socketio.generate'
  | 'mock.mqtt.generate'
  // ── Mock Server — System Prompts (behavioral rules sent as system message) ──
  | 'mock.rest.system'
  | 'mock.graphql.system'
  | 'mock.grpc.system'
  | 'mock.soap.system'
  | 'mock.sse.system'
  | 'mock.websocket.system'
  | 'mock.socketio.system'
  | 'mock.mqtt.system';

// ─── Default templates ────────────────────────────────────────────────────────

export const AI_PROMPT_TEMPLATE_DEFAULTS: Record<AiPromptTemplateKey, string> = {
  // ── Response & Diagnostics ────────────────────────────────────────────────
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
};

// ─── Labels for UI ────────────────────────────────────────────────────────────

export const AI_PROMPT_TEMPLATE_LABELS: Record<AiPromptTemplateKey, { label: string; description: string }> = {
  askAiWhy:               { label: 'Ask AI Why (Error Diagnosis)', description: 'Prompt used when "Ask AI why" is clicked on a failed HTTP response' },
  explainWithAi:          { label: 'Explain with AI',              description: 'Prompt used when "Explain" is clicked on a successful HTTP response' },
  followupWithAi:         { label: 'Follow-up with AI',            description: 'Prompt used when "Follow-up Requests" is clicked to suggest next API calls' },
  // Mock generate — shown as dual-tab (System + User) in Prompt Library
  'mock.rest.generate':      { label: 'REST',       description: 'System + user prompts for REST API mock route generation' },
  'mock.graphql.generate':   { label: 'GraphQL',   description: 'System + user prompts for GraphQL schema + operation generation' },
  'mock.grpc.generate':      { label: 'gRPC',      description: 'System + user prompts for gRPC service definition generation' },
  'mock.soap.generate':      { label: 'SOAP',      description: 'System + user prompts for SOAP operation generation' },
  'mock.sse.generate':       { label: 'SSE',       description: 'System + user prompts for Server-Sent Events generation' },
  'mock.websocket.generate': { label: 'WebSocket', description: 'System + user prompts for WebSocket handler generation' },
  'mock.socketio.generate':  { label: 'Socket.IO', description: 'System + user prompts for Socket.IO event generation' },
  'mock.mqtt.generate':      { label: 'MQTT',      description: 'System + user prompts for MQTT topic generation' },
  // System prompt keys — storage-only, exposed via the "System" tab when a mock entry is selected
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
  // User prompts — have runtime variables
  'mock.rest.generate':      ['{serverName}', '{context}'],
  'mock.graphql.generate':   ['{serverName}', '{context}'],
  'mock.grpc.generate':      ['{serverName}', '{context}'],
  'mock.soap.generate':      ['{serverName}', '{context}'],
  'mock.sse.generate':       ['{serverName}', '{context}'],
  'mock.websocket.generate': ['{serverName}', '{context}'],
  'mock.socketio.generate':  ['{serverName}', '{context}'],
  'mock.mqtt.generate':      ['{serverName}', '{context}'],
  // System prompts — no runtime variables (pure behavioral instructions)
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
// kind: 'template' — single-tab editor (template text only)
// kind: 'mock'     — dual-tab editor (System + User, like agents)
//                    key is the .generate key; system key = key.replace('.generate', '.system')
// Note: mock.[protocol].system keys are NOT listed here — they are storage-only,
// exposed through the System tab when a mock-generate item is selected.

export const AI_TEMPLATE_CATEGORIES: {
  id: string;
  label: string;
  kind: 'template' | 'mock';
  keys: AiPromptTemplateKey[];
}[] = [
  {
    id: 'diagnostics',
    label: 'Response & Diagnostics',
    kind: 'template',
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
];

export const AI_TEMPLATE_COLORS: Record<AiPromptTemplateKey, string> = {
  askAiWhy:               '#ef4444',
  explainWithAi:          '#06b6d4',
  followupWithAi:         '#10b981',
  // User prompts
  'mock.rest.generate':      '#3b82f6',
  'mock.graphql.generate':   '#ec4899',
  'mock.grpc.generate':      '#f97316',
  'mock.soap.generate':      '#8b5cf6',
  'mock.sse.generate':       '#10b981',
  'mock.websocket.generate':  '#f59e0b',
  'mock.socketio.generate':   '#ef4444',
  'mock.mqtt.generate':      '#06b6d4',
  // System prompts — same hue as user prompts but distinct shade (alpha badge)
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

// ─── Store ────────────────────────────────────────────────────────────────────

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

function persist(templates: AiPromptTemplates) {
  postMsg({ type: 'aiPromptTemplates:save', templates });
}

export const useAiPromptTemplatesStore = create<AiPromptTemplatesState>((set, get) => ({
  templates: { ...AI_PROMPT_TEMPLATE_DEFAULTS },
  loaded: false,

  setTemplates: (templates) => set({ templates, loaded: true }),

  setTemplate: (key, value) => {
    const next = { ...get().templates, [key]: value };
    set({ templates: next });
    persist(next);
  },

  resetTemplate: (key) => {
    const next = { ...get().templates, [key]: AI_PROMPT_TEMPLATE_DEFAULTS[key] };
    set({ templates: next });
    persist(next);
  },

  loadTemplates: () => {
    postMsg({ type: 'aiPromptTemplates:load' });
  },

  resolve: (key, vars = {}) => {
    const template = get().templates[key] ?? AI_PROMPT_TEMPLATE_DEFAULTS[key] ?? '';
    return interpolateTemplate(template, vars);
  },
}));
