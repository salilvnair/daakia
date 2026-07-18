/**
 * Seed-data constants for wiki-capture-mockserver.test.ts — split out purely
 * to keep the test file itself under CLAUDE.md's ~600-line file cap. Not a
 * test itself (doesn't match *.test.js, so Mocha's suite glob skips it).
 */

export const REST_SERVER = {
  id: 'wiki-mock-rest', name: 'users-api', description: 'Full user management API with list, create, and delete operations.',
  protocol: 'rest', port: null, running: false, createdAt: Date.now(),
  routes: [
    { id: 'r1', method: 'GET', path: '/api/users', statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '{"users":[{"id":1,"name":"Alice Johnson"}],"total":1}', delay: 0, enabled: true },
    { id: 'r2', method: 'POST', path: '/api/users', statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: '{"id":3,"name":"New User"}', delay: 0, enabled: true },
    { id: 'r3', method: 'DELETE', path: '/api/users/:id', statusCode: 204, headers: {}, body: '', delay: 0, enabled: true },
  ],
};

export const GRPC_SERVER = {
  id: 'wiki-mock-grpc', name: 'user-service', description: 'gRPC UserService mock with CRUD methods.',
  protocol: 'grpc', port: null, running: false, createdAt: Date.now(),
  routes: [],
  grpcMethods: [
    { id: 'g1', service: 'users.v1.UserService', method: 'GetUser', type: 'unary', response: '{"id":"usr_001","name":"Alice Johnson"}', enabled: true },
    { id: 'g2', service: 'users.v1.UserService', method: 'ListUsers', type: 'unary', response: '{"users":[]}', enabled: true },
  ],
};

// ── Route editor sub-tab screens — each its own single-route server so the
// route path is unique on the page for clickText, and the seeded fields are
// scoped to exactly what that sub-tab needs to look realistic. ─────────────

export const ROUTE_RESPONSE_SERVER = {
  id: 'wiki-mock-route-resp', name: 'orders-api', description: 'Order creation API.',
  protocol: 'rest', port: null, running: false, createdAt: Date.now(),
  routes: [{
    id: 'rr-resp', method: 'POST', path: '/api/orders', statusCode: 201,
    headers: { 'Content-Type': 'application/json', 'X-RateLimit-Remaining': '99' },
    body: JSON.stringify({ id: 'ord_1042', status: 'created', total: 89.5 }, null, 2),
    delay: 250, enabled: true, bodySource: 'inline',
  }],
};

export const ROUTE_MATCHING_SERVER = {
  id: 'wiki-mock-route-match', name: 'filtered-api', description: 'API demonstrating advanced route matching.',
  protocol: 'rest', port: null, running: false, createdAt: Date.now(),
  routes: [{
    id: 'rr-match', method: 'GET', path: '/api/users/search', statusCode: 200,
    headers: { 'Content-Type': 'application/json' }, body: '{"users":[]}', delay: 0, enabled: true,
    urlMatch: { type: 'exact', value: '/api/users/search', caseInsensitive: false },
    queryParamMatchers: [{ id: 'm1', key: 'status', matchType: 'equalTo', value: 'active' }],
    headerMatchers: [{ id: 'm2', key: 'X-Api-Version', matchType: 'equalTo', value: 'v2' }],
    bodyMatcher: { matchType: 'equalToJson', value: '{"role":"admin"}' },
    compositeLogic: 'AND', priority: 10,
  }],
};

export const ROUTE_ADVANCED_SERVER = {
  id: 'wiki-mock-route-adv', name: 'flaky-api', description: 'API demonstrating fault injection and rate limiting.',
  protocol: 'rest', port: null, running: false, createdAt: Date.now(),
  routes: [{
    id: 'rr-adv', method: 'GET', path: '/api/flaky', statusCode: 200,
    headers: {}, body: '{"ok":true}', delay: 0, enabled: true,
    fault: { enabled: true, type: 'RANDOM_5XX', probability: 0.25, delayMs: 200 },
    rateLimit: { enabled: true, requestsPerWindow: 100, windowMs: 60000, burstAllowance: 20 },
  }],
};

export const ROUTE_SEQUENCE_SERVER = {
  id: 'wiki-mock-route-seq', name: 'jobs-api', description: 'API demonstrating multi-response route sequences.',
  protocol: 'rest', port: null, running: false, createdAt: Date.now(),
  routes: [{
    id: 'rr-seq', method: 'GET', path: '/api/jobs/42/status', statusCode: 200,
    headers: {}, body: '{"status":"pending"}', delay: 0, enabled: true,
    responses: [
      { id: 's1', statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '{"status":"pending"}' },
      { id: 's2', statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '{"status":"processing"}' },
      { id: 's3', statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '{"status":"done"}' },
    ],
    sequenceMode: 'round-robin',
  }],
};

