/**
 * gRPC wiki captures (E-wiki-capture-grpc) — see wiki-capture-rest.test.ts for the pattern.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

interface ScreenSpec { id: string; label: string; explanation: string; directives: CaptureDirective[] }

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/grpc');

const BASE_PATCH = {
  protocol: 'grpc',
  url: 'localhost:50051',
  grpcMethod: 'users.v1.UserService/GetUser',
  grpcMessage: JSON.stringify({ id: 'usr_001' }, null, 2),
  grpcMetadata: [{ id: 'm1', key: 'authorization', value: 'Bearer {{token}}', enabled: true }],
};

const SCREENS: ScreenSpec[] = [
  {
    id: 'grpc-message',
    label: 'gRPC — Message',
    explanation: 'gRPC request message editor — select a service/method (via reflection or an uploaded .proto) and edit the JSON request payload.',
    directives: [
      { action: 'addTab', patch: BASE_PATCH },
      { action: 'click', selector: 'button[data-tab="message"]' },
      { action: 'wait', ms: 1800 },
    ],
  },
  {
    id: 'grpc-proto',
    label: 'gRPC — Service Definition',
    explanation: 'Upload a .proto file or use server reflection to discover available services and methods.',
    directives: [
      { action: 'addTab', patch: BASE_PATCH },
      { action: 'click', selector: 'button[data-tab="proto"]' },
      { action: 'wait', ms: 300 },
    ],
  },
  {
    id: 'grpc-auth',
    label: 'gRPC — Auth',
    explanation: 'Auth editor for gRPC calls — Bearer token, API key, or TLS client certificates.',
    directives: [
      { action: 'addTab', patch: { ...BASE_PATCH, authType: 'bearer', authData: { token: 'eyJhbGciOiJIUzI1NiJ9.mock_token' } } },
      { action: 'click', selector: 'button[data-tab="auth"]' },
      { action: 'wait', ms: 300 },
    ],
  },
];

suite('Daakia Wiki Capture — gRPC', () => {
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
