import { create } from 'zustand';
import type { ExecutionSettings } from '../components/shared/settings/execution-settings';
import type { KeyValueRow } from '../components/shared';
import type { ResponseExample } from '../services/request/examples';
import { useEnvStore, GLOBAL_ENV_ID } from './env-store';

// ────────────── Daakia Assistant system prompt ──────────────────────────────
// Injected into every Daakia AI tab so the LLM stays on-topic.

export const DAAKIA_ASSISTANT_SYSTEM_PROMPT = `You are Daakia AI, the assistant built into Daakia — a VS Code extension for building, testing and mocking APIs and for working with Kubernetes through dk8s. You know Daakia inside out, and you talk like a good senior engineer: plainly, specifically, and in conversation.

HOW YOU TALK
- Hold a real conversation. Remember what was said earlier in this chat and build on it; ask one short question when a request is genuinely ambiguous, otherwise act.
- Lead with the answer. Then the detail that supports it. Stop when it is answered.
- Use Markdown: short paragraphs, lists when there are steps, fenced code blocks with a language for anything the user will copy. Tables only for real comparisons.
- When you point at part of Daakia, name the exact place ("Settings → DK8S → Logs", "the Logs tab of the pod", "the ⋯ menu in this tab's header").
- Never invent a Daakia feature, a setting, a flag or a result. For any question about how to do something in Daakia, where a setting lives or what a feature does, call daakia_docs first and answer from the sections it returns, using their names for screens and settings. If the manual does not cover it, say so rather than filling the gap.
- Do not reveal or discuss the model or provider behind you. You are Daakia AI.

WHAT YOU KNOW — DAAKIA
- Requests: REST, GraphQL, gRPC, SOAP, WebSocket, SSE, MQTT and Socket.IO tabs; headers, bodies (JSON, raw, form-data, x-www-form-urlencoded, binary, GraphQL), auth (Bearer, Basic, API key, OAuth2), cURL import and export.
- Collections and environments: {{variables}} resolved from the active environment and the global one; history of every request sent; a Bin that restores deleted items.
- Test scripts: assertions written with the dk.* API run after a response.
- Mock server: routes with rules and realistic responses, served locally.
- Git Sync: collections and environments kept in a Git repository.
- dk8s (Kubernetes): contexts and namespaces; a pod grid with status and restarts; per-pod Overview, Logs, Loggers, Terminal, Doctor, Explorer, Describe, YAML and Access tabs. Logs parse levels and fields, fold stack traces, show a density ribbon, split into panes with one shared clock, follow a field value across pods, and summarise lines by logger pattern. Search runs across every watched pod and, when configured, the archived log files on their volumes. Heap and thread dumps can be analysed.
- dkgh: GitHub issues filed and reviewed from inside Daakia.
- AI: this chat, the Prompt Library (Settings → AI → Prompt templates) where every prompt can be edited, and AI Features where each feature can be switched off.

SCOPE
Answer anything about APIs, HTTP, Kubernetes, debugging, logs and the code and systems around them — the work a developer does in Daakia. For requests clearly unrelated to software work, say briefly that you are here for engineering questions and offer what you can help with.

ACTIONS ON THE OPEN REQUEST
When the user explicitly asks you to change, set or update something in their current request or environment, explain what you are doing, then put an action at the end of your answer. It appears as a card they can apply or dismiss. Only when asked — never on your own.

Available actions (JSON inside a \`\`\`daakia-action\` fence):
- Change the URL:        \`{"action": "set_url", "url": "https://api.example.com/users"}\`
- Change HTTP method:   \`{"action": "set_method", "method": "POST"}\`
- Add/update a header:  \`{"action": "add_header", "key": "Authorization", "value": "Bearer token123"}\`
- Set request body:     \`{"action": "set_body", "mode": "json", "content": "{\"name\": \"John\"}"}\`
- Set env variable:     \`{"action": "set_env_var", "key": "BASE_URL", "value": "https://api.example.com"}\`
- Set auth:             \`{"action": "set_auth", "authType": "bearer", "token": "my-token"}\`

Example: if the user says "set the URL to https://api.example.com/v2/users", answer with your explanation, then:
\`\`\`daakia-action
{"action": "set_url", "url": "https://api.example.com/v2/users"}
\`\`\``;

