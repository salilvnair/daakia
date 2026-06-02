/**
 * mock-try-handler.ts — Logic for opening pre-populated client tabs from mock server config.
 * Single Responsibility: Builds tab data from mock server state and opens it.
 */
import { useTabsStore } from '../../store/tabs-store';
import type { MockServer } from './mock-types';

/**
 * Infer a sample request body from a mock response JSON.
 * Strips auto-generated fields (id, createdAt, etc.) and returns a template.
 */
export function inferRequestBody(responseBody: string): string {
  try {
    const parsed = JSON.parse(responseBody);
    const obj = Array.isArray(parsed)
      ? parsed[0]
      : (parsed.data ? (Array.isArray(parsed.data) ? parsed.data[0] : parsed.data) : parsed);
    if (obj && typeof obj === 'object') {
      const template: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (['id', 'createdAt', 'updatedAt', 'deletedAt'].includes(k)) continue;
        template[k] = v;
      }
      return JSON.stringify(template, null, 2);
    }
  } catch { /* ignore parse errors */ }
  return '{}';
}

/**
 * Open a "Try" tab pre-populated with mock server metadata.
 * Protocol-aware: REST fills method/headers/body, GraphQL fills query,
 * WS/SSE/SIO/MQTT fill relevant authData fields.
 */
export function openTryTab(server: MockServer, serverUrl: string): void {
  if (!serverUrl) return;
  const { addTab, switchProtocol } = useTabsStore.getState();
  const proto = server.protocol || 'rest';

  if (proto === 'rest') {
    openRestTryTab(server, serverUrl, addTab, switchProtocol);
  } else if (proto === 'graphql') {
    openGraphQLTryTab(server, serverUrl, addTab, switchProtocol);
  } else if (proto === 'websocket') {
    openWebSocketTryTab(server, serverUrl, addTab, switchProtocol);
  } else if (proto === 'sse') {
    openSSETryTab(server, serverUrl, addTab, switchProtocol);
  } else if (proto === 'socketio') {
    openSocketIOTryTab(server, serverUrl, addTab, switchProtocol);
  } else if (proto === 'mqtt') {
    openMQTTTryTab(server, serverUrl, addTab, switchProtocol);
  } else if (proto === 'grpc') {
    openGrpcTryTab(server, serverUrl, addTab, switchProtocol);
  } else if (proto === 'soap') {
    openSoapTryTab(server, serverUrl, addTab, switchProtocol);
  }
}

/**
 * Open a Try tab for a specific REST route.
 */
export function openRouteTryTab(serverBaseUrl: string, route: { method: string; path: string; headers: Record<string, string>; body: string }): void {
  const fullUrl = `${serverBaseUrl}${route.path.startsWith('/') ? '' : '/'}${route.path}`;
  const { addTab, switchProtocol } = useTabsStore.getState();
  const headers = Object.entries(route.headers || {}).map(([key, value]) => ({ id: crypto.randomUUID(), key, value, enabled: true }));
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(route.method);
  const requestBody = hasBody && route.body ? inferRequestBody(route.body) : '';

  switchProtocol('rest');
  addTab({
    protocol: 'rest',
    method: route.method as any,
    url: fullUrl,
    name: `${route.method} ${route.path}`,
    headers,
    bodyMode: hasBody ? 'json' : 'none',
    bodyRaw: requestBody,
  });
}

// ────────── Private helpers ──────────

function openRestTryTab(server: MockServer, serverUrl: string, addTab: any, switchProtocol: any): void {
  const routes = server.routes.filter(r => r.enabled);
  const bodyRoute = routes.find(r => ['POST', 'PUT', 'PATCH'].includes(r.method)) || routes[0];
  if (bodyRoute) {
    const fullUrl = `${serverUrl}${bodyRoute.path.startsWith('/') ? '' : '/'}${bodyRoute.path}`;
    const headers = Object.entries(bodyRoute.headers || {}).map(([key, value]) => ({ key, value, enabled: true }));
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(bodyRoute.method);
    const requestBody = hasBody && bodyRoute.body ? inferRequestBody(bodyRoute.body) : '';
    switchProtocol('rest');
    addTab({
      protocol: 'rest',
      method: bodyRoute.method as any,
      url: fullUrl,
      name: `${bodyRoute.method} ${bodyRoute.path}`,
      headers,
      bodyMode: hasBody ? 'json' : 'none',
      bodyRaw: requestBody,
    });
  } else {
    switchProtocol('rest');
    addTab({ protocol: 'rest', url: serverUrl, name: `Try ${server.name}` });
  }
}

