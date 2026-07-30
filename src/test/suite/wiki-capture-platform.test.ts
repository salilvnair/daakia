/**
 * Platform wiki captures (E-wiki-capture-platform) — see wiki-capture-rest.test.ts
 * for the pattern. Covers the cross-cutting UI the protocol-tab captures never
 * show: the Collections/History/Environments sidebar panel (captured collapsed
 * — icon rail only — in every other capture suite, since none of them ever
 * click it open), the DevTools bottom panel, and every Settings section.
 *
 * Sidebar/DevTools panels are empty by default in a fresh capture session, so
 * these screens seed realistic example data via the seedSidebarData/
 * seedEnvironments/seedDevTools directives (CaptureBridge.tsx) before opening
 * the panel — otherwise the capture would faithfully show a real, but boring
 * and unconvincing, empty state.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

interface ScreenSpec { id: string; label: string; explanation: string; directives: CaptureDirective[] }

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/platform');

const BASE_REST_TAB = {
  protocol: 'rest',
  method: 'GET',
  url: 'https://api.example.com/v1/users?limit=10&page=1',
};

const EXAMPLE_COLLECTIONS = [
  {
    id: 'col-1', name: 'User Management API', parent_id: null, sort_order: 0, children: [],
    requests: [
      { id: 'req-1', collection_id: 'col-1', name: 'List Users', method: 'GET', url: 'https://api.example.com/v1/users' },
      { id: 'req-2', collection_id: 'col-1', name: 'Create User', method: 'POST', url: 'https://api.example.com/v1/users' },
      { id: 'req-3', collection_id: 'col-1', name: 'Delete User', method: 'DELETE', url: 'https://api.example.com/v1/users/:id' },
    ],
  },
  {
    id: 'col-2', name: 'Auth', parent_id: null, sort_order: 1, children: [],
    requests: [
      { id: 'req-4', collection_id: 'col-2', name: 'Login', method: 'POST', url: 'https://api.example.com/v1/auth/login' },
      { id: 'req-5', collection_id: 'col-2', name: 'Refresh Token', method: 'POST', url: 'https://api.example.com/v1/auth/refresh' },
    ],
  },
];

const EXAMPLE_HISTORY = [
  { id: 1, method: 'GET', url: 'https://api.example.com/v1/users', status: 200, status_text: 'OK', response_time: 142, response_size: 512, created_at: new Date(Date.now() - 30_000).toISOString() },
  { id: 2, method: 'POST', url: 'https://api.example.com/v1/users', status: 201, status_text: 'Created', response_time: 89, response_size: 128, created_at: new Date(Date.now() - 90_000).toISOString() },
  { id: 3, method: 'DELETE', url: 'https://api.example.com/v1/users/3', status: 204, status_text: 'No Content', response_time: 45, response_size: 0, created_at: new Date(Date.now() - 180_000).toISOString() },
  { id: 4, method: 'POST', url: 'https://api.example.com/v1/auth/login', status: 401, status_text: 'Unauthorized', response_time: 63, response_size: 84, created_at: new Date(Date.now() - 240_000).toISOString() },
];

const EXAMPLE_ENVIRONMENTS = [
  {
    id: 'env-1', name: 'Production', isGlobal: false, variables: [
      { id: 'v1', key: 'baseUrl', initialValue: 'https://api.example.com', currentValue: 'https://api.example.com', isSecret: false },
      { id: 'v2', key: 'apiKey', initialValue: 'sk_live_51H8x...', currentValue: 'sk_live_51H8x...', isSecret: true },
    ],
  },
  {
    id: 'env-2', name: 'Staging', isGlobal: false, variables: [
      { id: 'v3', key: 'baseUrl', initialValue: 'https://staging-api.example.com', currentValue: 'https://staging-api.example.com', isSecret: false },
      { id: 'v4', key: 'apiKey', initialValue: 'sk_test_4eC39...', currentValue: 'sk_test_4eC39...', isSecret: true },
    ],
  },
];

const EXAMPLE_LOGS = [
  { timestamp: Date.now() - 5000, level: 'log', args: ['Pre-request script started'], requestName: 'List Users', scriptPhase: 'pre-request' },
  { timestamp: Date.now() - 4000, level: 'info', args: ['Setting Authorization header from {{apiKey}}'], requestName: 'List Users', scriptPhase: 'pre-request' },
  { timestamp: Date.now() - 2000, level: 'log', args: ["status is 200 ✓"], requestName: 'List Users', scriptPhase: 'test' },
  { timestamp: Date.now() - 1000, level: 'warn', args: ['Response time exceeded 500ms threshold'], requestName: 'Create User', scriptPhase: 'test' },
  { timestamp: Date.now() - 500, level: 'error', args: ['Expected status 200, got 401'], requestName: 'Login', scriptPhase: 'test' },
];

const EXAMPLE_NETWORK = [
  {
    timestamp: Date.now() - 3000, method: 'GET', url: 'https://api.example.com/v1/users',
    requestHeaders: { Accept: 'application/json' }, status: 200, statusText: 'OK',
    responseHeaders: { 'content-type': 'application/json' }, responseBody: '{"users":[{"id":1,"name":"Alice Johnson"}],"total":1}',
    duration: 142, size: 512, contentType: 'application/json', protocol: 'http',
  },
  {
    timestamp: Date.now() - 1500, method: 'POST', url: 'https://api.example.com/v1/users',
    requestHeaders: { 'Content-Type': 'application/json' }, requestBody: '{"name":"New User"}',
    status: 201, statusText: 'Created', responseHeaders: { 'content-type': 'application/json' },
    responseBody: '{"id":3,"name":"New User"}', duration: 89, size: 128, contentType: 'application/json', protocol: 'http',
  },
];

// Settings sidebar sections — id here is SettingsPanel.tsx's SideNavItem leaf
// id, clicked via the data-nav-id attribute (added to @salilvnair/dui's
// SideNavView specifically so tests can target a stable, unambiguous element)
// rather than clickText: several section labels ("LLM Provider", "AI
// Features", etc.) also appear as plain prose inside other sections' own
// content, so text matching non-deterministically clicked the wrong element
// (proved by settings-general and settings-llm-provider capturing
// byte-identical HTML — the nav click silently landed on a description that
// happened to say "LLM Provider" instead of the real nav button). Note:
// 'wiki-new' is intentionally absent here — Wiki is now a SideNavView GROUP
// (its own header isn't a selectable leaf); see 'settings-wiki' below.
// A fresh e2e session's real AI-audit DB table has zero rows (nothing in the
// suite ever makes a real AI call), so settings-ai-audit would otherwise
// capture a genuine-but-boring "0 records" empty state — seeded here via
// AiAuditPanel's test-only __aiAuditCaptureSeed hook instead, same pattern
// as seedRealtimeState for the WS/SSE/SIO/MQTT panels.
const EXAMPLE_AI_AUDIT_ENTRIES = [
  {
    audit_id: 1, conversation_id: 'conv-001', stage: 'rest.body.generate', model: 'gpt-4o',
    system_prompt: 'You are an API assistant that generates realistic JSON request bodies from a description.',
    user_prompt: 'Generate a body for creating a new user with name, email, and role.',
    request_payload: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Generate a body for creating a new user' }] }),
    response_payload: JSON.stringify({ name: 'New User', email: 'new@example.com', role: 'user' }, null, 2),
    headers: JSON.stringify({ 'content-type': 'application/json' }),
    duration_ms: 842, created_at: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    audit_id: 2, conversation_id: 'conv-002', stage: 'rest.assert.generate', model: 'gpt-4o',
    system_prompt: 'You are an API assistant that writes dk.test() assertions from a response body.',
    user_prompt: 'Write assertions verifying the users array is non-empty and total is a number.',
    request_payload: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Write assertions...' }] }),
    response_payload: "dk.test('users is non-empty', () => { dk.expect(dk.response.json().users.length).toBeGreaterThan(0); });",
    headers: JSON.stringify({ 'content-type': 'application/json' }),
    duration_ms: 611, created_at: new Date(Date.now() - 180_000).toISOString(),
  },
  {
    audit_id: 3, conversation_id: 'conv-003', stage: 'mock.rest.generate', model: 'claude-sonnet-5',
    system_prompt: 'You generate realistic mock REST routes from a short description.',
    user_prompt: 'Generate CRUD routes for a users API.',
    request_payload: JSON.stringify({ model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'Generate CRUD routes for a users API' }] }),
    response_payload: JSON.stringify({ routes: [{ method: 'GET', path: '/api/users' }] }, null, 2),
    headers: JSON.stringify({ 'content-type': 'application/json' }),
    duration_ms: 1204, error: null, created_at: new Date(Date.now() - 300_000).toISOString(),
  },
  {
    audit_id: 4, conversation_id: 'conv-004', stage: 'DAAKIA_AI', model: 'gpt-4o',
    system_prompt: 'You are Daakia AI, an assistant embedded in an API client.',
    user_prompt: 'Why did my last request return a 401?',
    request_payload: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Why did my last request return a 401?' }] }),
    response_payload: 'A 401 means the Authorization header was missing or the bearer token expired — check the Auth tab on the Login request.',
    headers: JSON.stringify({ 'content-type': 'application/json' }),
    duration_ms: 733, error: 'Rate limited, retried once', created_at: new Date(Date.now() - 420_000).toISOString(),
  },
];

const SETTINGS_SECTIONS: Array<{ sectionId: string; captureId: string; label: string }> = [
  { sectionId: 'general', captureId: 'settings-general', label: 'Settings — General' },
  { sectionId: 'theme', captureId: 'settings-theme', label: 'Settings — Theme' },
  { sectionId: 'mock-server', captureId: 'settings-mock-server', label: 'Settings — Mock Server' },
  { sectionId: 'llm', captureId: 'settings-llm-provider', label: 'Settings — LLM Provider' },
  { sectionId: 'ai-features', captureId: 'settings-ai-features', label: 'Settings — AI Features' },
  { sectionId: 'prompt-library', captureId: 'settings-prompt-library', label: 'Settings — Prompt Library' },
  { sectionId: 'ai-audit', captureId: 'settings-ai-audit', label: 'Settings — AI Audit' },
  { sectionId: 'devtools', captureId: 'settings-developer-tools', label: 'Settings — Developer Tools' },
  { sectionId: 'power-features', captureId: 'settings-power-features', label: 'Settings — Power Features' },
];

// AppSidebar's toggle(section) CLOSES the panel if `section` is already the
// active one — and 'collections' is the app's default activeSection on a
// fresh session, so a single click on the Collections icon can silently
// close it instead of opening it, depending on whatever state leaked in from
// an earlier capture in this same long-lived webview session. Clicking a
// different ("decoy") icon first deterministically forces activeSection away
// from the target, so the final click always lands on toggle()'s "open and
// select" branch regardless of starting state.
const openSidebarPanel = (title: 'Collections' | 'History' | 'Environments'): CaptureDirective[] => {
  const decoy = title === 'Collections' ? 'Environments' : title === 'History' ? 'Collections' : 'History';
  return [
    { action: 'click', selector: `button[title="${decoy}"]` },
    { action: 'wait', ms: 150 },
    { action: 'click', selector: `button[title="${title}"]` },
    { action: 'wait', ms: 400 },
  ];
};

// The DevTools screens don't want the sidebar panel visible at all, but
// whichever of Collections/History/Environments the PREVIOUS screen left open
// stays open (mounted, real DOM) into this one otherwise — it's not just
// visually distracting, it's a real content-correctness bug (a "DevTools"
// screen capturing a stray "Environments" panel bleeding in from three
// screens earlier). Same double-click-one-icon trick as openSidebarPanel,
// but landing on "closed" instead of "open": clicking a fixed icon once
// forces it active (deterministic regardless of starting state), clicking it
// again matches toggle()'s "already active → close" branch.
const closeSidebarPanel = (): CaptureDirective[] => [
  { action: 'click', selector: 'button[title="History"]' },
  { action: 'wait', ms: 150 },
  { action: 'click', selector: 'button[title="History"]' },
  { action: 'wait', ms: 150 },
];

// Collections/History are cache-gated (isCollectionsLoaded/isHistoryLoaded):
// CollectionsPanel/HistoryPanel only fire their real DB fetch if the gate is
// still false *at mount time*, so seeding must happen BEFORE
// openSidebarPanel (which mounts the panel) to suppress the fetch entirely —
// seeding after mount loses the race whenever the real fetch's async
// response happens to land after the seed (which it did, intermittently,
// producing captures with a stuck loading skeleton or leaked real DB rows).
// EnvironmentsPanel has no such gate and unconditionally re-fetches on every
// mount regardless of seed order, so it keeps seeding AFTER the panel opens
// (a plain, side-effect-free store write that deterministically overwrites
// whatever the real fetch just wrote).
const SCREENS: ScreenSpec[] = [
  {
    id: 'platform-sidebar-collections',
    label: 'Sidebar — Collections (expanded)',
    explanation: 'The Collections panel, opened from the right-side icon rail — organizes saved requests into folders, each independently runnable.',
    directives: [
      // Tabs opened by every capture suite that ran before this one in the
      // same long-lived webview session stay open otherwise — bleeding a
      // long, truncated tab-bar strip across the top of every platform
      // screen (not just visually noisy: it also shifted the actual pixel
      // position of anything measured/cropped relative to this capture).
      { action: 'closeAllTabs' },
      { action: 'addTab', patch: BASE_REST_TAB },
      // Collections/History are cache-gated: CollectionsPanel/HistoryPanel
      // only fire their real DB fetch (`getCollections`/`getHistory`
      // postMsg) if `isCollectionsLoaded`/`isHistoryLoaded` is still false
      // *at mount time*. Seeding must happen BEFORE openSidebarPanel (which
      // mounts the panel) so the gate is already satisfied and the real
      // fetch never fires — otherwise its async response can land after our
      // seed and silently overwrite it with whatever's in the real (test)
      // DB, which is exactly what was happening here (captured HTML showed
      // either a stuck loading skeleton or leaked real DB rows instead of
      // the intended example data).
      { action: 'seedSidebarData', protocol: 'rest', collections: EXAMPLE_COLLECTIONS as any, history: EXAMPLE_HISTORY as any },
      ...openSidebarPanel('Collections'),
    ],
  },
  {
    id: 'platform-sidebar-history',
    label: 'Sidebar — History (expanded)',
    explanation: 'Every request sent is logged here automatically, with method, status, and timing — click any entry to re-open it as a new tab.',
    directives: [
      // Tabs opened by every capture suite that ran before this one in the
      // same long-lived webview session stay open otherwise — bleeding a
      // long, truncated tab-bar strip across the top of every platform
      // screen (not just visually noisy: it also shifted the actual pixel
      // position of anything measured/cropped relative to this capture).
      { action: 'closeAllTabs' },
      { action: 'addTab', patch: BASE_REST_TAB },
      { action: 'seedSidebarData', protocol: 'rest', collections: EXAMPLE_COLLECTIONS as any, history: EXAMPLE_HISTORY as any },
      ...openSidebarPanel('History'),
    ],
  },
  {
    id: 'platform-sidebar-environments',
    label: 'Sidebar — Environments (expanded)',
    explanation: 'Environments hold {{variable}} sets (base URLs, API keys) swappable per request — secret variables are masked in the UI.',
    directives: [
      // Tabs opened by every capture suite that ran before this one in the
      // same long-lived webview session stay open otherwise — bleeding a
      // long, truncated tab-bar strip across the top of every platform
      // screen (not just visually noisy: it also shifted the actual pixel
      // position of anything measured/cropped relative to this capture).
      { action: 'closeAllTabs' },
      { action: 'addTab', patch: BASE_REST_TAB },
      ...openSidebarPanel('Environments'),
      { action: 'seedEnvironments', environments: EXAMPLE_ENVIRONMENTS as any, activeEnvId: 'env-1' },
      { action: 'wait', ms: 200 },
    ],
  },
  {
    id: 'platform-devtools-console',
    label: 'DevTools — Console',
    explanation: 'The DevTools bottom panel’s Console tab — pre/post-request script logs and test assertion results, tagged by which request produced them.',
    directives: [
      // Tabs opened by every capture suite that ran before this one in the
      // same long-lived webview session stay open otherwise — bleeding a
      // long, truncated tab-bar strip across the top of every platform
      // screen (not just visually noisy: it also shifted the actual pixel
      // position of anything measured/cropped relative to this capture).
      { action: 'closeAllTabs' },
      { action: 'addTab', patch: BASE_REST_TAB },
      ...closeSidebarPanel(),
      { action: 'seedDevTools', devToolsTab: 'console' as any, logs: EXAMPLE_LOGS as any },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    id: 'platform-devtools-network',
    label: 'DevTools — Network',
    explanation: 'The DevTools Network tab — every request/response Daakia has made, with headers, bodies, timing, and size, independent of the main Response panel.',
    directives: [
      // Tabs opened by every capture suite that ran before this one in the
      // same long-lived webview session stay open otherwise — bleeding a
      // long, truncated tab-bar strip across the top of every platform
      // screen (not just visually noisy: it also shifted the actual pixel
      // position of anything measured/cropped relative to this capture).
      { action: 'closeAllTabs' },
      { action: 'addTab', patch: BASE_REST_TAB },
      ...closeSidebarPanel(),
      { action: 'seedDevTools', devToolsTab: 'network' as any, networkEntries: EXAMPLE_NETWORK as any },
      { action: 'wait', ms: 400 },
    ],
  },
  ...SETTINGS_SECTIONS.map((s): ScreenSpec => ({
    id: s.captureId,
    label: s.label,
    explanation: `The ${s.label.replace('Settings — ', '')} section of Settings.`,
    directives: [
      // The DevTools panel (opened + seeded by the two devtools-* screens
      // just before this in SCREENS order) stays open across the whole
      // session otherwise — bleeding a stray Network/Console strip into
      // every one of these 10 Settings captures.
      { action: 'closeDevTools' },
      // The 5 REST tabs opened by the sidebar/devtools screens just before
      // this in SCREENS order stay open across the whole session otherwise —
      // bleeding a stray, truncated tab-bar strip into every one of these
      // Settings captures (openSettingsTab only ADDS a Settings tab, it
      // doesn't replace whatever's already open).
      { action: 'closeAllTabs' },
      { action: 'openSettingsTab' },
      { action: 'wait', ms: 600 },
      { action: 'click', selector: `[data-nav-id="${s.sectionId}"]` },
      { action: 'wait', ms: 400 },
      // power-features previously captured a leaked-open AI modal (e.g. Bulk
      // URL Tester) from earlier activity in this long-lived webview session
      // — CaptureBridge's body-child portal scan picks up whatever's still
      // mounted. Close it so this screen shows the real Power Features grid.
      ...(s.sectionId === 'power-features' ? [{ action: 'closeModals' as const }, { action: 'wait' as const, ms: 300 }] : []),
      // ai-audit's real DB table is empty in a fresh e2e session (nothing
      // triggers a real AI call) — seed example rows into AiAuditPanel's own
      // local state via its test-only hook instead of capturing a genuine
      // but boring "0 records" state.
      ...(s.sectionId === 'ai-audit' ? [{ action: 'seedAiAudit' as const, aiAuditEntries: EXAMPLE_AI_AUDIT_ENTRIES as any }, { action: 'wait' as const, ms: 300 }] : []),
    ],
  })),
  {
    // Settings' own nav merges the wiki's tabs in as its "Wiki" group
    // (children ids prefixed `wiki:`) instead of DaakiaViewPage rendering a
    // second, independent SideNavView — this screen captures landing on the
    // wiki's default "Quick Start" tab via that merged nav.
    id: 'settings-wiki',
    label: 'Settings — Wiki',
    explanation: 'The Wiki, reached via the "Wiki" group in Settings\' own left nav — lands on Quick Start.',
    directives: [
      { action: 'closeDevTools' },
      // The 5 REST tabs opened by the sidebar/devtools screens just before
      // this in SCREENS order stay open across the whole session otherwise —
      // bleeding a stray, truncated tab-bar strip into every one of these
      // Settings captures (openSettingsTab only ADDS a Settings tab, it
      // doesn't replace whatever's already open).
      { action: 'closeAllTabs' },
      { action: 'openSettingsTab' },
      { action: 'wait', ms: 600 },
      { action: 'click', selector: '[data-nav-id="wiki:quick-start"]' },
      { action: 'wait', ms: 400 },
    ],
  },
  {
    // Visual regression coverage for the wiki-within-wiki itself: navigates
    // into Settings → Wiki, then clicks the (now merged-in) "Collections &
    // Env" nav item — the page with the most SectionTitle usages, so this is
    // the most sensitive screen for catching regressions in the gradient
    // section-card CSS (see WikiShared.css's `:has(> .dw-section-title)`).
    id: 'settings-wiki-collections-env',
    label: 'Settings — Wiki — Collections & Env (nested)',
    explanation: 'The wiki\'s own Collections & Env page, reached via Settings\' own "Wiki" nav group.',
    directives: [
      { action: 'closeDevTools' },
      // The 5 REST tabs opened by the sidebar/devtools screens just before
      // this in SCREENS order stay open across the whole session otherwise —
      // bleeding a stray, truncated tab-bar strip into every one of these
      // Settings captures (openSettingsTab only ADDS a Settings tab, it
      // doesn't replace whatever's already open).
      { action: 'closeAllTabs' },
      { action: 'openSettingsTab' },
      { action: 'wait', ms: 600 },
      { action: 'click', selector: '[data-nav-id="wiki:collections-env"]' },
      { action: 'wait', ms: 400 },
    ],
  },
];

suite('Daakia Wiki Capture — Platform (Sidebar, DevTools, Settings)', () => {
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

  // Command palette (Cmd+K / Ctrl+K) — dedicated test (not a plain SCREENS
  // entry) because it needs a follow-up runCapture to close itself again
  // afterward, via the same Ctrl+K toggle that opened it (App.tsx's
  // setPaletteOpen(prev => !prev)); leaving it open would bleed a
  // dk_cmdk__overlay portal into every capture suite that runs after this
  // one in the same long-lived webview session.
  test('capture platform-command-palette', async function () {
    this.timeout(20_000);
    await runCapture(MainPanel, [
      { action: 'closeAllTabs' },
      { action: 'addTab', patch: BASE_REST_TAB },
      ...closeSidebarPanel(),
      { action: 'closeDevTools' },
    ]);
    const html = await runCapture(MainPanel, [
      { action: 'key', key: 'k', ctrlKey: true },
      { action: 'wait', ms: 400 },
    ]);
    if (html.length < 200) throw new Error(`platform-command-palette: captured HTML looks too small (${html.length} chars)`);
    const file = 'platform-command-palette.html';
    fs.writeFileSync(path.join(OUT_DIR, file), html, 'utf-8');
    manifest.push({
      id: 'platform-command-palette',
      label: 'Command Palette (Cmd+K / Ctrl+K)',
      explanation: 'Search protocols, requests, collections, and settings from anywhere without touching the mouse — opened with Cmd+K (Mac) or Ctrl+K (Windows/Linux).',
      file,
    });
    // Close it again (same Ctrl+K toggle) so it doesn't stay open into the
    // next capture suite.
    await runCapture(MainPanel, [
      { action: 'key', key: 'k', ctrlKey: true },
      { action: 'wait', ms: 200 },
    ]);
  });

  // This suite is the only one that ever opens the Collections/History/
  // Environments sidebar panel or the DevTools panel — every other
  // wiki-capture-*.test.ts suite shares this same long-lived webview session
  // and never touches either, so state left open here would leak into every
  // capture that runs after this file alphabetically. By this point the
  // sidebar is already closed (each devtools-* screen's closeSidebarPanel()
  // leaves activeSection === null, and nothing after that reopens it) and
  // DevTools is already closed (every Settings screen's closeDevTools
  // directive runs before it) — this is just a defensive no-op safety net,
  // not load-bearing.
  test('confirm sidebar panel + DevTools are closed for later capture suites', async function () {
    this.timeout(20_000);
    await runCapture(MainPanel, [
      { action: 'closeDevTools' },
      { action: 'wait', ms: 200 },
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
