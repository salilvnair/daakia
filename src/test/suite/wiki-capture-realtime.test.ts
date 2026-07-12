/**
 * Realtime (WebSocket/SSE/Socket.IO/MQTT) wiki captures (E-wiki-capture-realtime).
 * All four live under protocol: 'websocket', distinguished by authData.rt_protocol —
 * see RealtimeProtocolSelector.tsx. See wiki-capture-rest.test.ts for the pattern.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

interface ScreenSpec { id: string; label: string; explanation: string; directives: CaptureDirective[] }

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/websocket');

const SCREENS: ScreenSpec[] = [
  {
    id: 'realtime-websocket',
    label: 'Realtime — WebSocket',
    explanation: 'WebSocket connection panel — connect, send/receive messages with a live log, message templates, and auto-reconnect.',
    directives: [
      { action: 'addTab', patch: { protocol: 'websocket', url: 'wss://echo.example.com/socket', authData: { rt_protocol: 'websocket' } } },
      { action: 'wait', ms: 500 },
    ],
  },
  {
    id: 'realtime-sse',
    label: 'Realtime — Server-Sent Events',
    explanation: 'SSE connection panel — subscribes to a text/event-stream endpoint and shows incoming events as they arrive.',
    directives: [
      { action: 'addTab', patch: { protocol: 'websocket', url: 'https://api.example.com/events', authData: { rt_protocol: 'sse' } } },
      { action: 'wait', ms: 500 },
    ],
  },
  {
    id: 'realtime-socketio',
    label: 'Realtime — Socket.IO',
    explanation: 'Socket.IO connection panel — connect with custom namespaces/auth, emit and listen for named events.',
    directives: [
      { action: 'addTab', patch: { protocol: 'websocket', url: 'https://api.example.com', authData: { rt_protocol: 'socketio' } } },
      { action: 'wait', ms: 500 },
    ],
  },
  {
    id: 'realtime-mqtt',
    label: 'Realtime — MQTT',
    explanation: 'MQTT connection panel (over WebSocket transport) — subscribe/publish to topics with QoS and retain flag support.',
    directives: [
      { action: 'addTab', patch: { protocol: 'websocket', url: 'wss://broker.example.com:8883', authData: { rt_protocol: 'mqtt' } } },
      { action: 'wait', ms: 500 },
    ],
  },
];

suite('Daakia Wiki Capture — Realtime', () => {
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

  suiteTeardown(() => {
    if (manifest.length > 0) fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  });
});
