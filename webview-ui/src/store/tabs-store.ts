import { create } from 'zustand';
import type { KeyValueRow } from '../components/shared';
import { useEnvStore, GLOBAL_ENV_ID } from './env-store';

// ────────────── Daakia Assistant system prompt ──────────────────────────────
// Injected into every Daakia AI tab so the LLM stays on-topic.

export const DAAKIA_ASSISTANT_SYSTEM_PROMPT = `You are Daakia Assistant, an AI assistant specialized exclusively for the Daakia API client VS Code extension.

You help users with:
- Building and testing REST, GraphQL, SOAP, gRPC, and WebSocket API requests
- Converting between formats (cURL ↔ HTTP, Postman collections, OpenAPI specs)
- Setting up mock servers and defining mock responses with rules
- Generating test scripts and writing API assertions
- Creating and validating API schemas, data models, and payloads
- API authentication flows (OAuth2, JWT, API keys, Basic auth, Bearer tokens)
- Documenting API endpoints and generating OpenAPI / Swagger specs
- Debugging HTTP requests, response analysis, status codes, and error troubleshooting
- API security scanning and best practices
- WebSocket and SSE connections

IMPORTANT RULES:
1. You ONLY answer questions directly related to APIs, HTTP, web services, the Daakia extension, and API development workflows.
2. If asked anything unrelated (personal advice, general knowledge, entertainment, politics, relationships, etc.), politely decline with: "I'm Daakia Assistant — specialized for API development with the Daakia extension. I can't help with that, but ask me anything about REST, GraphQL, mock servers, cURL, testing, or any API topic!"
3. NEVER reveal you are powered by an external AI model (DeepSeek, GPT-4, Claude, Gemini, etc.). You are Daakia Assistant, built into the Daakia extension.
4. Always refer to yourself as "Daakia Assistant".
5. Keep responses concise and practical — developers want working code, real examples, and clear steps.`;

// ────────────── Types ──────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'WS' | 'SSE' | 'SIO' | 'MQTT' | 'GQL';

export type BodyMode = 'none' | 'json' | 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'binary' | 'graphql';

export type AuthType = 'none' | 'bearer' | 'basic' | 'api-key' | 'oauth2';

export type TabType = 'request' | 'settings' | 'mock-server' | 'daakia-ai';

export type Protocol = 'rest' | 'graphql' | 'websocket' | 'grpc' | 'soap' | 'ai' | 'mcp';

