/**
 * The Scratchpads panel's rows: folders and what is in them, flattened in the
 * order they are drawn, filtered by the search box.
 */
import type { Scratchpad, ScratchpadFolder } from '../../store/scratchpad-store';
import { folderAndDescendants, scratchpadFileName } from '../../store/scratchpad-store';

export type TreeRow =
  | { kind: 'folder'; folder: ScratchpadFolder; depth: number; expanded: boolean; count: number }
  | { kind: 'file'; file: Scratchpad; depth: number };

/** A name or the text inside — the search box looks at both, as IntelliJ's does. */
export function scratchpadMatches(file: Scratchpad, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return scratchpadFileName(file).toLowerCase().includes(q) || file.content.toLowerCase().includes(q);
}

export function buildScratchpadTree(
  folders: ScratchpadFolder[],
  files: Scratchpad[],
  opts: { query: string; openFolders: Record<string, boolean>; defaultFolderId: string },
): TreeRow[] {
  const searching = !!opts.query.trim();
  const shown = files.filter(f => scratchpadMatches(f, opts.query));
  const rows: TreeRow[] = [];

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
      for (const file of shown.filter(f => f.folderId === folder.id)) {
        rows.push({ kind: 'file', file, depth: depth + 1 });
      }
    }
  };
  walk(null, 0, new Set());
  return rows;
}
