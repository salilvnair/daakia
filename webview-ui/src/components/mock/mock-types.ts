/**
 * Mock Server types shared across all mock UI components.
 */
export type MockServerProtocol = 'rest' | 'graphql' | 'websocket' | 'sse' | 'socketio' | 'mqtt' | 'grpc' | 'soap' | 'ai' | 'mcp';

export interface AiMockScenario {
  id: string;
  name: string;
  keywords: string[];
  response: string;
  delay: number;
  enabled: boolean;
}

export interface McpMockTool {
  id: string;
  name: string;
  description: string;
  inputSchema: string;
  response: string;
  delay: number;
  enabled: boolean;
}
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

// ─── Advanced Matching Types (6A.1-6A.4) ────────────────────────────────────

export type UrlMatchType = 'exact' | 'regex' | 'glob' | 'template' | 'pathPrefix';
export type MatchType = 'equalTo' | 'contains' | 'regex' | 'absent' | 'present' | 'startsWith' | 'endsWith' | 'notContaining';
export type BodyMatchType = 'equalTo' | 'equalToJson' | 'matchesJsonPath' | 'matchesJsonSchema' | 'equalToXml' | 'matchesXPath' | 'contains' | 'regex';
export type CompositeLogic = 'AND' | 'OR';

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

export interface BodyMatcher {
  matchType: BodyMatchType;
  value: string;
  ignoreArrayOrder?: boolean;
  ignoreExtraElements?: boolean;
  negate?: boolean;
}

// ─── Fault Injection (6A.13-6A.15) ──────────────────────────────────────────

export type FaultType = 'CONNECTION_RESET' | 'EMPTY_RESPONSE' | 'MALFORMED_JSON' | 'CHUNKED_DRIBBLE' | 'TIMEOUT' | 'RANDOM_5XX';

export interface FaultConfig {
  enabled: boolean;
  type?: FaultType;
  probability?: number;
  delayMs?: number;
  randomDelayRange?: { min: number; max: number };
  errorRate?: number;
}

// ─── Rate Limiting (6A.14) ──────────────────────────────────────────────────

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerWindow: number;
  windowMs: number;
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

// ─── MockRoute (extended with all 6A features) ───────────────────────────────

export interface MockRoute {
  id: string;
  method: HttpMethod | 'ANY';
  path: string;
  statusCode: number;
  headers: Record<string, string>;
  headerRows?: Array<{ key: string; value: string; enabled: boolean }>;
  body: string;
  delay: number;
  enabled: boolean;

  // Advanced matching (6A.1-6A.4)
  urlMatch?: UrlMatchConfig;
  headerMatchers?: MatchRule[];
  queryParamMatchers?: MatchRule[];
  cookieMatchers?: MatchRule[];
  bodyMatcher?: BodyMatcher;
  compositeLogic?: CompositeLogic;

  // Priority (6A.5)
  priority?: number;

  // Handlebars templating (6A.7)
  isTemplate?: boolean;

  // Body source (6A.10)
  bodySource?: 'inline' | 'file' | 'proxy';
  bodyFile?: string;
  proxyTarget?: string;

  // State machine (6A.11)
  requiredState?: string;
  newState?: string;
  stateVariableUpdates?: Record<string, string>;

  // Fault injection (6A.13)
  fault?: FaultConfig;

  // Rate limiting (6A.14)
  rateLimit?: RateLimitConfig;

  // Response sequences (6A.22)
  responses?: ResponseSequenceItem[];
  sequenceMode?: SequenceMode;

  // Webhooks (6A.23)
  webhooks?: WebhookConfig[];

  /** Optional JS script to dynamically generate response body (for OAuth/JWT flows) */
  responseScript?: string;
  /** Where to forward/store generated token */
  tokenOutput?: TokenOutputConfig;
}

export interface TokenOutputConfig {
  storeTo: 'env' | 'header' | 'body';
  envVarName?: string;
  headerName?: string;
  tokenField?: string;
}

export interface MockServer {
  id: string;
  name: string;
  description: string;
  protocol: MockServerProtocol;
  port: number | null;
  routes: MockRoute[];
  graphqlSchema?: string;
  graphqlOperations?: GraphQLMockOperation[];
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
  running: boolean;
  createdAt: number;

