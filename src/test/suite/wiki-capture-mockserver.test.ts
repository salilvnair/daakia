/**
 * Mock Server wiki captures (E-wiki-capture-mockserver) — see wiki-capture-rest.test.ts
 * for the pattern. Mock servers live in a separate Zustand store (useMockStore),
 * not RequestTab — see CaptureBridge.tsx's addMockServer directive.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

interface ScreenSpec { id: string; label: string; explanation: string; directives: CaptureDirective[] }

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/mock-server');

const REST_SERVER = {
  id: 'wiki-mock-rest', name: 'users-api', description: 'Full user management API with list, create, and delete operations.',
  protocol: 'rest', port: null, running: false, createdAt: Date.now(),
  routes: [
    { id: 'r1', method: 'GET', path: '/api/users', statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '{"users":[{"id":1,"name":"Alice Johnson"}],"total":1}', delay: 0, enabled: true },
    { id: 'r2', method: 'POST', path: '/api/users', statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: '{"id":3,"name":"New User"}', delay: 0, enabled: true },
    { id: 'r3', method: 'DELETE', path: '/api/users/:id', statusCode: 204, headers: {}, body: '', delay: 0, enabled: true },
  ],
};

const GRPC_SERVER = {
  id: 'wiki-mock-grpc', name: 'user-service', description: 'gRPC UserService mock with CRUD methods.',
  protocol: 'grpc', port: null, running: false, createdAt: Date.now(),
  routes: [],
  grpcMethods: [
    { id: 'g1', service: 'users.v1.UserService', method: 'GetUser', type: 'unary', response: '{"id":"usr_001","name":"Alice Johnson"}', enabled: true },
    { id: 'g2', service: 'users.v1.UserService', method: 'ListUsers', type: 'unary', response: '{"users":[]}', enabled: true },
  ],
};

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

  suiteTeardown(() => {
    if (manifest.length > 0) fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  });
});
