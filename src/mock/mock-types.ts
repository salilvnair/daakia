/**
 * Shared types for all mock server protocols.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type MockServerProtocol = 'rest' | 'graphql' | 'websocket' | 'sse' | 'socketio' | 'mqtt' | 'grpc' | 'soap' | 'ai' | 'mcp';

export interface AiMockScenario {
  id: string;
  name: string;
  keywords: string[];  // keywords in user message to match this scenario
  response: string;    // assistant reply text
  delay: number;
  enabled: boolean;
}

export interface McpMockTool {
  id: string;
  name: string;        // tool name (snake_case)
  description: string;
  inputSchema: string; // JSON Schema for input as string
  response: string;    // JSON response when called
  delay: number;
  enabled: boolean;
}

// ─── Advanced Matching Types (6A.1-6A.4) ────────────────────────────────────

export type UrlMatchType = 'exact' | 'regex' | 'glob' | 'template' | 'pathPrefix';
export type MatchType = 'equalTo' | 'contains' | 'regex' | 'absent' | 'present' | 'startsWith' | 'endsWith' | 'notContaining';

export interface UrlMatchConfig {
  type: UrlMatchType;
  value: string;
  caseInsensitive?: boolean;
}

export interface MatchRule {
  id: string;
  key: string;
  matchType: MatchType;
  value: string;
  caseInsensitive?: boolean;
  negate?: boolean;
}

export type BodyMatchType = 'equalTo' | 'equalToJson' | 'matchesJsonPath' | 'matchesJsonSchema' | 'equalToXml' | 'matchesXPath' | 'contains' | 'regex';

export interface BodyMatcher {
  matchType: BodyMatchType;
  value: string;
  ignoreArrayOrder?: boolean;
  ignoreExtraElements?: boolean;
  negate?: boolean;
}

// ─── Fault Injection Types (6A.13-6A.15) ────────────────────────────────────

export type FaultType = 'CONNECTION_RESET' | 'EMPTY_RESPONSE' | 'MALFORMED_JSON' | 'CHUNKED_DRIBBLE' | 'TIMEOUT' | 'RANDOM_5XX';

export interface FaultConfig {
  enabled: boolean;
  type?: FaultType;
  probability?: number;           // 0-1: chance this fault fires (default 1.0)
  delayMs?: number;               // fixed additional delay
  randomDelayRange?: { min: number; max: number };
  errorRate?: number;             // 0-1 chance of random 5xx
}

// ─── Rate Limiting (6A.14) ──────────────────────────────────────────────────

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerWindow: number;
  windowMs: number;               // 1000 = per-second, 60000 = per-minute
  burstAllowance?: number;
}

// ─── Response Sequences (6A.22) ─────────────────────────────────────────────

export interface ResponseSequenceItem {
  id: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  delayMs?: number;
}

export type SequenceMode = 'sequential' | 'round-robin' | 'random';

// ─── Webhooks (6A.23) ───────────────────────────────────────────────────────

export interface WebhookConfig {
  id: string;
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  delayMs?: number;
  enabled: boolean;
}

// ─── State Machine (6A.11-6A.12) ────────────────────────────────────────────

export interface StateNode {
  id: string;
  name: string;
  x: number;
  y: number;
  isInitial?: boolean;
  color?: string;
}

export interface StateTransition {
  id: string;
  from: string;
  to: string;
  routeId: string;
  label?: string;
}

export interface StateMachineConfig {
  enabled: boolean;
  states: StateNode[];
  transitions: StateTransition[];
  sessionMode: 'cookie' | 'header' | 'global';
  sessionKey?: string;
  defaultState: string;
}

// ─── Record & Playback (6A.16-6A.18) ────────────────────────────────────────

export interface RecordedRequest {
  id: string;
  timestamp: number;
  method: HttpMethod;
  path: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body?: string;
  response: {
    status: number;
    headers: Record<string, string>;
    body?: string;
    duration: number;
  };
  matchedRouteId?: string;
  savedAsStub?: boolean;
}

// ─── MockRoute (extended) ────────────────────────────────────────────────────

export interface MockRoute {
  id: string;
  method: HttpMethod | 'ANY';
  path: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  delay: number;
  enabled: boolean;

  // Advanced URL matching (6A.1)
  urlMatch?: UrlMatchConfig;

  // Condition matching (6A.2-6A.3)
  headerMatchers?: MatchRule[];
  queryParamMatchers?: MatchRule[];
  cookieMatchers?: MatchRule[];
  bodyMatcher?: BodyMatcher;

  // Composite logic (6A.4): how conditions combine
  compositeLogic?: 'AND' | 'OR';

  // Priority (6A.5): lower number = higher priority
  priority?: number;

  // Handlebars templating (6A.7)
  isTemplate?: boolean;

  // Response body source (6A.10)
  bodySource?: 'inline' | 'file' | 'proxy';
  bodyFile?: string;
  proxyTarget?: string;

  // State machine (6A.11)
  requiredState?: string;
  newState?: string;
  stateVariableUpdates?: Record<string, string>;

  // Fault injection (6A.13)
  fault?: FaultConfig;

  // Rate limiting per-route (6A.14)
  rateLimit?: RateLimitConfig;

  // Response sequences (6A.22)
  responses?: ResponseSequenceItem[];
  sequenceMode?: SequenceMode;

  // Webhooks (6A.23)
  webhooks?: WebhookConfig[];

  /** Optional JS script to dynamically generate response body */
  responseScript?: string;
  /** Where to forward/store generated token (for OAuth flows) */
  tokenOutput?: TokenOutputConfig;
}