function openGraphQLTryTab(server: MockServer, serverUrl: string, addTab: any, switchProtocol: any): void {
  const ops = (server.graphqlOperations || []).filter(o => o.enabled);
  const op = ops.find(o => o.operationType === 'query') || ops[0];
  let bodyRaw = '';
  if (op) {
    bodyRaw = `${op.operationType} ${op.operationName} {\n  ${op.operationName} {\n    # fields\n  }\n}`;
  }
  switchProtocol('graphql');
  addTab({ protocol: 'graphql', url: serverUrl, name: `Try ${server.name}`, bodyMode: 'graphql', bodyRaw });
}

function openWebSocketTryTab(server: MockServer, serverUrl: string, addTab: any, switchProtocol: any): void {
  const handlers = (server.wsHandlers || []).filter(h => h.enabled && h.event === 'message');
  const sampleMsg = handlers[0]?.matchPattern === '*' ? '{"type": "ping"}' : handlers[0]?.matchPattern || '{"type": "ping"}';
  switchProtocol('websocket');
  addTab({ protocol: 'websocket', url: serverUrl, name: `Try ${server.name}`, authData: { rt_protocol: 'websocket', ws_inputMsg: sampleMsg, ws_format: 'json' } });
}

function openSSETryTab(server: MockServer, serverUrl: string, addTab: any, switchProtocol: any): void {
  const events = (server.sseEvents || []).filter(e => e.enabled);
  const eventType = events[0]?.eventName || 'message';
  switchProtocol('websocket');
  addTab({ protocol: 'websocket', url: serverUrl, name: `Try ${server.name}`, authData: { rt_protocol: 'sse', sse_eventType: eventType } });
}

function openSocketIOTryTab(server: MockServer, serverUrl: string, addTab: any, switchProtocol: any): void {
  const handlers = (server.socketioHandlers || []).filter(h => h.enabled && h.event === 'message');
  const handler = handlers[0];
  const eventName = handler?.listenEvent || 'message';
  const eventData = handler?.response || '{"message": "Hello"}';
  switchProtocol('websocket');
  addTab({ protocol: 'websocket', url: serverUrl, name: `Try ${server.name}`, authData: { rt_protocol: 'socketio', sio_eventName: eventName, sio_eventData: eventData, sio_format: 'json' } });
}

function openMQTTTryTab(server: MockServer, serverUrl: string, addTab: any, switchProtocol: any): void {
  const topics = (server.mqttTopics || []).filter(t => t.enabled);
  const subTopics = topics.map(t => ({ id: crypto.randomUUID(), topic: t.topic, qos: t.qos, label: t.topic, color: 'var(--color-protocol-mqtt)', active: true }));
  const pubTopic = topics[0]?.topic || 'test/topic';
  const pubPayload = topics[0]?.payload || '{"message": "Hello MQTT"}';
  switchProtocol('websocket');
  addTab({
    protocol: 'websocket', url: serverUrl, name: `Try ${server.name}`,
    authData: {
      rt_protocol: 'mqtt',
      mqtt_pubTopic: pubTopic,
      mqtt_pubPayload: pubPayload,
      mqtt_pubQos: String(topics[0]?.qos || 0),
      mqtt_subscriptions: JSON.stringify(subTopics),
    },
  });
}

function openGrpcTryTab(server: MockServer, serverUrl: string, addTab: any, switchProtocol: any): void {
  const methods = (server.grpcMethods || []).filter(m => m.enabled !== false);
  const method = methods[0];
  switchProtocol('grpc');
  addTab({
    protocol: 'grpc',
    url: serverUrl,
    name: `Try ${server.name}`,
    grpcMethod: method ? `${method.service}/${method.method}` : '',
    grpcMessage: method?.response || '{\n  \n}',
    grpcProtoFile: server.grpcProtoFile || undefined,
  });
}

function openSoapTryTab(server: MockServer, serverUrl: string, addTab: any, switchProtocol: any): void {
  const ops = (server.soapOperations || []).filter(o => o.enabled);
  const op = ops[0];
  const soapAction = op?.soapAction || '';
  const soapOperation = op?.operation || '';
  const soapService = op?.service || '';

  // Build a minimal SOAP envelope from the first operation's response to infer structure
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header/>
  <soap:Body>
    <!-- ${soapOperation || 'Request'} -->
  </soap:Body>
</soap:Envelope>`;

  switchProtocol('soap');
  addTab({
    protocol: 'soap',
    url: serverUrl,
    name: `Try ${server.name}`,
    soapVersion: '1.1',
    soapAction,
    soapOperation,
    soapService,
    soapEnvelope: envelope,
  });
}