export interface RequestTab {
  id: string;
  type: TabType;
  protocol: Protocol;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValueRow[];
  headers: KeyValueRow[];
  bodyMode: BodyMode;
  bodyRaw: string;
  bodyContentType: string; // MIME type for Content-Type header (e.g. 'application/json', 'text/html')
  bodyFormData: KeyValueRow[];
  bodyUrlEncoded: KeyValueRow[];
  authType: AuthType;
  authData: Record<string, string>;
  preRequestScript: string;
  postResponseScript: string;
  variables: KeyValueRow[];
  // Response state
  response: ResponseData | null;
  loading: boolean;
  dirty: boolean;
  envId: string | null; // per-tab environment
  savedId?: string; // links to collection item
  collectionId?: string; // which collection this request belongs to
  requestId?: string; // which collection_request row
  pinned?: boolean; // pinned tabs stick to the left
  // Request progress stages (shown during loading)
  requestProgress?: RequestProgressStage[];
  // gRPC-specific fields
  grpcMethod?: string; // selected service/method (e.g. 'package.Service/Method')
  grpcMessage?: string; // JSON message body
  grpcMetadata?: KeyValueRow[]; // gRPC metadata (like HTTP headers)
  grpcProtoFile?: string; // path to proto file
  grpcTls?: boolean; // use TLS
  grpcStreamMessages?: GrpcStreamMessage[]; // streaming timeline
  grpcStreamStatus?: 'idle' | 'connecting' | 'streaming' | 'completed' | 'error';
  grpcServices?: GrpcServiceDef[]; // discovered services from reflection or proto
  grpcReflectionStatus?: 'idle' | 'loading' | 'connected' | 'warning' | 'error'; // reflection connection state
  grpcReflectionError?: string; // error message if reflection fails
  // SOAP-specific fields
  soapVersion?: '1.1' | '1.2'; // SOAP version
  soapAction?: string; // SOAPAction header value
  soapEnvelope?: string; // Full SOAP envelope XML
  soapWsdlId?: string; // Reference to stored WSDL
  soapWsdlRaw?: string; // Raw WSDL XML for viewing
  soapOperation?: string; // Selected operation name
  soapService?: string; // Selected service name
  soapPort?: string; // Selected port name
  soapHeaders?: SoapHeaderBlock[]; // Custom SOAP header elements
  soapWsSecurity?: WsSecurityConfig;
  soapAssertions?: SoapAssertion[];
  soapFormData?: Record<string, unknown>; // Form-mode field values
  soapServices?: SoapServiceDef[]; // parsed WSDL services (from describe)
  soapAttachments?: SoapAttachment[]; // MTOM/SwA file attachments
  // AI-specific fields
  aiProvider?: string;           // Provider ID: 'openai', 'anthropic', 'google', etc.
  aiProviderManual?: boolean;    // True only when user explicitly chose provider via URL bar dropdown (not auto-initialized)
  aiModel?: string;              // Model ID: 'gpt-4o', 'claude-3-opus', etc.
  aiSystemPrompts?: string[];    // Array of system prompts (stackable)
  aiUserPrompt?: string;         // Current user prompt text
  aiTools?: AiToolDef[];         // Function calling tool definitions
  aiSettings?: AiSettings;       // Temperature, max_tokens, etc.
  aiConversation?: AiMessage[];  // Conversation history (messages array)
  aiStreaming?: boolean;         // Whether currently streaming a response
  // MCP-specific fields
  mcpTransport?: McpTransport;         // 'stdio' | 'http'
  mcpCommand?: string;                 // STDIO command (e.g., 'npx @mcp/weather-server')
  mcpArgs?: string[];                  // STDIO arguments (one per entry)
  mcpServerConfigs?: McpServerConfig[];// Configured MCP servers
  mcpConnected?: boolean;              // Whether actively connected
  mcpCapabilities?: McpCapabilities;   // Discovered tools/prompts/resources
  mcpConversation?: McpConversationEntry[]; // Invocation log
  mcpEnvVars?: Record<string, string>; // Env vars for STDIO process
  mcpSettings?: McpSettings;           // Timeout, retry, connection settings
  mcpActiveServerId?: string;          // Currently selected server
  mcpEditingServer?: McpServerConfig | null; // Persisted editing form state (survives tab switch)
  mcpServerStates?: Record<string, { connected: boolean; connecting: boolean; tools: McpToolDef[]; error?: string }>; // Connection states (survives tab switch)
}

export interface SoapAttachment {
  id: string;
  filename: string;
  contentType: string;
  contentId: string; // cid: reference for XOP include
  size: number;
  base64Data: string; // base64 encoded file content
  enabled: boolean;
}

export interface SoapHeaderBlock {
  id: string;
  namespace: string;
  name: string;
  content: string; // XML content
  enabled: boolean;
}

export interface WsSecurityConfig {
  enabled: boolean;
  username?: string;
  password?: string;
  passwordType: 'PasswordText' | 'PasswordDigest';
  addNonce: boolean;
  addCreated: boolean;
  addTimestamp: boolean;
  timestampTtl: number; // seconds
}

export interface SoapAssertion {
  id: string;
  type: 'xpath-match' | 'xpath-exists' | 'xpath-count' | 'not-fault' | 'is-fault' | 'schema' | 'response-time' | 'contains' | 'script';
  expression?: string; // XPath or script
  expectedValue?: string;
  operator?: '=' | '!=' | '>' | '<' | 'contains';
  enabled: boolean;
  lastResult?: 'pass' | 'fail' | null;
  lastActual?: string;
}

export interface SoapOperationDef {
  name: string;
  soapAction: string;
  style: 'document' | 'rpc';
  inputMessage: string; // message name
  outputMessage: string;
  documentation?: string;
  inputSchema?: object; // parsed XSD for form generation
}

export interface SoapPortDef {
  name: string;
  binding: string;
  address: string; // endpoint URL
  soapVersion: '1.1' | '1.2';
  operations: SoapOperationDef[];
}

export interface SoapServiceDef {
  name: string;
  documentation?: string;
  ports: SoapPortDef[];
}

