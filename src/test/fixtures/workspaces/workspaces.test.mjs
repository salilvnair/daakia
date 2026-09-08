/**
 * Workspaces, against a real database.
 *
 * The whole feature is a scoping claim — "the collections you see belong to the
 * workspace you are in" — and a claim like that is worth nothing asserted
 * against mocks. This bundles the real db.ts and workspaces.ts over a real
 * sql.js database in a temp directory, with only `vscode` stubbed, and checks
 * what actually comes back out of SQL.
 *
 * The two failures it exists to catch:
 *   1. The migration not running, so an upgrade loses every collection.
 *   2. A listing query missing its scope, so one project shows another's work.
 *
 * Run: node src/test/fixtures/workspaces/workspaces.test.mjs
 */
import { strict as assert } from 'assert';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const dir = mkdtempSync(join(tmpdir(), 'daakia-ws-'));
const entry = join(dir, 'entry.ts');
const bundle = join(dir, 'bundle.cjs');
const vscodeStub = join(dir, 'vscode-stub.ts');

/* db.ts asks vscode for the storage directory and nothing else. */
writeFileSync(vscodeStub, `
export const workspace = {
  getConfiguration: () => ({ get: () => undefined }),
  workspaceFolders: undefined,
};
export const window = { showErrorMessage: () => undefined, showWarningMessage: () => undefined };
export const Uri = { file: (p: string) => ({ fsPath: p }) };
export const env = { appRoot: ${JSON.stringify(dir)} };
export const ExtensionMode = { Test: 3 };
`);

writeFileSync(entry, [
  `export * as db from ${JSON.stringify(resolve('src/storage/db.ts'))};`,
  `export * as ws from ${JSON.stringify(resolve('src/storage/workspaces.ts'))};
  export * as xfer from ${JSON.stringify(resolve('src/services/workspace-transfer.ts'))};`,
].join('\n'));

const esbuild = await import(pathToFileURL(resolve('node_modules/esbuild/lib/main.js')).href);
await esbuild.build({
  entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs',
  outfile: bundle, logLevel: 'error',
  /* Bundled, not external: the temp directory the bundle runs from has no
     node_modules, so an external require('sql.js') finds nothing and the
     database silently never opens. */
  absWorkingDir: resolve('.'),
  plugins: [{
    name: 'stub-vscode',
    setup(build) { build.onResolve({ filter: /^vscode$/ }, () => ({ path: vscodeStub })); },
  }],
});

const { db, ws, xfer } = createRequire(import.meta.url)(bundle);

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.error(`  FAIL  ${name}\n        ${err.message}`); }
};

/* initDb takes the *extension* path (it loads sql-wasm.wasm from dist/) and
   reads the database location from DAAKIA_TEST_DB_PATH, which is how the e2e
   harness keeps its database off the developer's real one. */
process.env.DAAKIA_TEST_DB_PATH = join(dir, 'daakia.sqlite');
await db.initDb(resolve('.'));

console.log('\nthe migration');

check('creates one workspace and nothing more', () => {
  const all = ws.listWorkspaces();
  assert.equal(all.length, 1, `expected one workspace, got ${all.length}`);
  assert.equal(all[0].id, db.DEFAULT_WORKSPACE_ID);
  assert.equal(all[0].name, 'My Workspace');
});

check('makes that workspace active without being asked', () => {
  assert.equal(ws.getActiveWorkspaceId(), db.DEFAULT_WORKSPACE_ID);
});

check('stamps rows that predate it', () => {
  // A row written the way a pre-workspace build wrote one: no workspace_id.
  const handle = db.getDb();
  handle.run(
    `INSERT INTO collections (id, name, parent_id, protocol) VALUES ('legacy', 'Old Collection', NULL, 'rest')`);
  handle.run(`UPDATE collections SET workspace_id = NULL WHERE id = 'legacy'`);

  db._migrateWorkspacesForTest(handle);

  const names = db.getAllCollections().map(c => c.name);
  assert.ok(names.includes('Old Collection'),
    `an upgrade lost a collection — saw ${JSON.stringify(names)}`);
});

