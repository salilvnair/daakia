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
  // ── Mock Server — core lifecycle ───────────────────────────────────────────
  { id: 'mock.start',           module: 'Mock Server', button: 'Start',           action: 'toggle', description: 'Start mock server instance',              color: 'var(--color-mock-server)', defaultEnabled: true },
  { id: 'mock.stop',            module: 'Mock Server', button: 'Stop',            action: 'toggle', description: 'Stop mock server instance',               color: 'var(--color-mock-server)', defaultEnabled: true },
  { id: 'mock.create',          module: 'Mock Server', button: 'New Server',      action: 'create', description: 'Create new mock server',                  color: 'var(--color-mock-server)', defaultEnabled: true },
  { id: 'mock.delete',          module: 'Mock Server', button: 'Delete',          action: 'delete', description: 'Delete mock server',                      color: 'var(--color-mock-server)', defaultEnabled: true },
  { id: 'mock.delete_all',      module: 'Mock Server', button: 'Delete All',      action: 'delete', description: 'Delete all mock servers',                 color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.rename',          module: 'Mock Server', button: 'Rename',          action: 'update', description: 'Rename mock server',                      color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.tab_switch',      module: 'Mock Server', button: 'Tab',             action: 'click',  description: 'Switch server detail tab',                color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.url_copy',        module: 'Mock Server', button: 'Copy URL',        action: 'click',  description: 'Copy server URL to clipboard',            color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.try',             module: 'Mock Server', button: 'Try',             action: 'click',  description: 'Open Try tab for running mock server',    color: 'var(--color-mock-server)', defaultEnabled: false },
  // ── Mock Server — stubs / routes ───────────────────────────────────────────
  { id: 'mock.add_stub',        module: 'Mock Server', button: 'Add Route',       action: 'create', description: 'Add new mock stub/route',                 color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.delete_stub',     module: 'Mock Server', button: 'Delete Route',    action: 'delete', description: 'Delete mock stub/route',                  color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.route_toggle',    module: 'Mock Server', button: 'Route Toggle',    action: 'toggle', description: 'Enable/disable a mock route',             color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.route_method',    module: 'Mock Server', button: 'Method',          action: 'update', description: 'Change HTTP method on a mock route',      color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.cfg_add',         module: 'Mock Server', button: 'Add Item',        action: 'create', description: 'Add route/operation/handler in protocol config', color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.cfg_clear',       module: 'Mock Server', button: 'Clear All',       action: 'delete', description: 'Clear all routes/ops/handlers for a protocol',   color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.sample_load',     module: 'Mock Server', button: 'Load Sample',     action: 'click',  description: 'Load sample config into protocol editor',  color: 'var(--color-mock-server)', defaultEnabled: false },
  // ── Mock Server — export/import ────────────────────────────────────────────
  { id: 'mock.export',          module: 'Mock Server', button: 'Export',          action: 'click',  description: 'Export mock server config',               color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.import',          module: 'Mock Server', button: 'Import',          action: 'click',  description: 'Import mock server config',               color: 'var(--color-mock-server)', defaultEnabled: false },
  // ── Mock Server — activity log ─────────────────────────────────────────────
  { id: 'mock.log_clear',       module: 'Mock Server', button: 'Clear Log',       action: 'delete', description: 'Clear mock server activity log',          color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.log_copy',        module: 'Mock Server', button: 'Copy Log',        action: 'click',  description: 'Copy log entry to clipboard',             color: 'var(--color-mock-server)', defaultEnabled: false },
  // ── Mock Server — traffic inspector ───────────────────────────────────────
  { id: 'mock.traffic_clear',   module: 'Mock Server', button: 'Clear Traffic',   action: 'delete', description: 'Clear protocol traffic inspector',        color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.traffic_filter',  module: 'Mock Server', button: 'Filter Traffic',  action: 'click',  description: 'Filter traffic inspector by protocol/dir',color: 'var(--color-mock-server)', defaultEnabled: false },
  // ── Mock Server — AI generation ────────────────────────────────────────────
  { id: 'mock.ai_generate',     module: 'Mock Server', button: 'AI Generate',     action: 'click',  description: 'Trigger AI route generation from prompt', color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.ai_regen',        module: 'Mock Server', button: 'AI Regenerate',   action: 'click',  description: 'Regenerate AI routes with same/new prompt',color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.ai_add_all',      module: 'Mock Server', button: 'Add All Routes',  action: 'create', description: 'Add all AI-generated routes/items',       color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.ai_add_one',      module: 'Mock Server', button: 'Add Route',       action: 'create', description: 'Add single AI-generated route/item',      color: 'var(--color-mock-server)', defaultEnabled: false },
  // ── Mock Server — state machine ────────────────────────────────────────────
  { id: 'mock.sm_add_state',    module: 'Mock Server', button: 'Add State',       action: 'create', description: 'Add state node to state machine',         color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.sm_del_state',    module: 'Mock Server', button: 'Delete State',    action: 'delete', description: 'Delete state node from state machine',    color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.sm_add_trans',    module: 'Mock Server', button: 'Add Transition',  action: 'create', description: 'Create transition between SM states',     color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.sm_del_trans',    module: 'Mock Server', button: 'Del Transition',  action: 'delete', description: 'Delete transition from state machine',    color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.sm_export',       module: 'Mock Server', button: 'Export SM',       action: 'click',  description: 'Export state machine JSON to clipboard',  color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.sm_initial',      module: 'Mock Server', button: 'Set Initial',     action: 'update', description: 'Set initial state on state machine',      color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.sm_link',         module: 'Mock Server', button: 'Link Workflow',   action: 'create', description: 'Link workflow to mock server',            color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.sm_unlink',       module: 'Mock Server', button: 'Unlink Workflow', action: 'delete', description: 'Unlink workflow from mock server',        color: 'var(--color-mock-server)', defaultEnabled: false },
  // ── Mock Server — chaos / fault / webhooks ─────────────────────────────────
  { id: 'mock.chaos_toggle',    module: 'Mock Server', button: 'Chaos Toggle',    action: 'toggle', description: 'Toggle chaos mode on/off for mock server', color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.fault_toggle',    module: 'Mock Server', button: 'Fault Toggle',    action: 'toggle', description: 'Toggle per-route fault injection',         color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.ratelimit_toggle',module: 'Mock Server', button: 'Rate Limit',      action: 'toggle', description: 'Toggle rate limiting on route',            color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.webhook_add',     module: 'Mock Server', button: 'Add Webhook',     action: 'create', description: 'Add outbound webhook to route',            color: 'var(--color-mock-server)', defaultEnabled: false },
  { id: 'mock.webhook_del',     module: 'Mock Server', button: 'Remove Webhook',  action: 'delete', description: 'Remove outbound webhook from route',       color: 'var(--color-mock-server)', defaultEnabled: false },

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

  // ── Settings — General ────────────────────────────────────────────────────
  { id: 'settings.open',              module: 'Settings', button: 'Settings',             action: 'click',  description: 'Open settings panel',                      color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.theme_change',      module: 'Settings', button: 'Theme',                action: 'toggle', description: 'Change UI theme (dark/light/custom)',       color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.font_change',       module: 'Settings', button: 'Font Size',            action: 'update', description: 'Change editor font size',                  color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.language_change',   module: 'Settings', button: 'Language',             action: 'update', description: 'Change UI language / locale',              color: 'var(--color-settings)', defaultEnabled: false },

  // ── Settings — Proxy ──────────────────────────────────────────────────────
  { id: 'settings.proxy_save',        module: 'Settings', button: 'Save Proxy',           action: 'click',  description: 'Save proxy configuration',                 color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.proxy_toggle',      module: 'Settings', button: 'Proxy Toggle',         action: 'toggle', description: 'Enable/disable proxy',                     color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.proxy_open',        module: 'Settings', button: 'Proxy Settings',       action: 'click',  description: 'Open Proxy Settings popup',                color: 'var(--color-settings)', defaultEnabled: false },

  // ── Settings — Bulk URL Tester ────────────────────────────────────────────
  { id: 'settings.bulk_open',         module: 'Settings', button: 'Bulk URL Tester',      action: 'click',  description: 'Open Bulk URL Tester popup',               color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.bulk_run',          module: 'Settings', button: 'Run Bulk Test',        action: 'click',  description: 'Start bulk URL test run',                  color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.bulk_export',       module: 'Settings', button: 'Export Results',       action: 'click',  description: 'Export bulk test results',                 color: 'var(--color-settings)', defaultEnabled: false },

  // ── Settings — Load Tester ────────────────────────────────────────────────
  { id: 'settings.load_open',         module: 'Settings', button: 'Load Tester',          action: 'click',  description: 'Open Load Tester popup',                   color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.load_start',        module: 'Settings', button: 'Start Load Test',      action: 'click',  description: 'Start load test run',                     color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.load_stop',         module: 'Settings', button: 'Stop Load Test',       action: 'click',  description: 'Stop load test run',                      color: 'var(--color-settings)', defaultEnabled: false },

  // ── Settings — Cookie Manager ─────────────────────────────────────────────
  { id: 'settings.cookie_open',       module: 'Settings', button: 'Cookie Manager',       action: 'click',  description: 'Open Cookie Manager popup',                color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.cookie_add',        module: 'Settings', button: 'Add Cookie',           action: 'create', description: 'Add cookie to cookie manager',             color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.cookie_del',        module: 'Settings', button: 'Delete Cookie',        action: 'delete', description: 'Delete cookie from cookie manager',        color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.cookie_clear',      module: 'Settings', button: 'Clear Cookies',        action: 'delete', description: 'Clear all cookies for a domain',           color: 'var(--color-settings)', defaultEnabled: false },

  // ── Settings — Client Certificates ───────────────────────────────────────
  { id: 'settings.cert_open',         module: 'Settings', button: 'Client Certificates',  action: 'click',  description: 'Open Client Certificates popup',           color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.cert_add',          module: 'Settings', button: 'Add Certificate',      action: 'create', description: 'Add client certificate',                   color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.cert_del',          module: 'Settings', button: 'Delete Cert',          action: 'delete', description: 'Delete client certificate',                color: 'var(--color-settings)', defaultEnabled: false },

  // ── Settings — API Monitor ────────────────────────────────────────────────
  { id: 'settings.monitor_open',      module: 'Settings', button: 'API Monitor',          action: 'click',  description: 'Open API Monitor popup',                   color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.monitor_add',       module: 'Settings', button: 'Add Monitor',          action: 'create', description: 'Add API monitor rule',                     color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.monitor_del',       module: 'Settings', button: 'Delete Monitor',       action: 'delete', description: 'Delete API monitor rule',                  color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.monitor_toggle',    module: 'Settings', button: 'Toggle Monitor',       action: 'toggle', description: 'Enable/disable an API monitor rule',       color: 'var(--color-settings)', defaultEnabled: false },

  // ── Settings — Response Diff ──────────────────────────────────────────────
  { id: 'settings.diff_open',         module: 'Settings', button: 'Response Diff',        action: 'click',  description: 'Open Response Diff modal',                 color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.diff_compare',      module: 'Settings', button: 'Compare',              action: 'click',  description: 'Run diff comparison between two responses', color: 'var(--color-settings)', defaultEnabled: false },

  // ── Settings — Request Interceptor ───────────────────────────────────────
  { id: 'settings.intercept_open',    module: 'Settings', button: 'Request Interceptor',  action: 'click',  description: 'Open Request Interceptor panel',           color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.intercept_start',   module: 'Settings', button: 'Start Interceptor',    action: 'toggle', description: 'Start request interception proxy',         color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.intercept_stop',    module: 'Settings', button: 'Stop Interceptor',     action: 'toggle', description: 'Stop request interception proxy',          color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.intercept_rule_add',module: 'Settings', button: 'Add Intercept Rule',   action: 'create', description: 'Add interception rule',                    color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.intercept_rule_del',module: 'Settings', button: 'Delete Intercept Rule',action: 'delete', description: 'Delete interception rule',                 color: 'var(--color-settings)', defaultEnabled: false },

  // ── Settings — Mock Server config ─────────────────────────────────────────
  { id: 'settings.mock_port_change',  module: 'Settings', button: 'Change Port',          action: 'update', description: 'Change mock server port number',           color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.mock_rename',       module: 'Settings', button: 'Rename Server',        action: 'update', description: 'Rename mock server',                       color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.mock_protocol_chg', module: 'Settings', button: 'Change Protocol',      action: 'update', description: 'Change mock server protocol',              color: 'var(--color-settings)', defaultEnabled: false },

  // ── Settings — Prompt Library ─────────────────────────────────────────────
  { id: 'settings.prompt_save',       module: 'Settings', button: 'Save Prompt',          action: 'click',  description: 'Save / update a prompt library entry',     color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.prompt_delete',     module: 'Settings', button: 'Delete Prompt',        action: 'delete', description: 'Delete a prompt library entry',            color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.prompt_reset',      module: 'Settings', button: 'Reset Prompt',         action: 'click',  description: 'Reset prompt to built-in default',        color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.prompt_import',     module: 'Settings', button: 'Import Prompts',       action: 'create', description: 'Import prompt library from file',          color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.prompt_export',     module: 'Settings', button: 'Export Prompts',       action: 'click',  description: 'Export prompt library to file',            color: 'var(--color-settings)', defaultEnabled: false },

  // ── Settings — LLM Provider ───────────────────────────────────────────────
  { id: 'settings.llm_provider_chg',  module: 'Settings', button: 'Change LLM Provider',  action: 'update', description: 'Switch active LLM provider',              color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.llm_model_chg',     module: 'Settings', button: 'Change Model',          action: 'update', description: 'Change LLM model selection',              color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.llm_custom_add',    module: 'Settings', button: 'Add Custom Provider',   action: 'create', description: 'Add custom LLM provider',                 color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'settings.llm_reset',         module: 'Settings', button: 'Reset LLM Defaults',    action: 'click',  description: 'Reset LLM provider settings to defaults', color: 'var(--color-settings)', defaultEnabled: false },

  // ── DevTools ───────────────────────────────────────────────────────────────
  { id: 'devtools.clear_audit',      module: 'DevTools', button: 'Clear Audit',       action: 'delete', description: 'Clear audit log',                    color: 'var(--color-settings)', defaultEnabled: true },
  { id: 'devtools.audit_config',     module: 'DevTools', button: 'Audit Config',      action: 'toggle', description: 'Toggle audit event enabled/disabled',  color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'devtools.snapshot_dl',      module: 'DevTools', button: 'Download Snapshot', action: 'click',  description: 'Download debug snapshot JSON',         color: 'var(--color-settings)', defaultEnabled: false },
  { id: 'devtools.db_query',         module: 'DevTools', button: 'DB Query',          action: 'click',  description: 'Run DB Explorer query',                color: 'var(--color-settings)', defaultEnabled: false },
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
