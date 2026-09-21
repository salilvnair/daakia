/**
 * A teammate's shared workspace, end to end in real VS Code.
 *
 * A real bare repo holds a teammate's shared workspace; the extension syncs it
 * and imports it the way the switcher does. Then every way of editing it is
 * tried twice: in the webview, where each control must be disabled, and at
 * the host, where each edit message must be refused and change nothing —
 * because a button is only a convenience, and the host is what keeps the copy
 * honest. Finally "Copy to my workspaces" must give an editable workspace.
 *
 * Git Sync's folder is a temp dir here (DAAKIA_TEST_SYNC_DIR, set by
 * runTests.ts), so this never touches a real clone.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { runCapture, type MainPanelLike } from '../wiki-capture/capture-orchestrator';

const TEAMMATE = '99999999-9999-4999-8999-999999999999';
const WS = 'ws-orders';
const LOCAL_ID = `shared-${TEAMMATE}-${WS}`;

type Msg = { type: string; [k: string]: unknown };
interface PanelInternals {
  postMessage: (msg: unknown) => void;
  _handleMessage: (msg: Msg) => void;
}

/** Is the context-menu item with this label disabled in the captured HTML? */
function menuItemDisabled(html: string, label: string): boolean {
  const at = html.indexOf(`>${label}<`);
  assert.ok(at >= 0, `menu item "${label}" not in the capture`);
  const cls = html.lastIndexOf('class="dui_ctx-menu__item', at);
  assert.ok(cls >= 0, `"${label}" is not inside a context-menu item`);
  const classes = html.slice(cls, html.indexOf('"', cls + 7));
  return classes.includes('dui_ctx-menu__item--disabled');
}

/** Is the <button> whose text includes `label` disabled? */
function buttonDisabled(html: string, label: string): boolean {
  const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (text === label || text.endsWith(label)) return /\sdisabled(=|\s|$)/.test(m[1]);
  }
  throw new Error(`no button "${label}" in the capture`);
}