console.log('\nscoping');

check('a second workspace starts empty', () => {
  const second = ws.createWorkspace('Second');
  assert.ok(second, 'createWorkspace returned nothing');

  db.upsertCollection('c-first', 'In the first', null, 'rest');
  assert.ok(db.getAllCollections().some(c => c.id === 'c-first'));

  ws.setActiveWorkspaceId(second.id);
  const seen = db.getAllCollections().map(c => c.id);
  assert.ok(!seen.includes('c-first'),
    `the second workspace can see the first one's collections: ${JSON.stringify(seen)}`);
});

check('what you create lands in the workspace you are in', () => {
  db.upsertCollection('c-second', 'In the second', null, 'rest');
  assert.ok(db.getAllCollections().some(c => c.id === 'c-second'));

  ws.setActiveWorkspaceId(db.DEFAULT_WORKSPACE_ID);
  const seen = db.getAllCollections().map(c => c.id);
  assert.ok(seen.includes('c-first'), 'the first workspace lost its own collection');
  assert.ok(!seen.includes('c-second'), 'a collection leaked back into the first workspace');
});

check('environments are scoped too', () => {
  db.upsertEnvironment({ id: 'e-first', name: 'Local', variables: '[]', is_active: 0 });
  assert.equal(db.getAllEnvironments().length, 1);

  const second = ws.listWorkspaces().find(w => w.id !== db.DEFAULT_WORKSPACE_ID);
  ws.setActiveWorkspaceId(second.id);
  assert.equal(db.getAllEnvironments().length, 0, 'an environment leaked across workspaces');
  ws.setActiveWorkspaceId(db.DEFAULT_WORKSPACE_ID);
});

check('history is scoped too', () => {
  db.insertHistory({ method: 'GET', url: 'https://first.test', protocol: 'rest' });
  assert.equal(db.getHistory(50).length, 1);

  const second = ws.listWorkspaces().find(w => w.id !== db.DEFAULT_WORKSPACE_ID);
  ws.setActiveWorkspaceId(second.id);
  assert.equal(db.getHistory(50).length, 0, 'history leaked across workspaces');

  // And clearing one does not touch the other.
  db.insertHistory({ method: 'GET', url: 'https://second.test', protocol: 'rest' });
  db.clearHistory();
  assert.equal(db.getHistory(50).length, 0);
  ws.setActiveWorkspaceId(db.DEFAULT_WORKSPACE_ID);
  assert.equal(db.getHistory(50).length, 1, 'clearing one workspace cleared another');
});

console.log('\nthe rules');

check('the counts describe the active workspace', () => {
  // Two: the one created above, plus the legacy row the migration adopted.
  const stats = ws.getWorkspaceStats();
  assert.equal(stats.collections, 2, `collections: ${stats.collections}`);
  assert.equal(stats.environments, 1, `environments: ${stats.environments}`);
});

check('the last workspace cannot be deleted', () => {
  const second = ws.listWorkspaces().find(w => w.id !== db.DEFAULT_WORKSPACE_ID);
  assert.equal(ws.deleteWorkspace(second.id).ok, true);
  const only = ws.listWorkspaces();
  assert.equal(only.length, 1);
  const refused = ws.deleteWorkspace(only[0].id);
  assert.equal(refused.ok, false, 'the only workspace was deleted, leaving nowhere to work');
});

check('deleting a workspace takes its collections with it', () => {
  const doomed = ws.createWorkspace('Doomed');
  ws.setActiveWorkspaceId(doomed.id);
  db.upsertCollection('c-doomed', 'Goes away', null, 'rest');
  assert.equal(db.getAllCollections().length, 1);

  ws.deleteWorkspace(doomed.id);
  assert.equal(ws.getActiveWorkspaceId(), db.DEFAULT_WORKSPACE_ID,
    'deleting the active workspace left the pointer dangling');

  const handle = db.getDb();
  const left = handle.exec(`SELECT COUNT(*) FROM collections WHERE id = 'c-doomed'`);
  assert.equal(Number(left[0].values[0][0]), 0, 'a deleted workspace left its collections behind');
});

