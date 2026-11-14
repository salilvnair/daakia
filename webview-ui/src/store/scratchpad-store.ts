/**
 * Scratchpads — IntelliJ's scratch files: JSON, XML, YAML, SQL or plain text
 * kept beside the requests, in folders, saved as you type.
 *
 * ── Who holds what ──
 *
 * This store is the working copy. Every change is applied here first and then
 * told to the host (`scratchpads:save`), which never answers a save — see
 * `scratchpad-handler.ts` for why. The host is read once, on first use.
 *
 * ── Saving ──
 *
 * There is no Save button and nothing is ever dirty. Typing is written 400ms
 * after it stops, per scratchpad; everything else — a rename, a move, a new
 * type — is written at once. Anything still waiting is written when the panel
 * goes away.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { useTabsStore } from './tabs-store';
import { useUiStateStore } from './ui-state-store';
import { logUiEvent } from './ui-audit-store';

export type ScratchpadType = 'json' | 'xml' | 'yml' | 'sql' | 'txt';

export const SCRATCHPAD_TYPE_ORDER: ScratchpadType[] = ['json', 'xml', 'yml', 'sql', 'txt'];

export const SCRATCHPAD_TYPES: Record<ScratchpadType, { label: string; badge: string; ext: string; color: string }> = {
  json: { label: 'JSON', badge: 'JSON', ext: 'json', color: 'var(--color-scratch-json)' },
  xml:  { label: 'XML',  badge: 'XML',  ext: 'xml',  color: 'var(--color-scratch-xml)' },
  yml:  { label: 'YAML', badge: 'YML',  ext: 'yml',  color: 'var(--color-scratch-yml)' },
  sql:  { label: 'SQL',  badge: 'SQL',  ext: 'sql',  color: 'var(--color-scratch-sql)' },
  txt:  { label: 'Text', badge: 'TXT',  ext: 'txt',  color: 'var(--color-scratch-txt)' },
};

export interface ScratchpadFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface Scratchpad {
  id: string;
  folderId: string;
  /** Without the extension: the type supplies that, so changing it cannot leave `a.json.yml`. */
  name: string;
  type: ScratchpadType;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export function scratchpadFileName(p: Pick<Scratchpad, 'name' | 'type'>): string {
  return `${p.name}.${SCRATCHPAD_TYPES[p.type].ext}`;
}

/** What somebody typed as a name, with any extension they typed taken off. */
export function cleanScratchpadName(raw: string): string {
  return raw.trim().replace(/\.(json|xml|ya?ml|sql|txt)$/i, '').trim();
}

