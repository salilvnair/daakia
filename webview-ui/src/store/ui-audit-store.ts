/**
 * UI Audit Store — universal event tracking for all UI actions.
 * Defines the event taxonomy, manages enable/disable config (localStorage),
 * and exposes logUiEvent() for firing events to the extension host.
 */
import { postMsg } from '../vscode';

// ─── Event definition ──────────────────────────────────────────────────────────

export interface AuditEventDef {
  id: string;
  module: string;
  button: string;
  action: string;
  description: string;
  color: string;
  defaultEnabled: boolean;
}

export const AUDIT_EVENT_DEFS: AuditEventDef[] = [
  // ── REST ───────────────────────────────────────────────────────────────────
  { id: 'rest.send',            module: 'REST', button: 'Send',            action: 'click',  description: 'Execute REST request',                color: 'var(--color-protocol-rest)', defaultEnabled: true },
  { id: 'rest.save',            module: 'REST', button: 'Save',            action: 'click',  description: 'Save REST request to collection',     color: 'var(--color-protocol-rest)', defaultEnabled: true },
  { id: 'rest.save_as',         module: 'REST', button: 'Save As',         action: 'click',  description: 'Save REST request as new entry',      color: 'var(--color-protocol-rest)', defaultEnabled: false },
  { id: 'rest.clear',           module: 'REST', button: 'Clear All',       action: 'click',  description: 'Clear REST request form',             color: 'var(--color-protocol-rest)', defaultEnabled: false },
  { id: 'rest.show_code',       module: 'REST', button: 'Show Code',       action: 'click',  description: 'Open Generate Code modal',            color: 'var(--color-protocol-rest)', defaultEnabled: false },
  { id: 'rest.import_curl',     module: 'REST', button: 'Import cURL',     action: 'click',  description: 'Import request from cURL command',    color: 'var(--color-protocol-rest)', defaultEnabled: false },
  { id: 'rest.copy_response',   module: 'REST', button: 'Copy',            action: 'click',  description: 'Copy REST response body',             color: 'var(--color-protocol-rest)', defaultEnabled: false },
  { id: 'rest.download',        module: 'REST', button: 'Send & Download', action: 'click',  description: 'Send and download response as file',  color: 'var(--color-protocol-rest)', defaultEnabled: false },

  // ── GraphQL ────────────────────────────────────────────────────────────────
  { id: 'graphql.send',         module: 'GraphQL', button: 'Run Query',   action: 'click',  description: 'Execute GraphQL query or mutation',   color: 'var(--color-protocol-graphql)', defaultEnabled: true },
  { id: 'graphql.save',         module: 'GraphQL', button: 'Save',        action: 'click',  description: 'Save GraphQL request',                color: 'var(--color-protocol-graphql)', defaultEnabled: false },
  { id: 'graphql.introspect',   module: 'GraphQL', button: 'Introspect',  action: 'click',  description: 'Run schema introspection',            color: 'var(--color-protocol-graphql)', defaultEnabled: true },
  { id: 'graphql.copy',         module: 'GraphQL', button: 'Copy',        action: 'click',  description: 'Copy GraphQL response',               color: 'var(--color-protocol-graphql)', defaultEnabled: false },

  // ── gRPC ───────────────────────────────────────────────────────────────────
  { id: 'grpc.invoke',          module: 'gRPC', button: 'Invoke',         action: 'click', description: 'Invoke gRPC method',                    color: 'var(--color-protocol-grpc)', defaultEnabled: true },
  { id: 'grpc.save',            module: 'gRPC', button: 'Save',           action: 'click', description: 'Save gRPC request',                     color: 'var(--color-protocol-grpc)', defaultEnabled: false },
  { id: 'grpc.import_proto',    module: 'gRPC', button: 'Import Proto',   action: 'click', description: 'Import .proto file',                    color: 'var(--color-protocol-grpc)', defaultEnabled: true },
  { id: 'grpc.stream_start',    module: 'gRPC', button: 'Start Stream',   action: 'click', description: 'Start gRPC streaming',                  color: 'var(--color-protocol-grpc)', defaultEnabled: true },
  { id: 'grpc.stream_stop',     module: 'gRPC', button: 'Stop Stream',    action: 'click', description: 'Stop gRPC streaming',                   color: 'var(--color-protocol-grpc)', defaultEnabled: true },

  // ── SOAP ───────────────────────────────────────────────────────────────────
  { id: 'soap.invoke',          module: 'SOAP', button: 'Send',           action: 'click', description: 'Invoke SOAP operation',                 color: 'var(--color-protocol-soap)', defaultEnabled: true },
  { id: 'soap.save',            module: 'SOAP', button: 'Save',           action: 'click', description: 'Save SOAP request',                     color: 'var(--color-protocol-soap)', defaultEnabled: false },
  { id: 'soap.import_wsdl',     module: 'SOAP', button: 'Import WSDL',   action: 'click', description: 'Import WSDL definition',                color: 'var(--color-protocol-soap)', defaultEnabled: true },
  { id: 'soap.copy_response',   module: 'SOAP', button: 'Copy',           action: 'click', description: 'Copy SOAP response',                    color: 'var(--color-protocol-soap)', defaultEnabled: false },

  // ── WebSocket ──────────────────────────────────────────────────────────────
  { id: 'ws.connect',           module: 'WebSocket', button: 'Connect',      action: 'click', description: 'Connect WebSocket',               color: 'var(--color-protocol-websocket)', defaultEnabled: true },
  { id: 'ws.disconnect',        module: 'WebSocket', button: 'Disconnect',   action: 'click', description: 'Disconnect WebSocket',            color: 'var(--color-protocol-websocket)', defaultEnabled: true },
  { id: 'ws.send',              module: 'WebSocket', button: 'Send',         action: 'click', description: 'Send WebSocket message',          color: 'var(--color-protocol-websocket)', defaultEnabled: false },
  { id: 'ws.clear',             module: 'WebSocket', button: 'Clear',        action: 'click', description: 'Clear WebSocket message log',     color: 'var(--color-protocol-websocket)', defaultEnabled: false },
  { id: 'ws.copy_message',      module: 'WebSocket', button: 'Copy',         action: 'click', description: 'Copy WebSocket message',          color: 'var(--color-protocol-websocket)', defaultEnabled: false },

  // ── SSE ────────────────────────────────────────────────────────────────────
  { id: 'sse.connect',          module: 'SSE', button: 'Connect',    action: 'click', description: 'Connect SSE stream',     color: 'var(--color-protocol-sse)', defaultEnabled: true },
  { id: 'sse.disconnect',       module: 'SSE', button: 'Disconnect', action: 'click', description: 'Disconnect SSE stream',  color: 'var(--color-protocol-sse)', defaultEnabled: true },
  { id: 'sse.clear',            module: 'SSE', button: 'Clear',      action: 'click', description: 'Clear SSE event log',    color: 'var(--color-protocol-sse)', defaultEnabled: false },

  // ── MQTT ───────────────────────────────────────────────────────────────────
  { id: 'mqtt.connect',         module: 'MQTT', button: 'Connect',     action: 'click', description: 'Connect MQTT broker',      color: 'var(--color-protocol-mqtt)', defaultEnabled: true },
  { id: 'mqtt.disconnect',      module: 'MQTT', button: 'Disconnect',  action: 'click', description: 'Disconnect MQTT broker',   color: 'var(--color-protocol-mqtt)', defaultEnabled: true },
  { id: 'mqtt.publish',         module: 'MQTT', button: 'Publish',     action: 'click', description: 'Publish MQTT message',     color: 'var(--color-protocol-mqtt)', defaultEnabled: false },
  { id: 'mqtt.subscribe',       module: 'MQTT', button: 'Subscribe',   action: 'click', description: 'Subscribe to MQTT topic', color: 'var(--color-protocol-mqtt)', defaultEnabled: false },
  { id: 'mqtt.clear',           module: 'MQTT', button: 'Clear',       action: 'click', description: 'Clear MQTT message log',  color: 'var(--color-protocol-mqtt)', defaultEnabled: false },

  // ── Socket.IO ──────────────────────────────────────────────────────────────
  { id: 'sio.connect',          module: 'Socket.IO', button: 'Connect',    action: 'click', description: 'Connect Socket.IO server', color: 'var(--color-protocol-socketio)', defaultEnabled: true },
  { id: 'sio.disconnect',       module: 'Socket.IO', button: 'Disconnect', action: 'click', description: 'Disconnect Socket.IO',     color: 'var(--color-protocol-socketio)', defaultEnabled: true },
  { id: 'sio.emit',             module: 'Socket.IO', button: 'Emit',       action: 'click', description: 'Emit Socket.IO event',     color: 'var(--color-protocol-socketio)', defaultEnabled: false },
  { id: 'sio.clear',            module: 'Socket.IO', button: 'Clear',      action: 'click', description: 'Clear Socket.IO event log', color: 'var(--color-protocol-socketio)', defaultEnabled: false },

  // ── Mock Server ────────────────────────────────────────────────────────────
  { id: 'mock.start',           module: 'Mock Server', button: 'Start',       action: 'toggle', description: 'Start mock server instance',     color: 'var(--color-mock-server)', defaultEnabled: true },
  { id: 'mock.stop',            module: 'Mock Server', button: 'Stop',        action: 'toggle', description: 'Stop mock server instance',      color: 'var(--color-mock-server)', defaultEnabled: true },
  { id: 'mock.create',          module: 'Mock Server', button: 'New Server',  action: 'create', description: 'Create new mock server',         color: 'var(--color-mock-server)', defaultEnabled: true },
  { id: 'mock.delete',          module: 'Mock Server', button: 'Delete',      action: 'delete', description: 'Delete mock server',             color: 'var(--color-mock-server)', defaultEnabled: true },
  { id: 'mock.add_stub',        module: 'Mock Server', button: 'Add Route',   action: 'create', description: 'Add new mock stub/route',        color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.delete_stub',     module: 'Mock Server', button: 'Delete Route', action: 'delete', description: 'Delete mock stub/route',        color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.export',          module: 'Mock Server', button: 'Export',      action: 'click',  description: 'Export mock server config',      color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.import',          module: 'Mock Server', button: 'Import',      action: 'click',  description: 'Import mock server config',      color: 'var(--color-mock-server)', defaultEnabled: false },

  // ── Collections ────────────────────────────────────────────────────────────
  { id: 'collection.create',    module: 'Collections', button: 'New Collection', action: 'create', description: 'Create a new collection',      color: 'var(--color-primary)', defaultEnabled: true },
  { id: 'collection.delete',    module: 'Collections', button: 'Delete',         action: 'delete', description: 'Delete a collection or item',  color: 'var(--color-primary)', defaultEnabled: true },
  { id: 'collection.rename',    module: 'Collections', button: 'Rename',         action: 'update', description: 'Rename collection or item',     color: 'var(--color-primary)', defaultEnabled: false },
  { id: 'collection.move',      module: 'Collections', button: 'Move',           action: 'update', description: 'Move item to another folder',   color: 'var(--color-primary)', defaultEnabled: false },
  { id: 'collection.export',    module: 'Collections', button: 'Export',         action: 'click',  description: 'Export collection to file',     color: 'var(--color-primary)', defaultEnabled: false },
  { id: 'collection.import',    module: 'Collections', button: 'Import',         action: 'create', description: 'Import collection from file',   color: 'var(--color-primary)', defaultEnabled: true },
  { id: 'collection.open',      module: 'Collections', button: 'Open',           action: 'click',  description: 'Open request from collection', color: 'var(--color-primary)', defaultEnabled: false },

  // ── Environment ────────────────────────────────────────────────────────────
  { id: 'env.create',           module: 'Environment', button: 'New Env',        action: 'create', description: 'Create new environment',        color: 'var(--color-success)', defaultEnabled: true },
  { id: 'env.delete',           module: 'Environment', button: 'Delete',         action: 'delete', description: 'Delete environment',            color: 'var(--color-success)', defaultEnabled: true },
  { id: 'env.activate',         module: 'Environment', button: 'Activate',       action: 'click',  description: 'Switch active environment',     color: 'var(--color-success)', defaultEnabled: true },
  { id: 'env.add_variable',     module: 'Environment', button: 'Add Variable',   action: 'create', description: 'Add environment variable',      color: 'var(--color-success)', defaultEnabled: false },
  { id: 'env.delete_variable',  module: 'Environment', button: 'Delete Var',     action: 'delete', description: 'Delete environment variable',   color: 'var(--color-success)', defaultEnabled: false },

  // ── Tab ────────────────────────────────────────────────────────────────────
  { id: 'tab.new',              module: 'Tabs', button: 'New Tab',     action: 'create', description: 'Create new request tab',         color: 'var(--color-text-secondary)', defaultEnabled: false },
  { id: 'tab.close',            module: 'Tabs', button: 'Close Tab',   action: 'close',  description: 'Close request tab',              color: 'var(--color-text-secondary)', defaultEnabled: false },
  { id: 'tab.duplicate',        module: 'Tabs', button: 'Duplicate',   action: 'create', description: 'Duplicate current request tab',  color: 'var(--color-text-secondary)', defaultEnabled: false },

  // ── History ────────────────────────────────────────────────────────────────
  { id: 'history.open',         module: 'History', button: 'Open',   action: 'click',  description: 'Open a history entry',    color: 'var(--color-info)', defaultEnabled: false },
  { id: 'history.copy',         module: 'History', button: 'Copy',   action: 'click',  description: 'Copy from history',       color: 'var(--color-info)', defaultEnabled: false },
  { id: 'history.delete',       module: 'History', button: 'Delete', action: 'delete', description: 'Delete a history entry',  color: 'var(--color-info)', defaultEnabled: false },
  { id: 'history.clear',        module: 'History', button: 'Clear',  action: 'delete', description: 'Clear all history',       color: 'var(--color-info)', defaultEnabled: true },

  // ── MCP ────────────────────────────────────────────────────────────────────
  { id: 'mcp.add_server',       module: 'MCP', button: 'Add Server',   action: 'create', description: 'Add MCP server connection',   color: 'var(--color-protocol-mcp)', defaultEnabled: true },
  { id: 'mcp.remove_server',    module: 'MCP', button: 'Remove',       action: 'delete', description: 'Remove MCP server',           color: 'var(--color-protocol-mcp)', defaultEnabled: true },
  { id: 'mcp.connect',          module: 'MCP', button: 'Connect',      action: 'click',  description: 'Connect to MCP server',       color: 'var(--color-protocol-mcp)', defaultEnabled: true },
  { id: 'mcp.disconnect',       module: 'MCP', button: 'Disconnect',   action: 'click',  description: 'Disconnect from MCP server',  color: 'var(--color-protocol-mcp)', defaultEnabled: true },
  { id: 'mcp.invoke_tool',      module: 'MCP', button: 'Invoke Tool',  action: 'click',  description: 'Invoke MCP tool',             color: 'var(--color-protocol-mcp)', defaultEnabled: false },

  // ── AI Features ────────────────────────────────────────────────────────────
  { id: 'ai.toggle_feature',    module: 'AI Features', button: 'Toggle Feature', action: 'toggle', description: 'Enable/disable individual AI feature',  color: 'var(--color-protocol-ai)', defaultEnabled: false },
  { id: 'ai.toggle_all',        module: 'AI Features', button: 'Toggle All',    action: 'toggle', description: 'Enable/disable all AI features at once', color: 'var(--color-protocol-ai)', defaultEnabled: false },
  { id: 'ai.save_prompt',       module: 'AI Features', button: 'Save Prompt',   action: 'click',  description: 'Save prompt library entry',              color: 'var(--color-protocol-ai)', defaultEnabled: false },
  { id: 'ai.reset_prompt',      module: 'AI Features', button: 'Reset Prompt',  action: 'click',  description: 'Reset prompt to default',                color: 'var(--color-protocol-ai)', defaultEnabled: false },

  // ── Settings & Tools ───────────────────────────────────────────────────────
  { id: 'settings.open',        module: 'Settings', button: 'Settings',        action: 'click',  description: 'Open settings panel',         color: 'var(--color-text-muted)', defaultEnabled: false },
  { id: 'settings.proxy_save',  module: 'Settings', button: 'Save Proxy',      action: 'click',  description: 'Save proxy configuration',    color: 'var(--color-text-muted)', defaultEnabled: true },
  { id: 'settings.proxy_toggle',module: 'Settings', button: 'Proxy Toggle',    action: 'toggle', description: 'Enable/disable proxy',        color: 'var(--color-text-muted)', defaultEnabled: true },
  { id: 'settings.cookie_add',  module: 'Settings', button: 'Add Cookie',      action: 'create', description: 'Add cookie to cookie manager', color: 'var(--color-text-muted)', defaultEnabled: false },
  { id: 'settings.cookie_del',  module: 'Settings', button: 'Delete Cookie',   action: 'delete', description: 'Delete cookie',               color: 'var(--color-text-muted)', defaultEnabled: false },
  { id: 'settings.cert_add',    module: 'Settings', button: 'Add Certificate', action: 'create', description: 'Add client certificate',      color: 'var(--color-text-muted)', defaultEnabled: true },
  { id: 'settings.cert_del',    module: 'Settings', button: 'Delete Cert',     action: 'delete', description: 'Delete client certificate',   color: 'var(--color-text-muted)', defaultEnabled: true },
  { id: 'settings.monitor_add', module: 'Settings', button: 'Add Monitor',     action: 'create', description: 'Add API monitor rule',        color: 'var(--color-text-muted)', defaultEnabled: true },
  { id: 'settings.monitor_del', module: 'Settings', button: 'Delete Monitor',  action: 'delete', description: 'Delete API monitor rule',     color: 'var(--color-text-muted)', defaultEnabled: true },

  // ── DevTools ───────────────────────────────────────────────────────────────
  { id: 'devtools.clear_audit',      module: 'DevTools', button: 'Clear Audit',     action: 'delete', description: 'Clear audit log',                   color: 'var(--color-warning)', defaultEnabled: true },
  { id: 'devtools.audit_config',     module: 'DevTools', button: 'Audit Config',    action: 'toggle', description: 'Toggle audit event enabled/disabled', color: 'var(--color-warning)', defaultEnabled: false },
  { id: 'devtools.snapshot_dl',      module: 'DevTools', button: 'Download Snapshot', action: 'click', description: 'Download debug snapshot JSON',     color: 'var(--color-warning)', defaultEnabled: false },
  { id: 'devtools.db_query',         module: 'DevTools', button: 'DB Query',        action: 'click',  description: 'Run DB Explorer query',             color: 'var(--color-warning)', defaultEnabled: false },
];

// ─── Config (localStorage) ────────────────────────────────────────────────────

const CONFIG_KEY = 'daakia_audit_config';

export function getAuditConfig(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function setAuditEventEnabled(eventTypeId: string, enabled: boolean): void {
  const config = getAuditConfig();
  config[eventTypeId] = enabled;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function isAuditEventEnabled(eventTypeId: string): boolean {
  const config = getAuditConfig();
  if (eventTypeId in config) return config[eventTypeId];
  const def = AUDIT_EVENT_DEFS.find(d => d.id === eventTypeId);
  return def?.defaultEnabled ?? false;
}

export function resetAuditConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
}

// ─── Log helper ───────────────────────────────────────────────────────────────

export function logUiEvent(eventTypeId: string, metadata?: Record<string, unknown>): void {
  if (!isAuditEventEnabled(eventTypeId)) return;
  const def = AUDIT_EVENT_DEFS.find(d => d.id === eventTypeId);
  if (!def) return;
  postMsg({
    type: 'uiAudit:log',
    event_type: eventTypeId,
    module: def.module,
    button: def.button,
    action: def.action,
    metadata,
  });
}
