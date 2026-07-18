/**
 * GraphQL wiki captures (E-wiki-capture-graphql) — see wiki-capture-rest.test.ts
 * for the pattern this follows.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

interface ScreenSpec { id: string; label: string; explanation: string; directives: CaptureDirective[] }

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/graphql');

const BASE_PATCH = {
  protocol: 'graphql',
  method: 'POST',
  url: 'https://api.example.com/graphql',
  bodyRaw: 'query GetUsers($limit: Int!) {\n  users(limit: $limit) {\n    id\n    name\n    email\n  }\n}',
  authData: { gql_variables: JSON.stringify({ limit: 10 }, null, 2) },
};

const RESPONSE_BODY = JSON.stringify({
  data: {
    users: [
      { id: 'usr_001', name: 'Ada Lovelace', email: 'ada@example.com' },
      { id: 'usr_002', name: 'Alan Turing', email: 'alan@example.com' },
      { id: 'usr_003', name: 'Grace Hopper', email: 'grace@example.com' },
    ],
  },
}, null, 2);

const RESPONSE_PATCH = {
  ...BASE_PATCH,
  response: {
    status: 200, statusText: 'OK',
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-abc-123' },
    body: RESPONSE_BODY,
    size: RESPONSE_BODY.length,
    time: 84,
    contentType: 'application/json',
    cookies: [],
  },
};

const SCREENS: ScreenSpec[] = [
  { id: 'graphql-query', label: 'GraphQL — Query',
    explanation: 'GraphQL query editor with schema-aware autocomplete, syntax highlighting, and an AI-assisted Query Builder.',
    directives: [ { action: 'addTab', patch: BASE_PATCH }, { action: 'click', selector: 'button[data-tab="query"]' }, { action: 'wait', ms: 1800 } ] },
  { id: 'graphql-variables', label: 'GraphQL — Variables',
    explanation: 'Query variables editor — JSON values passed alongside the query, with variable name validation against the query.',
    directives: [ { action: 'addTab', patch: BASE_PATCH }, { action: 'click', selector: 'button[data-tab="variables"]' }, { action: 'wait', ms: 1800 } ] },
  { id: 'graphql-headers', label: 'GraphQL — Headers',
    explanation: 'Request headers for the GraphQL endpoint, same editor used across every protocol.',
    directives: [ { action: 'addTab', patch: { ...BASE_PATCH, headers: [{ id: 'h1', key: 'Authorization', value: 'Bearer {{token}}', enabled: true }] } }, { action: 'click', selector: 'button[data-tab="headers"]' }, { action: 'wait', ms: 600 } ] },
  { id: 'graphql-authorization', label: 'GraphQL — Authorization',
    explanation: 'Auth editor for the GraphQL endpoint — Bearer, Basic, API Key, OAuth 2.0.',
    directives: [ { action: 'addTab', patch: { ...BASE_PATCH, authType: 'bearer', authData: { ...BASE_PATCH.authData, token: 'eyJhbGciOiJIUzI1NiJ9.mock_token' } } }, { action: 'click', selector: 'button[data-tab="authorization"]' }, { action: 'wait', ms: 600 } ] },
  { id: 'graphql-scripts', label: 'GraphQL — Scripts',
    explanation: 'Pre-request / Post-response script editors — the same dk.* runtime as REST, so tokens, chained sub-requests, and dk.test() assertions work identically here.',
    directives: [ { action: 'addTab', patch: { ...BASE_PATCH, preRequestScript: '// Refresh token before sending', postResponseScript: 'dk.test("No GraphQL errors", () => {\n  dk.expect(dk.response.json().errors).toBeUndefined();\n});' } }, { action: 'click', selector: 'button[data-tab="scripts"]' }, { action: 'wait', ms: 1800 } ] },
  { id: 'graphql-subscription', label: 'GraphQL — Subscription',
    explanation: 'Live subscription panel using the graphql-ws protocol over WebSocket — Subscribe/Stop, a Live indicator, an events log with per-event timestamps and copy, and auto-scroll toggle.',
    directives: [ { action: 'addTab', patch: BASE_PATCH }, { action: 'click', selector: 'button[data-tab="subscription"]' }, { action: 'wait', ms: 600 } ] },
  { id: 'graphql-response', label: 'GraphQL — Response',
    explanation: 'Status bar (HTTP status + size + time), a GraphQL Errors flag when the errors array is non-empty even on a 200, and the same AI Explain/Follow-ups/Record Baseline toolbar as REST.',
    directives: [ { action: 'addTab', patch: RESPONSE_PATCH }, { action: 'wait', ms: 1800 } ] },
];

suite('Daakia Wiki Capture — GraphQL', () => {
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