/** `scratchpad<N>` with N one past the highest in use — scratchpad1, scratchpad2, … */
export function nextScratchpadName(files: Pick<Scratchpad, 'name'>[]): string {
  let max = 0;
  for (const f of files) {
    const m = /^scratchpad(\d+)$/.exec(f.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `scratchpad${max + 1}`;
}

/** A folder and every folder inside it, at any depth. */
export function folderAndDescendants(folders: ScratchpadFolder[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    for (const f of folders) if (f.parentId === out[i] && !out.includes(f.id)) out.push(f.id);
  }
  return out;
}

/** "Orders debugging / payloads" — where a scratchpad lives, for a breadcrumb or a hint. */
export function folderPath(folders: ScratchpadFolder[], id: string): string {
  const parts: string[] = [];
  let f = folders.find(x => x.id === id);
  const seen = new Set<string>();
  while (f && !seen.has(f.id)) {
    seen.add(f.id);
    parts.unshift(f.name);
    f = f.parentId ? folders.find(x => x.id === f!.parentId) : undefined;
  }
  return parts.join(' / ');
}

const SAVE_DELAY_MS = 400;
const OPEN_FOLDERS_PREF = 'scratchpads.openFolders';
const LAST_OPEN_PREF = 'scratchpads.lastOpened';

const pending = new Map<string, ReturnType<typeof setTimeout>>();

function send(p: Scratchpad): void {
  postMsg({ type: 'scratchpads:save', file: p });
}

function sendFolder(f: ScratchpadFolder): void {
  postMsg({ type: 'scratchpads:saveFolder', folder: f });
}

function readOpenFolders(): Record<string, boolean> {
  try { return JSON.parse(useUiStateStore.getState().getPref(OPEN_FOLDERS_PREF, '{}') || '{}'); } catch { return {}; }
}

interface ScratchpadState {
  loaded: boolean;
  requested: boolean;
  folders: ScratchpadFolder[];
  files: Scratchpad[];
  defaultFolderId: string;
  openFolders: Record<string, boolean>;
  /** The last scratchpad deleted, for Undo. */
  lastDeleted: Scratchpad | null;

  load: () => void;
  hydrate: (data: { folders?: ScratchpadFolder[]; files?: Scratchpad[]; defaultFolderId?: string }) => void;

  create: (type: ScratchpadType, folderId?: string) => Scratchpad;
  open: (id: string) => void;
  setContent: (id: string, content: string) => void;
  rename: (id: string, raw: string) => void;
  changeType: (id: string, type: ScratchpadType) => void;
  move: (id: string, folderId: string) => void;
  duplicate: (id: string) => Scratchpad | null;
  remove: (id: string) => void;
  undoRemove: () => void;

  createFolder: (parentId: string | null, name?: string) => ScratchpadFolder;
  renameFolder: (id: string, name: string) => void;
  /**
   * Delete a folder. Any folder but the default goes with its subfolders, and
   * what was in them moves to the default folder. The default folder is never
   * removed: deleting it deletes what is inside it and leaves it empty.
   */
  deleteFolder: (id: string) => { moved: number; deleted: number };
  setDefaultFolder: (id: string) => void;
  setFolderOpen: (id: string, open: boolean) => void;
  /** Unfold every folder above a scratchpad, so its row is on screen. */
  reveal: (id: string) => void;
  /** Unfold every folder. */
  expandAll: () => void;
  collapseAll: () => void;

  /** Write anything still waiting on the debounce. */
  flush: () => void;
}

export const useScratchpadStore = create<ScratchpadState>((set, get) => {
  const patchFile = (id: string, patch: Partial<Scratchpad>, debounce = false): Scratchpad | null => {
    const cur = get().files.find(f => f.id === id);
    if (!cur) return null;
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    set(s => ({ files: s.files.map(f => (f.id === id ? next : f)) }));
    const t = pending.get(id);
    if (t) clearTimeout(t);
    if (debounce) {
      pending.set(id, setTimeout(() => {
        pending.delete(id);
        const latest = get().files.find(f => f.id === id);
        if (latest) send(latest);
      }, SAVE_DELAY_MS));
    } else {
      pending.delete(id);
      send(next);
    }
    return next;
  };

  /* A tab shows the file's name; a rename or a new type has to reach it. */
  const retitleTabs = (p: Scratchpad) => {
    const tabs = useTabsStore.getState();
    for (const t of tabs.tabs) {
      if (t.type === 'scratchpad' && t.scratchpadId === p.id && t.name !== scratchpadFileName(p)) {
        tabs.updateTab(t.id, { name: scratchpadFileName(p) });
      }
    }
  };

  const persistOpen = (openFolders: Record<string, boolean>) => {
    useUiStateStore.getState().setPref(OPEN_FOLDERS_PREF, JSON.stringify(openFolders));
  };

  return {
    loaded: false,
    requested: false,
    folders: [],
    files: [],
    defaultFolderId: '',
    openFolders: {},
    lastDeleted: null,

    load: () => {
      if (get().requested) return;
      set({ requested: true, openFolders: readOpenFolders() });
      postMsg({ type: 'scratchpads:get' });
    },

    hydrate: (data) => {
      const files = (data.files ?? []).map(f => ({ ...f, type: (SCRATCHPAD_TYPES[f.type] ? f.type : 'txt') as ScratchpadType }));
      /* Something typed before the answer came is newer than the answer. */
      const local = new Map(get().files.filter(f => pending.has(f.id)).map(f => [f.id, f]));
      set({
        loaded: true,
        requested: true,
        folders: data.folders ?? [],
        files: files.map(f => local.get(f.id) ?? f).concat([...local.values()].filter(l => !files.some(f => f.id === l.id))),
        defaultFolderId: data.defaultFolderId ?? '',
        openFolders: { ...readOpenFolders(), ...get().openFolders },
      });
      /* Tabs restored from the last session keep the name they had then. */
      get().files.forEach(retitleTabs);
    },

    create: (type, folderId) => {
      const s = get();
      const target = folderId && s.folders.some(f => f.id === folderId) ? folderId : s.defaultFolderId;
      const now = new Date().toISOString();
      const pad: Scratchpad = {
        id: crypto.randomUUID(),
        folderId: target,
        name: nextScratchpadName(s.files),
        type,
        content: '',
        createdAt: now,
        updatedAt: now,
      };
      const openFolders = { ...s.openFolders, [target]: true };
      set({ files: [...s.files, pad], openFolders });
      persistOpen(openFolders);
      send(pad);
      logUiEvent('scratchpad.create', { type });
      get().open(pad.id);
      return pad;
    },

    open: (id) => {
      const p = get().files.find(f => f.id === id);
      if (!p) return;
      useTabsStore.getState().openScratchpadTab(p.id, scratchpadFileName(p));
      useUiStateStore.getState().setPref(LAST_OPEN_PREF, p.id);
    },

    setContent: (id, content) => {
      const cur = get().files.find(f => f.id === id);
      if (!cur || cur.content === content) return;
      patchFile(id, { content }, true);
    },

    rename: (id, raw) => {
      const name = cleanScratchpadName(raw);
      const cur = get().files.find(f => f.id === id);
      if (!cur || !name || name === cur.name) return;
      const next = patchFile(id, { name });
      if (next) retitleTabs(next);
    },

    changeType: (id, type) => {
      const next = patchFile(id, { type });
      if (next) retitleTabs(next);
    },

    move: (id, folderId) => {
      const cur = get().files.find(f => f.id === id);
      if (!cur || cur.folderId === folderId || !get().folders.some(f => f.id === folderId)) return;
      patchFile(id, { folderId });
      const openFolders = { ...get().openFolders, [folderId]: true };
      set({ openFolders });
      persistOpen(openFolders);
      logUiEvent('scratchpad.move', {});
    },

    duplicate: (id) => {
      const s = get();
      const src = s.files.find(f => f.id === id);
      if (!src) return null;
      const now = new Date().toISOString();
      const copy: Scratchpad = {
        ...src,
        id: crypto.randomUUID(),
        name: /^scratchpad\d+$/.test(src.name) ? nextScratchpadName(s.files) : `${src.name}-copy`,
        createdAt: now,
        updatedAt: now,
      };
      set({ files: [...s.files, copy] });
      send(copy);
      logUiEvent('scratchpad.create', { type: copy.type, duplicate: true });
      get().open(copy.id);
      return copy;
    },

    remove: (id) => {
      const cur = get().files.find(f => f.id === id);
      if (!cur) return;
      const t = pending.get(id);
      if (t) { clearTimeout(t); pending.delete(id); }
      set(s => ({ files: s.files.filter(f => f.id !== id), lastDeleted: cur }));
      postMsg({ type: 'scratchpads:delete', id });
      const tabs = useTabsStore.getState();
      tabs.tabs.filter(tb => tb.type === 'scratchpad' && tb.scratchpadId === id).forEach(tb => tabs.closeTab(tb.id));
      logUiEvent('scratchpad.delete', { type: cur.type });
    },

    undoRemove: () => {
      const p = get().lastDeleted;
      if (!p) return;
      const s = get();
      const restored = { ...p, folderId: s.folders.some(f => f.id === p.folderId) ? p.folderId : s.defaultFolderId };
      set({ files: [...s.files, restored], lastDeleted: null });
      send(restored);
      get().open(restored.id);
    },

    createFolder: (parentId, name = 'New folder') => {
      const s = get();
      const parent = parentId && s.folders.some(f => f.id === parentId) ? parentId : null;
      const siblings = s.folders.filter(f => f.parentId === parent);
      const folder: ScratchpadFolder = {
        id: crypto.randomUUID(),
        name,
        parentId: parent,
        sortOrder: siblings.reduce((m, f) => Math.max(m, f.sortOrder), 0) + 1,
      };
      const openFolders = { ...s.openFolders, [folder.id]: true, ...(parent ? { [parent]: true } : {}) };
      set({ folders: [...s.folders, folder], openFolders });
      persistOpen(openFolders);
      sendFolder(folder);
      logUiEvent('scratchpad.folder.create', {});
      return folder;
    },

    renameFolder: (id, raw) => {
      const name = raw.trim();
      const cur = get().folders.find(f => f.id === id);
      if (!cur || !name || name === cur.name) return;
      const next = { ...cur, name };
      set(s => ({ folders: s.folders.map(f => (f.id === id ? next : f)) }));
      sendFolder(next);
    },

    deleteFolder: (id) => {
      const s = get();
      if (!s.folders.some(f => f.id === id)) return { moved: 0, deleted: 0 };
      const all = folderAndDescendants(s.folders, id);
      const inside = s.files.filter(f => all.includes(f.folderId));

      if (id === s.defaultFolderId) {
        /* The folder stays, so new scratchpads still have somewhere to go. */
        const gone = all.filter(f => f !== id);
        const ids = new Set(inside.map(f => f.id));
        for (const f of inside) {
          const t = pending.get(f.id);
          if (t) { clearTimeout(t); pending.delete(f.id); }
          postMsg({ type: 'scratchpads:delete', id: f.id });
        }
        set(st => ({
          files: st.files.filter(f => !ids.has(f.id)),
          folders: st.folders.filter(f => !gone.includes(f.id)),
          lastDeleted: st.lastDeleted && ids.has(st.lastDeleted.id) ? null : st.lastDeleted,
        }));
        if (gone.length) postMsg({ type: 'scratchpads:deleteFolders', ids: gone });
        const tabs = useTabsStore.getState();
        tabs.tabs.filter(tb => tb.type === 'scratchpad' && tb.scratchpadId && ids.has(tb.scratchpadId)).forEach(tb => tabs.closeTab(tb.id));
        logUiEvent('scratchpad.folder.delete', { moved: 0, deleted: inside.length, emptiedDefault: true });
        return { moved: 0, deleted: inside.length };
      }

      for (const f of inside) patchFile(f.id, { folderId: s.defaultFolderId });
      set(st => ({ folders: st.folders.filter(f => !all.includes(f.id)) }));
      postMsg({ type: 'scratchpads:deleteFolders', ids: all });
      logUiEvent('scratchpad.folder.delete', { moved: inside.length, deleted: 0 });
      return { moved: inside.length, deleted: 0 };
    },

    setDefaultFolder: (id) => {
      if (!get().folders.some(f => f.id === id)) return;
      set({ defaultFolderId: id });
      postMsg({ type: 'scratchpads:setDefault', folderId: id });
    },

    setFolderOpen: (id, open) => {
      const openFolders = { ...get().openFolders, [id]: open };
      set({ openFolders });
      persistOpen(openFolders);
    },

    reveal: (id) => {
      const s = get();
      const p = s.files.find(f => f.id === id);
      if (!p) return;
      const openFolders = { ...s.openFolders };
      let fid: string | null = p.folderId;
      const seen = new Set<string>();
      while (fid && !seen.has(fid)) {
        seen.add(fid);
        openFolders[fid] = true;
        fid = s.folders.find(f => f.id === fid)?.parentId ?? null;
      }
      set({ openFolders });
      persistOpen(openFolders);
    },

    expandAll: () => {
      const open = Object.fromEntries(get().folders.map(f => [f.id, true]));
      set({ openFolders: open });
      persistOpen(open);
    },

    collapseAll: () => {
      set({ openFolders: {} });
      persistOpen({});
    },

    flush: () => {
      for (const [id, t] of pending) {
        clearTimeout(t);
        const p = get().files.find(f => f.id === id);
        if (p) send(p);
      }
      pending.clear();
    },
  };
});

/** The scratchpad last opened, for the rail icon to come back to. */
export function lastOpenedScratchpadId(): string | undefined {
  return useUiStateStore.getState().getPref(LAST_OPEN_PREF);
}

/*
  The rail icon: back to the scratchpad you were in, or the one most recently
  changed, or — with none at all — a new JSON one. Never an empty page.
*/
export function openScratchpads(): void {
  const store = useScratchpadStore.getState();
  const tabs = useTabsStore.getState();
  const showing = tabs.tabs.find(t => t.id === tabs.activeTabId);
  if (showing?.type === 'scratchpad') return;
  const openTab = tabs.tabs.filter(t => t.type === 'scratchpad').pop();
  if (openTab) { tabs.setActiveTab(openTab.id); return; }
  if (!store.loaded) {
    /* Not read yet: ask, and open once the answer is in. */
    store.load();
    const unsub = useScratchpadStore.subscribe(s => {
      if (!s.loaded) return;
      unsub();
      openScratchpads();
    });
    return;
  }
  const last = lastOpenedScratchpadId();
  const pick = store.files.find(f => f.id === last)
    ?? [...store.files].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (pick) store.open(pick.id);
  else store.create('json');
}

if (typeof window !== 'undefined') {
  const flush = () => useScratchpadStore.getState().flush();
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
