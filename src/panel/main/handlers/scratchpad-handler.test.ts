/**
 * The host's half of scratchpads: the default folder, and never losing text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  folders: [] as { id: string; name: string; parent_id: string | null; sort_order: number }[],
  pads: [] as { id: string; folder_id: string; name: string; type: string; content: string; created_at: string; updated_at: string }[],
  settings: {} as Record<string, unknown>,
}));

vi.mock('../../../storage/db', () => ({
  getScratchpadFolders: () => db.folders,
  getScratchpads: () => db.pads,
  upsertScratchpadFolder: (f: { id: string; name: string; parentId: string | null; sortOrder: number }) => {
    db.folders = db.folders.filter(x => x.id !== f.id).concat({ id: f.id, name: f.name, parent_id: f.parentId, sort_order: f.sortOrder });
  },
  deleteScratchpadFolders: (ids: string[]) => { db.folders = db.folders.filter(f => !ids.includes(f.id)); },
  upsertScratchpad: (p: { id: string; folderId: string; name: string; type: string; content: string; updatedAt: string }) => {
    db.pads = db.pads.filter(x => x.id !== p.id).concat({ id: p.id, folder_id: p.folderId, name: p.name, type: p.type, content: p.content, created_at: '', updated_at: p.updatedAt });
  },
  deleteScratchpad: (id: string) => { db.pads = db.pads.filter(p => p.id !== id); },
  getSetting: (k: string) => db.settings[k],
  setSetting: (k: string, v: unknown) => { db.settings[k] = v; },
}));

import {
  handleScratchpadsGet, handleScratchpadSave, handleScratchpadFoldersDelete, handleScratchpadSetDefault,
} from './scratchpad-handler';

function get() {
  const out: Record<string, any>[] = [];
  handleScratchpadsGet(m => out.push(m as Record<string, any>));
  return out[0];
}

beforeEach(() => {
  db.folders = [];
  db.pads = [];
  db.settings = {};
});

describe('scratchpads on the host', () => {
  it('makes the default folder the first time it is asked', () => {
    const data = get();
    expect(data.type).toBe('scratchpads:data');
    expect(data.folders).toEqual([{ id: 'scratchpads-default', name: 'Scratchpads', parentId: null, sortOrder: 0 }]);
    expect(data.defaultFolderId).toBe('scratchpads-default');
    expect(get().folders).toHaveLength(1);
  });

  it('saves what it is sent and reads it back', () => {
    get();
    handleScratchpadSave({ file: { id: 'p', folderId: 'scratchpads-default', name: 'orders', type: 'sql', content: 'SELECT 1', updatedAt: '2026-11-13T00:00:00Z' } });
    expect(get().files).toEqual([expect.objectContaining({ id: 'p', name: 'orders', type: 'sql', content: 'SELECT 1', updatedAt: '2026-11-13T00:00:00Z' })]);
  });

  it('a type it does not know is kept as text rather than refused', () => {
    get();
    handleScratchpadSave({ file: { id: 'p', folderId: 'scratchpads-default', name: 'x', type: 'exe', content: 'hi' } });
    expect(get().files[0].type).toBe('txt');
  });

  it('a scratchpad whose folder is gone shows in the default folder', () => {
    get();
    handleScratchpadSave({ file: { id: 'p', folderId: 'vanished', name: 'x', type: 'json', content: '{}' } });
    expect(get().files[0].folderId).toBe('scratchpads-default');
  });

  it('will not delete the default folder', () => {
    get();
    handleScratchpadFoldersDelete({ ids: ['scratchpads-default'] });
    expect(db.folders).toHaveLength(1);
  });

  it('moves the default only to a folder that exists', () => {
    get();
    handleScratchpadSetDefault({ folderId: 'nowhere' });
    expect(get().defaultFolderId).toBe('scratchpads-default');
    db.folders.push({ id: 'f2', name: 'Orders', parent_id: null, sort_order: 1 });
    handleScratchpadSetDefault({ folderId: 'f2' });
    expect(get().defaultFolderId).toBe('f2');
  });
});