  // WireMock-grade features (6A)
  stateMachine?: StateMachineConfig;
  globalFault?: FaultConfig;
  globalRateLimit?: RateLimitConfig;
  recordingMode?: boolean;
  proxyTarget?: string;
  recordedTraffic?: RecordedRequest[];
}

export interface GraphQLMockOperation {
  id: string;
  operationType: 'query' | 'mutation' | 'subscription';
  operationName: string;
  response: string;
  statusCode: number;
  delay: number;
  enabled: boolean;
}

export interface WebSocketMockHandler {
  id: string;
  event: 'connection' | 'message' | 'disconnect';
  matchPattern: string;
  response: string;
  delay: number;
  enabled: boolean;
  broadcast: boolean;
}

export interface SSEMockEvent {
  id: string;
  eventName: string;
  data: string;
  intervalMs: number;
  delay: number;
  enabled: boolean;
  repeat: boolean;
}

export interface SocketIOMockHandler {
  id: string;
  event: 'connection' | 'message' | 'disconnect';
  listenEvent: string;
  emitEvent: string;
  response: string;
  delay: number;
  enabled: boolean;
  broadcast: boolean;
}

export interface MQTTMockTopic {
  id: string;
  topic: string;
  qos: 0 | 1 | 2;
  retain: boolean;
  payload: string;
  intervalMs: number;
  enabled: boolean;
}

export interface GrpcMockMethod {
  id: string;
  service: string;
  method: string;
  type: 'unary' | 'server_streaming' | 'client_streaming' | 'bidi_streaming';
  response: string;
  responseScript?: string;
  streamResponses?: Array<{ data: string; delayMs: number }>;
  enabled: boolean;
  delay?: number;
  statusCode?: number;
  serviceEnabled?: boolean;
}

export interface SoapMockOperation {
  id: string;
  service: string;
  operation: string;
  soapAction: string;
  responseType: 'static' | 'script' | 'fault';
  response: string;
  responseScript?: string;
  faultCode?: string;
  faultString?: string;
  delay: number;
  enabled: boolean;
  serviceEnabled?: boolean;
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
  duration?: number;
  clientId?: string;
  event?: string;
}

// ────────── Helpers ──────────

export function createDefaultRoute(): MockRoute {
  return {
    id: crypto.randomUUID(),
    method: 'GET',
    path: '/',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '{\n  "message": "Hello from mock server"\n}',
    delay: 0,
    enabled: true,
  };
}

export function createDefaultSSEEvent(): SSEMockEvent {
  return {
    id: crypto.randomUUID(),
    eventName: 'message',
    data: '{"timestamp": "{{now}}","value": 42}',
    intervalMs: 2000,
    delay: 0,
    enabled: true,
    repeat: true,
  };
}

export function createDefaultSocketIOHandler(): SocketIOMockHandler {
  return {
    id: crypto.randomUUID(),
    event: 'message',
    listenEvent: 'chat message',
    emitEvent: 'chat response',
    response: '{"text": "Echo: received your message"}',
    delay: 0,
    enabled: true,
    broadcast: false,
  };
}

export function createDefaultMQTTTopic(): MQTTMockTopic {
  return {
    id: crypto.randomUUID(),
    topic: 'test/hello',
    qos: 0,
    retain: false,
    payload: '{"message": "Hello from MQTT mock broker"}',
    intervalMs: 5000,
    enabled: true,
  };
}

export function createDefaultAiScenario(): AiMockScenario {
  return {
    id: crypto.randomUUID(),
    name: 'Custom Scenario',
    keywords: ['custom', 'example'],
    response: 'This is a custom mock AI response. Edit the keywords to match your use case and update this response.',
    delay: 300,
    enabled: true,
  };
}

export function createDefaultMcpTool(): McpMockTool {
  return {
    id: crypto.randomUUID(),
    name: 'my_tool',
    description: 'A custom MCP tool. Describe what it does here.',
    inputSchema: JSON.stringify({ type: 'object', properties: { input: { type: 'string', description: 'Tool input' } }, required: ['input'] }),
    response: JSON.stringify({ result: 'Tool executed successfully', data: { input: '(echoed from request)' } }),
    delay: 200,
    enabled: true,
  };
}

