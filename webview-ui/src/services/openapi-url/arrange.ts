/**
 * The Organize step of the Swagger URL import: folders, and where each
 * request sits in them, before anything is created.
 *
 * Pure functions over one small value, so the drag-and-drop in the wizard is
 * only ever "call one of these, set the result" — and every move can be
 * tested without a DOM. Ids here are the wizard's own; the host swaps them for
 * real ones when it creates the collection.
 */

export interface OutlineOp {
  id: string;
  method: string;
  path: string;
  summary: string;
  operationId: string;
  tag: string;
  deprecated: boolean;
  security: string[];
}

export interface ArrangeFolder { id: string; name: string; parentId: string | null; open: boolean }
export interface ArrangeRequest { opId: string; folderId: string | null; on: boolean }
export interface Arrangement { folders: ArrangeFolder[]; requests: ArrangeRequest[] }

export type GroupBy = 'tag' | 'path' | 'flat';
export type NameBy = 'summary' | 'operationId' | 'path';

/**
 * A fresh arrangement.
 *
 * Tag: one folder per tag, in the order the spec lists them.
 * Path: one folder per first segment, and inside it one per resource that
 *   takes a parameter — `/store/order/{orderId}` lands in store › order/{orderId}.
 * Flat: no folders.
 * `keepOn` carries which requests were ticked across a regroup.
 */
export function arrange(ops: OutlineOp[], by: GroupBy, keepOn?: ReadonlyMap<string, boolean>): Arrangement {
  const folders: ArrangeFolder[] = [];
  const byKey = new Map<string, string>();
  const folderFor = (name: string, parentId: string | null) => {
    const key = `${parentId ?? ''}/${name}`;
    let id = byKey.get(key);
    if (!id) {
      id = `f${folders.length + 1}`;
      folders.push({ id, name, parentId, open: true });
      byKey.set(key, id);
    }
    return id;
  };
  const requests = ops.map(op => {
    let folderId: string | null = null;
    if (by === 'tag') folderId = folderFor(op.tag || 'Untagged', null);
    if (by === 'path') {
      const segs = op.path.split('/').filter(Boolean);
      if (segs.length) {
        const top = folderFor(segs[0], null);
        let last = -1;
        segs.forEach((s, i) => { if (s.startsWith('{')) last = i; });
        folderId = last > 0 ? folderFor(segs.slice(1, last + 1).join('/'), top) : top;
      }
    }
    return { opId: op.id, folderId, on: keepOn?.get(op.id) ?? !op.deprecated };
  });
  return { folders, requests };
}

export function requestName(op: OutlineOp, by: NameBy): string {
  if (by === 'operationId' && op.operationId) return op.operationId;
  if (by === 'path') return `${op.method} ${op.path}`;
  return op.summary || op.operationId || `${op.method} ${op.path}`;
}

/** Is `a` above `b`? A folder cannot be dropped into one of its own. */
export function isAncestor(folders: ArrangeFolder[], a: string, b: string): boolean {
  let cur = folders.find(f => f.id === b);
  const seen = new Set<string>();
  while (cur?.parentId && !seen.has(cur.id)) {
    if (cur.parentId === a) return true;
    seen.add(cur.id);
    cur = folders.find(f => f.id === cur!.parentId);
  }
  return false;
}

/** The folder and every folder below it. */
export function subtree(folders: ArrangeFolder[], id: string): string[] {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) for (const f of folders) if (f.parentId === ids[i]) ids.push(f.id);
  return ids;
}

export function requestsUnder(a: Arrangement, folderId: string): ArrangeRequest[] {
  const ids = new Set(subtree(a.folders, folderId));
  return a.requests.filter(r => r.folderId !== null && ids.has(r.folderId));
}

export type Dragged = { kind: 'request'; id: string } | { kind: 'folder'; id: string };

export function canDropInto(a: Arrangement, d: Dragged, folderId: string | null): boolean {
  if (d.kind === 'request') return true;
  if (folderId === null) return true;
  return d.id !== folderId && !isAncestor(a.folders, d.id, folderId);
}

