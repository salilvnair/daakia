/**
 * The Scratchpads side panel — the collections tree, for scratch files.
 *
 * Folders nest and can be renamed, deleted and made the default; scratchpads
 * open on a click, move by drag or by Move to, and rename in place. New ones
 * land in the default folder unless they are made from a folder's own menu.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ButtonView, IconButtonView, InfoPopupView, TextInputView } from '@salilvnair/dui';
import { ConfirmDialog, ContextMenu, type ContextMenuItem } from '../shared';
import {
  useScratchpadStore, SCRATCHPAD_TYPES, SCRATCHPAD_TYPE_ORDER, scratchpadFileName, folderPath, folderAndDescendants,
  type Scratchpad, type ScratchpadFolder, type ScratchpadType,
} from '../../store/scratchpad-store';
import { useTabsStore } from '../../store/tabs-store';
import { useToastStore } from '../../store/toast-store';
import { copyText } from '../../utils/clipboard';
import {
  ScratchpadIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, ChevronRightIcon, ChevronDownIcon, PlusIcon,
  RenameIcon, CopyIcon, TrashIcon, MoreHorizontalIcon, CollapseAllIcon, FolderTransferIcon, ExternalLinkIcon,
  CodeBracketsIcon, StarIcon, SearchIcon, ClipboardIcon, ExpandAllIcon, HelpCircleIcon, MoreVerticalIcon,
} from '../../icons';
import { buildScratchpadTree } from './scratchpad-tree';
import { relativeTime } from './scratchpad-format';
import './scratchpad.css';

const DRAG_TYPE = 'application/x-daakia-scratchpad';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type Menu =
  | { kind: 'new'; x: number; y: number }
  | { kind: 'more'; x: number; y: number }
  | { kind: 'file'; id: string; x: number; y: number }
  | { kind: 'folder'; id: string; x: number; y: number };

type Renaming = { kind: 'file' | 'folder'; id: string; value: string } | null;

function typeIcon(type: ScratchpadType) {
  const t = SCRATCHPAD_TYPES[type];
  return <span className="dk-scratch-badge" style={{ color: t.color }}>{t.badge}</span>;
}

function typeSubmenu(current?: ScratchpadType): ContextMenuItem[] {
  return SCRATCHPAD_TYPE_ORDER.map(k => ({
    id: k,
    label: SCRATCHPAD_TYPES[k].label,
    icon: typeIcon(k),
    checked: k === current,
    disabled: k === current,
  }));
}

export function ScratchpadsPanel() {
  const { folders, files, defaultFolderId, openFolders, loaded, lastDeleted } = useScratchpadStore();
  const activeScratchId = useTabsStore(s => {
    const t = s.tabs.find(x => x.id === s.activeTabId);
    return t?.type === 'scratchpad' ? t.scratchpadId : undefined;
  });
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renaming, setRenaming] = useState<Renaming>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [undoFor, setUndoFor] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState<ScratchpadFolder | null>(null);
  /* Date headings that are closed, by `<folder id>::<heading>[::<inner>]`. Open unless closed. */
  const [collapsedDates, setCollapsedDates] = useState<ReadonlySet<string>>(() => new Set());
  const toggleDate = (key: string) => setCollapsedDates(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  /* Every date heading there is, at any depth, as if all were open — what a
     collapse-all closes. */
  const allDateKeys = () => buildScratchpadTree(folders, files, {
    query: '', defaultFolderId, openFolders: Object.fromEntries(folders.map(f => [f.id, true])),
  }).flatMap(r => (r.kind === 'date' ? [r.key] : []));

  /* History's per-group expand / collapse all, for a folder or a date heading.
     `prefixes` are the date keys at and under it: a folder's id, or a heading's own key. */
  const setDatesOpen = (prefixes: string[], open: boolean) => setCollapsedDates(prev => {
    const under = (k: string) => prefixes.some(p => k === p || k.startsWith(`${p}::`));
    const next = new Set([...prev].filter(k => !under(k)));
    if (!open) for (const k of allDateKeys()) if (under(k)) next.add(k);
    return next;
  });
  const expandFolderTree = (id: string) => {
    const ids = folderAndDescendants(folders, id);
    store().setFoldersOpen(ids, true);
    setDatesOpen(ids, true);
  };
  const collapseFolderTree = (id: string) => {
    const ids = folderAndDescendants(folders, id);
    store().setFoldersOpen(ids, false);
    setDatesOpen(ids, false);
  };

  /* The small pair History puts on each group heading — only on one holding more
     than three, where opening it all or folding it away saves clicks. */
  const treeButtons = (expand: () => void, collapse: () => void, small = false) => (
    <span className="dk-scratch-tree__tree-btns" onClick={e => e.stopPropagation()}>
      <IconButtonView
        icon={<ExpandAllIcon size={small ? 9 : 10} className="text-[var(--color-info)]" />}
        size="xs"
        tooltip="Expand all"
        onClick={expand}
      />
      <IconButtonView
        icon={<CollapseAllIcon size={small ? 9 : 10} className="text-[var(--color-warning)]" />}
        size="xs"
        tooltip="Collapse all"
        onClick={collapse}
      />
    </span>
  );
  const infoAnchorRef = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);

  useEffect(() => { useScratchpadStore.getState().load(); }, []);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  /* Undo stays on offer for a few seconds after a delete. */
  useEffect(() => {
    if (!undoFor) return;
    const t = setTimeout(() => setUndoFor(null), 8000);
    return () => clearTimeout(t);
  }, [undoFor]);

  const rows = useMemo(
    () => buildScratchpadTree(folders, files, { query, openFolders, defaultFolderId, collapsedDates }),
    [folders, files, query, openFolders, defaultFolderId, collapsedDates],
  );
  const store = useScratchpadStore.getState;
  const defaultName = folders.find(f => f.id === defaultFolderId)?.name ?? 'Scratchpads';

  const at = (e: React.MouseEvent, below = false) => {
    if (below) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      return { x: r.left, y: r.bottom + 4 };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const startRenameFile = (f: Scratchpad) => setRenaming({ kind: 'file', id: f.id, value: f.name });
  const startRenameFolder = (f: ScratchpadFolder) => setRenaming({ kind: 'folder', id: f.id, value: f.name });
  const commitRename = () => {
    if (!renaming) return;
    if (renaming.kind === 'file') store().rename(renaming.id, renaming.value);
    else store().renameFolder(renaming.id, renaming.value);
    setRenaming(null);
  };

  const newFolder = (parentId: string | null) => {
    const f = store().createFolder(parentId);
    setRenaming({ kind: 'folder', id: f.id, value: f.name });
  };

  const removeFile = (f: Scratchpad) => {
    store().remove(f.id);
    setUndoFor(scratchpadFileName(f));
  };

  /** What deleting a folder would take with it: scratchpads and subfolders, at any depth. */
  const contentsOf = (f: ScratchpadFolder) => {
    const ids = folderAndDescendants(folders, f.id);
    return { files: files.filter(x => ids.includes(x.folderId)).length, folders: ids.length - 1 };
  };

  const deleteFolder = (f: ScratchpadFolder) => {
    /* The default folder stays and only its contents go, which cannot be undone — so ask. */
    if (f.id === defaultFolderId) { setConfirmEmpty(f); return; }
    const { moved } = store().deleteFolder(f.id);
    useToastStore.getState().addToast({
      type: 'info',
      message: moved ? `Deleted "${f.name}". Its ${moved} scratchpad${moved === 1 ? '' : 's'} moved to ${defaultName}.` : `Deleted "${f.name}".`,
    });
  };

  const emptyDefault = (f: ScratchpadFolder) => {
    setConfirmEmpty(null);
    const { deleted } = store().deleteFolder(f.id);
    useToastStore.getState().addToast({
      type: 'info',
      message: `Deleted everything in "${f.name}"${deleted ? ` — ${plural(deleted, 'scratchpad')}` : ''}. The folder stays as the default for new scratchpads.`,
    });
  };

  /* ── menus ── */

  const menuItems = (): ContextMenuItem[] => {
    if (!menu) return [];
    if (menu.kind === 'new') {
      return [
        { id: 'heading', label: `New scratchpad in ${defaultName}`, heading: true },
        ...SCRATCHPAD_TYPE_ORDER.map(k => ({ id: `new:${k}`, label: SCRATCHPAD_TYPES[k].label, icon: typeIcon(k), shortcut: `.${SCRATCHPAD_TYPES[k].ext}` })),
        { id: 'sep', label: '', separator: true },
        { id: 'new-folder', label: 'New folder', icon: <FolderPlusIcon size={13} />, iconColor: 'var(--color-warning)' },
      ];
    }
    if (menu.kind === 'more') {
      return [
        { id: 'new-folder', label: 'New folder', icon: <FolderPlusIcon size={13} />, iconColor: 'var(--color-warning)' },
        { id: 'reveal', label: 'Reveal open scratchpad', icon: <ExternalLinkIcon size={13} />, iconColor: 'var(--color-info)', disabled: !activeScratchId },
      ];
    }
    if (menu.kind === 'file') {
      const f = files.find(x => x.id === menu.id);
      if (!f) return [];
      const targets = folders.filter(x => x.id !== f.folderId);
      return [
        { id: 'open', label: 'Open', icon: <ExternalLinkIcon size={13} />, iconColor: 'var(--color-info)', shortcut: 'Enter' },
        { id: 'rename', label: 'Rename', icon: <RenameIcon size={13} />, iconColor: 'var(--color-ctx-rename)', shortcut: 'F2' },
        { id: 'duplicate', label: 'Duplicate', icon: <CopyIcon size={13} />, iconColor: 'var(--color-ctx-duplicate)' },
        {
          id: 'move', label: 'Move to', icon: <FolderTransferIcon size={13} />, iconColor: 'var(--color-info)',
          disabled: targets.length === 0,
          submenu: targets.map(x => ({ id: x.id, label: folderPath(folders, x.id), icon: <FolderIcon size={13} />, iconColor: 'var(--color-warning)' })),
        },
        { id: 'type', label: 'Change type', icon: <CodeBracketsIcon size={13} />, iconColor: 'var(--color-scratchpad)', submenu: typeSubmenu(f.type) },
        { id: 'copy', label: 'Copy contents', icon: <ClipboardIcon size={13} />, iconColor: 'var(--color-text-muted)' },
        { id: 'sep', label: '', separator: true },
        { id: 'delete', label: 'Delete', icon: <TrashIcon size={13} />, danger: true, shortcut: 'Del' },
      ];
    }
    const folder = folders.find(x => x.id === menu.id);
    if (!folder) return [];
    const isDefault = folder.id === defaultFolderId;
    return [
      { id: 'new-here', label: 'New scratchpad here', icon: <PlusIcon size={13} />, iconColor: 'var(--color-success)', submenu: typeSubmenu() },
      { id: 'new-subfolder', label: 'New folder', icon: <FolderPlusIcon size={13} />, iconColor: 'var(--color-warning)' },
      { id: 'sep1', label: '', separator: true },
      { id: 'rename', label: 'Rename', icon: <RenameIcon size={13} />, iconColor: 'var(--color-ctx-rename)', shortcut: 'F2' },
      {
        id: 'default', label: isDefault ? 'Default folder' : 'Set as default',
        icon: <StarIcon size={13} filled={isDefault} />, iconColor: 'var(--color-scratchpad)', disabled: isDefault,
      },
      { id: 'sep2', label: '', separator: true },
      (() => {
        /* The default folder can be deleted too: it stays, and what is inside it goes. */
        const c = contentsOf(folder);
        const empty = isDefault && c.files === 0 && c.folders === 0;
        return { id: 'delete', label: empty ? 'Delete folder (already empty)' : 'Delete folder', icon: <TrashIcon size={13} />, danger: !empty, disabled: empty };
      })(),
    ];
  };

  const onMenuSelect = (id: string, subId?: string) => {
    if (!menu) return;
    const m = menu;
    setMenu(null);
    if (m.kind === 'more') {
      if (id === 'new-folder') newFolder(null);
      else if (id === 'reveal' && activeScratchId) store().reveal(activeScratchId);
      return;
    }
    if (m.kind === 'new') {
      if (id.startsWith('new:')) store().create(id.slice(4) as ScratchpadType);
      else if (id === 'new-folder') newFolder(null);
      return;
    }
    if (m.kind === 'file') {
      const f = files.find(x => x.id === m.id);
      if (!f) return;
      if (id === 'open') store().open(f.id);
      else if (id === 'rename') startRenameFile(f);
      else if (id === 'duplicate') store().duplicate(f.id);
      else if (id === 'move' && subId) store().move(f.id, subId);
      else if (id === 'type' && subId) store().changeType(f.id, subId as ScratchpadType);
      else if (id === 'copy') void copyText(f.content).then(ok => useToastStore.getState().addToast(ok
        ? { type: 'success', message: `Copied ${scratchpadFileName(f)}` }
        : { type: 'error', message: 'The clipboard refused the copy.' }));
      else if (id === 'delete') removeFile(f);
      return;
    }
    const folder = folders.find(x => x.id === m.id);
    if (!folder) return;
    if (id === 'new-here' && subId) store().create(subId as ScratchpadType, folder.id);
    else if (id === 'new-subfolder') newFolder(folder.id);
    else if (id === 'rename') startRenameFolder(folder);
    else if (id === 'default') store().setDefaultFolder(folder.id);
    else if (id === 'delete') deleteFolder(folder);
  };

  /* ── drag and drop ── */

  const dragOver = (folderId: string) => (e: React.DragEvent) => {
    if (!dragId.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropId !== folderId) setDropId(folderId);
  };
  const drop = (folderId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = dragId.current ?? e.dataTransfer.getData(DRAG_TYPE);
    dragId.current = null;
    setDropId(null);
    if (id) store().move(id, folderId);
  };

  const renameInput = (kind: 'file' | 'folder', suffix?: string) => (
    <>
      <input
        className="dk-scratch-tree__input"
        aria-label={kind === 'file' ? 'Scratchpad name' : 'Folder name'}
        autoFocus
        value={renaming?.value ?? ''}
        onChange={e => setRenaming(r => (r ? { ...r, value: e.target.value } : r))}
        onFocus={e => e.currentTarget.select()}
        onKeyDown={e => {
          if (e.key === 'Enter') commitRename();
          if (e.key === 'Escape') setRenaming(null);
          e.stopPropagation();
        }}
        onBlur={commitRename}
        onClick={e => e.stopPropagation()}
      />
      {suffix && <span className="dk-scratch-tree__ext">{suffix}</span>}
    </>
  );

  return (
    <div className="dk-scratch-panel">
      {/* Header, search and toolbar are the Collections panel's, part for part. */}
      <div className="px-4 py-3 border-b border-[var(--color-surface-border)] text-[13px] text-[var(--color-text-secondary)] flex items-center gap-2">
        <span className="flex-shrink-0" style={{ color: 'var(--color-scratchpad)' }}>
          <ScratchpadIcon size={16} />
        </span>
        <span>Scratchpad Collections</span>
      </div>

      <div className="px-3 py-2 border-b border-[var(--color-surface-border)] flex items-center gap-1.5">
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextInputView
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            size="md"
            width="fw"
            iconLeft={<SearchIcon size={11} />}
            aria-label="Search scratchpad names and contents"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-surface-border)]">
        <div className="flex items-center gap-1.5">
          <ButtonView
            variant="ghost"
            size="sm"
            iconLeft={<PlusIcon size={14} />}
            onClick={(e) => setMenu({ kind: 'new', ...at(e, true) })}
            accentColor="var(--color-scratchpad)"
          >
            New
          </ButtonView>
        </div>

        <div className="flex items-center gap-1.5 relative">
          <IconButtonView
            icon={<ExpandAllIcon size={13} className="text-[var(--color-info)]" />}
            size="sm"
            tooltip="Expand all"
            onClick={() => { store().expandAll(); setCollapsedDates(new Set()); }}
          />
          <IconButtonView
            icon={<CollapseAllIcon size={13} className="text-[var(--color-warning)]" />}
            size="sm"
            tooltip="Collapse all"
            onClick={() => store().collapseAll()}
          />
          <div ref={infoAnchorRef} style={{ display: 'inline-flex' }}>
            <IconButtonView
              icon={<HelpCircleIcon size={14} />}
              size="sm"
              tooltip="Scratchpads help"
              active={infoOpen}
              style={{ borderRadius: '50%' }}
              onClick={() => setInfoOpen(o => !o)}
            />
          </div>
          <InfoPopupView
            open={infoOpen}
            onClose={() => setInfoOpen(false)}
            anchorEl={infoAnchorRef.current}
            title="Scratchpads"
            description="Scratch files that save themselves as you type. They belong to no workspace and are always here."
            items={[
              { code: '+ New', description: 'A JSON, XML, YAML, SQL or text scratchpad, or a folder' },
              { code: 'Drag & Drop', description: 'Move a scratchpad into another folder' },
              { code: 'Right-click', description: 'Rename, duplicate, move, change type, delete' },
              { code: 'Ctrl+Win+K', description: 'Type json, sql… to open or make one' },
            ]}
            footer={`New scratchpads go to ${defaultName} unless made from a folder's menu.`}
          />
          <IconButtonView
            icon={<MoreVerticalIcon size={14} />}
            size="default"
            tooltip="More Options"
            onClick={(e) => setMenu({ kind: 'more', ...at(e, true) })}
          />
        </div>
      </div>

      <div className="dk-scratch-tree" role="tree" aria-label="Scratchpads">
        {!loaded && <div className="dk-scratch-tree__note">Loading…</div>}
        {loaded && rows.length === 0 && query.trim() && (
          <div className="dk-scratch-tree__note">No scratchpad has “{query.trim()}” in its name or contents.</div>
        )}
        {rows.map(row => {
          if (row.kind === 'folder') {
            const f = row.folder;
            const isRenaming = renaming?.kind === 'folder' && renaming.id === f.id;
            return (
              <div
                key={`d:${f.id}`}
                role="treeitem"
                aria-expanded={row.expanded}
                className={`dk-scratch-tree__row dk-scratch-tree__row--folder${dropId === f.id ? ' dk-scratch-tree__row--drop' : ''}`}
                style={{ paddingLeft: 6 + row.depth * 14 }}
                onClick={() => !isRenaming && store().setFolderOpen(f.id, !row.expanded)}
                onDoubleClick={() => startRenameFolder(f)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenu({ kind: 'folder', id: f.id, ...at(e) }); }}
                onDragOver={dragOver(f.id)}
                onDragLeave={() => { if (dropId === f.id) setDropId(null); }}
                onDrop={drop(f.id)}
                onKeyDown={e => { if (e.key === 'F2') startRenameFolder(f); }}
                tabIndex={0}
              >
                <ChevronRightIcon size={11} className="dk-scratch-tree__chevron" style={{ transform: row.expanded ? 'rotate(90deg)' : undefined }} />
                {row.expanded
                  ? <FolderOpenIcon size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                  : <FolderIcon size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />}
                {isRenaming ? renameInput('folder') : (
                  <>
                    <span className="dk-scratch-tree__name">{f.name}</span>
                    {f.id === defaultFolderId && <span className="dk-scratch-tree__default" title="New scratchpads go here">default</span>}
                    <span className="flex-1" />
                    {row.count > 3 && treeButtons(() => expandFolderTree(f.id), () => collapseFolderTree(f.id))}
                    <span className="dk-scratch-tree__count">{row.count}</span>
                    <button
                      type="button"
                      className="dk-scratch-tree__act"
                      aria-label="Folder actions"
                      onClick={e => { e.stopPropagation(); setMenu({ kind: 'folder', id: f.id, ...at(e, true) }); }}
                    >
                      <MoreHorizontalIcon size={13} />
                    </button>
                  </>
                )}
              </div>
            );
          }
          if (row.kind === 'date') {
            /* A date heading belongs to its folder: a scratchpad dropped on it lands there. */
            const folderId = row.key.split('::')[0];
            return (
              <div
                key={`t:${row.key}`}
                role="treeitem"
                aria-expanded={row.expanded}
                className={`dk-scratch-tree__row dk-scratch-tree__row--date dk-scratch-tree__row--date${row.level}${dropId === folderId ? ' dk-scratch-tree__row--drop' : ''}`}
                style={{ paddingLeft: 6 + row.depth * 14 }}
                onClick={() => toggleDate(row.key)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDate(row.key); } }}
                onDragOver={dragOver(folderId)}
                onDrop={drop(folderId)}
                tabIndex={0}
              >
                <ChevronRightIcon size={10} strokeWidth={2.5} className="dk-scratch-tree__chevron" style={{ transform: row.expanded ? 'rotate(90deg)' : undefined }} />
                <span className="dk-scratch-tree__date">{row.label}</span>
                <span className="flex-1" />
                {row.count > 3 && treeButtons(() => setDatesOpen([row.key], true), () => setDatesOpen([row.key], false), row.level > 1)}
                <span className="dk-scratch-tree__count">{row.count}</span>
              </div>
            );
          }
          const p = row.file;
          const isRenaming = renaming?.kind === 'file' && renaming.id === p.id;
          return (
            <div
              key={`f:${p.id}`}
              role="treeitem"
              aria-selected={activeScratchId === p.id}
              className={`dk-scratch-tree__row${activeScratchId === p.id ? ' dk-scratch-tree__row--active' : ''}`}
              style={{ paddingLeft: 24 + (row.depth - 1) * 14 }}
              draggable={!isRenaming}
              onDragStart={e => { dragId.current = p.id; e.dataTransfer.setData(DRAG_TYPE, p.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => { dragId.current = null; setDropId(null); }}
              onDragOver={dragOver(p.folderId)}
              onDrop={drop(p.folderId)}
              onClick={() => !isRenaming && store().open(p.id)}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenu({ kind: 'file', id: p.id, ...at(e) }); }}
              onKeyDown={e => {
                if (isRenaming) return;
                if (e.key === 'Enter') store().open(p.id);
                if (e.key === 'F2') startRenameFile(p);
                if (e.key === 'Delete') removeFile(p);
              }}
              tabIndex={0}
              title={`${folderPath(folders, p.folderId)} / ${scratchpadFileName(p)}`}
            >
              {typeIcon(p.type)}
              {isRenaming ? renameInput('file', `.${SCRATCHPAD_TYPES[p.type].ext}`) : (
                <>
                  <span className="dk-scratch-tree__name dk-scratch-tree__name--file">{scratchpadFileName(p)}</span>
                  <span className="dk-scratch-tree__ago">{relativeTime(p.updatedAt)}</span>
                  <button
                    type="button"
                    className="dk-scratch-tree__act"
                    aria-label="Rename"
                    onClick={e => { e.stopPropagation(); startRenameFile(p); }}
                  >
                    <RenameIcon size={12} />
                  </button>
                  <button
                    type="button"
                    className="dk-scratch-tree__act"
                    aria-label="More actions"
                    onClick={e => { e.stopPropagation(); setMenu({ kind: 'file', id: p.id, ...at(e, true) }); }}
                  >
                    <MoreHorizontalIcon size={13} />
                  </button>
                </>
              )}
            </div>
          );
        })}
        {loaded && files.length === 0 && !query.trim() && (
          <div className="dk-scratch-tree__note">
            Nothing here yet. Press New, or type <b>json</b> in the command palette.
          </div>
        )}
      </div>

      {undoFor && lastDeleted && (
        <div className="dk-scratch-panel__undo" role="status">
          <span>Deleted {undoFor}</span>
          <button type="button" onClick={() => { store().undoRemove(); setUndoFor(null); }}>Undo</button>
        </div>
      )}

      <div className="dk-scratch-panel__foot">
        Drag a scratchpad onto a folder to move it. New ones go to <b>{defaultName}</b>.
      </div>

      {confirmEmpty && (() => {
        const c = contentsOf(confirmEmpty);
        const what = [c.files ? plural(c.files, 'scratchpad') : '', c.folders ? plural(c.folders, 'folder') : ''].filter(Boolean).join(' and ');
        return (
          <ConfirmDialog
            title={`Delete everything in "${confirmEmpty.name}"?`}
            message={`${what} will be deleted. "${confirmEmpty.name}" itself stays, as the folder new scratchpads go to. This cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={() => emptyDefault(confirmEmpty)}
            onCancel={() => setConfirmEmpty(null)}
          />
        );
      })()}

      {menu && (
        <ContextMenu
          items={menuItems()}
          position={{ x: menu.x, y: menu.y }}
          onSelect={onMenuSelect}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