// ────────────── Types ──────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'WS' | 'SSE' | 'SIO' | 'MQTT' | 'GQL';

export type BodyMode = 'none' | 'json' | 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'binary' | 'graphql';

export type AuthType = 'none' | 'bearer' | 'basic' | 'api-key' | 'oauth2';

export type TabType = 'request' | 'settings' | 'mock-server' | 'daakia-ai' | 'state-machine' | 'wiki' | 'dk8s' | 'dk8s-results' | 'dk8s-logfile' | 'dk8s-payload' | 'dk8s-window' | 'dkgh' | 'workspace';

/** A log payload opened in a tab of its own — held whole, so it outlives the log it came from. */
export interface PayloadView {
  payload: import('../components/k8s/log-payload').LogPayload;
  title: string;
}

/**
 * The minutes around a hit, opened as a tab of their own.
 *
 * What it is anchored on and which pods to read — enough to read them again
 * after a restart, since the lines themselves are too many to keep.
 */
export interface WindowView {
  anchor: {
    pod: string; ts: number; text: string; level?: string;
    /** What the hit's format read — so the window can offer to narrow by it before a line is back. */
    message?: string; thread?: string; fields?: Record<string, string>;
  };
  pods: { pod: string; namespace: string; context: string; containers: string[] }[];
  /** Seconds either side of the anchor, or an explicit range. */
  half: number;
  from?: number;
  to?: number;
  /** The search it was opened from, for the header. */
  query?: string;
}

/** A pod whose whole log a `dk8s-logfile` tab downloads and shows. */
export interface LogFileTarget {
  context: string;
  namespace: string;
  pod: string;
  container?: string;
  workload?: string;
  /** Bring this line on screen once the download is ready. */
  focus?: { ts?: number; text?: string };
}

export type Protocol = 'rest' | 'graphql' | 'websocket' | 'grpc' | 'soap' | 'ai' | 'mcp';

