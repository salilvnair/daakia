/**
 * REST wiki captures (E-wiki-capture-rest) — drives the real running extension
 * through every REST screen and writes each captured #root outerHTML to
 * plan/daakia_live/rest/<screen-id>.html, plus a manifest.json describing each
 * screen (id, label, explanation) for the wiki UI to consume.
 *
 * Not a conventional assertion-style test — a capture RUN that happens to live
 * in the e2e suite so it reuses the exact same real, activated extension host.
 * Run via: npm run test:e2e (or a filtered run once one exists).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

interface ScreenSpec {
  id: string;
  label: string;
  explanation: string;
  directives: CaptureDirective[];
}

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/rest');

const SAMPLE_RESPONSE = {
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json', 'x-request-id': 'req_8f3a2b1c' },
  body: JSON.stringify({ users: [{ id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin' }, { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'user' }], total: 2, page: 1 }, null, 2),
  size: 512,
  time: 142,
  contentType: 'application/json',
  cookies: [],
};

const BASE_TAB_PATCH = {
  protocol: 'rest',
  method: 'GET',
  url: 'https://api.example.com/v1/users?limit=10&page=1',
  params: [
    { id: 'p1', key: 'limit', value: '10', enabled: true },
    { id: 'p2', key: 'page', value: '1', enabled: true },
  ],
  headers: [
    { id: 'h1', key: 'Accept', value: 'application/json', enabled: true },
    { id: 'h2', key: 'X-Request-ID', value: '{{$random.uuid}}', enabled: true },
  ],
};

const SCREENS: ScreenSpec[] = [
  {
    id: 'rest-params',
    label: 'REST — Params',
    explanation: 'Query parameters editor. Params typed here sync automatically with the URL bar, and each row can be individually enabled/disabled without deleting it.',
    directives: [
      { action: 'addTab', patch: BASE_TAB_PATCH },
      { action: 'click', selector: 'button[data-tab="params"]' },
      { action: 'wait', ms: 300 },
    ],
  },
  {
    id: 'rest-headers',
    label: 'REST — Headers',
    explanation: 'Request headers editor, with environment variable interpolation (e.g. {{$random.uuid}}) and AI-assisted header suggestions.',
    directives: [
      { action: 'addTab', patch: BASE_TAB_PATCH },
      { action: 'click', selector: 'button[data-tab="headers"]' },
      { action: 'wait', ms: 300 },
    ],
  },
  {
    id: 'rest-body-json',
    label: 'REST — Body (JSON)',
    explanation: 'Request body editor with JSON/XML/form-data/urlencoded modes, syntax highlighting, and AI-assisted body generation.',
    directives: [
      {
        action: 'addTab',
        patch: {
          ...BASE_TAB_PATCH,
          method: 'POST',
          bodyMode: 'raw',
          bodyContentType: 'application/json',
          bodyRaw: JSON.stringify({ name: 'New User', email: 'new@example.com', role: 'user' }, null, 2),
        },
      },
      { action: 'click', selector: 'button[data-tab="body"]' },
      { action: 'wait', ms: 1800 }, // Monaco needs real time to mount + tokenize on first use
    ],
  },
  {
    id: 'rest-auth',
    label: 'REST — Authorization',
    explanation: 'Auth editor supporting Bearer token, Basic, API Key, OAuth 2.0, and Digest — with per-request or inherited-from-collection modes.',
    directives: [
      {
        action: 'addTab',
        patch: { ...BASE_TAB_PATCH, authType: 'bearer', authData: { token: 'eyJhbGciOiJIUzI1NiJ9.mock_token_for_docs' } },
      },
      { action: 'click', selector: 'button[data-tab="auth"]' },
      { action: 'wait', ms: 300 },
    ],
  },
  {
    id: 'rest-scripts',
    label: 'REST — Scripts',
    explanation: 'Pre-request and post-response scripting with the dk.* runtime — set variables, run assertions, and chain requests.',
    directives: [
      {
        action: 'addTab',
        patch: {
          ...BASE_TAB_PATCH,
          preRequestScript: "dk.env.set('timestamp', Date.now());",
          postResponseScript: "dk.test('status is 200', () => {\n  dk.expect(dk.response.status).toBe(200);\n});",
        },
      },
      { action: 'click', selector: 'button[data-tab="scripts"]' },
      { action: 'wait', ms: 1800 }, // Monaco needs real time to mount + tokenize on first use
    ],
  },
  {
    id: 'rest-variables',
    label: 'REST — Variables',
    explanation: 'Per-request variables scoped to this tab only, layered on top of environment and collection variables.',
    directives: [
      {
        action: 'addTab',
        patch: { ...BASE_TAB_PATCH, variables: [{ id: 'v1', key: 'userId', value: '42', enabled: true }] },
      },
      { action: 'click', selector: 'button[data-tab="variables"]' },
      { action: 'wait', ms: 300 },
    ],
  },
  {
    id: 'rest-response',
    label: 'REST — Response',
    explanation: 'Response viewer with syntax-highlighted body, headers, cookies, timeline, and test results — populated here from a real captured response.',
    directives: [
      { action: 'addTab', patch: { ...BASE_TAB_PATCH, response: SAMPLE_RESPONSE } },
      { action: 'wait', ms: 1800 }, // Monaco needs real time to mount + tokenize on first use
    ],
  },
];

suite('Daakia Wiki Capture — REST', () => {
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
    if (manifest.length > 0) {
      fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    }
  });
});