export const STATEMACHINE_SERVER = {
  id: 'wiki-mock-sm', name: 'checkout-api', description: 'API gated behind a real state-machine workflow.',
  protocol: 'rest', port: null, running: false, createdAt: Date.now(),
  routes: [{
    id: 'rr-sm', method: 'POST', path: '/api/orders/:id/pay', statusCode: 200,
    headers: { 'Content-Type': 'application/json' }, body: '{"status":"paid"}', delay: 0, enabled: true,
    connectedWorkflowId: 'wf-1', triggerEvent: 'PAY',
  }],
  connectedWorkflows: [
    {
      workflowId: 'wf-1', name: 'Order Lifecycle',
      stateMachine: {
        enabled: true, sessionMode: 'header', sessionKey: 'X-Session-ID', defaultState: 'created',
        states: [],
        transitions: [
          { id: 't1', from: 'created', to: 'paid', routeId: '', label: 'PAY' },
          { id: 't2', from: 'paid', to: 'shipped', routeId: '', label: 'SHIP' },
        ],
      },
    },
    {
      workflowId: 'wf-2', name: 'Refund Flow',
      stateMachine: {
        enabled: true, sessionMode: 'header', defaultState: 'requested',
        states: [],
        transitions: [{ id: 't3', from: 'requested', to: 'approved', routeId: '', label: 'APPROVE' }],
      },
    },
  ],
};

export const CHAOS_SERVER = {
  id: 'wiki-mock-chaos', name: 'unreliable-api', description: 'API with server-wide fault injection and rate limiting.',
  protocol: 'rest', port: null, running: false, createdAt: Date.now(),
  routes: [{ id: 'r1', method: 'GET', path: '/api/ping', statusCode: 200, headers: {}, body: '{"pong":true}', delay: 0, enabled: true }],
  globalFault: { enabled: true, type: 'RANDOM_5XX', probability: 0.25 },
  globalRateLimit: { enabled: true, requestsPerWindow: 1000, windowMs: 60000 },
};

export const GRAPHQL_CONFIG_SERVER = {
  id: 'wiki-mock-gql', name: 'catalog-graphql', description: 'GraphQL product catalog API.',
  protocol: 'graphql', port: null, running: false, createdAt: Date.now(),
  routes: [],
  graphqlSchema: 'type Query {\n  users: [User!]!\n  user(id: ID!): User\n}\n\ntype User {\n  id: ID!\n  name: String!\n  email: String\n}',
  graphqlOperations: [
    { id: 'op1', operationType: 'query', operationName: 'users', response: '{"data":{"users":[{"id":"1","name":"Alice Johnson"}]}}', statusCode: 200, delay: 0, enabled: true },
  ],
};

export const SOAP_CONFIG_SERVER = {
  id: 'wiki-mock-soap', name: 'weather-soap', description: 'SOAP weather lookup service.',
  protocol: 'soap', port: null, running: false, createdAt: Date.now(),
  routes: [],
  soapOperations: [{
    id: 'op1', service: 'WeatherService', operation: 'GetWeather',
    soapAction: 'http://example.com/weather/GetWeather',
    responseType: 'static',
    response: '<?xml version="1.0"?>\n<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetWeatherResponse><temperature>72</temperature></GetWeatherResponse></soap:Body></soap:Envelope>',
    delay: 0, enabled: true, serviceEnabled: true,
  }],
};

export const WS_HANDLERS_SERVER = {
  id: 'wiki-mock-ws-cfg', name: 'chat-ws', description: 'WebSocket chat server mock.',
  protocol: 'websocket', port: null, running: false, createdAt: Date.now(),
  routes: [],
  wsHandlers: [
    { id: 'h1', event: 'connection', matchPattern: '', response: '{"type":"welcome","message":"Connected to mock server"}', delay: 0, enabled: true, broadcast: false },
    { id: 'h2', event: 'message', matchPattern: '^ping$', response: '{"type":"pong"}', delay: 0, enabled: true, broadcast: false },
    { id: 'h3', event: 'disconnect', matchPattern: '', response: '{"echo":true}', delay: 0, enabled: true, broadcast: false },
  ],
};

export const SIO_HANDLERS_SERVER = {
  id: 'wiki-mock-sio-cfg', name: 'chat-sio', description: 'Socket.IO chat server mock.',
  protocol: 'socketio', port: null, running: false, createdAt: Date.now(),
  routes: [],
  socketioHandlers: [
    { id: 'h1', event: 'message', listenEvent: 'chat message', emitEvent: 'chat response', response: '{"text":"Echo: received your message"}', delay: 0, enabled: true, broadcast: false },
  ],
};

export const SSE_EVENTS_SERVER = {
  id: 'wiki-mock-sse-cfg', name: 'prices-sse', description: 'SSE live price-feed mock.',
  protocol: 'sse', port: null, running: false, createdAt: Date.now(),
  routes: [],
  sseEvents: [
    { id: 'e1', eventName: 'price-update', data: '{"symbol":"AAPL","price":182.34}', intervalMs: 3000, delay: 0, enabled: true, repeat: true },
  ],
};

export const MQTT_TOPICS_SERVER = {
  id: 'wiki-mock-mqtt-cfg', name: 'sensors-mqtt', description: 'MQTT sensor telemetry mock.',
  protocol: 'mqtt', port: null, running: false, createdAt: Date.now(),
  routes: [],
  mqttTopics: [
    { id: 't1', topic: 'sensors/temperature', qos: 1, retain: false, payload: '{"value":22.5,"unit":"C"}', intervalMs: 5000, enabled: true },
  ],
};

export const IMPORT_SERVER = {
  id: 'wiki-mock-import', name: 'import-demo-api', description: 'API used to demonstrate the Import panel.',
  protocol: 'rest', port: null, running: false, createdAt: Date.now(), routes: [],
};

export const WSDL_IMPORT_SERVER = {
  id: 'wiki-mock-wsdl', name: 'import-demo-soap', description: 'SOAP server used to demonstrate WSDL import.',
  protocol: 'soap', port: null, running: false, createdAt: Date.now(), routes: [],
};
