/**
 * Mock Server wiki captures (E-wiki-capture-mockserver) — see wiki-capture-rest.test.ts
 * for the pattern. Mock servers live in a separate Zustand store (useMockStore),
 * not RequestTab — see CaptureBridge.tsx's addMockServer directive.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';
import {
  REST_SERVER, GRPC_SERVER, ROUTE_RESPONSE_SERVER, ROUTE_MATCHING_SERVER, ROUTE_ADVANCED_SERVER,
  ROUTE_SEQUENCE_SERVER, STATEMACHINE_SERVER, CHAOS_SERVER, GRAPHQL_CONFIG_SERVER, SOAP_CONFIG_SERVER,
  WS_HANDLERS_SERVER, SIO_HANDLERS_SERVER, SSE_EVENTS_SERVER, MQTT_TOPICS_SERVER, IMPORT_SERVER, WSDL_IMPORT_SERVER,
} from './wiki-capture-mockserver-fixtures';

interface ScreenSpec { id: string; label: string; explanation: string; directives: CaptureDirective[] }

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/mock-server');

const SCREENS: ScreenSpec[] = [
  {
    id: 'mockserver-rest-routes',
    label: 'Mock Server — REST Routes',
    explanation: 'Configured REST mock routes with method, path, status code, and response body — each independently enabled/disabled.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: REST_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'users-api' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-rest-catalog',
    label: 'Mock Server — Catalog',
    explanation: 'Pre-built template library — one-click add realistic route sets (Users CRUD, Auth Flow, Error Scenarios, etc.) instead of building routes from scratch.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: REST_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'users-api' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="catalog"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-grpc-routes',
    label: 'Mock Server — gRPC Services',
    explanation: 'Configured gRPC mock services and methods — supports unary and all three streaming modes, with example JSON responses.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: GRPC_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'user-service' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-export',
    label: 'Mock Server — Export',
    explanation: 'Export the configured server to a WireMock mapping bundle, an OpenAPI spec, or a standalone runnable Node.js script.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: REST_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'users-api' },
      { action: 'wait', ms: 300 },
      // Any AI modal (e.g. Chaos Engineering Planner) left open by earlier
      // manual/automated activity in this long-lived webview session bleeds
      // into every later capture via CaptureBridge's body-child portal
      // scan — close it before landing on Export so this screen shows the
      // real Export panel, not a leaked-open modal.
      { action: 'closeModals' },
      { action: 'click', selector: 'button[data-tab="export"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-route-response',
    label: 'Mock Server — Route Editor: Response',
    explanation: 'The route editor\'s Response tab — status code, delay, response headers, and body, opened by clicking any route row.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: ROUTE_RESPONSE_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'orders-api' },
      { action: 'wait', ms: 300 },
      // ServerDetail.tsx's serverTab local state isn't reset when switching
      // servers (no remount, and its own reset effect only fires on a
      // tabbed→non-tabbed protocol change) — it stays whatever the LAST
      // screen in this long-lived session left it on. Force 'routes' so the
      // route list actually renders, regardless of leftover state.
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 300 },
      { action: 'clickText', text: '/api/orders' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-route-matching',
    label: 'Mock Server — Route Editor: Matching',
    explanation: 'The route editor\'s Matching tab — extra conditions beyond method+path: query params, headers, and body content, so multiple routes can share a path and respond differently.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: ROUTE_MATCHING_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'filtered-api' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 300 },
      { action: 'clickText', text: '/api/users/search' },
      { action: 'wait', ms: 400 },
      { action: 'click', selector: 'button[data-tab="matching"]' },
      { action: 'wait', ms: 300 },
      { action: 'clickText', text: 'Advanced Match Rules' },
      { action: 'wait', ms: 300 },
    ],
  },
  {
    id: 'mockserver-route-advanced',
    label: 'Mock Server — Route Editor: Advanced',
    explanation: 'The route editor\'s Advanced tab — per-route fault injection override and rate limiting, independent of the server-wide Chaos settings.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: ROUTE_ADVANCED_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'flaky-api' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 300 },
      { action: 'clickText', text: '/api/flaky' },
      { action: 'wait', ms: 400 },
      { action: 'click', selector: 'button[data-tab="advanced"]' },
      { action: 'wait', ms: 300 },
      { action: 'clickText', text: 'Fault Injection & Rate Limiting' },
      { action: 'wait', ms: 300 },
    ],
  },
  {
    id: 'mockserver-route-sequence',
    label: 'Mock Server — Route Editor: Response Sequences',
    explanation: 'An ordered list of different responses for the same route — each hit advances to the next one, for simulating a value that changes across repeated calls.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: ROUTE_SEQUENCE_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'jobs-api' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 300 },
      { action: 'clickText', text: '/api/jobs/42/status' },
      { action: 'wait', ms: 400 },
      { action: 'clickText', text: 'Response Sequences' },
      { action: 'wait', ms: 300 },
    ],
  },
  {
    id: 'mockserver-statemachine',
    label: 'Mock Server — State Machine Gating',
    explanation: 'A route gated behind a real connected workflow — the two-step State Machine + Trigger Event selector, populated from the workflow\'s own transition labels.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: STATEMACHINE_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'checkout-api' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 300 },
      { action: 'clickText', text: '/api/orders/:id/pay' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-flow',
    label: 'Mock Server — State Machine Canvas',
    explanation: 'The visual node/edge canvas for building a state-machine workflow — states as nodes, events as edges. "Connect to Mock Server" wires the finished workflow into a route.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openStateMachineTab' },
      { action: 'wait', ms: 1800 }, // lazy-loaded canvas chunk on first open
      { action: 'seedStateMachineWorkflow', sampleId: 'users-crud' },
      { action: 'wait', ms: 700 },
    ],
  },
  {
    id: 'mockserver-chaos',
    label: 'Mock Server — Chaos & Fault Injection',
    explanation: 'Server-wide fault injection (probability slider, Low/Medium/High presets, protocol-aware fault types) and a global rate limit.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: CHAOS_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'unreliable-api' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="chaos"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-graphql-schema',
    label: 'Mock Server — GraphQL Config',
    explanation: 'A GraphQL mock server\'s own config screen — SDL schema editor plus per-operation mock responses, each with its own Response/Sequence/Matching/Advanced tabs.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: GRAPHQL_CONFIG_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'catalog-graphql' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-soap-services',
    label: 'Mock Server — SOAP Config',
    explanation: 'A SOAP mock server\'s config screen — Service → Operation hierarchy, each operation with its own static/script/fault response type.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: SOAP_CONFIG_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'weather-soap' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 300 },
      { action: 'clickText', text: 'WeatherService' },
      { action: 'wait', ms: 300 },
      { action: 'clickText', text: 'GetWeather' },
      { action: 'wait', ms: 300 },
    ],
  },
  {
    id: 'mockserver-ws-handlers',
    label: 'Mock Server — WebSocket Config',
    explanation: 'A WebSocket mock server\'s config screen — On Connect / On Message (regex pattern) / On Disconnect handlers, each with its own response and broadcast toggle.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: WS_HANDLERS_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'chat-ws' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-sio-messages',
    label: 'Mock Server — Socket.IO Config',
    explanation: 'A Socket.IO mock server\'s config screen — event-based handlers: listen for one event, emit a response event back.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: SIO_HANDLERS_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'chat-sio' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-sse-events',
    label: 'Mock Server — SSE Config',
    explanation: 'An SSE mock server\'s config screen — event streams with name, data, interval, and delay, independently enabled.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: SSE_EVENTS_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'prices-sse' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-mqtt-topics',
    label: 'Mock Server — MQTT Config',
    explanation: 'An MQTT mock server\'s config screen — topic subscriptions with QoS, retain flag, publish payload, and interval.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: MQTT_TOPICS_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'sensors-mqtt' },
      { action: 'wait', ms: 300 },
      { action: 'click', selector: 'button[data-tab="routes"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-import',
    label: 'Mock Server — Import',
    explanation: 'The Import tab — paste or upload OpenAPI/Postman/WireMock (REST), SDL (GraphQL), .proto (gRPC), or WSDL (SOAP) to generate routes instead of building them by hand.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: IMPORT_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'import-demo-api' },
      { action: 'wait', ms: 300 },
      { action: 'closeModals' },
      { action: 'click', selector: 'button[data-tab="import"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'mockserver-wsdl',
    label: 'Mock Server — WSDL Import',
    explanation: 'The Import tab for a SOAP mock server — a single WSDL format, auto-seeded with a realistic placeholder WSDL document.',
    directives: [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: WSDL_IMPORT_SERVER as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'import-demo-soap' },
      { action: 'wait', ms: 300 },
      { action: 'closeModals' },
      { action: 'click', selector: 'button[data-tab="import"]' },
      { action: 'wait', ms: 400 },
    ],
  },
];

suite('Daakia Wiki Capture — Mock Server', () => {
  let MainPanel: MainPanelLike;

  suiteSetup(async function () {
    this.timeout(20_000);
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
      this.timeout(20_000);
      const html = await runCapture(MainPanel, screen.directives);
      if (html.length < 200) throw new Error(`${screen.id}: captured HTML looks too small (${html.length} chars)`);
      const file = `${screen.id}.html`;
      fs.writeFileSync(path.join(OUT_DIR, file), html, 'utf-8');
      manifest.push({ id: screen.id, label: screen.label, explanation: screen.explanation, file });
    });
  }

  // Real-traffic capture: starts an ACTUALLY-RUNNING mock server through the
  // real UI button (real startMockServer() call, real port), fires a real
  // Node fetch() at it, then captures the Activity Log ('traffic' tab)
  // showing that real request — not seeded/synthetic data. The real port is
  // read back off the DOM (the server's URL is rendered as plain text next
  // to the Start/Stop button) rather than importing mock-server-manager.ts
  // directly, since a statically-imported copy of that module in this test's
  // own tsc-compiled output is a SEPARATE module instance from the one
  // running inside the real, webpack-bundled dist/extension.js — its
  // module-level running-server registry would always read back empty.
  test('capture mockserver-traffic (real server + real request)', async function () {
    this.timeout(35_000);
    const startHtml = await runCapture(MainPanel, [
      { action: 'openMockServerTab' },
      { action: 'wait', ms: 1200 },
      { action: 'addMockServer', server: { ...REST_SERVER, id: 'wiki-mock-traffic', name: 'traffic-demo-api' } as any },
      { action: 'wait', ms: 500 },
      { action: 'clickText', text: 'traffic-demo-api' },
      { action: 'wait', ms: 300 },
      { action: 'closeModals' },
      { action: 'clickText', text: '▶ Start' },
      { action: 'waitForMessage', messageType: 'mockServer:started', timeoutMs: 10_000 },
      { action: 'wait', ms: 300 },
    ]);
    const portMatch = startHtml.match(/https?:\/\/localhost:(\d+)/);
    if (!portMatch) throw new Error('mockserver-traffic: could not read real port off the started server\'s DOM');
    const port = portMatch[1];

    // Real HTTP request from the Node extension-host process against the
    // real running mock server — exactly what a user's own client would do.
    const res = await fetch(`http://localhost:${port}/api/users`);
    if (res.status !== 200) throw new Error(`mockserver-traffic: expected 200 from real mock server, got ${res.status}`);
    await res.text();
    // Let the real onLog callback's postMessage('mockServer:log', ...) reach
    // and be committed by the webview before capturing.
    await new Promise(r => setTimeout(r, 600));

    const html = await runCapture(MainPanel, [
      { action: 'click', selector: 'button[data-tab="traffic"]' },
      { action: 'wait', ms: 400 },
    ]);
    if (html.length < 200) throw new Error(`mockserver-traffic: captured HTML looks too small (${html.length} chars)`);
    const file = 'mockserver-traffic.html';
    fs.writeFileSync(path.join(OUT_DIR, file), html, 'utf-8');
    manifest.push({
      id: 'mockserver-traffic',
      label: 'Mock Server — Activity Log (real traffic)',
      explanation: 'The Activity Log tab, showing a real incoming request logged live while the mock server was actually running — method, path, matched route, status, and timing, exactly as it would for real traffic hitting your mock.',
      file,
    });

    // Stop the real server so it doesn't stay bound to its port for the rest
    // of this long-lived test session.
    await runCapture(MainPanel, [
      { action: 'clickText', text: '⏹ Stop' },
      { action: 'wait', ms: 300 },
    ]);
  });

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
