/**
 * AI Prompt Templates Store — user-editable prompt templates for all AI actions.
 *
 * Templates are persisted to SQLite via the extension host.
 * Each template supports {placeholder} variables resolved at runtime.
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
  | 'askAiWhy'
  | 'explainWithAi'
  | 'followupWithAi'
  | 'mock.rest.generate'
  | 'mock.graphql.generate'
  | 'mock.grpc.generate'
  | 'mock.soap.generate'
  | 'mock.sse.generate'
  | 'mock.websocket.generate'
  | 'mock.socketio.generate'
  | 'mock.mqtt.generate';

// ─── Default templates ────────────────────────────────────────────────────────

export const AI_PROMPT_TEMPLATE_DEFAULTS: Record<AiPromptTemplateKey, string> = {
  askAiWhy:
    `Explain why this HTTP request failed and how to fix it.\n\nMethod: {method}\nURL: {url}\nStatus: {status} {statusText}\nResponse: {body}\n\nProvide:\n1. Root cause of the error\n2. Step-by-step fix\n3. Example corrected request if applicable`,

  explainWithAi:
    `Explain this HTTP response in plain English.\n\nRequest: {method} {url}\nStatus: {status} {statusText}\nResponse body:\n{body}\n\nWalk through:\n1. What this response means — success, partial, or notable state\n2. What data is returned and what each key field represents\n3. Any notable API patterns, pagination, or conventions visible here\n4. Things to watch out for (rate limits, cursor expiry, missing fields)\n5. Logical next requests to make based on this response`,

  followupWithAi:
    `Based on this API response, suggest the most useful follow-up API calls.\n\nRequest: {method} {url}\nResponse body:\n{body}\n\nList 3-5 concrete follow-up requests:\n- HTTP method and exact endpoint path (use realistic IDs/values from the response body)\n- One-line explanation of what this request does and why it's useful\n- Any required headers or body fields for the follow-up\n\nBe specific — use real resource IDs, slugs, or cursor values from the response above.`,

  'mock.rest.generate':
    `Generate a realistic REST API mock for a server named "{serverName}".\n\nContext:\n{context}\n\nFirst, briefly describe what you're building — what domain is this, what are the key resources, and what does the overall API look like? Keep it to 2-3 conversational sentences, like you're explaining it to a teammate.\n\nThen output the routes as a JSON array in a \`\`\`routes code block:\n\n\`\`\`routes\n[\n  {\n    "method": "GET",\n    "path": "/example",\n    "statusCode": 200,\n    "name": "Short route name",\n    "description": "What this route does",\n    "body": { "key": "realistic value" }\n  }\n]\n\`\`\`\n\nRules:\n- method: GET POST PUT PATCH or DELETE\n- path: starts with / (use :id for dynamic segments, e.g. /users/:id)\n- statusCode: realistic HTTP code (200 201 204 400 404 etc)\n- body: flat JSON object (max 5 fields), real-looking values, never placeholder text\n- Generate up to 6 routes covering the core operations for this domain\n- The \`\`\`routes block must be 100% complete and valid parseable JSON — always close the array`,

  'mock.graphql.generate':
    `Generate a GraphQL SDL schema and mock operations for a server named "{serverName}".\n\nProvide:\n1. A complete SDL schema with realistic types, queries, and mutations\n2. 3-5 mock operation responses in JSON format (matching the schema)\n\nUse realistic field names and data. No lorem ipsum.\n\nExisting schema:\n{context}`,

  'mock.grpc.generate':
    `Generate gRPC service definitions for a mock server named "{serverName}".\n\nProvide:\n1. Service name and 3-5 RPC methods (unary or streaming)\n2. Example JSON request/response for each method\n3. Brief description of each method's purpose\n\nUse realistic proto-style naming. No lorem ipsum.\n\nExisting services:\n{context}`,

  'mock.soap.generate':
    `Generate SOAP service operations for a mock server named "{serverName}".\n\nProvide:\n1. Service name and 3-5 SOAP operations (SOAPAction)\n2. Example XML response body for each operation\n3. Brief description of each operation's purpose\n\nUse realistic SOAP/WSDL naming conventions.\n\nExisting operations:\n{context}`,

  'mock.sse.generate':
    `Generate Server-Sent Events (SSE) configuration for a mock server named "{serverName}".\n\nProvide:\n1. 3-5 SSE event types with realistic event names\n2. Example JSON data payload for each event\n3. Suggested interval (in milliseconds) for repeated events\n4. Brief description of what each event represents\n\nExisting events:\n{context}`,

  'mock.websocket.generate':
    `Generate WebSocket message handlers for a mock server named "{serverName}".\n\nProvide:\n1. 3-5 message patterns (trigger → response)\n2. Example JSON for each request message and its response\n3. Brief description of each handler's purpose\n\nUse realistic event-driven naming.\n\nExisting handlers:\n{context}`,

  'mock.socketio.generate':
    `Generate Socket.IO event definitions for a mock server named "{serverName}".\n\nProvide:\n1. 3-5 Socket.IO events (client→server and server→client)\n2. Example JSON payload for each event\n3. Brief description of each event's purpose\n\nUse realistic Socket.IO naming conventions.\n\nExisting events:\n{context}`,

  'mock.mqtt.generate':
    `Generate MQTT topic definitions for a mock server named "{serverName}".\n\nProvide:\n1. 3-5 MQTT topics with realistic topic paths (e.g. sensors/temp/device1)\n2. Example JSON or text payload for each topic\n3. Suggested publish interval\n4. Brief description of each topic\n\nUse realistic IoT/MQTT naming conventions.\n\nExisting topics:\n{context}`,
};

// ─── Labels for UI ────────────────────────────────────────────────────────────

export const AI_PROMPT_TEMPLATE_LABELS: Record<AiPromptTemplateKey, { label: string; description: string }> = {
  askAiWhy:               { label: 'Ask AI Why (Error Diagnosis)', description: 'Prompt used when "Ask AI why" is clicked on a failed HTTP response' },
  explainWithAi:          { label: 'Explain with AI',              description: 'Prompt used when "Explain" is clicked on a successful HTTP response' },
  followupWithAi:         { label: 'Follow-up with AI',            description: 'Prompt used when "Follow-up Requests" is clicked to suggest next API calls' },
  'mock.rest.generate':   { label: 'REST Routes Generate',         description: '✨ Generate with AI in REST mock server config' },
  'mock.graphql.generate':{ label: 'GraphQL Schema Generate',      description: '✨ Generate with AI in GraphQL mock server config' },
  'mock.grpc.generate':   { label: 'gRPC Services Generate',       description: '✨ Generate with AI in gRPC mock server config' },
  'mock.soap.generate':   { label: 'SOAP Operations Generate',     description: '✨ Generate with AI in SOAP mock server config' },
  'mock.sse.generate':    { label: 'SSE Events Generate',          description: '✨ Generate with AI in SSE mock server config' },
  'mock.websocket.generate':   { label: 'WebSocket Handlers Generate',  description: '✨ Generate with AI in WebSocket mock server config' },
  'mock.socketio.generate':    { label: 'Socket.IO Events Generate',    description: '✨ Generate with AI in Socket.IO mock server config' },
  'mock.mqtt.generate':   { label: 'MQTT Topics Generate',         description: '✨ Generate with AI in MQTT mock server config' },
};

// ─── Variables available per template ────────────────────────────────────────

export const AI_PROMPT_TEMPLATE_VARIABLES: Record<AiPromptTemplateKey, string[]> = {
  askAiWhy:               ['{method}', '{url}', '{status}', '{statusText}', '{body}'],
  explainWithAi:          ['{method}', '{url}', '{status}', '{statusText}', '{body}'],
  followupWithAi:         ['{method}', '{url}', '{body}'],
  'mock.rest.generate':   ['{serverName}', '{context}'],
  'mock.graphql.generate':['{serverName}', '{context}'],
  'mock.grpc.generate':   ['{serverName}', '{context}'],
  'mock.soap.generate':   ['{serverName}', '{context}'],
  'mock.sse.generate':    ['{serverName}', '{context}'],
  'mock.websocket.generate': ['{serverName}', '{context}'],
  'mock.socketio.generate':  ['{serverName}', '{context}'],
  'mock.mqtt.generate':   ['{serverName}', '{context}'],
};

// ─── Prompt Library sidebar categories ───────────────────────────────────────

export const AI_TEMPLATE_CATEGORIES: { id: string; label: string; keys: AiPromptTemplateKey[] }[] = [
  {
    id: 'diagnostics',
    label: 'Response & Diagnostics',
    keys: ['askAiWhy', 'explainWithAi', 'followupWithAi'],
  },
  {
    id: 'mock-generate',
    label: 'Mock Server — Generate',
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
  'mock.rest.generate':   '#3b82f6',
  'mock.graphql.generate':'#ec4899',
  'mock.grpc.generate':   '#f97316',
  'mock.soap.generate':   '#8b5cf6',
  'mock.sse.generate':    '#10b981',
  'mock.websocket.generate': '#f59e0b',
  'mock.socketio.generate':  '#ef4444',
  'mock.mqtt.generate':   '#06b6d4',
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