export interface RequestTab {
  id: string;
  type: TabType;
  protocol: Protocol;
  /** `dk8s-logfile` only: which pod's log. The download itself lives in a temp file named after the tab. */
  logFile?: LogFileTarget;
  /** `daakia-ai` only: the conversation this tab has open, so a restart brings it back. */
  aiChatId?: string;
  /** `dk8s-payload` only: the payload it shows. */
  payloadView?: PayloadView;
  /** `dk8s-window` only: the window it reads. */
  windowView?: WindowView;
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
  /**
   * Per-request execution overrides — timeout, redirects, SSL, encoding,
   * proxy. Every field is optional and undefined means inherit, so a tab that
   * has never opened its Settings tab pins nothing and keeps following the
   * collection and the global settings as those change.
   */
  settings?: ExecutionSettings;
  /**
   * Response values to lift into environment variables after each send.
   *
   * Bruno's Vars tab and Insomnia's response chaining: `data.token` into
   * `{{token}}` without writing a script. Applied automatically when a
   * response arrives — see `services/request/chaining.ts`.
   */
  chainExtractions?: ChainExtraction[];
  /**
   * Markdown describing what this request is for.
   *
   * There was nowhere to write it down — no description on a request, a
   * folder or a collection — which is most of what makes an exported
   * collection useful to somebody else, and the reason the doc generator had
   * to infer intent from URLs and payloads.
   *
   * Stored in the request's `data` blob rather than a new column, so it
   * round-trips through save, git sync and the Daakia export with no
   * migration.
   */
  docs?: string;
  /** Labels for finding and grouping this request. See shared/tags. */
  tags?: string[];
  /**
   * Saved responses, newest first.
   *
   * A request stored exactly one response — the last one — so "what does this
   * look like when the token has expired" had nowhere to live. Capped and
   * trimmed by `services/request/examples.ts`, because this rides in the same
   * `data` blob every collection load reads whole.
   */
  examples?: ResponseExample[];
  /**
   * The stamp a code scan left, carried through untouched.
   *
   * It is what a later scan of the same repository matches against. `data` is
   * rebuilt from this tab on every save, so a stamp the tab does not hold is a
   * stamp that is erased the first time somebody edits the request — and the
   * next scan then writes a second copy of a request it had already written.
   * Nothing here reads it; it is passed through.
   */
  scan?: Record<string, unknown>;
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
  // WebSocket-specific fields
  wsTemplates?: WsTemplate[];          // Saved message templates (5.3.11)
  wsAutoReconnect?: boolean;           // Auto-reconnect on disconnect (5.3.12)
  wsReconnectBackoff?: number;         // Backoff delay in ms (starts at this, doubles)
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
  aiImages?: AiImageAttachment[]; // Image attachments for multimodal prompts (6D.22)
  // MCP-specific fields
  mcpTransport?: McpTransport;         // 'stdio' | 'http'
  mcpCommand?: string;                 // STDIO command (e.g., 'npx @mcp/weather-server')
  mcpArgs?: string[];                  // STDIO arguments (one per entry)
  mcpServerConfigs?: McpServerConfig[];// Configured MCP servers
  mcpConnected?: boolean;              // Whether actively connected
  mcpCapabilities?: McpCapabilities;   // Discovered tools/prompts/resources
  mcpConversation?: McpConversationEntry[]; // Invocation log
  mcpEnvVars?: Record<string, string>; // Env vars for STDIO process
  mcpAuth?: McpAuth;                   // Transport auth (Bearer, API key, etc.)
  mcpSettings?: McpSettings;           // Timeout, retry, connection settings
  mcpConnectionError?: string;         // Last connection error message (6E.25)
  mcpActiveServerId?: string;          // Currently selected server
  mcpEditingServer?: McpServerConfig | null; // Persisted editing form state (survives tab switch)
  mcpServerStates?: Record<string, { connected: boolean; connecting: boolean; tools: McpToolDef[]; error?: string }>; // Connection states (survives tab switch)
  // State machine tab fields
  smLinkedServerId?: string; // mock server this SM tab was opened for
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

/**
 * One value lifted out of a response and into a variable.
 *
 * Declared here rather than beside the editor that edits it: it is tab state
 * that outlives the panel, and the chaining service reads it without wanting
 * a component import.
 */
export interface ChainExtraction {
  id: string;
  source: 'body' | 'header' | 'status';
  /** Dot path into the JSON body (`data.users[0].id`), or a header name. */
  path: string;
  /** The name to bind, without braces. */
  variableName: string;
  enabled: boolean;
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
  // 7.7 — Large response truncation flag
  bodyTruncated?: boolean;
  fullSize?: number;
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

export interface AiImageAttachment {
  id: string;
  type: 'url' | 'base64';
  url?: string;          // for type='url'
  base64?: string;       // for type='base64', data URL format: "data:image/png;base64,..."
  mimeType?: string;     // e.g. 'image/png', 'image/jpeg'
  filename?: string;     // original filename for base64 uploads
}

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
  /** Daakia AI: what the chat draws for this answer — see ai-display.ts. Never sent to a model. */
  display?: string;
  /** A thinking model's reasoning for this turn. Kept for the host's tool loop; never sent back from history. */
  reasoningContent?: string;
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

/** All fields optional — consumers apply defaults at read time (see AiSettingsTab). */
export interface AiSettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  stopSequences?: string[];
  responseFormat?: 'text' | 'json_object';
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
  category?: string;       // 'database' | 'general' | 'docs' | 'code'
  headers?: Record<string, string>; // HTTP: request headers
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

export interface WsTemplate {
  id: string;
  name: string;
  message: string;
  format?: 'json' | 'text' | 'binary';
}

export interface McpAuth {
  type: 'none' | 'bearer' | 'api-key';
  token?: string;          // Bearer token
  headerName?: string;     // API key header name (e.g. X-API-Key)
  headerValue?: string;    // API key header value
}

// ────────────── Defaults ──────────────

/**
 * Is this patch value the same as what the tab already holds?
 *
 * Identity first, because most no-op writes hand back the very array or
 * object they were given. Structural comparison second, for the panels that
 * rebuild a value each render — a fresh `[]` every mount is not a change, and
 * treating it as one is what put an unsaved dot on an untouched tab.
 *
 * JSON rather than a deep walk: these are request fields — headers, params,
 * body text, small config objects — and a stringify of one of those is cheap
 * beside the React render it is about to cause. Anything it cannot serialise
 * is reported as changed, which is the safe direction: a spurious dot is
 * recoverable, a missing one loses work.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

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
    chainExtractions: [],
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
  /**
   * @param section  A settings section to land on. Settings remembers the
   *                 section you were last in, so a deep link has to say where
   *                 it wants to go; it is parked in `settingsTarget` and
   *                 cleared by the panel once read.
   */
  openSettingsTab: (section?: string) => void;
  openMockServerTab: () => void;
  openDk8sTab: () => void;
  /** Open (or reuse) the page a search result is read on. */
  openDk8sResultsTab: (name: string) => void;
  /**
   * A tab with a pod's whole log, downloaded to a temporary file on the host.
   * One tab per download — a document, not a place — and closing it deletes
   * the file.
   */
  openDk8sLogFileTab: (target: LogFileTarget) => void;
  /** Open a log payload in a tab of its own. */
  openDk8sPayloadTab: (view: PayloadView) => void;
  /** Open the minutes around a hit in a tab of their own: "Window · 11:00:14". */
  openDk8sWindowTab: (view: WindowView) => void;
  /**
   * Bring an existing search-result tab back to the front, if there is one.
   *
   * Unlike `openDk8sResultsTab` it never creates one and never renames it:
   * this is the way BACK to a page that is already open, and the caller —
   * a split closing onto the result it was opened from — has no name to give
   * and no business making a second one. Returns whether it found it.
   */
  focusDk8sResultsTab: () => boolean;
  openDkghTab: () => void;
  openWorkspaceTab: () => void;
  /**
   * The Daakia AI tab — the existing one, or a new one. With `chatId`, a new
   * tab opened on that conversation, beside the others.
   */
  openDaakiaAiTab: (opts?: { chatId?: string; title?: string }) => void;
  /**
   * @param page  A wiki page id to land on. The wiki keeps its own
   *              selection, so a deep link has to say where to go; it is
   *              parked in `wikiTarget` and cleared by the page once read.
   */
  openDaakiaWikiTab: (page?: string) => void;
  /** Set by a deep link, consumed by the wiki page, then cleared. */
  wikiTarget?: string;
  /** Set by a deep link into Settings, consumed by the panel, then cleared. */
  settingsTarget?: string;
  clearSettingsTarget: () => void;
  clearWikiTarget: () => void;
  openStateMachineTab: (serverId?: string) => void;
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