export function createDefaultServer(name: string, protocol: MockServerProtocol = 'rest'): MockServer {
  return {
    id: crypto.randomUUID(),
    name,
    description: '',
    protocol,
    port: null,
    routes: protocol === 'rest' ? [createDefaultRoute()] : [],
    sseEvents: protocol === 'sse' ? [createDefaultSSEEvent()] : [],
    socketioHandlers: protocol === 'socketio' ? [createDefaultSocketIOHandler()] : [],
    mqttTopics: protocol === 'mqtt' ? [createDefaultMQTTTopic()] : [],
    aiScenarios: protocol === 'ai' ? [] : [],  // empty = use 15 built-in defaults on server
    mcpTools: protocol === 'mcp' ? [] : [],   // empty = use 15 built-in defaults on server
    running: false,
    createdAt: Date.now(),
  };
}

/**
 * Create a sample OAuth/JWT mock server with full OAuth2 Authorization Code flow.
 */
export function createOAuthSampleServer(): MockServer {
  return {
    id: crypto.randomUUID(),
    name: 'OAuth Mock Server',
    description: 'Full OAuth2 Authorization Code flow with login page, token endpoint, and protected APIs',
    protocol: 'rest',
    port: null,
    routes: [
      // ─── OAuth2 Authorization Code Flow ───
      {
        id: crypto.randomUUID(),
        method: 'GET',
        path: '/oauth/authorize',
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `
const redirect_uri = req.query.redirect_uri || 'http://localhost:3000/callback';
const state = req.query.state || '';
const client_id = req.query.client_id || 'default-client';

return \`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OAuth 2.0 Authorization</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0f0f23 0%,#1a1a3e 50%,#0f0f23 100%);color:#e2e8f0;overflow:hidden}
body::before{content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle at 30% 40%,rgba(99,102,241,0.08) 0%,transparent 50%),radial-gradient(circle at 70% 60%,rgba(139,92,246,0.06) 0%,transparent 50%);animation:drift 20s ease-in-out infinite}
@keyframes drift{0%,100%{transform:translate(0,0)}50%{transform:translate(-2%,1%)}}
.container{position:relative;z-index:1;width:100%;max-width:420px;padding:20px}
.card{background:rgba(30,30,60,0.6);backdrop-filter:blur(20px);border:1px solid rgba(99,102,241,0.2);border-radius:16px;padding:40px 32px;box-shadow:0 25px 60px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.05)}
.header{text-align:center;margin-bottom:32px}
.header h1{font-size:22px;font-weight:700;background:linear-gradient(135deg,#818cf8,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.header p{font-size:13px;color:#94a3b8}
.chip{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;margin:4px}
.form-group{margin-bottom:20px}
.form-group label{display:block;font-size:12px;font-weight:500;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px}
.form-group input{width:100%;padding:12px 16px;background:rgba(15,15,35,0.8);border:1px solid rgba(99,102,241,0.2);border-radius:10px;color:#e2e8f0;font-size:14px;transition:all 0.3s ease;outline:none}
.form-group input:focus{border-color:rgba(99,102,241,0.6);box-shadow:0 0 0 3px rgba(99,102,241,0.1),0 0 20px rgba(99,102,241,0.1)}
.form-group input::placeholder{color:#475569}
.btn{width:100%;padding:14px;border:none;border-radius:10px;font-size:15px;font-weight:600;color:#fff;background:linear-gradient(135deg,#6366f1,#8b5cf6);cursor:pointer;transition:all 0.3s ease;margin-top:8px}
.btn:hover{transform:translateY(-1px);box-shadow:0 10px 30px rgba(99,102,241,0.3)}
.btn:active{transform:translateY(0)}
.footer{text-align:center;margin-top:24px;font-size:11px;color:#475569}
.footer span{color:#6366f1}
</style>
</head>
<body>
<div class="container">
<div class="card">
<div class="header">
<h1>OAuth 2.0 Authorization</h1>
<p>Grant access to your account</p>
<div style="margin-top:12px">
<span class="chip">\${client_id}</span>
</div>
</div>
<form onsubmit="handleAuth(event)">
<div class="form-group">
<label>Username</label>
<input type="text" id="username" placeholder="Enter your username" required autocomplete="username" />
</div>
<div class="form-group">
<label>Password</label>
<input type="password" id="password" placeholder="Enter your password" required autocomplete="current-password" />
</div>
<button type="submit" class="btn">Authorize</button>
</form>
<div class="footer">Powered by <span>Daakia Mock Server</span></div>
</div>
</div>
<script>
function handleAuth(e){
e.preventDefault();
var u=document.getElementById('username').value;
var code=btoa(u+':'+Date.now());
var safeCode=code.replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
window.location.href='\${redirect_uri}'+'?code='+safeCode+'&state='+'\${state}';
}
</script>
</body>
</html>\`;
`,
      },
      {
        id: crypto.randomUUID(),
        method: 'POST',
        path: '/oauth/token',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 100,
        enabled: true,
        responseScript: `
// OAuth2 Token endpoint — supports authorization_code and refresh_token grants
const body = req.body || {};
const grant_type = body.grant_type;

if (grant_type === 'authorization_code') {
  const code = body.code || '';
  let username = 'unknown';
  try { username = atob(code).split(':')[0]; } catch(e) {}
  const accessToken = jwt.sign(
    { sub: username, role: 'user', scope: 'openid profile email' },
    'mock-secret-key',
    { expiresIn: 3600 }
  );
  const refreshToken = jwt.sign(
    { sub: username, type: 'refresh' },
    'mock-refresh-secret',
    { expiresIn: 86400 }
  );
  const idToken = jwt.sign(
    { sub: username, name: username, email: username + '@example.com', iss: 'daakia-mock' },
    'mock-secret-key',
    { expiresIn: 3600 }
  );
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    id_token: idToken,
    token_type: 'Bearer',
    expires_in: 3600
  };
}

if (grant_type === 'refresh_token') {
  const newToken = jwt.sign(
    { sub: 'refreshed-user', role: 'user', scope: 'openid profile email' },
    'mock-secret-key',
    { expiresIn: 3600 }
  );
  return {
    access_token: newToken,
    token_type: 'Bearer',
    expires_in: 3600
  };
}

return { error: 'unsupported_grant_type', status: 400 };
`,
      },
      {
        id: crypto.randomUUID(),
        method: 'GET',
        path: '/oauth/userinfo',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `
// Protected userinfo endpoint
const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
if (!auth.startsWith('Bearer ')) {
  return { error: 'invalid_token', error_description: 'Missing or invalid Bearer token', status: 401 };
}
const token = auth.replace('Bearer ', '');
if (token.split('.').length !== 3) {
  return { error: 'invalid_token', error_description: 'Malformed token', status: 401 };
}
let sub = 'mock-user';
try { sub = JSON.parse(atob(token.split('.')[1])).sub || sub; } catch(e) {}
return {
  sub,
  name: sub,
  email: sub + '@example.com',
  email_verified: true,
  picture: 'https://i.pravatar.cc/150'
};
`,
      },
      {
        id: crypto.randomUUID(),
        method: 'GET',
        path: '/.well-known/openid-configuration',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `
// OpenID Connect Discovery document
const host = req.headers['host'] || 'localhost:3000';
const issuer = 'http://' + host;
return {
  issuer,
  authorization_endpoint: issuer + '/oauth/authorize',
  token_endpoint: issuer + '/oauth/token',
  userinfo_endpoint: issuer + '/oauth/userinfo',
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['HS256'],
  scopes_supported: ['openid', 'profile', 'email'],
  token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic']
};
`,
      },
      // ─── Legacy password-based routes (backward compatibility) ───
      {
        id: crypto.randomUUID(),
        method: 'POST',
        path: '/auth/login',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 100,
        enabled: true,
        responseScript: `
const { username, password } = req.body || {};
if (!username || !password) {
  return { error: 'Missing credentials', status: 400 };
}
if (password.length < 3) {
  return { error: 'Invalid credentials', status: 401 };
}
const accessToken = jwt.sign(
  { sub: username, role: 'user', scope: 'read write' },
  'mock-secret-key',
  { expiresIn: 3600 }
);
const refreshToken = jwt.sign(
  { sub: username, type: 'refresh' },
  'mock-refresh-secret',
  { expiresIn: 86400 }
);
return {
  access_token: accessToken,
  refresh_token: refreshToken,
  token_type: 'Bearer',
  expires_in: 3600,
  user: { id: crypto.randomUUID(), username, role: 'user' }
};
`,
      },
      {
        id: crypto.randomUUID(),
        method: 'POST',
        path: '/auth/refresh',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 50,
        enabled: true,
        responseScript: `
const { refresh_token } = req.body || {};
if (!refresh_token) {
  return { error: 'Missing refresh_token', status: 401 };
}
const newToken = jwt.sign(
  { sub: 'refreshed-user', role: 'user', scope: 'read write' },
  'mock-secret-key',
  { expiresIn: 3600 }
);
return {
  access_token: newToken,
  token_type: 'Bearer',
  expires_in: 3600
};
`,
      },
      {
        id: crypto.randomUUID(),
        method: 'GET',
        path: '/api/profile',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `
const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
if (!auth.startsWith('Bearer ')) {
  return { error: 'Unauthorized', message: 'Missing or invalid Bearer token', status: 401 };
}
const token = auth.replace('Bearer ', '');
if (token.split('.').length !== 3) {
  return { error: 'Unauthorized', message: 'Invalid token format', status: 401 };
}
return {
  id: crypto.randomUUID(),
  username: 'mock-user',
  email: 'user@example.com',
  role: 'user',
  profile: { firstName: 'Test', lastName: 'User', avatar: 'https://i.pravatar.cc/150' }
};
`,
      },
      {
        id: crypto.randomUUID(),
        method: 'GET',
        path: '/api/orders',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 50,
        enabled: true,
        responseScript: `
const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
if (!auth.startsWith('Bearer ')) {
  return { error: 'Unauthorized', status: 401 };
}
return {
  orders: [
    { id: crypto.randomUUID(), item: 'Widget Pro', qty: 2, total: 49.98, status: 'shipped' },
    { id: crypto.randomUUID(), item: 'Gadget X', qty: 1, total: 129.99, status: 'processing' },
  ],
  total: 2
};
`,
      },
    ],
    running: false,
    createdAt: Date.now(),
  };
}

