import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/* db.ts and git-sync.ts import `vscode`; nothing exercised here needs more than
   a settings reader that returns defaults. */
vi.mock('vscode', () => ({
  workspace: { getConfiguration: () => ({ get: (_k: string, d?: unknown) => d }) },
  window: {},
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));
/* Mock servers bind ports; the sync only needs their saved configs. */
vi.mock('../mock/mock-server-manager', () => ({ loadSavedConfigs: () => [], saveConfigs: () => undefined }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  initDb, closeDb, upsertCollection, upsertCollectionRequest, insertHistory, getHistory,
  upsertEnvironment, getAllEnvironments, getCollectionTree, setSetting,
} from '../storage/db';
import {
  listWorkspaces, createWorkspace, setWorkspaceShared, setActiveWorkspaceId,
  _resetActiveWorkspaceCache, withWorkspace, deleteWorkspace,
} from '../storage/workspaces';
import { refuseIfReadOnly } from '../panel/main/handlers/workspace-handler';
import {
  ensureGitRepo, gitSyncNow, getSyncIdentity, getSyncFolder, saveGitSyncSettings,
  sharedWorkspaceLocalId, USERS_DIR,
} from './git-sync';

/*
  Two people, two databases, two home folders, one bare repo — each "person"
  is a closeDb/initDb away from the other, so this is the real sync code
  running real git, not a model of it.

  What it pins is the collaboration contract: every sync writes only its own
  folder, so two people syncing in turn never conflict; your private data stays
  out of everybody else's Daakia; a shared workspace arrives read-only, under
  its owner's name, and leaves when they stop sharing it.
*/

const ROOT = path.resolve(__dirname, '../..');
let tmp: string;
let remote: string;

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

async function become(who: 'alice' | 'bob'): Promise<void> {
  closeDb();
  const home = path.join(tmp, who);
  fs.mkdirSync(home, { recursive: true });
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.DAAKIA_TEST_DB_PATH = path.join(home, 'daakia.db');
  await initDb(ROOT);
  _resetActiveWorkspaceCache();
  setSetting('gitSyncIdentity', { id: who === 'alice' ? ALICE : BOB, name: who });
  await saveGitSyncSettings({ remoteUrl: remote, branch: 'main' });
}

function repoFile(...parts: string[]): string {
  return path.join(getSyncFolder(), USERS_DIR, ...parts);
}

const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, DB: process.env.DAAKIA_TEST_DB_PATH };

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'daakia-sync-'));
  remote = path.join(tmp, 'remote.git');
  execFileSync('git', ['init', '--bare', '-q', '-b', 'main', remote]);
});

afterAll(() => {
  closeDb();
  process.env.HOME = saved.HOME;
  process.env.USERPROFILE = saved.USERPROFILE;
  if (saved.DB === undefined) delete process.env.DAAKIA_TEST_DB_PATH;
  else process.env.DAAKIA_TEST_DB_PATH = saved.DB;
  fs.rmSync(tmp, { recursive: true, force: true });
});

let paymentsId = '';