/** Drop onto a folder (or the top level, `null`). The folder opens. */
export function moveInto(a: Arrangement, d: Dragged, folderId: string | null): Arrangement {
  if (!canDropInto(a, d, folderId)) return a;
  const folders = a.folders.map(f => {
    if (d.kind === 'folder' && f.id === d.id) return { ...f, parentId: folderId };
    if (f.id === folderId) return { ...f, open: true };
    return f;
  });
  if (d.kind === 'folder') return { ...a, folders };
  const moving = a.requests.find(r => r.opId === d.id);
  if (!moving) return a;
  // To the end of its new folder, so it shows up where you can see it land.
  const rest = a.requests.filter(r => r.opId !== d.id);
  return { folders, requests: [...rest, { ...moving, folderId }] };
}

/** Drop onto a request: go just above it, in its folder. A folder goes beside it. */
export function moveBefore(a: Arrangement, d: Dragged, targetOpId: string): Arrangement {
  const target = a.requests.find(r => r.opId === targetOpId);
  if (!target) return a;
  if (d.kind === 'folder') return moveInto(a, d, target.folderId);
  if (d.id === targetOpId) return a;
  const moving = a.requests.find(r => r.opId === d.id);
  if (!moving) return a;
  const rest = a.requests.filter(r => r.opId !== d.id);
  const at = rest.findIndex(r => r.opId === targetOpId);
  rest.splice(at, 0, { ...moving, folderId: target.folderId });
  return { ...a, requests: rest };
}

let made = 0;
export function addFolder(a: Arrangement, parentId: string | null, name = 'New folder'): { next: Arrangement; id: string } {
  const id = `n${Date.now().toString(36)}${++made}`;
  const folders = a.folders.map(f => (f.id === parentId ? { ...f, open: true } : f));
  return { id, next: { ...a, folders: [...folders, { id, name, parentId, open: true }] } };
}

/** Remove a folder and keep what was in it: its requests and folders move up one level. */
export function unwrapFolder(a: Arrangement, id: string): Arrangement {
  const gone = a.folders.find(f => f.id === id);
  if (!gone) return a;
  return {
    folders: a.folders.filter(f => f.id !== id).map(f => (f.parentId === id ? { ...f, parentId: gone.parentId } : f)),
    requests: a.requests.map(r => (r.folderId === id ? { ...r, folderId: gone.parentId } : r)),
  };
}

export function renameFolder(a: Arrangement, id: string, name: string): Arrangement {
  return { ...a, folders: a.folders.map(f => (f.id === id ? { ...f, name } : f)) };
}

export function toggleOpen(a: Arrangement, id: string): Arrangement {
  return { ...a, folders: a.folders.map(f => (f.id === id ? { ...f, open: !f.open } : f)) };
}

export function setOn(a: Arrangement, opIds: ReadonlySet<string>, on: boolean): Arrangement {
  return { ...a, requests: a.requests.map(r => (opIds.has(r.opId) ? { ...r, on } : r)) };
}

/** Folders that will hold at least one ticked request — the ones that get created. */
export function foldersInUse(a: Arrangement): ArrangeFolder[] {
  return a.folders.filter(f => requestsUnder(a, f.id).some(r => r.on));
}

export type TreeRow =
  | { kind: 'folder'; folder: ArrangeFolder; depth: number; total: number; on: number }
  | { kind: 'request'; request: ArrangeRequest; depth: number };

/** The tree as rows, folders before requests at each level; closed folders hide their contents. */
export function treeRows(a: Arrangement, onlyOn = false): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const f of a.folders.filter(x => x.parentId === parentId)) {
      const inside = requestsUnder(a, f.id);
      const on = inside.filter(r => r.on).length;
      if (onlyOn && on === 0) continue;
      rows.push({ kind: 'folder', folder: f, depth, total: inside.length, on });
      if (f.open || onlyOn) walk(f.id, depth + 1);
    }
    for (const r of a.requests.filter(x => x.folderId === parentId)) {
      if (onlyOn && !r.on) continue;
      rows.push({ kind: 'request', request: r, depth });
    }
  };
  walk(null, 0);
  return rows;
}