/**
 * Create a sample REST CRUD mock server.
 */
export function createCrudSampleServer(): MockServer {
  return {
    id: crypto.randomUUID(),
    name: 'CRUD API Server',
    description: 'Basic REST CRUD API with items resource',
    protocol: 'rest',
    port: null,
    routes: [
      {
        id: crypto.randomUUID(),
        method: 'GET',
        path: '/api/items',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `
return {
  items: [
    { id: '1', name: 'Item One', description: 'First item', createdAt: '2025-01-01T00:00:00Z' },
    { id: '2', name: 'Item Two', description: 'Second item', createdAt: '2025-01-02T00:00:00Z' },
    { id: '3', name: 'Item Three', description: 'Third item', createdAt: '2025-01-03T00:00:00Z' },
  ],
  total: 3
};
`,
      },
      {
        id: crypto.randomUUID(),
        method: 'GET',
        path: '/api/items/:id',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `
const id = req.params.id;
return { id, name: 'Item ' + id, description: 'Details for item ' + id, createdAt: new Date().toISOString() };
`,
      },
      {
        id: crypto.randomUUID(),
        method: 'POST',
        path: '/api/items',
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `
const { name, description } = req.body || {};
return { id: crypto.randomUUID(), name: name || 'New Item', description: description || '', createdAt: new Date().toISOString() };
`,
      },
      {
        id: crypto.randomUUID(),
        method: 'PUT',
        path: '/api/items/:id',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `
const id = req.params.id;
const { name, description } = req.body || {};
return { id, name: name || 'Updated Item', description: description || '', updatedAt: new Date().toISOString() };
`,
      },
      {
        id: crypto.randomUUID(),
        method: 'DELETE',
        path: '/api/items/:id',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `
return { message: 'Item ' + req.params.id + ' deleted successfully' };
`,
      },
    ],
    running: false,
    createdAt: Date.now(),
  };
}
