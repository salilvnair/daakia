/**
 * The Scratchpads panel's rows, and the small helpers beside them.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildScratchpadTree } from './scratchpad-tree';
import { relativeTime, formatScratchpad, canFormat } from './scratchpad-format';
import type { Scratchpad, ScratchpadFolder } from '../../store/scratchpad-store';

const folders: ScratchpadFolder[] = [
  { id: 'orders', name: 'Orders debugging', parentId: null, sortOrder: 1 },
  { id: 'payloads', name: 'payloads', parentId: 'orders', sortOrder: 0 },
  { id: 'def', name: 'Scratchpads', parentId: null, sortOrder: 5 },
];
/* Midday on a fixed day: "a minute ago" is Today however late the suite runs —
   at 00:00:30 it was yesterday, and every date heading below moved. */
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date(2026, 10, 13, 12, 0, 0));

/* Edited a minute ago: each lands under Today → Just now. */
const RECENT = new Date(Date.now() - 60_000).toISOString();
const pad = (id: string, folderId: string, name: string, content = '', updatedAt = RECENT): Scratchpad => ({
  id, folderId, name, type: 'json', content, createdAt: updatedAt, updatedAt,
});
const files = [pad('a', 'def', 'scratchpad1', '{"orderId":"ord_8f21"}'), pad('b', 'payloads', 'refund'), pad('c', 'orders', 'staging')];

const labels = (rows: ReturnType<typeof buildScratchpadTree>) =>
  rows.map(r => `${'  '.repeat(r.depth)}${r.kind === 'folder' ? r.folder.name : r.kind === 'date' ? `[${r.label}]` : r.file.name}`);

describe('the tree', () => {
  it('puts the default folder first, and shows only what is unfolded', () => {
    const rows = buildScratchpadTree(folders, files, { query: '', openFolders: { def: true, orders: true }, defaultFolderId: 'def' });
    expect(labels(rows)).toEqual([
      'Scratchpads', '  [Today]', '    [Just now]', '      scratchpad1',
      'Orders debugging', '  payloads', '  [Today]', '    [Just now]', '      staging',
    ]);
  });

  it('counts what is inside a folder at any depth', () => {
    const rows = buildScratchpadTree(folders, files, { query: '', openFolders: {}, defaultFolderId: 'def' });
    const orders = rows.find(r => r.kind === 'folder' && r.folder.id === 'orders');
    expect(orders && orders.kind === 'folder' && orders.count).toBe(2);
  });

  it('searches names and contents, and opens every folder with a hit', () => {
    expect(labels(buildScratchpadTree(folders, files, { query: 'refund', openFolders: {}, defaultFolderId: 'def' })))
      .toEqual(['Orders debugging', '  payloads', '    [Today]', '      [Just now]', '        refund']);
    expect(labels(buildScratchpadTree(folders, files, { query: 'ord_8f21', openFolders: {}, defaultFolderId: 'def' })))
      .toEqual(['Scratchpads', '  [Today]', '    [Just now]', '      scratchpad1']);
  });
});

describe('date headings inside a folder', () => {
  const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const lastYear = `${new Date().getFullYear() - 1}-03-14T10:00:00.000Z`;
  const pads = [
    pad('t', 'def', 'today'),
    pad('y', 'def', 'yesterday', '', day(1)),
    pad('o', 'def', 'old', '', lastYear),
  ];
  const open = { def: true };

  it('groups a folder the way History does, newest first', () => {
    const rows = buildScratchpadTree(folders, pads, { query: '', openFolders: open, defaultFolderId: 'def' });
    expect(labels(rows)).toEqual([
      'Scratchpads',
      '  [Today]', '    [Just now]', '      today',
      '  [Yesterday]', '    yesterday',
      `  [${new Date().getFullYear() - 1}]`, '    [March]', '      [Mar 14]', '        old',
      'Orders debugging',
    ]);
  });

  it('counts a heading by what is under it at any depth', () => {
    const rows = buildScratchpadTree(folders, pads, { query: '', openFolders: open, defaultFolderId: 'def' });
    const year = rows.find(r => r.kind === 'date' && r.level === 1 && /^\d{4}$/.test(r.label));
    expect(year && year.kind === 'date' && year.count).toBe(1);
  });

  it('hides what is under a collapsed heading, and opens it again while searching', () => {
    const collapsedDates = new Set(['def::Yesterday']);
    const closed = buildScratchpadTree(folders, pads, { query: '', openFolders: open, defaultFolderId: 'def', collapsedDates });
    expect(labels(closed)).toContain('  [Yesterday]');
    expect(labels(closed)).not.toContain('    yesterday');
    const searched = buildScratchpadTree(folders, pads, { query: 'yesterday', openFolders: open, defaultFolderId: 'def', collapsedDates });
    expect(labels(searched)).toEqual(['Scratchpads', '  [Yesterday]', '    yesterday']);
  });
});

describe('helpers', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  it('says when, the way a person does', () => {
    expect(relativeTime('2026-11-13T11:59:50Z', now)).toBe('just now');
    expect(relativeTime('2026-11-13T11:58:00Z', now)).toBe('2 min ago');
    expect(relativeTime('2026-11-12T10:00:00Z', now)).toBe('yesterday');
    expect(relativeTime('2026-11-04T12:00:00Z', now)).toBe('last week');
  });

  it('formats JSON and XML, and leaves broken JSON alone', () => {
    expect(formatScratchpad('json', '{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(formatScratchpad('json', '{"a":')).toBeNull();
    expect(formatScratchpad('xml', '<a><b>1</b></a>')).toContain('\n');
    expect(canFormat('sql')).toBe(false);
  });
});
