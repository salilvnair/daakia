/**
 * The Scratchpads panel's rows: folders and what is in them, flattened in the
 * order they are drawn, filtered by the search box.
 */
import type { Scratchpad, ScratchpadFolder } from '../../store/scratchpad-store';
import { folderAndDescendants, scratchpadFileName } from '../../store/scratchpad-store';
import { buildGroups, type SubGroup } from '../../services/history';

export type TreeRow =
  | { kind: 'folder'; folder: ScratchpadFolder; depth: number; expanded: boolean; count: number }
  /* A date heading inside a folder — History's groups: Today (then "Just now",
     "3 hours ago"), Yesterday, this month's days, earlier months, earlier years.
     `level` 1 is the outer heading, 2 and 3 the ones inside it. */
  | { kind: 'date'; key: string; label: string; depth: number; level: 1 | 2 | 3; expanded: boolean; count: number }
  | { kind: 'file'; file: Scratchpad; depth: number };

type Dated = { created_at: string; file: Scratchpad };

const countIn = (sg: SubGroup<Dated>): number =>
  sg.items.length + (sg.subGroups ?? []).reduce((n, s) => n + countIn(s), 0);

/** A name or the text inside — the search box looks at both, as IntelliJ's does. */
export function scratchpadMatches(file: Scratchpad, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return scratchpadFileName(file).toLowerCase().includes(q) || file.content.toLowerCase().includes(q);
}

export function buildScratchpadTree(
  folders: ScratchpadFolder[],
  files: Scratchpad[],
  opts: { query: string; openFolders: Record<string, boolean>; defaultFolderId: string; collapsedDates?: ReadonlySet<string> },
): TreeRow[] {
  const searching = !!opts.query.trim();
  const shown = files.filter(f => scratchpadMatches(f, opts.query));
  const rows: TreeRow[] = [];
  /* Open unless closed: a new day's heading arrives open. Searching opens all of them. */
  const isOpen = (key: string) => searching || !opts.collapsedDates?.has(key);

  const sub = (sg: SubGroup<Dated>, parentKey: string, depth: number, level: 2 | 3) => {
    /* A heading with no label (Yesterday, a day this month) holds its scratchpads directly. */
    if (!sg.label) {
      for (const d of sg.items) rows.push({ kind: 'file', file: d.file, depth });
      return;
    }
    const key = `${parentKey}::${sg.label}`;
    const expanded = isOpen(key);
    rows.push({ kind: 'date', key, label: sg.label, depth, level, expanded, count: countIn(sg) });
    if (!expanded) return;
    for (const inner of sg.subGroups ?? []) sub(inner, key, depth + 1, 3);
    for (const d of sg.items) rows.push({ kind: 'file', file: d.file, depth: depth + 1 });
  };

  /* A folder's own scratchpads, newest edit first, under date headings. */
  const dated = (list: Scratchpad[], folderId: string, depth: number) => {
    const items: Dated[] = [...list]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(file => ({ created_at: file.updatedAt, file }));
    for (const g of buildGroups<Dated>(items)) {
      const key = `${folderId}::${g.label}`;
      const expanded = isOpen(key);
      const count = g.subGroups.reduce((n, sg) => n + countIn(sg), 0);
      rows.push({ kind: 'date', key, label: g.label, depth, level: 1, expanded, count });
      if (expanded) for (const sg of g.subGroups) sub(sg, key, depth + 1, 2);
    }
  };

  /* The default folder first, then the rest as they were made. */
  const order = (list: ScratchpadFolder[]) => [...list].sort((a, b) =>
    (a.id === opts.defaultFolderId ? -1 : b.id === opts.defaultFolderId ? 1 : 0) || a.sortOrder - b.sortOrder);

  const walk = (parentId: string | null, depth: number, seen: Set<string>) => {
    for (const folder of order(folders.filter(f => f.parentId === parentId))) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      const inside = folderAndDescendants(folders, folder.id);
      const count = shown.filter(f => inside.includes(f.folderId)).length;
      if (searching && count === 0) continue;
      /* While searching, every folder with a hit is open — a hit you have to
         go and unfold is a hit you did not see. */
      const expanded = searching || !!opts.openFolders[folder.id];
      rows.push({ kind: 'folder', folder, depth, expanded, count });
      if (!expanded) continue;
      walk(folder.id, depth + 1, seen);
      dated(shown.filter(f => f.folderId === folder.id), folder.id, depth + 1);
    }
  };
  walk(null, 0, new Set());
  return rows;
}
