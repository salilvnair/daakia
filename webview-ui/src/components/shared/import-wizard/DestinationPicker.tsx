/**
 * Where an import lands: which workspace, and a new collection or one you
 * already have.
 *
 * Two cards rather than a tree with a "+ New" row in it. The tree-only version
 * left the default — a new collection — selected but invisible: nothing in the
 * tree was highlighted, and an empty workspace said "No collections yet" as if
 * the import had nowhere to go.
 *
 * The workspace is a real choice, because "the active workspace" is a thing
 * people forget they changed. Switching it here switches the app's, the same
 * as the title bar does, and the collection list follows.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconButtonView, SelectInputView } from '@salilvnair/dui';
import { CheckIcon, ChevronRightIcon, FolderIcon, FolderPlusIcon, LayoutGridIcon, SearchIcon } from '../../../icons';
import { useWorkspaceStore } from '../../../store/workspace-store';
import { postMsg } from '../../../vscode';
import './import-wizard.css';

export interface CollectionNode { id: string; name: string; children?: CollectionNode[] }

export type Target =
  | { kind: 'new' }
  /** An existing collection or a folder inside one. `path` runs from the collection down. */
  | { kind: 'existing'; id: string; path: string[] };

export function targetLabel(t: Target, newName: string): string {
  return t.kind === 'new' ? newName : t.path.join(' / ');
}

