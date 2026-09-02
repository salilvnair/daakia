/**
 * Quick Mocks — turn a sidebar request (History row, collection request, whole collection)
 * into a stub on a shared per-protocol "Quick Mocks" mock server.
 *
 * Everything used to be funnelled into the REST server, so mocking a GraphQL / SOAP / gRPC /
 * realtime / MCP entry produced a REST route with the wrong shape (and in the wrong tab).
 * The protocol the entry actually belongs to now decides both the target server and the kind
 * of stub that gets created.
 */
import type {
  MockServer, MockServerProtocol, MockRoute, GraphQLMockOperation, WebSocketMockHandler,
  SSEMockEvent, SocketIOMockHandler, MQTTMockTopic, GrpcMockMethod, SoapMockOperation,
  McpMockTool, AiMockScenario,
} from './mock-types';
import { createDefaultServer, createDefaultRoute } from './mock-types';

/** The minimum a sidebar entry carries — `name` is absent for older History payloads. */
export interface QuickMockRequest {
  name?: string;
  method?: string;
  url?: string;
}

const MOCK_PROTOCOLS = new Set<string>(['rest', 'graphql', 'websocket', 'sse', 'socketio', 'mqtt', 'grpc', 'soap', 'ai', 'mcp']);

/**
 * The realtime sidebar keeps WebSocket / SSE / Socket.IO / MQTT under one `websocket`
 * protocol and tells them apart by the display method — mock servers don't, so the method
 * wins whenever it names a protocol of its own.
 */
const METHOD_PROTOCOLS: Record<string, MockServerProtocol> = {
  WS: 'websocket', WEBSOCKET: 'websocket',
  SSE: 'sse',
  SIO: 'socketio', SOCKETIO: 'socketio',
  MQTT: 'mqtt',
  GRPC: 'grpc',
  SOAP: 'soap',
  GQL: 'graphql', GRAPHQL: 'graphql',
  MCP: 'mcp',
};

export const QUICK_MOCK_PROTOCOL_LABELS: Record<MockServerProtocol, string> = {
  rest: 'REST', graphql: 'GraphQL', websocket: 'WebSocket', sse: 'SSE', socketio: 'Socket.IO',
  mqtt: 'MQTT', grpc: 'gRPC', soap: 'SOAP', ai: 'AI', mcp: 'MCP',
};

/** Which mock server protocol can actually serve this entry. */
export function resolveMockProtocol(protocol?: string, method?: string): MockServerProtocol {
  const byMethod = METHOD_PROTOCOLS[(method || '').trim().toUpperCase()];
  if (byMethod) return byMethod;
  const p = (protocol || '').trim().toLowerCase();
  return MOCK_PROTOCOLS.has(p) ? (p as MockServerProtocol) : 'rest';
}

/** REST keeps the original "Quick Mocks" name so existing servers keep collecting stubs. */
export function quickMockServerName(protocol: MockServerProtocol): string {
  return protocol === 'rest' ? 'Quick Mocks' : `Quick Mocks (${QUICK_MOCK_PROTOCOL_LABELS[protocol]})`;
}

/** A Quick Mocks server starts empty — the per-protocol placeholder stub would just be noise. */
export function createQuickMockServer(protocol: MockServerProtocol): MockServer {
  return {
    ...createDefaultServer(quickMockServerName(protocol), protocol),
    routes: [], sseEvents: [], socketioHandlers: [], mqttTopics: [],
  };
}

// ─── Naming helpers ──────────────────────────────────────────────────────────

function label(req: QuickMockRequest): string {
  return (req.name || req.url || '').trim() || 'mock';
}

/** `Get User Profile` → `GetUserProfile` — safe as a GraphQL/SOAP/gRPC identifier. */
function pascalCase(raw: string, fallback: string): string {
  const parts = raw.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return parts.map(p => p[0].toUpperCase() + p.slice(1)).join('');
}

/** `Get User Profile` → `get_user_profile` — MCP tool / event naming. */
function snakeCase(raw: string, fallback: string): string {
  const s = raw.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  return s || fallback;
}