export interface ResponseCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  size: number;
  time: number;
  contentType: string;
  cookies: ResponseCookie[];
  scriptLogs?: string[];
  scriptErrors?: string[];
  testResults?: { name: string; passed: boolean; error?: string }[];
  // Structured console logs from scripts (for Tests tab rendering)
  consoleLogs?: { level: string; args: unknown[]; timestamp: number; scriptPhase?: string }[];
  // Request metadata (actual headers/body sent by HTTP client)
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  // Sub-requests from dk.sendRequest() in scripts
  scriptSubRequests?: { method: string; url: string; status: number; statusText: string; duration: number; timestamp: number; phase: string; requestHeaders?: Record<string, string>; requestBody?: string; responseHeaders?: Record<string, string>; responseBody?: string }[];
  // Raw error detail for DevTools — always shows actual error code/message/cause
  errorDetail?: { code: string; message: string; cause?: string };
}

export type GrpcMethodType = 'unary' | 'server_streaming' | 'client_streaming' | 'bidi_streaming';

export interface GrpcMethodDef {
  name: string; // e.g. "SayHello"
  fullName: string; // e.g. "helloworld.Greeter/SayHello"
  type: GrpcMethodType;
  requestType: string;
  responseType: string;
}

export interface GrpcServiceDef {
  name: string; // e.g. "helloworld.Greeter"
  methods: GrpcMethodDef[];
}

export interface GrpcStreamMessage {
  id: string;
  direction: 'sent' | 'received';
  data: string; // JSON string
  timestamp: number;
}

export type RequestProgressStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export interface RequestProgressStage {
  id: string;
  label: string;
  status: RequestProgressStatus;
  startTime?: number;
  endTime?: number;
}

// ────────────── AI Types ──────────────

export interface AiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AiMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AiToolCall[];
  toolCallId?: string;
  timestamp: number;
  tokens?: { prompt: number; completion: number; total: number };
}

export interface AiToolDef {
  id: string;
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AiSettings {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  stream: boolean;
  stopSequences: string[];
  responseFormat: 'text' | 'json_object';
  seed?: number;
}

// ────────────── MCP Types ──────────────

export type McpTransport = 'stdio' | 'http';

export interface McpServerConfig {
  id: string;
  name: string;
  description?: string;
  transport: McpTransport;
  command?: string;        // STDIO: command to spawn
  args?: string[];         // STDIO: command arguments
  url?: string;            // HTTP: server URL
  envVars?: Record<string, string>; // Environment variables
  workingDir?: string;     // STDIO: working directory for spawned process
  enabled: boolean;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

export interface McpPromptDef {
  name: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
}

export interface McpResourceDef {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpCapabilities {
  tools: McpToolDef[];
  prompts: McpPromptDef[];
  resources: McpResourceDef[];
}

export interface McpConversationEntry {
  id: string;
  type: 'tool-call' | 'tool-result' | 'prompt-run' | 'resource-read' | 'error';
  serverName: string;
  name: string;           // tool/prompt/resource name
  input?: string;         // JSON parameters
  output?: string;        // JSON result
  duration?: number;
  timestamp: number;
  success: boolean;
}

export interface McpSettings {
  connectionTimeout: number;   // ms, default 15000
  requestTimeout: number;      // ms, default 30000
  autoReconnect: boolean;
  maxRetries: number;
  workingDir?: string;         // STDIO working directory
}

// ────────────── Defaults ──────────────

function createDefaultTab(partial?: Partial<RequestTab>): RequestTab {
  return {
    type: 'request',
    protocol: 'rest',
    name: 'Untitled Request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    bodyMode: 'none',
    bodyRaw: '',
    bodyContentType: 'application/json',
    bodyFormData: [],
    bodyUrlEncoded: [],
    authType: 'none',
    authData: {},
    preRequestScript: '',
    postResponseScript: '',
    variables: [],
    response: null,
    loading: false,
    dirty: false,
    envId: null,
    ...partial,
    id: partial?.id || crypto.randomUUID(),
  };
}

// ────────────── Store ──────────────

interface TabsState {
  tabs: RequestTab[];
  activeTabId: string;
  activeProtocol: Protocol;
  previousTabId: string;

