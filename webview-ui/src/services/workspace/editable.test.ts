import { describe, it, expect } from 'vitest';
import {
  lockEdits, permissionsFor, COLLECTION_EDIT_IDS, SHARED_READ_ONLY, EDITABLE_EVERYWHERE, READ_ONLY_REASON,
} from './editable';

/* One table decides what a workspace lets you change; every panel's menus go
   through lockEdits with it. These pin both halves. */

describe('permissionsFor', () => {
  it('lets you change everything in your own workspace', () => {
    expect(permissionsFor({ owner_id: null })).toEqual(EDITABLE_EVERYWHERE);
  });

  it("locks a teammate's collections and overview, not your history or their blank secrets", () => {
    expect(permissionsFor({ owner_id: 'someone' })).toEqual(SHARED_READ_ONLY);
    expect(SHARED_READ_ONLY).toEqual({ overview: false, collections: false, environments: true, history: true });
  });
});

describe('lockEdits', () => {
  const items = [
    { id: 'open', label: 'Open' },
    { id: 'rename', label: 'Rename' },
    { id: 'import', label: 'Import', children: [{ id: 'import-postman', label: 'Postman' }] },
    { id: 'export', label: 'Export', children: [{ id: 'export-daakia', label: 'Daakia' }] },
  ];

  it('leaves an editable menu alone', () => {
    expect(lockEdits(items, true, COLLECTION_EDIT_IDS)).toBe(items);
  });

  it('disables edits, with the reason, and keeps everything else', () => {
    const locked = lockEdits(items, false, COLLECTION_EDIT_IDS);
    expect(locked.map(i => [i.id, !!(i as { disabled?: boolean }).disabled])).toEqual([
      ['open', false], ['rename', true], ['import', true], ['export', false],
    ]);
    expect((locked[1] as { description?: string }).description).toBe(READ_ONLY_REASON);
  });

  it('reaches into submenus', () => {
    const nested = lockEdits([{ id: 'more', label: 'More', children: [{ id: 'delete', label: 'Delete' }] }], false, COLLECTION_EDIT_IDS);
    expect((nested[0].children![0] as { disabled?: boolean }).disabled).toBe(true);
  });
});
