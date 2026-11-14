/**
 * Scratchpads — IntelliJ's scratch files, in Daakia.
 *
 * The webview owns the working copy and tells the host about each change; the
 * host answers only `scratchpads:get`. A save is never echoed back: the reply
 * to the save of keystroke ten would land while keystroke twelve was on
 * screen, and put the editor back two characters.
 *
 * ── The default folder ──
 *
 * There is always one folder new scratchpads go to unless somebody picks
 * another. It is created the first time anything asks, and its id lives in
 * app settings rather than as a flag on a row, so making a different folder
 * the default is one write rather than two that could disagree.
 */
import {
  getScratchpadFolders, getScratchpads, upsertScratchpadFolder, deleteScratchpadFolders,
  upsertScratchpad, deleteScratchpad, getSetting, setSetting,
} from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

export const SCRATCHPAD_TYPES = ['json', 'xml', 'yml', 'sql', 'txt'] as const;
export type ScratchpadType = (typeof SCRATCHPAD_TYPES)[number];

const DEFAULT_FOLDER_KEY = 'scratchpads.defaultFolder';
const FIRST_FOLDER_ID = 'scratchpads-default';

export interface ScratchpadFolderMsg { id: string; name: string; parentId: string | null; sortOrder?: number }
export interface ScratchpadMsg { id: string; folderId: string; name: string; type: string; content: string; updatedAt?: string }

/** The default folder, made on first use and re-made if it has gone. */
function ensureDefaultFolder(): string {
  const folders = getScratchpadFolders();
  const saved = getSetting<string>(DEFAULT_FOLDER_KEY);
  if (saved && folders.some(f => f.id === saved)) return saved;
  /* The setting points nowhere — a sync that dropped the row, say. The first
     folder there is takes over before a new one is made. */
  const fallback = folders.find(f => !f.parent_id)?.id;
  if (fallback) { setSetting(DEFAULT_FOLDER_KEY, fallback); return fallback; }
  upsertScratchpadFolder({ id: FIRST_FOLDER_ID, name: 'Scratchpads', parentId: null, sortOrder: 0 });
  setSetting(DEFAULT_FOLDER_KEY, FIRST_FOLDER_ID);
  return FIRST_FOLDER_ID;
}

export function handleScratchpadsGet(postMessage: PostMessage): void {
  const defaultFolderId = ensureDefaultFolder();
  const folderIds = new Set(getScratchpadFolders().map(f => f.id));
  postMessage({
    type: 'scratchpads:data',
    defaultFolderId,
    folders: getScratchpadFolders().map(f => ({
      id: f.id, name: f.name, parentId: f.parent_id && folderIds.has(f.parent_id) ? f.parent_id : null, sortOrder: f.sort_order,
    })),
    /* A scratchpad whose folder is gone is shown in the default one rather
       than not at all — it is somebody's text, and it has to be findable. */
    files: getScratchpads().map(p => ({
      id: p.id,
      folderId: folderIds.has(p.folder_id) ? p.folder_id : defaultFolderId,
      name: p.name,
      type: (SCRATCHPAD_TYPES as readonly string[]).includes(p.type) ? p.type : 'txt',
      content: p.content,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    })),
  });
}

export function handleScratchpadSave(msg: Record<string, unknown>): void {
  const p = msg.file as ScratchpadMsg | undefined;
  if (!p || typeof p.id !== 'string' || !p.id || typeof p.folderId !== 'string' || typeof p.name !== 'string') return;
  upsertScratchpad({
    id: p.id,
    folderId: p.folderId,
    name: p.name.trim() || 'scratchpad',
    type: (SCRATCHPAD_TYPES as readonly string[]).includes(p.type) ? p.type : 'txt',
    content: typeof p.content === 'string' ? p.content : '',
    updatedAt: typeof p.updatedAt === 'string' && p.updatedAt ? p.updatedAt : new Date().toISOString(),
  });
}

export function handleScratchpadDelete(msg: Record<string, unknown>): void {
  if (typeof msg.id === 'string' && msg.id) deleteScratchpad(msg.id);
}

export function handleScratchpadFolderSave(msg: Record<string, unknown>): void {
  const f = msg.folder as ScratchpadFolderMsg | undefined;
  if (!f || typeof f.id !== 'string' || !f.id || typeof f.name !== 'string') return;
  upsertScratchpadFolder({
    id: f.id,
    name: f.name.trim() || 'New folder',
    parentId: typeof f.parentId === 'string' && f.parentId ? f.parentId : null,
    sortOrder: typeof f.sortOrder === 'number' ? f.sortOrder : 0,
  });
}

/**
 * Remove folders. The webview has already moved what was in them — it sends
 * those saves first — so this never deletes a scratchpad by taking its
 * folder away. The default folder is refused: it is where everything lands.
 */
export function handleScratchpadFoldersDelete(msg: Record<string, unknown>): void {
  const ids = Array.isArray(msg.ids) ? msg.ids.filter((x): x is string => typeof x === 'string' && !!x) : [];
  const keep = getSetting<string>(DEFAULT_FOLDER_KEY);
  deleteScratchpadFolders(ids.filter(id => id !== keep));
}

export function handleScratchpadSetDefault(msg: Record<string, unknown>): void {
  const id = msg.folderId;
  if (typeof id !== 'string' || !getScratchpadFolders().some(f => f.id === id)) return;
  setSetting(DEFAULT_FOLDER_KEY, id);
}