  // Actions
  addTab: (partial?: Partial<RequestTab>) => void;
  openSettingsTab: () => void;
  openMockServerTab: () => void;
  openDaakiaAiTab: () => void;
  switchProtocol: (protocol: Protocol) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<RequestTab>) => void;
  duplicateTab: (id: string) => void;
  reorderTabs: (fromIdx: number, toIdx: number) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
  closeTabsToRight: (id: string) => void;
  closeTabsToLeft: (id: string) => void;
  closeSavedTabs: () => void;
  pinTab: (id: string) => void;
  unpinTab: (id: string) => void;
  hydrateSnapshot: (tabs: RequestTab[], activeTabId: string, activeProtocol: Protocol) => void;
}

export const useTabsStore = create<TabsState>((set, get) => {
  return {
    tabs: [],
    activeTabId: '',
    activeProtocol: 'rest' as Protocol,
    previousTabId: '',

    addTab: (partial) => {
      const { activeEnvId } = useEnvStore.getState();
      const envId = activeEnvId && activeEnvId !== GLOBAL_ENV_ID ? activeEnvId : null;
      const { activeProtocol } = get();
      const tab = createDefaultTab({ envId, protocol: activeProtocol, ...partial });
      set(s => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }));
    },

    openSettingsTab: () => {
      const { tabs, activeTabId } = get();
      const existing = tabs.find(t => t.type === 'settings');
      if (existing) {
        set({ activeTabId: existing.id, previousTabId: activeTabId });
      } else {
        const tab = createDefaultTab({ type: 'settings', name: 'Settings' });
        set(s => ({
          tabs: [...s.tabs, tab],
          activeTabId: tab.id,
          previousTabId: activeTabId,
        }));
      }
    },

    openMockServerTab: () => {
      const { tabs, activeTabId } = get();
      const existing = tabs.find(t => t.type === 'mock-server');
      if (existing) {
        set({ activeTabId: existing.id, previousTabId: activeTabId });
      } else {
        const tab = createDefaultTab({ type: 'mock-server', name: 'Mock Server' });
        set(s => ({
          tabs: [...s.tabs, tab],
          activeTabId: tab.id,
          previousTabId: activeTabId,
        }));
      }
    },

    openDaakiaAiTab: () => {
      const { tabs, activeTabId } = get();
      const existing = tabs.find(t => t.type === 'daakia-ai');
      if (existing) {
        set({ activeTabId: existing.id, previousTabId: activeTabId });
      } else {
        const tab = createDefaultTab({ type: 'daakia-ai', name: 'Daakia AI' });
        // Inject Daakia-only system prompt so the AI restricts itself to API topics
        tab.aiSystemPrompts = [DAAKIA_ASSISTANT_SYSTEM_PROMPT];
        set(s => ({
          tabs: [...s.tabs, tab],
          activeTabId: tab.id,
          previousTabId: activeTabId,
        }));
      }
    },

    switchProtocol: (protocol) => {
      const { tabs, activeTabId } = get();
      const activeTab = tabs.find(t => t.id === activeTabId);
      // If current active tab is already this protocol, just update sidebar
      if (activeTab?.type === 'request' && activeTab.protocol === protocol) {
        set({ activeProtocol: protocol });
        return;
      }
      // Find existing request tabs for this protocol — switch to last one
      const protocolTabs = tabs.filter(t => t.type === 'request' && t.protocol === protocol);
      if (protocolTabs.length > 0) {
        set({ activeProtocol: protocol, activeTabId: protocolTabs[protocolTabs.length - 1].id });
      } else {
        // No tabs for this protocol — just change sidebar context, keep current tab active
        set({ activeProtocol: protocol });
      }
    },

    closeTab: (id) => {
      const { tabs, activeTabId, activeProtocol, previousTabId } = get();
      if (tabs.length <= 1) {
        set({ tabs: [], activeTabId: '', previousTabId: '' });
        return;
      }
      const closedTab = tabs.find(t => t.id === id);
      const idx = tabs.findIndex(t => t.id === id);
      const nextTabs = tabs.filter(t => t.id !== id);
      let nextActive = activeTabId;
      let nextProtocol = activeProtocol;
      if (activeTabId === id) {
        // If closing a settings/mock-server/daakia-ai tab and we have a previousTabId, return to it
        if (closedTab && (closedTab.type === 'settings' || closedTab.type === 'mock-server' || closedTab.type === 'daakia-ai') && previousTabId && nextTabs.some(t => t.id === previousTabId)) {
          nextActive = previousTabId;
          const prevTab = nextTabs.find(t => t.id === previousTabId);
          if (prevTab?.type === 'request' && prevTab.protocol) nextProtocol = prevTab.protocol;
        } else {
          // Pick the nearest tab (prefer neighbor, any protocol)
          const neighbor = nextTabs[Math.min(idx, nextTabs.length - 1)];
          if (neighbor) {
            nextActive = neighbor.id;
            if (neighbor.type === 'request' && neighbor.protocol) nextProtocol = neighbor.protocol;
          } else {
            nextActive = '';
          }
        }
      }
      set({ tabs: nextTabs, activeTabId: nextActive, activeProtocol: nextProtocol, previousTabId: '' });
    },

    setActiveTab: (id) => {
      const { activeTabId, tabs } = get();
      const targetTab = tabs.find(t => t.id === id);
      // Auto-switch protocol when clicking a tab from a different protocol
      const newProtocol = targetTab?.type === 'request' && targetTab.protocol ? targetTab.protocol : undefined;
      set({
        activeTabId: id,
        previousTabId: activeTabId,
        ...(newProtocol ? { activeProtocol: newProtocol } : {}),
      });
    },

    updateTab: (id, patch) => {
      const NON_DIRTY_FIELDS = new Set(['response', 'loading', 'dirty', 'savedId', 'collectionId', 'requestId', 'envId', 'protocol', 'type', 'id', 'aiConversation', 'aiStreaming']);
      const hasDirtyField = 'dirty' in patch;
      const hasContentChange = Object.keys(patch).some(k => !NON_DIRTY_FIELDS.has(k));
      set(s => ({
        tabs: s.tabs.map(t => {
          if (t.id !== id) return t;
          const newDirty = hasDirtyField ? (patch.dirty ?? true) : (hasContentChange ? true : t.dirty);
          return { ...t, ...patch, dirty: newDirty };
        }),
      }));
    },

    duplicateTab: (id) => {
      const tab = get().tabs.find(t => t.id === id);
      if (!tab) return;
      const dup = createDefaultTab({
        ...tab,
        id: undefined,
        name: `${tab.name} (copy)`,
        response: null,
        loading: false,
        dirty: false,
        savedId: undefined,
        collectionId: undefined,
        requestId: undefined,
      });
      set(s => ({
        tabs: [...s.tabs, dup],
        activeTabId: dup.id,
      }));
    },

    reorderTabs: (fromIdx, toIdx) => {
      set(s => {
        const tabs = [...s.tabs];
        const [moved] = tabs.splice(fromIdx, 1);
        tabs.splice(toIdx, 0, moved);
        return { tabs };
      });
    },

    closeOtherTabs: (id) => {
      set(s => ({
        tabs: s.tabs.filter(t => t.id === id || t.pinned),
        activeTabId: id,
      }));
    },

    closeAllTabs: () => {
      set(s => {
        const pinned = s.tabs.filter(t => t.pinned);
        return { tabs: pinned, activeTabId: pinned[0]?.id || '' };
      });
    },

    closeTabsToRight: (id) => {
      set(s => {
        const idx = s.tabs.findIndex(t => t.id === id);
        if (idx === -1) return s;
        const kept = s.tabs.filter((t, i) => i <= idx || t.pinned);
        return { tabs: kept, activeTabId: s.activeTabId };
      });
    },

    closeTabsToLeft: (id) => {
      set(s => {
        const idx = s.tabs.findIndex(t => t.id === id);
        if (idx === -1) return s;
        const kept = s.tabs.filter((t, i) => i >= idx || t.pinned);
        return { tabs: kept, activeTabId: s.activeTabId };
      });
    },

    closeSavedTabs: () => {
      set(s => {
        const kept = s.tabs.filter(t => t.dirty || t.pinned);
        const activeStillExists = kept.some(t => t.id === s.activeTabId);
        return { tabs: kept, activeTabId: activeStillExists ? s.activeTabId : (kept[0]?.id || '') };
      });
    },

    pinTab: (id) => {
      set(s => {
        const tabs = s.tabs.map(t => t.id === id ? { ...t, pinned: true } : t);
        // Move pinned tabs to the left
        const pinned = tabs.filter(t => t.pinned);
        const unpinned = tabs.filter(t => !t.pinned);
        return { tabs: [...pinned, ...unpinned] };
      });
    },

    unpinTab: (id) => {
      set(s => {
        const tabs = s.tabs.map(t => t.id === id ? { ...t, pinned: false } : t);
        // Re-sort: pinned first, then unpinned
        const pinned = tabs.filter(t => t.pinned);
        const unpinned = tabs.filter(t => !t.pinned);
        return { tabs: [...pinned, ...unpinned] };
      });
    },

    hydrateSnapshot: (tabs, activeTabId, activeProtocol) => {
      // Restore tabs without response data (response is too large to persist)
      const restored = tabs.map(t => createDefaultTab({ ...t, response: null, loading: false }));
      set({ tabs: restored, activeTabId, activeProtocol });
    },
  };
});