describe('Git Sync between two people', () => {
  it('writes only your own folder, with credentials redacted', async () => {
    await become('alice');
    expect((await ensureGitRepo(remote, 'main')).ok).toBe(true);

    upsertCollection('col-private', 'Alice private', null, 'rest');
    upsertCollectionRequest({ id: 'req-private', collection_id: 'col-private', name: 'Me', method: 'GET', url: 'https://x/me' } as never);
    insertHistory({
      method: 'GET', url: 'https://api.test/me?api_key=abc123&page=2', status: 200, protocol: 'rest',
      request_data: JSON.stringify({ headers: [{ key: 'Authorization', value: 'Bearer s3cret' }, { key: 'Accept', value: 'json' }] }),
    });

    const payments = createWorkspace('Payments')!;
    paymentsId = payments.id;
    withWorkspace(payments.id, () => {
      upsertCollection('col-pay', 'Payments API', null, 'rest');
      upsertCollectionRequest({ id: 'req-charge', collection_id: 'col-pay', name: 'Charge', method: 'POST', url: '{{base}}/charge' } as never);
      upsertEnvironment({
        id: 'env-pay', name: 'Staging', is_active: 1,
        variables: JSON.stringify([
          { id: 'v1', key: 'base', initialValue: 'https://pay.test', currentValue: 'https://pay.test' },
          { id: 'v2', key: 'apiKey', initialValue: 'sk_live', currentValue: 'sk_live', isSecret: true },
        ]),
      });
    });
    expect(setWorkspaceShared(payments.id, true)).toBe(true);

    const result = await gitSyncNow();
    expect(result.ok, result.message).toBe(true);
    expect(result.pushed).toBe(true);

    const history = fs.readFileSync(repoFile(ALICE, 'private', 'workspaces', 'ws-default', 'history.daakia.json'), 'utf8');
    expect(history).not.toContain('s3cret');
    expect(history).not.toContain('abc123');
    expect(history).toContain('page=2');

    const shared = fs.readFileSync(repoFile(ALICE, 'shared', payments.id, 'workspace.daakia.json'), 'utf8');
    expect(shared).toContain('Payments API');
    expect(shared).not.toContain('sk_live');
  }, 60_000);

  it('gives a teammate the shared workspace read-only, and nothing private', async () => {
    await become('bob');
    expect((await ensureGitRepo(remote, 'main')).ok).toBe(true);
    insertHistory({ method: 'GET', url: 'https://bob.test/', status: 200, protocol: 'rest' });

    const result = await gitSyncNow();
    expect(result.ok, result.message).toBe(true);
    expect(result.shared).toBe(1);

    const copy = listWorkspaces().find(w => w.id === sharedWorkspaceLocalId(ALICE, paymentsId));
    expect(copy?.owner_id).toBe(ALICE);
    // No global git name in a fresh home, so the OS user names the owner.
    expect(copy?.owner_name).toBe(os.userInfo().username);

    // Alice's private collection and history never arrive.
    expect(getCollectionTree('rest').map(c => c.name)).not.toContain('Alice private');
    expect(getHistory(100, 0).map(h => h.url)).toEqual(['https://bob.test/']);

    withWorkspace(copy!.id, () => {
      expect(getCollectionTree('rest').map(c => c.name)).toEqual(['Payments API']);
      const vars = JSON.parse(getAllEnvironments()[0].variables) as { key: string; initialValue: string }[];
      expect(vars.find(v => v.key === 'base')?.initialValue).toBe('https://pay.test');
      expect(vars.find(v => v.key === 'apiKey')?.initialValue).toBe('');
    });

    setActiveWorkspaceId(copy!.id);
    const posted: unknown[] = [];
    expect(refuseIfReadOnly({ type: 'createCollection' }, m => posted.push(m), () => undefined)).toBe(true);
    expect(refuseIfReadOnly({ type: 'getCollections' }, m => posted.push(m), () => undefined)).toBe(false);
    setActiveWorkspaceId('ws-default');
  }, 60_000);

  it('never conflicts when both people changed things between syncs', async () => {
    await become('alice');
    insertHistory({ method: 'POST', url: 'https://api.test/second', status: 201, protocol: 'rest' });
    await become('bob');
    insertHistory({ method: 'POST', url: 'https://bob.test/second', status: 201, protocol: 'rest' });

    // Bob's clone is behind Alice's first push; both append to "their" history.
    await become('alice');
    const a = await gitSyncNow();
    expect(a.ok, a.message).toBe(true);
    await become('bob');
    const b = await gitSyncNow();
    expect(b.ok, b.message).toBe(true);

    // And the retry that used to fail forever is a clean no-op.
    const again = await gitSyncNow();
    expect(again.ok, again.message).toBe(true);
  }, 90_000);

  it('removes the copy once its owner stops sharing', async () => {
    await become('alice');
    setWorkspaceShared(paymentsId, false);
    expect((await gitSyncNow()).ok).toBe(true);

    await become('bob');
    const result = await gitSyncNow();
    expect(result.ok, result.message).toBe(true);
    expect(result.shared).toBe(0);
    expect(listWorkspaces().some(w => w.owner_id)).toBe(false);
  }, 60_000);

  it('keeps a local delete deleted', async () => {
    await become('alice');
    expect(getSyncIdentity().id).toBe(ALICE);
    const before = listWorkspaces().length;
    expect(deleteWorkspace(paymentsId).ok).toBe(true);
    expect((await gitSyncNow()).ok).toBe(true);
    expect(listWorkspaces().length).toBe(before - 1);
    expect(fs.existsSync(repoFile(ALICE, 'private', 'workspaces', paymentsId))).toBe(false);
  }, 60_000);
});
