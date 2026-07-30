/**
 * Realtime (WebSocket/SSE/Socket.IO/MQTT) wiki captures (E-wiki-capture-realtime).
 * All four live under protocol: 'websocket', distinguished by authData.rt_protocol —
 * see RealtimeProtocolSelector.tsx. See wiki-capture-rest.test.ts for the pattern.
 *
 * Every screen now seeds a real connected state + message/event log via the
 * seedRealtimeState directive, which calls a test-only window hook each panel
 * exposes (__wsCaptureSeed / __sseCaptureSeed / __sioCaptureSeed /
 * __mqttCaptureSeed — see WebSocketPanel.tsx etc.) — that state lives in a
 * module-level cache outside useTabsStore and can't be seeded via `patch`.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

interface ScreenSpec { id: string; label: string; explanation: string; directives: CaptureDirective[] }

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/websocket');

const now = Date.now();

const WS_MESSAGES = [
  { id: 'm1', direction: 'sent', data: '{"type":"subscribe","channel":"orders"}', timestamp: now - 8000 },
  { id: 'm2', direction: 'received', data: '{"type":"subscribed","channel":"orders","ok":true}', timestamp: now - 7500 },
  { id: 'm3', direction: 'sent', data: '{"type":"ping"}', timestamp: now - 4000 },
  { id: 'm4', direction: 'received', data: '{"type":"pong","ts":1732000000}', timestamp: now - 3900 },
  { id: 'm5', direction: 'received', data: '{"type":"order.created","orderId":"ord_42","total":89.5}', timestamp: now - 1000 },
];

const SSE_EVENTS = [
  { id: 'e1', eventType: 'data', data: '{"progress":10}', timestamp: now - 6000 },
  { id: 'e2', eventType: 'data', data: '{"progress":55}', timestamp: now - 3000 },
  { id: 'e3', eventType: 'complete', data: '{"progress":100,"status":"done"}', timestamp: now - 500 },
];

const SIO_EVENTS = [
  { id: 's1', direction: 'sent', event: 'join', data: '{"room":"lobby"}', timestamp: now - 7000 },
  { id: 's2', direction: 'received', event: 'joined', data: '{"room":"lobby","members":4}', timestamp: now - 6800 },
  { id: 's3', direction: 'received', event: 'chat:message', data: '{"user":"ada","text":"hey team"}', timestamp: now - 1200 },
];

const MQTT_MESSAGES = [
  { id: 'q1', topic: 'sensors/temp', payload: '{"celsius":22.4}', qos: 0, retain: false, direction: 'received', timestamp: now - 5000 },
  { id: 'q2', topic: 'sensors/temp', payload: '{"celsius":22.6}', qos: 0, retain: false, direction: 'received', timestamp: now - 2000 },
  { id: 'q3', topic: 'commands/restart', payload: '{"ack":true}', qos: 1, retain: false, direction: 'published', timestamp: now - 800 },
];

const MQTT_SUBSCRIPTIONS = [
  { id: 'sub1', topic: 'sensors/#', qos: 0, label: 'sensors/#', color: '#06b6d4', active: true },
  { id: 'sub2', topic: 'commands/restart', qos: 1, label: 'commands/restart', color: '#f59e0b', active: true },
];

const SCREENS: ScreenSpec[] = [
  // ── WebSocket ─────────────────────────────────────────────────────
  {
    id: 'ws-communication',
    label: 'WebSocket — Communication',
    explanation: 'The default WebSocket sub-tab — connected (green dot), message composer at the bottom, live log above with sent (green) and received (purple) entries.',
    directives: [
      { action: 'addTab', patch: { protocol: 'websocket', url: 'wss://echo.example.com/socket', authData: { rt_protocol: 'websocket' } } },
      { action: 'wait', ms: 400 },
      { action: 'seedRealtimeState', realtimeProtocol: 'ws', realtimeMessages: WS_MESSAGES, realtimeConnState: 'connected' },
      { action: 'wait', ms: 500 },
    ],
  },
  {
    id: 'ws-log',
    label: 'WebSocket — Log',
    explanation: 'The live message log — collapsible entries, green dot for sent / purple dot for received, auto-scroll toggle, clear-log and scroll-to-top/bottom controls.',
    directives: [
      { action: 'addTab', patch: { protocol: 'websocket', url: 'wss://echo.example.com/socket', authData: { rt_protocol: 'websocket' } } },
      { action: 'wait', ms: 400 },
      { action: 'seedRealtimeState', realtimeProtocol: 'ws', realtimeMessages: WS_MESSAGES, realtimeConnState: 'connected' },
      { action: 'wait', ms: 500 },
    ],
  },
  {
    id: 'ws-protocols',
    label: 'WebSocket — Protocols',
    explanation: 'Subprotocol list sent during the WebSocket handshake (Sec-WebSocket-Protocol) — each one individually enabled/disabled, e.g. graphql-ws for GraphQL subscriptions.',
    directives: [
      {
        action: 'addTab',
        patch: {
          protocol: 'websocket', url: 'wss://echo.example.com/socket',
          authData: { rt_protocol: 'websocket', ws_protocol_entries: JSON.stringify([{ enabled: true, value: 'graphql-ws' }, { enabled: false, value: 'soap' }]) },
        },
      },
      { action: 'wait', ms: 400 },
      // WebSocketPanel.tsx's activeSubTab is local React state that only
      // re-syncs from the ws.subtab.<id> pref inside a useEffect keyed on
      // activeTabId — writing the pref directly (setActiveTabSubtab) never
      // fires that effect, so the panel silently stayed on Communication no
      // matter what subtab was requested. A real click on the actual
      // TabView button goes through the component's own setActiveSubTab,
      // exactly like a real user, and updates both local state and the pref.
      { action: 'click', selector: 'button[data-tab="protocols"]' },
      { action: 'wait', ms: 500 },
    ],
  },
  {
    id: 'ws-templates',
    label: 'WebSocket — Templates',
    explanation: 'Saved message templates you can re-send with one click instead of retyping a JSON payload every time.',
    directives: [
      {
        action: 'addTab',
        patch: {
          protocol: 'websocket', url: 'wss://echo.example.com/socket',
          authData: { rt_protocol: 'websocket' },
          wsTemplates: [
            { id: 't1', name: 'Ping', message: '{"type":"ping"}', format: 'json' },
            { id: 't2', name: 'Subscribe Orders', message: '{"type":"subscribe","channel":"orders"}', format: 'json' },
          ],
        } as any,
      },
      { action: 'wait', ms: 400 },
      // Same stale-closure issue as ws-protocols above — real click instead.
      { action: 'click', selector: 'button[data-tab="templates"]' },
      { action: 'wait', ms: 500 },
    ],
  },
  // ── SSE ───────────────────────────────────────────────────────────
  {
    id: 'realtime-sse',
    label: 'Realtime — Server-Sent Events',
    explanation: 'SSE connection panel, connected — event log shows real incoming events with type and data as they arrive.',
    directives: [
      { action: 'addTab', patch: { protocol: 'websocket', url: 'https://api.example.com/events', authData: { rt_protocol: 'sse', sse_eventType: 'data' } } },
      { action: 'wait', ms: 400 },
      { action: 'seedRealtimeState', realtimeProtocol: 'sse', realtimeMessages: SSE_EVENTS, realtimeConnState: 'connected' },
      { action: 'wait', ms: 500 },
    ],
  },
  // ── Socket.IO ─────────────────────────────────────────────────────
  {
    id: 'sio-communication',
    label: 'Socket.IO — Communication',
    explanation: 'Emit/listen composer — event name plus JSON payload, connected with a real socket id, live event log below.',
    directives: [
      { action: 'addTab', patch: { protocol: 'websocket', url: 'https://api.example.com', authData: { rt_protocol: 'socketio', sio_subTab: 'communication' } } },
      { action: 'wait', ms: 400 },
      { action: 'seedRealtimeState', realtimeProtocol: 'sio', realtimeMessages: SIO_EVENTS, realtimeConnState: 'connected', realtimeSocketId: 'sock_9f3a1c' },
      { action: 'wait', ms: 500 },
    ],
  },
  {
    id: 'sio-log',
    label: 'Socket.IO — Log',
    explanation: "Live event log for every emitted and received Socket.IO event, same auto-scroll and clear controls as WebSocket's Log tab.",
    directives: [
      { action: 'addTab', patch: { protocol: 'websocket', url: 'https://api.example.com', authData: { rt_protocol: 'socketio', sio_subTab: 'communication' } } },
      { action: 'wait', ms: 400 },
      { action: 'seedRealtimeState', realtimeProtocol: 'sio', realtimeMessages: SIO_EVENTS, realtimeConnState: 'connected', realtimeSocketId: 'sock_9f3a1c' },
      { action: 'wait', ms: 500 },
    ],
  },
  {
    id: 'sio-authorization',
    label: 'Socket.IO — Authorization',
    explanation: 'The only realtime sub-protocol with a real Authorization tab — same AuthEditor as REST, sent as Socket.IO connection auth on handshake.',
    directives: [
      {
        action: 'addTab',
        patch: {
          protocol: 'websocket', url: 'https://api.example.com',
          authType: 'bearer',
          authData: { rt_protocol: 'socketio', sio_subTab: 'authorization', token: 'eyJhbGciOiJIUzI1NiJ9.mock_token' },
        },
      },
      { action: 'wait', ms: 400 },
      { action: 'setActiveTabSubtab', subtabProtocol: 'sio', subtab: 'authorization' },
      { action: 'wait', ms: 500 },
    ],
  },
  // ── MQTT ──────────────────────────────────────────────────────────
  {
    id: 'realtime-mqtt',
    label: 'Realtime — MQTT',
    explanation: 'MQTT connection panel (over WebSocket transport), connected — 2 active subscriptions, live messages with QoS/retain per row.',
    directives: [
      {
        action: 'addTab',
        patch: {
          protocol: 'websocket', url: 'wss://broker.example.com:8883',
          authData: {
            rt_protocol: 'mqtt', mqtt_clientId: 'daakia_wiki_demo',
            mqtt_subscriptions: JSON.stringify(MQTT_SUBSCRIPTIONS),
          },
        },
      },
      { action: 'wait', ms: 400 },
      { action: 'seedRealtimeState', realtimeProtocol: 'mqtt', realtimeMessages: MQTT_MESSAGES, realtimeConnState: 'connected' },
      { action: 'wait', ms: 500 },
    ],
  },
];

suite('Daakia Wiki Capture — Realtime', () => {
  let MainPanel: MainPanelLike;

  suiteSetup(async function () {
    this.timeout(35_000);
    const ext = vscode.extensions.getExtension('salilvnair.daakia');
    if (!ext) throw new Error('extension not found');
    const exports = ext.isActive ? ext.exports : await ext.activate();
    MainPanel = exports.MainPanel as MainPanelLike;
    if (!MainPanel.currentPanel) await vscode.commands.executeCommand('daakia.openPanel');
    for (let i = 0; i < 40 && !MainPanel.currentPanel; i++) await new Promise(r => setTimeout(r, 250));
    if (!MainPanel.currentPanel) throw new Error('MainPanel.currentPanel never became available');
    await new Promise(r => setTimeout(r, 2500));
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  const manifest: Array<{ id: string; label: string; explanation: string; file: string }> = [];

  for (const screen of SCREENS) {
    test(`capture ${screen.id}`, async function () {
      this.timeout(35_000);
      const html = await runCapture(MainPanel, screen.directives);
      if (html.length < 200) throw new Error(`${screen.id}: captured HTML looks too small (${html.length} chars)`);
      const file = `${screen.id}.html`;
      fs.writeFileSync(path.join(OUT_DIR, file), html, 'utf-8');
      manifest.push({ id: screen.id, label: screen.label, explanation: screen.explanation, file });
    });
  }

  // Merge into the existing manifest rather than overwriting it — this test file
  // may only cover a subset of the screens that end up in manifest.json (others
  // were added by a different test file, or copied in directly); overwriting
  // would silently delete every entry this run didn't touch.
  suiteTeardown(() => {
    if (manifest.length === 0) return;
    const manifestPath = path.join(OUT_DIR, 'manifest.json');
    let existing: Array<{ id: string; label: string; explanation: string; file: string }> = [];
    if (fs.existsSync(manifestPath)) {
      try { existing = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch { existing = []; }
    }
    const byId = new Map(existing.map(e => [e.id, e]));
    for (const e of manifest) byId.set(e.id, e);
    fs.writeFileSync(manifestPath, JSON.stringify(Array.from(byId.values()), null, 2), 'utf-8');
  });
});
