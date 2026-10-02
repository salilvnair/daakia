/**
 * The scripts library: scoped to a workspace, and carried by Git Sync without
 * a sync rolling back an edit made since.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const kv = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  findAll: (c: string) => [...kv.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([, v]) => v),
  findById: (c: string, id: string) => kv.get(`${c}/${id}`),
  upsert: (c: string, id: string, r: unknown) => { kv.set(`${c}/${id}`, r); return r; },
  remove: (c: string, id: string) => { kv.delete(`${c}/${id}`); },
}));

const {
  saveScript, listScripts, deleteScript, scriptsForSync, importSyncedScripts, normaliseScriptName,
} = await import('./py-scripts');

beforeEach(() => kv.clear());

describe('py-scripts', () => {
  it('names always end in .py and never carry a path', () => {
    expect(normaliseScriptName('check_db')).toBe('check_db.py');
    expect(normaliseScriptName('a/b.py')).toBe('a_b.py');
    expect(normaliseScriptName('  ')).toBe('untitled.py');
  });

  it('keeps each workspace its own library', () => {
    saveScript('ws1', { name: 'a.py', source: 'print(1)' });
    saveScript('ws2', { name: 'b.py', source: 'print(2)' });
    expect(listScripts('ws1').map(s => s.name)).toEqual(['a.py']);
    expect(listScripts('ws2').map(s => s.name)).toEqual(['b.py']);
  });

  it('will not overwrite or delete another workspace\'s script by id', () => {
    const a = saveScript('ws1', { name: 'a.py', source: 'x' });
    const b = saveScript('ws2', { id: a.id, name: 'a.py', source: 'y' });
    expect(b.id).not.toBe(a.id);
    expect(deleteScript('ws2', a.id)).toBe(false);
    expect(listScripts('ws1')).toHaveLength(1);
  });

  it('round-trips through the sync file, newer wins', () => {
    const s = saveScript('ws1', { name: 'a.py', folder: 'orders', source: 'old' });
    const exported = scriptsForSync('ws1');
    expect(exported[0]).not.toHaveProperty('workspaceId');

    // A newer copy from a teammate is taken...
    const newer = [{ ...exported[0], source: 'new', updatedAt: '2999-01-01T00:00:00.000Z' }];
    expect(importSyncedScripts('ws1', newer)).toBe(1);
    expect(listScripts('ws1')[0].source).toBe('new');

    // ...an older one is not.
    const older = [{ ...exported[0], source: 'stale', updatedAt: '2000-01-01T00:00:00.000Z' }];
    expect(importSyncedScripts('ws1', older)).toBe(0);
    expect(listScripts('ws1')[0].source).toBe('new');
    expect(listScripts('ws1')[0].id).toBe(s.id);
  });

  it('syncs a delete as a tombstone, so the other copy cannot bring it back', () => {
    const s = saveScript('ws1', { name: 'a.py', source: 'x' });
    const before = scriptsForSync('ws1');
    expect(deleteScript('ws1', s.id)).toBe(true);
    expect(listScripts('ws1')).toEqual([]);
    const after = scriptsForSync('ws1');
    expect(after[0]).toMatchObject({ id: s.id, deleted: true });
    // The other machine's older, undeleted copy loses to the tombstone...
    expect(importSyncedScripts('ws1', before)).toBe(0);
    expect(listScripts('ws1')).toEqual([]);
    // ...and a tombstone from there removes it here.
    const t = saveScript('ws1', { name: 'b.py', source: 'y' });
    importSyncedScripts('ws1', [{ ...scriptsForSync('ws1').find(x => x.id === t.id)!, deleted: true, updatedAt: '2999-01-01T00:00:00.000Z' }]);
    expect(listScripts('ws1')).toEqual([]);
  });

  it('ignores junk in the file', () => {
    expect(importSyncedScripts('ws1', [null, { id: 1 }, { id: 'x' }, 'nope'])).toBe(0);
    expect(importSyncedScripts('ws1', 'not a list')).toBe(0);
  });
});
