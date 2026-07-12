// ─── Global Protocol Diagnostics Logger ──────────────────────────────────────
// Logs ALL protocol messages to browser DevTools console for full observability.
// Every request/response, error, connection event is logged with full metadata.

export function logProtocolMessage(msg: Record<string, unknown>) {
  if (!msg?.type) return;
  const type = msg.type as string;

  // ── REST / SOAP / GraphQL response
  if (type === 'responseData') {
    const resp = msg.response as Record<string, unknown> | undefined;
    const status = (resp?.status as number) ?? 0;
    const isError = status === 0 || status >= 400;
    const color = isError ? '#ef4444' : '#22c55e';
    const icon = isError ? '🚨' : '✅';
    console.group(`%c${icon} ${msg.requestMethod || 'REQ'} ${msg.requestUrl || ''} → ${status} ${resp?.statusText || ''}`, `color:${color};font-weight:bold`);
    console.log('%cRequest:', 'font-weight:bold', { method: msg.requestMethod, url: msg.requestUrl, headers: msg.requestHeaders, body: msg.requestBody });
    console.log('%cResponse:', 'font-weight:bold', { status, statusText: resp?.statusText, headers: resp?.headers, size: resp?.size, time: resp?.time, contentType: resp?.contentType });
    if (resp?.body) console.log('%cBody Preview:', 'font-weight:bold', String(resp.body).slice(0, 1000));
    if (resp?.errorDetail) console.error('%cError Detail:', 'font-weight:bold', resp.errorDetail);
    if (msg.scriptLogs) console.log('%cScript Logs:', 'font-weight:bold', msg.scriptLogs);
    if (msg.scriptErrors) console.error('%cScript Errors:', 'font-weight:bold', msg.scriptErrors);
    if (msg.testResults) console.log('%cTest Results:', 'font-weight:bold', msg.testResults);
    console.groupEnd();
  }

  // ── REST / SOAP error
  if (type === 'requestError') {
    console.group('%c🚨 Request Error', 'color:#ef4444;font-weight:bold;font-size:12px');
    console.error('%cError:', 'font-weight:bold', msg.error);
    console.error('%cTab:', 'font-weight:bold', msg.tabId);
    if (msg.scriptLogs) console.log('%cScript Logs:', 'font-weight:bold', msg.scriptLogs);
    if (msg.scriptErrors) console.error('%cScript Errors:', 'font-weight:bold', msg.scriptErrors);
    if (msg.consoleLogs) console.log('%cConsole Logs:', 'font-weight:bold', msg.consoleLogs);
    console.groupEnd();
  }

  // ── GraphQL response
  if (type === 'graphqlResponse') {
    const status = (msg.status as number) ?? 0;
    const isError = status === 0 || status >= 400;
    const color = isError ? '#ef4444' : '#22c55e';
    console.group(`%c${isError ? '🚨' : '✅'} GraphQL ${msg.url || ''} → ${status}`, `color:${color};font-weight:bold`);
    console.log('%cRequest:', 'font-weight:bold', { url: msg.url, query: msg.query, variables: msg.variables, headers: msg.requestHeaders });
    console.log('%cResponse:', 'font-weight:bold', { status, headers: msg.responseHeaders, body: msg.body, time: msg.time, size: msg.size });
    if (msg.errors) console.error('%cGraphQL Errors:', 'font-weight:bold', msg.errors);
    console.groupEnd();
  }

  // ── GraphQL subscription events
  if (type === 'graphqlSubscriptionData') {
    console.log('%c📡 GraphQL Subscription Data', 'color:#7c3aed;font-weight:bold', msg.data);
  }

  // ── WebSocket events
  if (type === 'wsConnected') {
    console.log('%c🔌 WebSocket Connected', 'color:#22c55e;font-weight:bold', msg.url || msg.tabId);
  }
  if (type === 'wsMessage') {
    console.log('%c📨 WebSocket Message', 'color:#3b82f6;font-weight:bold', { direction: msg.direction, data: msg.data, timestamp: msg.timestamp });
  }
  if (type === 'wsDisconnected' || type === 'wsClosed') {
    console.log('%c⛔ WebSocket Disconnected', 'color:#6b7280;font-weight:bold', { code: msg.code, reason: msg.reason });
  }
  if (type === 'wsError') {
    console.error('%c🚨 WebSocket Error', 'color:#ef4444;font-weight:bold', msg.error || msg.message);
  }

  // ── SSE events
  if (type === 'sseConnected') {
    console.log('%c🔌 SSE Connected', 'color:#22c55e;font-weight:bold', msg.url || msg.tabId);
  }
  if (type === 'sseEvent' || type === 'sseMessage') {
    console.log('%c📨 SSE Event', 'color:#06b6d4;font-weight:bold', { event: msg.event, data: msg.data });
  }
  if (type === 'sseError') {
    console.error('%c🚨 SSE Error', 'color:#ef4444;font-weight:bold', msg.error || msg.message);
  }

  // ── Socket.IO events
  if (type === 'socketioConnected') {
    console.log('%c🔌 Socket.IO Connected', 'color:#22c55e;font-weight:bold', msg.url || msg.tabId);
  }
  if (type === 'socketioEvent') {
    console.log('%c📨 Socket.IO Event', 'color:#f59e0b;font-weight:bold', { event: msg.event, data: msg.data });
  }
  if (type === 'socketioError') {
    console.error('%c🚨 Socket.IO Error', 'color:#ef4444;font-weight:bold', msg.error || msg.message);
  }
  if (type === 'socketioDisconnected') {
    console.log('%c⛔ Socket.IO Disconnected', 'color:#6b7280;font-weight:bold', msg.reason);
  }

  // ── MQTT events
  if (type === 'mqttConnected') {
    console.log('%c🔌 MQTT Connected', 'color:#22c55e;font-weight:bold', msg.url || msg.tabId);
  }
  if (type === 'mqttMessage') {
    console.log('%c📨 MQTT Message', 'color:#059669;font-weight:bold', { topic: msg.topic, payload: msg.payload, qos: msg.qos });
  }
  if (type === 'mqttError') {
    console.error('%c🚨 MQTT Error', 'color:#ef4444;font-weight:bold', msg.error || msg.message);
  }
  if (type === 'mqttDisconnected') {
    console.log('%c⛔ MQTT Disconnected', 'color:#6b7280;font-weight:bold', msg.tabId);
  }

  // ── gRPC events
  if (type === 'grpcResponse') {
    const status = (msg.status as number) ?? 0;
    const isError = status !== 0;
    console.group(`%c${isError ? '🚨' : '✅'} gRPC ${msg.method || msg.service || ''} → ${msg.statusText || status}`, `color:${isError ? '#ef4444' : '#22c55e'};font-weight:bold`);
    console.log('%cRequest:', 'font-weight:bold', { service: msg.service, method: msg.method, metadata: msg.metadata, body: msg.requestBody });
    console.log('%cResponse:', 'font-weight:bold', { status, statusText: msg.statusText, metadata: msg.responseMetadata, body: msg.body, time: msg.time });
    if (msg.error) console.error('%cError:', 'font-weight:bold', msg.error);
    console.groupEnd();
  }

  // ── MCP events
  if (type === 'mcp:connected') {
    console.log('%c🔌 MCP Connected', 'color:#22c55e;font-weight:bold', { tabId: msg.tabId, tools: msg.tools });
  }
  if (type === 'mcp:response') {
    console.group('%c✅ MCP Response', 'color:#22c55e;font-weight:bold');
    console.log('%cMethod:', 'font-weight:bold', msg.method);
    console.log('%cResult:', 'font-weight:bold', msg.result);
    console.log('%cDuration:', 'font-weight:bold', msg.duration);
    console.groupEnd();
  }
  if (type === 'mcp:error') {
    console.group('%c🚨 MCP Error', 'color:#ef4444;font-weight:bold');
    console.error('%cError:', 'font-weight:bold', msg.error || msg.message);
    console.error('%cTab:', 'font-weight:bold', msg.tabId);
    if (msg.diagnostics) console.error('%cDiagnostics:', 'font-weight:bold', msg.diagnostics);
    console.groupEnd();
  }
  if (type === 'mcp:disconnected') {
    console.log('%c⛔ MCP Disconnected', 'color:#6b7280;font-weight:bold', msg.tabId);
  }
  if (type === 'mcp:activity') {
    console.log('%c📋 MCP Activity', 'color:#8b5cf6;font-weight:bold', { method: msg.method, params: msg.params, result: msg.result });
  }

  // ── SOAP response (uses responseData with protocol hint)
  // (handled by the general responseData case above)

  // ── Mock server lifecycle events
  if (type === 'mockServerLog') {
    console.log('%c🎭 Mock Server', 'color:#f59e0b;font-weight:bold', msg.entry);
  }
  if (type === 'mockServer:started') {
    console.group(`%c🟢 Mock Server Started`, 'color:#22c55e;font-weight:bold;font-size:12px');
    console.log('%cServer ID:', 'font-weight:bold', msg.id);
    console.log('%cPort:', 'font-weight:bold', msg.port);
    console.log('%cProtocol:', 'font-weight:bold', msg.protocol || 'rest');
    console.log('%cTimestamp:', 'font-weight:bold', new Date().toISOString());
    console.groupEnd();
  }
  if (type === 'mockServer:stopped') {
    console.group(`%c🔴 Mock Server Stopped`, 'color:#f59e0b;font-weight:bold;font-size:12px');
    console.log('%cServer ID:', 'font-weight:bold', msg.id);
    console.log('%cTimestamp:', 'font-weight:bold', new Date().toISOString());
    console.groupEnd();
  }
  if (type === 'mockServer:error') {
    console.group(`%c🚨 Mock Server Error`, 'color:#ef4444;font-weight:bold;font-size:12px');
    console.error('%cServer ID:', 'font-weight:bold', msg.id);
    console.error('%cError:', 'font-weight:bold', msg.error);
    if ((msg.error as string)?.includes('\n')) {
      console.error('%cStack:', 'font-weight:bold', msg.error);
    }
    console.groupEnd();
  }

  // ── Settings changes (audit trail)
  if (type === 'saveAiProviders' || type === 'aiProviders:save') {
    console.group('%c⚙️ Settings Changed — AI Providers', 'color:#8b5cf6;font-weight:bold;font-size:11px');
    console.log('%cProviders:', 'font-weight:bold', msg.providers);
    console.log('%cDefault Provider:', 'font-weight:bold', msg.defaultProviderId);
    console.log('%cDefault Model:', 'font-weight:bold', msg.defaultModelId);
    console.log('%cTimestamp:', 'font-weight:bold', new Date().toISOString());
    console.groupEnd();
  }
  if (type === 'saveSetting' || type === 'saveSettings') {
    console.log(`%c⚙️ Setting Saved: ${msg.key || msg.section || ''}`, 'color:#8b5cf6;font-weight:bold', { key: msg.key, value: msg.value, section: msg.section });
  }
}
