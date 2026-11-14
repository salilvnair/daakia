/**
 * Scratchpads: the naming, the folders, and what reaches the host.
 *
 * The host never answers a save, so this store is the only record of what the
 * user did until the next launch. Each rule here is one a wrong answer would
 * lose text over: a folder deleted with its scratchpads in it, a rename that
 * kept the extension twice, a debounce that never fired.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const posted = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('../vscode', () => ({ postMsg: (m: Record<string, unknown>) => posted.push(m) }));

import {
  useScratchpadStore, nextScratchpadName, cleanScratchpadName, scratchpadFileName, folderPath, folderAndDescendants,
  type ScratchpadFolder, type Scratchpad,
} from './scratchpad-store';
import { useTabsStore } from './tabs-store';

const DEFAULT = 'scratchpads-default';
const folders: ScratchpadFolder[] = [
  { id: DEFAULT, name: 'Scratchpads', parentId: null, sortOrder: 0 },
  { id: 'orders', name: 'Orders debugging', parentId: null, sortOrder: 1 },
  { id: 'payloads', name: 'payloads', parentId: 'orders', sortOrder: 0 },
];
const pad = (over: Partial<Scratchpad>): Scratchpad => ({
  id: 'p1', folderId: DEFAULT, name: 'scratchpad1', type: 'json', content: '{}',
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', ...over,
});

function reset(files: Scratchpad[] = []) {
  useScratchpadStore.setState({
    loaded: true, requested: true, folders: [...folders], files, defaultFolderId: DEFAULT, openFolders: {}, lastDeleted: null,
  });
  useTabsStore.setState({ tabs: [], activeTabId: '', previousTabId: '' });
  posted.length = 0;
}

beforeEach(() => reset());
afterEach(() => vi.useRealTimers());

describe('names', () => {
  it('counts on from the highest scratchpadN in use', () => {
    expect(nextScratchpadName([])).toBe('scratchpad1');
    expect(nextScratchpadName([{ name: 'scratchpad1' }, { name: 'scratchpad7' }, { name: 'notes' }])).toBe('scratchpad8');
  });

  it('takes a typed extension off — the type supplies it', () => {
    expect(cleanScratchpadName('  orders.json ')).toBe('orders');
    expect(cleanScratchpadName('values.yaml')).toBe('values');
    expect(cleanScratchpadName('v1.2-notes')).toBe('v1.2-notes');
    expect(scratchpadFileName({ name: 'orders', type: 'yml' })).toBe('orders.yml');
  });

  it('writes a folder as its path', () => {
    expect(folderPath(folders, 'payloads')).toBe('Orders debugging / payloads');
    expect(folderAndDescendants(folders, 'orders')).toEqual(['orders', 'payloads']);
  });
});

describe('a new scratchpad', () => {
  it('goes to the default folder, opens in a tab, and is saved', () => {
    const p = useScratchpadStore.getState().create('sql');
    expect(p).toMatchObject({ name: 'scratchpad1', type: 'sql', folderId: DEFAULT, content: '' });
    const tab = useTabsStore.getState().tabs.find(t => t.scratchpadId === p.id);
    expect(tab).toMatchObject({ type: 'scratchpad', name: 'scratchpad1.sql' });
    expect(useTabsStore.getState().activeTabId).toBe(tab!.id);
    expect(posted).toContainEqual({ type: 'scratchpads:save', file: p });
  });

  it('goes to the folder it was made from', () => {
    expect(useScratchpadStore.getState().create('xml', 'payloads').folderId).toBe('payloads');
  });

  it('opening one twice brings back its tab rather than a second editor on the same text', () => {
    reset([pad({})]);
    useScratchpadStore.getState().open('p1');
    useScratchpadStore.getState().open('p1');
    expect(useTabsStore.getState().tabs.filter(t => t.scratchpadId === 'p1')).toHaveLength(1);
  });
});

describe('saving as you type', () => {
  it('writes once, after typing stops', () => {
    vi.useFakeTimers();
    reset([pad({})]);
    const s = useScratchpadStore.getState();
    s.setContent('p1', '{"a"');
    s.setContent('p1', '{"a":1}');
    expect(posted).toHaveLength(0);
    vi.advanceTimersByTime(400);
    expect(posted).toHaveLength(1);
    expect((posted[0].file as Scratchpad).content).toBe('{"a":1}');
  });

  it('flush writes what the debounce is still holding', () => {
    vi.useFakeTimers();
    reset([pad({})]);
    useScratchpadStore.getState().setContent('p1', 'typed just before closing');
    useScratchpadStore.getState().flush();
    expect((posted[0].file as Scratchpad).content).toBe('typed just before closing');
    vi.advanceTimersByTime(1000);
    expect(posted).toHaveLength(1);
  });

  it('an answer from the host does not undo what was typed before it arrived', () => {
    vi.useFakeTimers();
    reset([pad({})]);
    useScratchpadStore.getState().setContent('p1', 'newer');
    useScratchpadStore.getState().hydrate({ folders, files: [pad({ content: 'older' })], defaultFolderId: DEFAULT });
    expect(useScratchpadStore.getState().files[0].content).toBe('newer');
  });
});

describe('renaming, moving, retyping', () => {
  it('a rename reaches the tab', () => {
    reset([pad({})]);
    useScratchpadStore.getState().open('p1');
    useScratchpadStore.getState().rename('p1', 'order.json');
    expect(useTabsStore.getState().tabs[0].name).toBe('order.json');
    useScratchpadStore.getState().changeType('p1', 'xml');
    expect(useTabsStore.getState().tabs[0].name).toBe('order.xml');
  });

  it('moves to another folder and opens it', () => {
    reset([pad({})]);
    useScratchpadStore.getState().move('p1', 'payloads');
    expect(useScratchpadStore.getState().files[0].folderId).toBe('payloads');
    expect(useScratchpadStore.getState().openFolders.payloads).toBe(true);
  });

  it('a duplicate of scratchpadN is the next scratchpadN; of a named one, name-copy', () => {
    reset([pad({}), pad({ id: 'p2', name: 'orders' })]);
    expect(useScratchpadStore.getState().duplicate('p1')!.name).toBe('scratchpad2');
    expect(useScratchpadStore.getState().duplicate('p2')!.name).toBe('orders-copy');
  });
});

describe('deleting', () => {
  it('closes the tab and can be undone', () => {
    reset([pad({})]);
    useScratchpadStore.getState().open('p1');
    useScratchpadStore.getState().remove('p1');
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(posted).toContainEqual({ type: 'scratchpads:delete', id: 'p1' });
    useScratchpadStore.getState().undoRemove();
    expect(useScratchpadStore.getState().files.map(f => f.id)).toEqual(['p1']);
  });

  it('a folder takes its subfolders with it, and its scratchpads go to the default folder', () => {
    reset([pad({ id: 'a', folderId: 'orders' }), pad({ id: 'b', folderId: 'payloads' }), pad({ id: 'c' })]);
    expect(useScratchpadStore.getState().deleteFolder('orders')).toEqual({ moved: 2, deleted: 0 });
    expect(useScratchpadStore.getState().folders.map(f => f.id)).toEqual([DEFAULT]);
    expect(useScratchpadStore.getState().files.every(f => f.folderId === DEFAULT)).toBe(true);
    /* The moves are written before the folders go, so nothing is ever in a folder that is gone. */
    const kinds = posted.map(m => m.type);
    expect(kinds.lastIndexOf('scratchpads:save')).toBeLessThan(kinds.indexOf('scratchpads:deleteFolders'));
  });

  it('deleting the default folder deletes what is in it and keeps the folder', () => {
    reset([pad({ id: 'a' }), pad({ id: 'b', folderId: 'orders' })]);
    const sub = useScratchpadStore.getState().createFolder(DEFAULT, 'inner');
    useScratchpadStore.setState(st => ({ files: [...st.files, pad({ id: 'c', folderId: sub.id })] }));
    useScratchpadStore.getState().open('a');
    posted.length = 0;

    expect(useScratchpadStore.getState().deleteFolder(DEFAULT)).toEqual({ moved: 0, deleted: 2 });
    const st = useScratchpadStore.getState();
    expect(st.folders.map(f => f.id)).toEqual([DEFAULT, 'orders', 'payloads']);
    expect(st.defaultFolderId).toBe(DEFAULT);
    /* Only what was inside: the scratchpad in another folder is untouched. */
    expect(st.files.map(f => f.id)).toEqual(['b']);
    expect(posted).toContainEqual({ type: 'scratchpads:delete', id: 'a' });
    expect(posted).toContainEqual({ type: 'scratchpads:delete', id: 'c' });
    expect(posted).toContainEqual({ type: 'scratchpads:deleteFolders', ids: [sub.id] });
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });

  it('a save still waiting for a scratchpad in the emptied folder is dropped, not written back', () => {
    vi.useFakeTimers();
    reset([pad({ id: 'a' })]);
    useScratchpadStore.getState().setContent('a', 'typed');
    useScratchpadStore.getState().deleteFolder(DEFAULT);
    posted.length = 0;
    vi.advanceTimersByTime(1000);
    expect(posted).toHaveLength(0);
  });
});

describe('folders', () => {
  it('a new subfolder opens its parent', () => {
    const f = useScratchpadStore.getState().createFolder('orders');
    expect(f.parentId).toBe('orders');
    expect(useScratchpadStore.getState().openFolders).toMatchObject({ orders: true, [f.id]: true });
  });

  it('another folder can become the default', () => {
    useScratchpadStore.getState().setDefaultFolder('orders');
    expect(useScratchpadStore.getState().defaultFolderId).toBe('orders');
    expect(useScratchpadStore.getState().create('json').folderId).toBe('orders');
  });

  it('reveal unfolds every folder above a scratchpad', () => {
    reset([pad({ folderId: 'payloads' })]);
    useScratchpadStore.getState().reveal('p1');
    expect(useScratchpadStore.getState().openFolders).toMatchObject({ payloads: true, orders: true });
  });
});
