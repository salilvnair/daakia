/**
 * gRPC wiki captures (E-wiki-capture-grpc) — see wiki-capture-rest.test.ts for the pattern.
 *
 * Now includes a populated `response` in every applicable screen so the wiki
 * shows what a real gRPC round-trip looks like (Body/Metadata/Timeline/Tests
 * response sub-tabs would otherwise render "Hit Invoke to get a response").
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

interface ScreenSpec { id: string; label: string; explanation: string; directives: CaptureDirective[] }

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/grpc');

const BASE_REQUEST_PATCH = {
  protocol: 'grpc',
  url: 'localhost:50051',
  grpcService: 'users.v1.UserService',
  grpcMethod: 'GetUser',
  grpcMessage: JSON.stringify({ id: 'usr_001' }, null, 2),
  grpcMetadata: [
    { id: 'm1', key: 'authorization', value: 'Bearer {{token}}', enabled: true },
    { id: 'm2', key: 'x-request-id', value: '{{$random.uuid}}', enabled: true },
  ],
};

// Same tab but with a populated response — used by every screen showing the
// response half (Body/Metadata/Timeline/Tests).
const RESPONSE_PATCH = {
  ...BASE_REQUEST_PATCH,
  response: {
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/grpc+json',
      'grpc-status': '0',
      'grpc-message': 'OK',
      'x-envoy-upstream-service-time': '42',
    },
    body: JSON.stringify({
      id: 'usr_001',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'admin',
      createdAt: '2024-11-03T09:41:00Z',
    }, null, 2),
    size: 148,
    time: 42,
    contentType: 'application/grpc+json',
    cookies: [],
  },
  scriptTestResults: [
    { name: 'grpc-status is OK', passed: true, error: undefined },
    { name: 'response has id', passed: true, error: undefined },
    { name: 'response.role is admin', passed: true, error: undefined },
  ],
};

const SCREENS: ScreenSpec[] = [
  // ── Request-side sub-tabs ─────────────────────────────────────────
  {
    id: 'grpc-message',
    label: 'gRPC — Message',
    explanation: 'gRPC request message editor — select a service/method (via reflection or an uploaded .proto) and edit the JSON request payload.',
    directives: [
      { action: 'addTab', patch: BASE_REQUEST_PATCH },
      { action: 'click', selector: 'button[data-tab="message"]' },
      { action: 'wait', ms: 1800 },
    ],
  },
  {
    id: 'grpc-metadata',
    label: 'gRPC — Metadata',
    explanation: "gRPC's header equivalent — same key/value table as REST Headers, with an AI ✨ suggest button. Nothing auto-added; every row is what you typed.",
    directives: [
      { action: 'addTab', patch: BASE_REQUEST_PATCH },
      { action: 'click', selector: 'button[data-tab="metadata"]' },
      { action: 'wait', ms: 600 },
    ],
  },
  {
    id: 'grpc-proto',
    label: 'gRPC — Service Definition',
    explanation: 'Upload a .proto file or use server reflection to discover available services and methods.',
    directives: [
      { action: 'addTab', patch: BASE_REQUEST_PATCH },
      { action: 'click', selector: 'button[data-tab="proto"]' },
      { action: 'wait', ms: 600 },
    ],
  },
  {
    id: 'grpc-auth',
    label: 'gRPC — Auth',
    explanation: 'Auth editor for gRPC calls — Bearer token, API key, or TLS client certificates.',
    directives: [
      { action: 'addTab', patch: { ...BASE_REQUEST_PATCH, authType: 'bearer', authData: { token: 'eyJhbGciOiJIUzI1NiJ9.mock_token' } } },
      { action: 'click', selector: 'button[data-tab="auth"]' },
      { action: 'wait', ms: 600 },
    ],
  },
  {
    id: 'grpc-scripts',
    label: 'gRPC — Scripts',
    explanation: 'Pre-request / Post-response script editors — same dk.* runtime as REST and every other protocol.',
    directives: [
      { action: 'addTab', patch: { ...BASE_REQUEST_PATCH, preRequestScript: '// Set a dynamic timestamp header\ndk.request.metadata["x-ts"] = Date.now().toString();', postResponseScript: 'dk.test("grpc-status is OK", () => {\n  dk.expect(dk.response.headers["grpc-status"]).toBe("0");\n});' } },
      { action: 'click', selector: 'button[data-tab="scripts"]' },
      { action: 'wait', ms: 1800 },
    ],
  },
  // ── Response-side sub-tabs (with populated response) ─────────────
  {
    id: 'grpc-response-body',
    label: 'gRPC — Response Body',
    explanation: "The RPC's decoded JSON response. For streaming calls, each message received appears here as it arrives.",
    directives: [
      { action: 'addTab', patch: RESPONSE_PATCH },
      { action: 'setResponseSubtab', responseProtocol: 'grpc', subtab: 'body' },
      { action: 'wait', ms: 1800 },
    ],
  },
  {
    id: 'grpc-response-metadata',
    label: 'gRPC — Response Metadata',
    explanation: 'Trailing metadata the server sent back — grpc-status, grpc-message, and any custom trailers.',
    directives: [
      { action: 'addTab', patch: RESPONSE_PATCH },
      { action: 'setResponseSubtab', responseProtocol: 'grpc', subtab: 'metadata' },
      { action: 'wait', ms: 600 },
    ],
  },
  {
    id: 'grpc-response-tests',
    label: 'gRPC — Response Tests',
    explanation: 'dk.test() assertion results from the Post-response script — same Tests tab format as REST.',
    directives: [
      { action: 'addTab', patch: RESPONSE_PATCH },
      { action: 'setResponseSubtab', responseProtocol: 'grpc', subtab: 'tests' },
      { action: 'wait', ms: 600 },
    ],
  },
  {
    id: 'grpc-response-timeline',
    label: 'gRPC — Response Timeline',
    explanation: "Where the call's time went — connection setup, TLS handshake, time-to-first-byte for the response.",
    directives: [
      { action: 'addTab', patch: RESPONSE_PATCH },
      { action: 'setResponseSubtab', responseProtocol: 'grpc', subtab: 'timeline' },
      { action: 'wait', ms: 600 },
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