export function DestinationPicker({ target, onTarget, newName, onNewName, existingHint }: {
  target: Target;
  onTarget: (t: Target) => void;
  newName: string;
  onNewName: (name: string) => void;
  /** What going into an existing collection means for this import. */
  existingHint?: ReactNode;
}) {
  const workspaces = useWorkspaceStore(w => w.workspaces);
  const activeId = useWorkspaceStore(w => w.activeId);
  const switchTo = useWorkspaceStore(w => w.switchTo);
  const [tree, setTree] = useState<CollectionNode[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');

  /* The active workspace's collections — a switch reloads them, so listen rather than read once. */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'collectionsData' || (e.data.protocol && e.data.protocol !== 'rest')) return;
      const list = (e.data.collections ?? e.data.data ?? []) as CollectionNode[];
      setTree(Array.isArray(list) ? list : []);
    };
    window.addEventListener('message', onMessage);
    postMsg({ type: 'getCollections', protocol: 'rest' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /* A collection picked in one workspace is not in the next. */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    onTarget({ kind: 'new' });
    postMsg({ type: 'getCollections', protocol: 'rest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const shown = useMemo(() => filterTree(tree, query.trim().toLowerCase()), [tree, query]);
  const searching = !!query.trim();

  const createFolder = (parent: CollectionNode, path: string[]) => {
    const name = folderName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    postMsg({ type: 'createFolder', id, name, parentId: parent.id, protocol: 'rest' });
    postMsg({ type: 'getCollections', protocol: 'rest' });
    setOpen(o => new Set(o).add(parent.id));
    onTarget({ kind: 'existing', id, path: [...path, name] });
    setCreatingIn(null);
    setFolderName('');
  };

  const rows = (nodes: CollectionNode[], depth: number, path: string[]): ReactNode[] => nodes.flatMap(n => {
    const kids = n.children ?? [];
    const here = [...path, n.name];
    const expanded = searching || open.has(n.id);
    const on = target.kind === 'existing' && target.id === n.id;
    const out: ReactNode[] = [(
      <div
        key={n.id}
        className={`dk-swi-pick${on ? ' is-on' : ''}`}
        style={{ paddingLeft: 4 + depth * 18 }}
        onClick={() => onTarget({ kind: 'existing', id: n.id, path: here })}
      >
        <button
          type="button"
          className="dk-swi-caret"
          style={{ visibility: kids.length ? 'visible' : 'hidden' }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={e => { e.stopPropagation(); setOpen(o => { const x = new Set(o); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; }); }}
        >
          <ChevronRightIcon size={11} style={{ transform: expanded ? 'rotate(90deg)' : undefined }} />
        </button>
        <FolderIcon size={14} className="dk-swi-folder" />
        <span className="dk-swi-name">{n.name}</span>
        <span className="dk-swi-rowbtns">
          <IconButtonView size="sm" icon={<FolderPlusIcon size={12} />} tooltip={`New folder inside ${n.name}`}
            onClick={(e?: React.MouseEvent) => { e?.stopPropagation(); setCreatingIn(n.id); setFolderName(''); setOpen(o => new Set(o).add(n.id)); }} />
        </span>
        {on && <CheckIcon size={13} className="dk-swi-pick__check" />}
      </div>
    )];
    if (creatingIn === n.id) {
      out.push(
        <div key={`${n.id}:new`} className="dk-swi-newrow" style={{ paddingLeft: 26 + (depth + 1) * 18 }}>
          <FolderIcon size={13} className="dk-swi-folder" />
          <input
            className="dk-swi-input"
            autoFocus
            value={folderName}
            placeholder={`Folder inside ${n.name}`}
            onChange={e => setFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); createFolder(n, here); }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCreatingIn(null); }
            }}
            onBlur={() => { if (!folderName.trim()) setCreatingIn(null); }}
          />
        </div>,
      );
    }
    if (expanded) out.push(...rows(kids, depth + 1, here));
    return out;
  });

  return (
    <div className="dk-swi-choices">
      <div className="dk-swi-field">
        <span className="dk-swi-eyebrow">Workspace</span>
        <div className="dk-swi-ws">
          <SelectInputView
            size="md"
            value={activeId ?? ''}
            onChange={id => switchTo(id)}
            options={workspaces.map(w => ({ value: w.id, label: w.name, icon: <LayoutGridIcon size={13} /> }))}
          />
        </div>
      </div>

      <span className="dk-swi-eyebrow" style={{ marginTop: 6 }}>Where it goes</span>

      <div className={`dk-swi-choice${target.kind === 'new' ? ' is-on' : ''}`} onClick={() => target.kind !== 'new' && onTarget({ kind: 'new' })}>
        <button type="button" className="dk-swi-choice__head" onClick={() => onTarget({ kind: 'new' })}>
          <span className="dk-swi-radio" /><b>A new collection</b>
        </button>
        {target.kind === 'new' && (
          <input className="dk-swi-input" style={{ fontFamily: 'var(--font-sans)' }} value={newName} onChange={e => onNewName(e.target.value)} aria-label="New collection name" placeholder="Collection name" />
        )}
      </div>

      <div className={`dk-swi-choice${target.kind === 'existing' ? ' is-on' : ''}`} onClick={() => { if (target.kind !== 'existing' && shown[0]) onTarget({ kind: 'existing', id: shown[0].id, path: [shown[0].name] }); }}>
        <button type="button" className="dk-swi-choice__head" disabled={tree.length === 0}>
          <span className="dk-swi-radio" /><b>Into a collection or folder you have</b>
          {tree.length === 0 && <span className="dk-swi-muted dk-swi-small">none in this workspace yet</span>}
        </button>
        {target.kind === 'existing' && (
          <>
            <div className="dk-swi-picker" onClick={e => e.stopPropagation()}>
              <label className="dk-swi-picker__search">
                <SearchIcon size={13} />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search collections and folders" />
              </label>
              <div className="dk-swi-picker__list">
                {rows(shown, 0, [])}
                {shown.length === 0 && <div className="dk-swi-picker__empty">Nothing matches that.</div>}
              </div>
            </div>
            {existingHint && <p className="dk-swi-muted dk-swi-small">{existingHint}</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** Keep a node when it matches, or when anything under it does. */
export function filterTree(nodes: CollectionNode[], q: string): CollectionNode[] {
  if (!q) return nodes;
  const out: CollectionNode[] = [];
  for (const n of nodes) {
    const kids = filterTree(n.children ?? [], q);
    if (n.name.toLowerCase().includes(q) || kids.length) out.push({ ...n, children: kids.length ? kids : n.children });
  }
  return out;
}