export interface TokenOutputConfig {
  /** Where to store the token: 'env' | 'header' | 'body' (default: body only) */
  storeTo: 'env' | 'header' | 'body';
  /** Environment variable name (when storeTo='env') */
  envVarName?: string;
  /** Header name to set in response (when storeTo='header') */
  headerName?: string;
  /** JSON path in response body where token lives (e.g., 'access_token') */
  tokenField?: string;
}

export interface GraphQLMockOperation {
  id: string;
  operationType: 'query' | 'mutation' | 'subscription';
  operationName: string;
  response: string;
  statusCode: number;
  delay: number;
  enabled: boolean;
  // Sprint 13.1-13.5: advanced matching + sequences + fault
  responses?: ResponseSequenceItem[];
  sequenceMode?: SequenceMode;
  headerMatchers?: MatchRule[];
  queryParamMatchers?: MatchRule[];
  cookieMatchers?: MatchRule[];
  bodyMatcher?: BodyMatcher;
  compositeLogic?: 'AND' | 'OR';
  priority?: number;
  fault?: FaultConfig;
  rateLimit?: RateLimitConfig;
}

export interface WebSocketMockHandler {
  id: string;
  event: 'connection' | 'message' | 'disconnect';
  matchPattern: string; // regex or exact match for incoming messages
  response: string;
  delay: number;
  enabled: boolean;
  broadcast: boolean; // send to all connected clients
  // Sprint 13.6-13.10: sequences + fault + state machine
  responses?: ResponseSequenceItem[];
  sequenceMode?: SequenceMode;
  fault?: FaultConfig;
  rateLimit?: RateLimitConfig;
  stateMachineState?: string; // only match when mock is in this state
  nextState?: string; // transition to this state after responding
}

export interface SSEMockEvent {
  id: string;
  eventName: string; // SSE event type (e.g., 'message', 'update', 'heartbeat')
  data: string; // event payload (JSON or text)
  intervalMs: number; // repeat interval in ms (0 = send once on connect)
  delay: number; // initial delay before first send
  enabled: boolean;
  repeat: boolean; // if true, keeps sending at intervalMs
  // Sprint 13.21-13.25: sequences + matching + reconnect simulation
  responses?: ResponseSequenceItem[];
  sequenceMode?: SequenceMode;
  dataMatchRegex?: string; // match on event data (regex)
  fault?: FaultConfig;
  rateLimit?: RateLimitConfig;
  reconnectAfterN?: number; // send 204 after N events to force client reconnect
}

export interface SocketIOMockHandler {
  id: string;
  event: 'connection' | 'message' | 'disconnect'; // trigger event
  listenEvent: string; // event name to listen for (for 'message' type)
  emitEvent: string; // event name to emit in response
  response: string; // JSON response data
  delay: number;
  enabled: boolean;
  broadcast: boolean; // emit to all connected clients
  // Sprint 13.26-13.30: sequences + matching + state machines
  responses?: ResponseSequenceItem[];
  sequenceMode?: SequenceMode;
  payloadMatchRegex?: string; // match on event payload (regex)
  fault?: FaultConfig;
  rateLimit?: RateLimitConfig;
  namespace?: string; // Socket.IO namespace (e.g., '/chat')
  room?: string; // emit to specific room
  stateMachineState?: string;
  nextState?: string;
}