/**
 * The part of a request URL a mock route should answer on.
 *
 * A mock replaces the host: you point `{{backend}}` at the mock's own address
 * and the paths underneath stay the same. So the host — however it is written
 * — is exactly what has to come off, and everything after it has to survive
 * untouched.
 *
 * It used to go through `new URL(url, 'http://placeholder')`, which does the
 * opposite of both. With no scheme, `{{backend}}/actuator/health` is not a
 * host and a path — it is one relative path whose first segment happens to
 * contain braces, so mocking a collection produced routes like
 * `/%7B%7Bbackend%7D%7D/actuator/health`: the variable kept as a literal
 * segment, percent-encoded, matching nothing anyone would ever request. The
 * same encoding hit variables in the middle of a path, so `/users/{{id}}`
 * became `/users/%7B%7Bid%7D%7D` even when the host was written out in full.
 *
 * Hence string surgery rather than a URL parse: a template is not a URL, and
 * the parser's job here is to know which prefix is the host, not to normalise
 * the rest.
 */
function pathFromUrl(url: string | undefined): string {
  let path = (url || '/').trim();

  // `scheme://host[:port]` — the written-out form.
  path = path.replace(/^[a-zA-Z][\w+.-]*:\/\/[^/?#]*/, '');

  // A leading `{{var}}` is the host. Only the leading one: a variable further
  // along is part of the path and belongs to the route.
  path = path.replace(/^\{\{[^}]*\}\}/, '');

  // `localhost:8080/api` — a host and port with no scheme at all. Anchored on
  // the port, so a path that merely contains a colon is left alone.
  path = path.replace(/^[a-zA-Z0-9.-]+:\d+(?=[/?#]|$)/, '');

  // A fragment never reaches the server, so it cannot be part of a route.
  path = path.split('#')[0]!;

  if (!path.startsWith('/')) path = '/' + path;
  // Joining a host that ended in `/` to a path that began with one.
  path = path.replace(/\/{2,}/g, '/');
  return path;
}

/**
 * The variables a URL's host was written as, if any.
 *
 * Reported so the mock can say which variable to repoint — the route paths
 * alone do not tell you that `{{backend}}` is now meant to be the mock's
 * address, and that is the one step between a mock existing and it answering.
 */
export function hostVariablesOf(urls: (string | undefined)[]): string[] {
  const names = new Set<string>();
  for (const url of urls) {
    const m = (url || '').trim().match(/^\{\{([^}]+)\}\}/);
    if (m) names.add(m[1]!.trim());
  }
  return [...names];
}

// ─── Per-protocol stub builders ──────────────────────────────────────────────

function toRoute(req: QuickMockRequest): MockRoute {
  return {
    ...createDefaultRoute(),
    id: crypto.randomUUID(),
    method: (req.method as MockRoute['method']) || 'GET',
    path: pathFromUrl(req.url),
    statusCode: 200,
    body: '{}',
  };
}

function toGraphqlOperation(req: QuickMockRequest): GraphQLMockOperation {
  return {
    id: crypto.randomUUID(),
    operationType: 'query',
    operationName: pascalCase(label(req), 'MockQuery'),
    response: '{\n  "data": {}\n}',
    statusCode: 200,
    delay: 0,
    enabled: true,
  };
}

function toWsHandler(req: QuickMockRequest): WebSocketMockHandler {
  return {
    id: crypto.randomUUID(),
    event: 'message',
    matchPattern: '*',
    response: JSON.stringify({ message: `Mock reply for ${label(req)}` }),
    delay: 0,
    enabled: true,
    broadcast: false,
  };
}

function toSseEvent(req: QuickMockRequest): SSEMockEvent {
  return {
    id: crypto.randomUUID(),
    eventName: snakeCase(label(req), 'message'),
    data: '{"value": 42}',
    intervalMs: 2000,
    delay: 0,
    enabled: true,
    repeat: true,
  };
}

function toSocketioHandler(req: QuickMockRequest): SocketIOMockHandler {
  const event = snakeCase(label(req), 'message');
  return {
    id: crypto.randomUUID(),
    event: 'message',
    listenEvent: event,
    emitEvent: `${event}_response`,
    response: '{"ok": true}',
    delay: 0,
    enabled: true,
    broadcast: false,
  };
}

function toMqttTopic(req: QuickMockRequest): MQTTMockTopic {
  // MQTT "URLs" are broker addresses — the topic is carried by the request name.
  const topic = (req.name || '').trim().replace(/^\/+/, '')
    || pathFromUrl(req.url).replace(/^\/+/, '')
    || 'test/hello';
  return {
    id: crypto.randomUUID(),
    topic,
    qos: 0,
    retain: false,
    payload: '{"message": "Hello from MQTT mock broker"}',
    intervalMs: 5000,
    enabled: true,
  };
}

function toGrpcMethod(req: QuickMockRequest): GrpcMockMethod {
  // gRPC entries are named either "package.Service/Method" or just the method.
  const raw = label(req);
  const slash = raw.lastIndexOf('/');
  const service = slash > 0 ? raw.slice(0, slash).trim() : '';
  const method = slash > 0 ? raw.slice(slash + 1) : raw;
  return {
    id: crypto.randomUUID(),
    service: service || 'MockService',
    method: pascalCase(method, 'MockMethod'),
    type: 'unary',
    response: '{}',
    enabled: true,
    delay: 0,
  };
}

function toSoapOperation(req: QuickMockRequest): SoapMockOperation {
  const operation = pascalCase(label(req), 'MockOperation');
  return {
    id: crypto.randomUUID(),
    service: 'MockService',
    operation,
    soapAction: operation,
    responseType: 'static',
    response: [
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
      '  <soap:Body>',
      `    <${operation}Response/>`,
      '  </soap:Body>',
      '</soap:Envelope>',
    ].join('\n'),
    delay: 0,
    enabled: true,
  };
}

function toMcpTool(req: QuickMockRequest): McpMockTool {
  return {
    id: crypto.randomUUID(),
    name: snakeCase(label(req), 'my_tool'),
    description: `Mock tool generated from ${label(req)}`,
    inputSchema: JSON.stringify({ type: 'object', properties: { input: { type: 'string', description: 'Tool input' } }, required: ['input'] }),
    response: JSON.stringify({ result: 'Tool executed successfully' }),
    delay: 200,
    enabled: true,
  };
}

function toAiScenario(req: QuickMockRequest): AiMockScenario {
  const name = label(req);
  return {
    id: crypto.randomUUID(),
    name,
    keywords: name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 4).map(w => w.toLowerCase()),
    response: `Mock AI response for "${name}". Edit the keywords and this response to match your use case.`,
    delay: 300,
    enabled: true,
  };
}

/** What each protocol calls the thing that got added — used in the confirmation toast. */
const STUB_NOUNS: Record<MockServerProtocol, string> = {
  rest: 'route', graphql: 'operation', websocket: 'handler', sse: 'event', socketio: 'handler',
  mqtt: 'topic', grpc: 'method', soap: 'operation', ai: 'scenario', mcp: 'tool',
};

export function quickMockStubNoun(protocol: MockServerProtocol, count: number): string {
  return count === 1 ? STUB_NOUNS[protocol] : `${STUB_NOUNS[protocol]}s`;
}

/**
 * Append one stub per request to `server`, in whatever shape that server's protocol uses.
 * Returns a new server — the caller swaps it into its list.
 */
export function appendQuickMocks(server: MockServer, reqs: QuickMockRequest[]): MockServer {
  switch (server.protocol) {
    case 'graphql':
      return { ...server, graphqlOperations: [...(server.graphqlOperations || []), ...reqs.map(toGraphqlOperation)] };
    case 'websocket':
      return { ...server, wsHandlers: [...(server.wsHandlers || []), ...reqs.map(toWsHandler)] };
    case 'sse':
      return { ...server, sseEvents: [...(server.sseEvents || []), ...reqs.map(toSseEvent)] };
    case 'socketio':
      return { ...server, socketioHandlers: [...(server.socketioHandlers || []), ...reqs.map(toSocketioHandler)] };
    case 'mqtt':
      return { ...server, mqttTopics: [...(server.mqttTopics || []), ...reqs.map(toMqttTopic)] };
    case 'grpc':
      return { ...server, grpcMethods: [...(server.grpcMethods || []), ...reqs.map(toGrpcMethod)] };
    case 'soap':
      return { ...server, soapOperations: [...(server.soapOperations || []), ...reqs.map(toSoapOperation)] };
    case 'mcp':
      return { ...server, mcpTools: [...(server.mcpTools || []), ...reqs.map(toMcpTool)] };
    case 'ai':
      return { ...server, aiScenarios: [...(server.aiScenarios || []), ...reqs.map(toAiScenario)] };
    default:
      return { ...server, routes: [...server.routes, ...reqs.map(toRoute)] };
  }
}