check('switching to a workspace that is gone falls back rather than emptying the app', () => {
  db.setSetting('activeWorkspaceId', 'ws-does-not-exist');
  ws._resetActiveWorkspaceCache();
  assert.equal(ws.getActiveWorkspaceId(), db.DEFAULT_WORKSPACE_ID);
  assert.ok(db.getAllCollections().length > 0,
    'a stale active id emptied the sidebar instead of falling back');
});

console.log('\non and off disk');

check('a workspace round-trips through a file', () => {
  const source = ws.createWorkspace('Exportable');
  ws.setActiveWorkspaceId(source.id);
  db.upsertCollection('c-x', 'Billing', null, 'rest');
  db.upsertCollectionRequest({
    id: 'r-x', collection_id: 'c-x', name: 'Charge',
    method: 'POST', url: 'https://pay.example.com/charge', data: '{}', sort_order: 0,
  });
  db.upsertEnvironment({
    id: 'e-x', name: 'Staging', is_active: 0,
    variables: JSON.stringify([
      { key: 'baseUrl', initialValue: 'https://pay.example.com', currentValue: 'https://pay.example.com' },
      { key: 'apiToken', initialValue: 'sk-live-REAL', currentValue: 'sk-live-REAL', isSecret: true },
    ]),
  });
  ws.setWorkspaceDocs(source.id, '# Billing\n\nHow it works.');

  const file = join(dir, 'exported.json');
  xfer.writeWorkspaceFile(file);

  // Back in as a workspace of its own.
  ws.setActiveWorkspaceId(db.DEFAULT_WORKSPACE_ID);
  const out = xfer.importWorkspaceFile(file);
  assert.equal(out.ok, true, out.error);
  assert.equal(out.requests, 1, `imported ${out.requests} requests`);
  assert.equal(out.environments, 1);

  // The import switches into what it created, so this reads the new one.
  const names = db.getAllCollections().map(c => c.name);
  assert.deepEqual(names, ['Billing'], `imported collections: ${JSON.stringify(names)}`);
  assert.equal(ws.getWorkspace(ws.getActiveWorkspaceId()).docs, '# Billing\n\nHow it works.');
});

check('a secret does not survive the export', () => {
  const written = JSON.parse(readFileSync(join(dir, 'exported.json'), 'utf8'));
  const vars = written.environments[0].variables;
  const token = vars.find(v => v.key === 'apiToken');
  const base = vars.find(v => v.key === 'baseUrl');

  assert.ok(token, 'the secret variable was dropped entirely — the name should survive');
  assert.equal(token.currentValue, 'REDACTED', 'a secret value was written to disk');
  assert.equal(token.initialValue, 'REDACTED', 'a secret value was written to disk');
  assert.equal(base.currentValue, 'https://pay.example.com', 'a non-secret was redacted');

  assert.ok(!readFileSync(join(dir, 'exported.json'), 'utf8').includes('sk-live-REAL'),
    'the real token is somewhere in the exported file');
});

check('a file that is not a workspace leaves nothing behind', () => {
  const before = ws.listWorkspaces().length;
  const junk = join(dir, 'junk.json');
  writeFileSync(junk, JSON.stringify({ hello: 'world' }));

  const out = xfer.importWorkspaceFile(junk);
  assert.equal(out.ok, false);
  assert.equal(ws.listWorkspaces().length, before,
    'a failed import left a half-made workspace in the switcher');
});

check('Open wants a folder with a workspace file in it', () => {
  const empty = join(dir, 'not-a-workspace');
  mkdirSync(empty, { recursive: true });
  const out = xfer.openWorkspaceFolder(empty);
  assert.equal(out.ok, false);
  assert.match(out.error, /daakia-workspace\.json/);
});

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? '\nall good\n' : `\n${failures} failing\n`);
process.exit(failures === 0 ? 0 : 1);