export interface MQTTMockTopic {
  id: string;
  topic: string; // MQTT topic pattern (supports wildcards: +, #)
  qos: 0 | 1 | 2;
  retain: boolean;
  payload: string; // default publish payload (JSON or text)
  intervalMs: number; // auto-publish interval (0 = only on subscribe)
  enabled: boolean;
  // Sprint 13.16-13.20: sequences + wildcard matching + state machines
  responses?: ResponseSequenceItem[];
  sequenceMode?: SequenceMode;
  payloadMatchRegex?: string; // match incoming MQTT payload (regex / JSONPath)
  fault?: FaultConfig;
  rateLimit?: RateLimitConfig;
  stateMachineState?: string;
  nextState?: string;
  lastWillTopic?: string; // LWT topic when client disconnects
  lastWillPayload?: string;
}

export interface GrpcMockMethod {
  id: string;
  service: string;
  method: string;
  type: 'unary' | 'server_streaming' | 'client_streaming' | 'bidi_streaming';
  response: string; // JSON response body
  responseScript?: string; // dynamic response script
  streamResponses?: Array<{ data: string; delayMs: number }>;
  enabled: boolean;
  serviceEnabled?: boolean;
  // Sprint 13.11-13.15: advanced matching + sequences + fault
  responses?: ResponseSequenceItem[];
  sequenceMode?: SequenceMode;
  headerMatchers?: MatchRule[];
  bodyMatcher?: BodyMatcher;
  compositeLogic?: 'AND' | 'OR';
  priority?: number;
  fault?: FaultConfig;
  rateLimit?: RateLimitConfig;
}

export interface SoapMockOperation {
  id: string;
  service: string;
  operation: string;
  soapAction: string;
  responseType: 'static' | 'script' | 'fault';
  response: string; // XML response body
  responseScript?: string; // dynamic response
  faultCode?: string;
  faultString?: string;
  delay: number;
  enabled: boolean;
  serviceEnabled?: boolean;
  // Sprint 13 (SOAP parity): sequences + matching + fault
  responses?: ResponseSequenceItem[];
  sequenceMode?: SequenceMode;
  headerMatchers?: MatchRule[];
  bodyMatcher?: BodyMatcher;
  compositeLogic?: 'AND' | 'OR';
  priority?: number;
  fault?: FaultConfig;
  rateLimit?: RateLimitConfig;
}

/** Sprint 13.32: per-server webhook callback fired when any protocol handler matches */
export interface ProtocolWebhookConfig {
  url: string;
  delayMs?: number;
  /** Retry attempts on failure (max 3, default 1) */
  retries?: number;
  /** ms between retries (default 1000) */
  retryDelayMs?: number;
  /** Bearer token or full Authorization header value */
  authHeader?: string;
  /** Optional extra headers */
  headers?: Record<string, string>;
  /** Filter to specific event types: 'connection' | 'message' | 'publish' | 'all' */
  eventFilter?: string;
}

export interface MockServerConfig {
  id: string;
  name: string;
  description: string;
  protocol: MockServerProtocol;
  routes: MockRoute[];
  graphqlOperations?: GraphQLMockOperation[];
  graphqlSchema?: string;
  wsHandlers?: WebSocketMockHandler[];
  sseEvents?: SSEMockEvent[];
  socketioHandlers?: SocketIOMockHandler[];
  mqttTopics?: MQTTMockTopic[];
  grpcMethods?: GrpcMockMethod[];
  grpcProtoFile?: string;
  soapOperations?: SoapMockOperation[];
  soapWsdl?: string;
  aiScenarios?: AiMockScenario[];
  mcpTools?: McpMockTool[];
  port?: number;
  /** Sprint 13.32: HTTP callbacks to fire when any non-REST protocol handler matches */
  protocolWebhooks?: ProtocolWebhookConfig[];

  // State machine (6A.11-6A.12)
  stateMachine?: StateMachineConfig;

  // Global fault injection / chaos (6A.15)
  globalFault?: FaultConfig;

  // Global rate limiting (6A.14)
  globalRateLimit?: RateLimitConfig;

  // Record & playback (6A.16-6A.18)
  recordingMode?: boolean;
  proxyTarget?: string;
  recordedTraffic?: RecordedRequest[];
}

export interface MockLogEntry {
  id: string;
  timestamp: number;
  serverId: string;
  direction: 'incoming' | 'outgoing' | 'system';
  protocol: MockServerProtocol;
  method?: HttpMethod;
  path?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  duration?: number; // ms
  clientId?: string; // for WS/SSE/SocketIO connections
  event?: string; // event type
  /** Sprint 13.33: which handler was matched (for non-REST protocols) */
  matchedHandlerId?: string;
  matchedHandlerName?: string;
  /** Sprint 13.33: template variables extracted from the payload */
  extractedVars?: Record<string, string>;
}
