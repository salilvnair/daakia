import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: { getConfiguration: () => ({ get: (_k: string, d?: unknown) => d }) },
  window: {},
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));
vi.mock('../mock/mock-server-manager', () => ({ loadSavedConfigs: () => [], saveConfigs: () => undefined }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initDb, closeDb, insertHistory, getHistory, upsertCollection, getCollectionTree, getTrashEntries } from '../storage/db';
import { createWorkspace, setActiveWorkspaceId, withWorkspace, _resetActiveWorkspaceCache } from '../storage/workspaces';
import { archiveHistoryEntry, archiveCollection, restoreEntry } from './bin';

/*
  A restore goes back where the thing was deleted from. Every restorer writes
  through the scoped storage calls, so without the recorded workspace a
  request deleted in one workspace came back in whichever was open.
*/

const saved = process.env.DAAKIA_TEST_DB_PATH;
let dir: string;

beforeAll(async () => {
  closeDb();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daakia-bin-ws-'));
  process.env.DAAKIA_TEST_DB_PATH = path.join(dir, 'daakia.db');
  await initDb(path.resolve(__dirname, '../..'));
  _resetActiveWorkspaceCache();
});

afterAll(() => {
  closeDb();
  if (saved === undefined) delete process.env.DAAKIA_TEST_DB_PATH;
  else process.env.DAAKIA_TEST_DB_PATH = saved;
});

describe('restoring from the Bin', () => {
  it('puts history back in the workspace it was deleted from', () => {
    const payments = createWorkspace('Payments')!;
    const orders = createWorkspace('Orders')!;

    setActiveWorkspaceId(payments.id);
    insertHistory({ method: 'POST', url: 'https://pay.test/charge', status: 201, protocol: 'rest' });
    const row = getHistory(10, 0)[0];
    expect(archiveHistoryEntry(row.id!)).toBe(true);
    expect(getHistory(10, 0)).toEqual([]);

    // Restored while another workspace is open.
    setActiveWorkspaceId(orders.id);
    const entry = getTrashEntries('history')[0];
    expect(entry.workspace_id).toBe(payments.id);
    expect(restoreEntry(entry.id)).toBe(true);

    expect(getHistory(10, 0)).toEqual([]);
    withWorkspace(payments.id, () => {
      expect(getHistory(10, 0).map(h => h.url)).toEqual(['https://pay.test/charge']);
    });
  });

  it('puts a collection back in the workspace it was deleted from', () => {
    const a = createWorkspace('A')!;
    const b = createWorkspace('B')!;

    setActiveWorkspaceId(a.id);
    upsertCollection('col-a', 'Only in A', null, 'rest');
    expect(archiveCollection('col-a')).toBe(true);

    setActiveWorkspaceId(b.id);
    const entry = getTrashEntries('collection').find(e => e.original_id === 'col-a')!;
    expect(restoreEntry(entry.id)).toBe(true);

    expect(getCollectionTree('rest').map(c => c.name)).toEqual([]);
    withWorkspace(a.id, () => {
      expect(getCollectionTree('rest').map(c => c.name)).toEqual(['Only in A']);
    });
  });
});