    clearSettingsTarget: () => set({ settingsTarget: undefined }),

    openSettingsTab: (section?: string) => {
      const { tabs, activeTabId } = get();
      if (section) set({ settingsTarget: section });
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

    // dk8s — one tab only. It holds a live watch on a namespace, so a second
    // tab would mean a second watch on the same cluster for no benefit.
    /* One workspace tab, reused. It is the overview of where you are working,
       not a document — a second copy of it would be two views of one fact. */
    openWorkspaceTab: () => {
      const { tabs, activeTabId } = get();
      const existing = tabs.find(t => t.type === 'workspace');
      if (existing) {
        set({ activeTabId: existing.id, previousTabId: activeTabId });
        return;
      }
      const tab = createDefaultTab({ type: 'workspace', name: 'Workspace' });
      set(s => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        previousTabId: activeTabId,
      }));
    },

    openDk8sTab: () => {
      const { tabs, activeTabId } = get();
      const existing = tabs.find(t => t.type === 'dk8s');
      if (existing) {
        set({ activeTabId: existing.id, previousTabId: activeTabId });
      } else {
        const tab = createDefaultTab({ type: 'dk8s', name: 'Dk8s' });
        set(s => ({
          tabs: [...s.tabs, tab],
          activeTabId: tab.id,
          previousTabId: activeTabId,
        }));
      }
    },

