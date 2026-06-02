/**
 * Shared types for all mock server protocols.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type MockServerProtocol = 'rest' | 'graphql' | 'websocket' | 'sse' | 'socketio' | 'mqtt' | 'grpc' | 'soap';

export interface MockRoute {
  id: string;
  method: HttpMethod;
  path: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  delay: number;
  enabled: boolean;
  /** Optional JS script to dynamically generate response body. Has access to `req` (body, headers, query, params) and must return a string/object. */
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
}

export interface WebSocketMockHandler {
  id: string;
  event: 'connection' | 'message' | 'disconnect';
  matchPattern: string; // regex or exact match for incoming messages
  response: string;
  delay: number;
  enabled: boolean;
  broadcast: boolean; // send to all connected clients
}

export interface SSEMockEvent {
  id: string;
  eventName: string; // SSE event type (e.g., 'message', 'update', 'heartbeat')
  data: string; // event payload (JSON or text)
  intervalMs: number; // repeat interval in ms (0 = send once on connect)
  delay: number; // initial delay before first send
  enabled: boolean;
  repeat: boolean; // if true, keeps sending at intervalMs
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
}

export interface MQTTMockTopic {
  id: string;
  topic: string; // MQTT topic pattern (supports wildcards: +, #)
  qos: 0 | 1 | 2;
  retain: boolean;
  payload: string; // default publish payload (JSON or text)
  intervalMs: number; // auto-publish interval (0 = only on subscribe)
  enabled: boolean;
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
}

export interface MockServerConfig {
  id: string;
  name: string;
  description: string;
  protocol: MockServerProtocol;
  routes: MockRoute[];
  graphqlOperations?: GraphQLMockOperation[];
  graphqlSchema?: string; // SDL schema for introspection
  wsHandlers?: WebSocketMockHandler[];
  sseEvents?: SSEMockEvent[];
  socketioHandlers?: SocketIOMockHandler[];
  mqttTopics?: MQTTMockTopic[];
  grpcMethods?: GrpcMockMethod[];
  grpcProtoFile?: string;
  soapOperations?: SoapMockOperation[];
  soapWsdl?: string; // WSDL content to serve at ?wsdl
  port?: number;
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
}