suite('Workspaces — a teammate\'s shared workspace is read-only', () => {
  let MainPanel: MainPanelLike;
  let panel: PanelInternals;
  let original: (msg: unknown) => void;
  const seen: Msg[] = [];
  let tmp: string;

  /** Send to the host as the webview would, and wait for its reply. */
  async function send(msg: Msg, reply?: string, timeoutMs = 20_000): Promise<Msg | undefined> {
    const from = seen.length;
    panel._handleMessage(msg);
    if (!reply) { await new Promise(r => setTimeout(r, 300)); return undefined; }
    const start = Date.now();
    for (;;) {
      const hit = seen.slice(from).find(m => m.type === reply);
      if (hit) return hit;
      if (Date.now() - start > timeoutMs) throw new Error(`no ${reply} after ${msg.type}`);
      await new Promise(r => setTimeout(r, 100));
    }
  }

  async function restCollections(): Promise<{ name: string; requests?: { name: string }[] }[]> {
    const from = seen.length;
    panel._handleMessage({ type: 'getCollections', protocol: 'rest' });
    for (let i = 0; i < 50; i++) {
      const hit = seen.slice(from).find(m => m.type === 'collectionsData' && m.protocol === 'rest');
      if (hit) return hit.collections as { name: string }[];
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('no collectionsData');
  }

  suiteSetup(async function () {
    this.timeout(90_000);
    const ext = vscode.extensions.getExtension('salilvnair.daakia');
    if (!ext) throw new Error('extension not found');
    const exports = ext.isActive ? ext.exports : await ext.activate();
    MainPanel = exports.MainPanel as MainPanelLike;
    if (!MainPanel.currentPanel) await vscode.commands.executeCommand('daakia.openPanel');
    for (let i = 0; i < 40 && !MainPanel.currentPanel; i++) await new Promise(r => setTimeout(r, 250));
    if (!MainPanel.currentPanel) throw new Error('MainPanel.currentPanel never became available');
    await new Promise(r => setTimeout(r, 2500));

    panel = MainPanel.currentPanel as unknown as PanelInternals;
    original = panel.postMessage.bind(panel);
    panel.postMessage = (msg: unknown) => { seen.push(msg as Msg); original(msg); };

    // A remote holding one teammate's shared workspace, as their sync would write it.
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'daakia-e2e-share-'));
    const remote = path.join(tmp, 'remote.git');
    const seed = path.join(tmp, 'seed');
    execFileSync('git', ['init', '--bare', '-q', '-b', 'main', remote]);
    execFileSync('git', ['clone', '-q', remote, seed]);
    const user = path.join(seed, 'users', TEAMMATE);
    fs.mkdirSync(path.join(user, 'shared', WS), { recursive: true });
    fs.writeFileSync(path.join(user, 'profile.json'),
      JSON.stringify({ version: '1.0', kind: 'profile', id: TEAMMATE, name: 'Priya' }));
    fs.writeFileSync(path.join(user, 'shared', WS, 'workspace.daakia.json'), JSON.stringify({
      version: '1.0', kind: 'shared-workspace',
      owner: { id: TEAMMATE, name: 'Priya' },
      workspace: { id: WS, name: 'Orders Team', color: null, docs: '# Orders\n\nHow the orders team tests.' },
      collections: { rest: [{
        id: 'col-orders', name: 'Orders API', parent_id: null, sort_order: 0, children: [],
        requests: [{ id: 'req-list', collection_id: 'col-orders', name: 'List orders', method: 'GET',
                     url: 'https://orders.test/v1/orders', data: '{}', sort_order: 0 }],
      }] },
      environments: [{ id: 'env-orders', name: 'Orders Staging', isActive: true,
        variables: [{ id: 'v1', key: 'base', initialValue: 'https://orders.test', currentValue: 'https://orders.test' }] }],
    }));
    const who = ['-c', 'user.name=seed', '-c', 'user.email=seed@test.local'];
    execFileSync('git', [...who, 'add', '-A'], { cwd: seed });
    execFileSync('git', [...who, 'commit', '-q', '-m', 'Priya shares Orders Team'], { cwd: seed });
    execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: seed });

    await send({ type: 'gitSync:saveSettings', settings: { remoteUrl: remote, branch: 'main' } }, 'gitSync:settingsData');
    const init = await send({ type: 'gitSync:init' }, 'gitSync:initResult');
    assert.ok((init?.result as { ok: boolean }).ok, JSON.stringify(init));
    const sync = await send({ type: 'gitSync:syncNow' }, 'gitSync:syncResult', 60_000);
    assert.ok((sync?.result as { ok: boolean }).ok, JSON.stringify(sync));

    // Import it the way the switcher's Import shared does.
    const changed = await send({ type: 'importSharedWorkspace', ownerId: TEAMMATE, workspaceId: WS }, 'workspaceChanged');
    assert.strictEqual(changed?.activeId, LOCAL_ID);
  });

  suiteTeardown(async () => {
    if (panel && original) {
      panel._handleMessage({ type: 'switchWorkspace', id: 'ws-default' });
      panel.postMessage = original;
    }
    /* Best effort: on Windows git can still hold a pack file open for a
       moment, and a leftover temp folder is not a test failure. */
    try { if (tmp) fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp */ }
  });

  test('the header says whose it is, and that it is read-only', async function () {
    this.timeout(30_000);
    const html = await runCapture(MainPanel, [{ action: 'openWorkspaceTab' }, { action: 'wait', ms: 800 }]);
    assert.ok(html.includes('Priya'), 'owner name missing');
    assert.ok(html.includes('ws-owner-pill--theirs') && html.includes('read-only'), 'read-only pill missing');
  });

  test('Overview: import, new collection and the docs are disabled, not hidden', async function () {
    this.timeout(30_000);
    const html = await runCapture(MainPanel, [
      { action: 'openWorkspaceTab' }, { action: 'click', selector: '.ws-subtabs .ws-subtab:nth-child(1)' }, { action: 'wait', ms: 800 },
    ]);
    assert.ok(buttonDisabled(html, 'Import'), 'Import should be disabled');
    assert.ok(buttonDisabled(html, 'New collection'), 'New collection should be disabled');
    assert.ok(buttonDisabled(html, 'Generate with AI'), 'Generate with AI should be disabled');
    assert.ok(!buttonDisabled(html, 'Export'), 'Export is reading, and should stay enabled');
  });

  test('Collections: New is disabled', async function () {
    this.timeout(30_000);
    const html = await runCapture(MainPanel, [
      { action: 'openWorkspaceTab' }, { action: 'click', selector: '.ws-subtabs .ws-subtab:nth-child(2)' }, { action: 'wait', ms: 1000 },
    ]);
    assert.ok(html.includes('Orders API'), 'the shared collection should be listed');
    assert.ok(buttonDisabled(html, 'New'), '+ New should be disabled');
  });

  test('Collections: the folder menu disables every edit and keeps running and exporting', async function () {
    this.timeout(30_000);
    const html = await runCapture(MainPanel, [
      { action: 'openWorkspaceTab' }, { action: 'click', selector: '.ws-subtabs .ws-subtab:nth-child(2)' }, { action: 'wait', ms: 800 },
      { action: 'contextMenuText', text: 'Orders API' }, { action: 'wait', ms: 500 },
    ]);
    for (const label of ['New Request', 'New Folder', 'Rename', 'Duplicate', 'Properties', 'Delete']) {
      assert.ok(menuItemDisabled(html, label), `${label} should be disabled`);
    }
    for (const label of ['Run Collection', 'Export']) {
      assert.ok(!menuItemDisabled(html, label), `${label} should stay enabled`);
    }
    await runCapture(MainPanel, [{ action: 'key', key: 'Escape' }, { action: 'closeModals' }]);
  });

  test('Collections: the request menu disables every edit and keeps opening', async function () {
    this.timeout(30_000);
    const html = await runCapture(MainPanel, [
      { action: 'openWorkspaceTab' }, { action: 'click', selector: '.ws-subtabs .ws-subtab:nth-child(2)' }, { action: 'wait', ms: 800 },
      { action: 'clickText', text: 'Orders API' }, { action: 'wait', ms: 500 },
      { action: 'contextMenuText', text: 'List orders' }, { action: 'wait', ms: 500 },
    ]);
    for (const label of ['Rename', 'Duplicate', 'Delete']) {
      assert.ok(menuItemDisabled(html, label), `${label} should be disabled`);
    }
    for (const label of ['Open', 'Open in New Tab']) {
      assert.ok(!menuItemDisabled(html, label), `${label} should stay enabled`);
    }
    await runCapture(MainPanel, [{ action: 'key', key: 'Escape' }, { action: 'closeModals' }]);
  });

  test('the host refuses every collection edit, and nothing changes', async function () {
    this.timeout(60_000);
    const edits: Msg[] = [
      { type: 'createCollection', id: 'hack-col', name: 'Hack', protocol: 'rest' },
      { type: 'createFolder', id: 'hack-folder', name: 'Hack folder', parentId: `sh-${TEAMMATE.slice(0, 8)}-col-orders`, protocol: 'rest' },
      { type: 'renameCollection', id: `sh-${TEAMMATE.slice(0, 8)}-col-orders`, name: 'Renamed', protocol: 'rest' },
      { type: 'renameRequest', id: `sh-${TEAMMATE.slice(0, 8)}-req-list`, name: 'Renamed request', protocol: 'rest' },
      { type: 'duplicateCollection', id: `sh-${TEAMMATE.slice(0, 8)}-col-orders`, protocol: 'rest' },
      { type: 'duplicateRequest', id: `sh-${TEAMMATE.slice(0, 8)}-req-list`, protocol: 'rest' },
      { type: 'saveRequestToCollection', collectionId: `sh-${TEAMMATE.slice(0, 8)}-col-orders`, protocol: 'rest',
        request: { id: 'hack-req', name: 'Hack request', method: 'GET', url: 'https://x' } },
      { type: 'deleteRequestFromCollection', requestId: `sh-${TEAMMATE.slice(0, 8)}-req-list`, protocol: 'rest' },
      { type: 'deleteCollection', id: `sh-${TEAMMATE.slice(0, 8)}-col-orders`, protocol: 'rest' },
      { type: 'clearCollections', protocol: 'rest' },
    ];
    for (const edit of edits) {
      const toast = await send(edit, 'toast');
      assert.ok(String(toast?.message).includes('read-only'), `${edit.type} was not refused: ${JSON.stringify(toast)}`);
    }
    const tree = await restCollections();
    assert.deepStrictEqual(tree.map(c => c.name), ['Orders API']);
    assert.deepStrictEqual(tree[0].requests?.map(r => r.name), ['List orders']);
  });

  test('the Import shared dialog shows what is shared, and imports what was ticked under its name', async function () {
    this.timeout(30_000);
    const preview = await send({ type: 'getSharedWorkspacePreview', ownerId: TEAMMATE, workspaceId: WS }, 'sharedWorkspacePreview');
    const p = preview?.preview as { name: string; ownerName: string; collections: { name: string }[]; environments: { name: string }[] };
    assert.strictEqual(p.name, 'Orders Team');
    assert.strictEqual(p.ownerName, 'Priya');
    assert.deepStrictEqual(p.collections.map(c => c.name), ['Orders API']);
    assert.deepStrictEqual(p.environments.map(env => env.name), ['Orders Staging']);

    const changed = await send({
      type: 'copyWorkspaceToMine', ownerId: TEAMMATE, workspaceId: WS,
      name: 'Orders (by Priya)', collectionIds: ['col-orders'], environmentIds: [],
    }, 'workspaceChanged');
    const ws = (changed?.workspaces as { id: string; name: string; owner_id: string | null }[]).find(w => w.id === changed?.activeId);
    assert.strictEqual(ws?.name, 'Orders (by Priya)');
    assert.strictEqual(ws?.owner_id, null);
    assert.deepStrictEqual((await restCollections()).map(c => c.name), ['Orders API']);
    await send({ type: 'switchWorkspace', id: LOCAL_ID }, 'workspaceChanged');
  });

  test('Copy to my workspaces gives an editable workspace', async function () {
    this.timeout(60_000);
    const changed = await send({ type: 'copyWorkspaceToMine', id: LOCAL_ID }, 'workspaceChanged');
    const copyId = changed?.activeId as string;
    assert.ok(copyId && copyId !== LOCAL_ID, 'should switch to the new copy');
    const copy = (changed?.workspaces as { id: string; name: string; owner_id: string | null }[]).find(w => w.id === copyId);
    assert.strictEqual(copy?.name, 'Orders Team');
    assert.strictEqual(copy?.owner_id, null);

    const html = await runCapture(MainPanel, [
      { action: 'openWorkspaceTab' }, { action: 'click', selector: '.ws-subtabs .ws-subtab:nth-child(2)' }, { action: 'wait', ms: 1000 },
      { action: 'contextMenuText', text: 'Orders API' }, { action: 'wait', ms: 500 },
    ]);
    // The pill, not the page text: the refusal toasts from the test before can still be on screen.
    assert.ok(!html.includes('ws-owner-pill--theirs'), 'the copy should not carry the read-only pill');
    assert.ok(!buttonDisabled(html, 'New'), '+ New should be enabled in the copy');
    for (const label of ['New Request', 'Rename', 'Delete']) {
      assert.ok(!menuItemDisabled(html, label), `${label} should be enabled in the copy`);
    }
    await runCapture(MainPanel, [{ action: 'key', key: 'Escape' }, { action: 'closeModals' }]);

    // And the host lets it change.
    const from = seen.length;
    await send({ type: 'createCollection', id: 'mine-col', name: 'Mine', protocol: 'rest' });
    assert.ok(!seen.slice(from).some(m => m.type === 'toast' && String(m.message).includes('read-only')), 'edit in the copy was refused');
    const tree = await restCollections();
    assert.deepStrictEqual(tree.map(c => c.name).sort(), ['Mine', 'Orders API']);
  });
});