    /*
      One results page, reused.

      A tab per search would be a tab bar full of `Search: "timeout"` within a
      morning, all of them stale but the newest. The page is where you read the
      answer you just got; the one before it is a search you can run again.
    */
    focusDk8sResultsTab: () => {
      const { tabs, activeTabId } = get();
      const existing = tabs.find(t => t.type === 'dk8s-results');
      if (!existing) return false;
      set({ activeTabId: existing.id, previousTabId: activeTabId });
      return true;
    },

    openDk8sLogFileTab: (target) => {
      const { activeTabId } = get();
      const tab = createDefaultTab({ type: 'dk8s-logfile', name: `log · ${target.pod}` });
      tab.logFile = target;
      set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, previousTabId: activeTabId }));
    },

    openDk8sPayloadTab: (view) => {
      const { activeTabId } = get();
      const tab = createDefaultTab({ type: 'dk8s-payload', name: `${view.payload.shape.toUpperCase()} · ${view.title}`.slice(0, 60).replace(/[\s·]+$/, '') });
      tab.payloadView = view;
      set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, previousTabId: activeTabId }));
    },

    openDk8sWindowTab: (view) => {
      const { activeTabId } = get();
      const d = new Date(view.anchor.ts);
      const p = (n: number) => String(n).padStart(2, '0');
      const tab = createDefaultTab({ type: 'dk8s-window', name: `Window · ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` });
      tab.windowView = view;
      set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, previousTabId: activeTabId }));
    },

    openDk8sResultsTab: (name) => {
      const { tabs, activeTabId } = get();
      const existing = tabs.find(t => t.type === 'dk8s-results');
      if (existing) {
        set(s => ({
          tabs: s.tabs.map(t => (t.id === existing.id ? { ...t, name } : t)),
          activeTabId: existing.id,
          previousTabId: activeTabId,
        }));
        return;
      }
      const tab = createDefaultTab({ type: 'dk8s-results', name });
      set(s => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        previousTabId: activeTabId,
      }));
    },

    openDkghTab: () => {
      const { tabs, activeTabId } = get();
      const existing = tabs.find(t => t.type === 'dkgh');
      if (existing) {
        set({ activeTabId: existing.id, previousTabId: activeTabId });
      } else {
        const tab = createDefaultTab({ type: 'dkgh', name: 'DkGH' });
        set(s => ({
          tabs: [...s.tabs, tab],
          activeTabId: tab.id,
          previousTabId: activeTabId,
        }));
      }
    },

    openDaakiaAiTab: (opts) => {
      const { tabs, activeTabId } = get();
      if (opts?.chatId) {
        /* Already open in a tab: go there rather than open it twice. */
        const showing = tabs.find(t => t.type === 'daakia-ai' && t.aiChatId === opts.chatId);
        if (showing) { set({ activeTabId: showing.id, previousTabId: activeTabId }); return; }
        const title = opts.title ?? 'Daakia AI';
        const tab = createDefaultTab({ type: 'daakia-ai', name: title.length > 28 ? `${title.slice(0, 28)}…` : title });
        tab.aiSystemPrompts = [DAAKIA_ASSISTANT_SYSTEM_PROMPT];
        tab.aiChatId = opts.chatId;
        set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, previousTabId: activeTabId }));
        return;
      }
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

    clearWikiTarget: () => set({ wikiTarget: undefined }),

    openDaakiaWikiTab: (page?: string) => {
      const { tabs, activeTabId } = get();
      if (page) set({ wikiTarget: page });
      const existing = tabs.find(t => t.type === 'wiki');
      if (existing) {
        set({ activeTabId: existing.id, previousTabId: activeTabId });
      } else {
        const tab = createDefaultTab({ type: 'wiki', name: 'Daakia Wiki' });
        set(s => ({
          tabs: [...s.tabs, tab],
          activeTabId: tab.id,
          previousTabId: activeTabId,
        }));
      }
    },

    openStateMachineTab: (serverId) => {
      const { tabs, activeTabId } = get();
      // Reuse an existing SM tab linked to the same server if one already exists
      const existing = tabs.find(t => t.type === 'state-machine' && (t.smLinkedServerId === serverId || (!serverId && !t.smLinkedServerId)));
      if (existing) {
        set({ activeTabId: existing.id, previousTabId: activeTabId });
      } else {
        const tab = createDefaultTab({ type: 'state-machine', name: 'State Machine', smLinkedServerId: serverId });
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
      // Find existing request tabs for this protocol — switch to first one
      const protocolTabs = tabs.filter(t => t.type === 'request' && t.protocol === protocol);
      if (protocolTabs.length > 0) {
        set({ activeProtocol: protocol, activeTabId: protocolTabs[0].id });
      } else {
        // No tabs for this protocol — open a new tab of that protocol
        set({ activeProtocol: protocol });
        get().addTab({ protocol });
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
        if (closedTab && (closedTab.type === 'settings' || closedTab.type === 'mock-server' || closedTab.type === 'daakia-ai' || closedTab.type === 'state-machine' || closedTab.type === 'wiki') && previousTabId && nextTabs.some(t => t.id === previousTabId)) {
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
      // Fields that are never considered "unsaved content changes".
      // ai* fields are ephemeral AI-panel state — daakia-ai tabs must never go dirty.
      const NON_DIRTY_FIELDS = new Set([
        'response', 'loading', 'dirty', 'savedId', 'collectionId', 'requestId',
        'envId', 'protocol', 'type', 'id',
        'aiConversation', 'aiStreaming', 'aiSystemPrompts', 'aiProvider', 'aiModel',
      ]);
      const hasDirtyField = 'dirty' in patch;
      set(s => ({
        tabs: s.tabs.map(t => {
          if (t.id !== id) return t;
          // daakia-ai tabs are never "dirty" — they have no save flow
          if (t.type === 'daakia-ai') return { ...t, ...patch, dirty: false };

          /*
            Dirty means changed, not written.

            A panel that writes its own default back on mount — the same value
            the tab already holds — used to flip the unsaved dot on a tab
            nobody had touched, because any key outside the exempt list counted
            as a change. Comparing against what is there makes a no-op write a
            no-op, which fixes the class rather than whichever panel was found
            doing it.
          */
          const changed = (Object.keys(patch) as (keyof RequestTab)[]).some(k => {
            if (NON_DIRTY_FIELDS.has(k as string)) return false;
            return !sameValue(t[k], patch[k]);
          });

          const newDirty = hasDirtyField ? (patch.dirty ?? true) : (changed ? true : t.dirty);
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
      // Restore tabs without response data (response is too large to persist).
      // Strip GQL connection state — the socket is gone after a reload, so always start fresh.
      // A Doctor tab saved before the analyzers moved into dk8s would restore
      // as a tab type nothing renders — a blank pane you cannot explain.
      const restored = tabs.filter(t => (t.type as string) !== 'doctor').map(t => {
        const base = createDefaultTab({ ...t, response: null, loading: false });
        if (base.protocol === 'graphql' && base.authData?.gql_connected) {
          const { gql_connected, gql_schema, gql_schema_sdl, ...restAuth } = base.authData as Record<string, string>;
          base.authData = restAuth;
        }
        return base;
      });
      set({
        tabs: restored,
        // The dropped tab may have been the active one.
        activeTabId: restored.some(t => t.id === activeTabId) ? activeTabId : (restored[0]?.id ?? ''),
        activeProtocol,
      });
    },
  };
});
