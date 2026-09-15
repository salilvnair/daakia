/**
 * Where a scan's requests are about to go.
 *
 * ── Why this is not three fields in a footer ──
 *
 * It was: a name box, the workspace as a sentence, and a button. That hid two
 * decisions and got a third wrong. You could not put the requests into a
 * collection you already had; you could not see which workspace you were
 * writing into, let alone change it; and the base URL the scan had just worked
 * out was written into a collection variable and nowhere else, so it never
 * became an environment you could switch.
 *
 * Three decisions, so three controls, laid out the way daakia already lays out
 * a destination in Save as: a workspace pill, a searchable collection tree with
 * a `+ New` at the top, and the environment stated as a thing that will be
 * created rather than implied.
 *
 * The tree here is modelled on the one inside `SaveRequestModal`. That one
 * should eventually move here and both should use this — the picker is now in
 * two places, which is one more than it should be in.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderIcon, FolderOpenIcon, FolderPlusIcon, ChevronRightIcon, ChevronDownIcon, CheckIcon, LayoutGridIcon } from '../../../icons';
import { useWorkspaceStore } from '../../../store/workspace-store';
import { postMsg } from '../../../vscode';

const ACCENT = 'var(--color-sidebar-collections)';

export interface CollectionNode {
  id: string;
  name: string;
  children?: CollectionNode[];
}

export type Destination =
  /** A new collection, named. */
  | { kind: 'new'; name: string }
  /** An existing collection or folder, by id. */
  | { kind: 'existing'; id: string; name: string };

export function ScanDestination({
  destination, onDestination, envName, createEnv, onCreateEnv, baseUrl, defaultName,
}: {
  destination: Destination;
  onDestination: (d: Destination) => void;
  envName: string;
  createEnv: boolean;
  onCreateEnv: (on: boolean) => void;
  baseUrl?: string;
  /** What a new collection would be called — the repository's own name. */
  defaultName: string;
}) {
  const [tree, setTree] = useState<CollectionNode[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /*
    Creating a folder, and where.

    `null` means the root — a new collection. An id means inside that folder,
    which is the case the first version could not express at all: you could
    make a collection but never a folder inside one, so a scan could only ever
    land at the top level of the tree.
  */
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);
  const [newName, setNewName] = useState('');

  /* The collections of the workspace that is active right now — switching
     workspace reloads them, which is why this listens rather than reads once. */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'collectionsData') return;
      const list = (e.data.collections ?? e.data.data ?? []) as CollectionNode[];
      setTree(Array.isArray(list) ? list : []);
    };
    window.addEventListener('message', onMessage);
    postMsg({ type: 'getCollections', protocol: 'rest' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const shown = useMemo(() => filterTree(tree, query.trim().toLowerCase()), [tree, query]);

  /** Create it, select it, and open its parent so it can be seen. */
  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    postMsg({ type: 'createFolder', id, name, parentId: creatingIn ?? null, protocol: 'rest' });
    if (creatingIn) setExpanded(prev => new Set(prev).add(creatingIn));
    onDestination({ kind: 'existing', id, name });
    setCreatingIn(undefined);
    setNewName('');
    /* The tree is the host's; ask for it again rather than patching a copy. */
    postMsg({ type: 'getCollections', protocol: 'rest' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <WorkspaceRow />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Label>Where the requests go</Label>
        <div style={{
          borderRadius: 8, overflow: 'hidden',
          border: '1px solid var(--color-input-border)', background: 'var(--color-input-bg)',
        }}>
          <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--color-surface-border)' }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search collections…"
              style={{
                width: '100%', height: 26, background: 'transparent', border: 'none',
                outline: 'none', fontSize: 12, color: 'var(--color-text-primary)',
              }}
            />
          </div>

          {/* A new collection at the root. Each folder below has its own `+`
              for creating inside it. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '6px 12px',
            borderBottom: '1px solid var(--color-surface-border)',
          }}>
            <button
              type="button"
              onClick={() => { setCreatingIn(null); setNewName(defaultName); }}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 12.5, color: ACCENT,
              }}
            >+ New collection</button>
          </div>

          {creatingIn !== undefined && (
            <CreateRow
              parentName={creatingIn ? nameOfId(tree, creatingIn) : undefined}
              value={newName}
              onChange={setNewName}
              onCommit={create}
              onCancel={() => { setCreatingIn(undefined); setNewName(''); }}
            />
          )}

          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {shown.map(node => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                expanded={expanded}
                onToggleExpand={(id) => setExpanded(prev => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
                selectedId={destination.kind === 'existing' ? destination.id : undefined}
                onSelect={(n) => onDestination({ kind: 'existing', id: n.id, name: n.name })}
                onCreateInside={(n) => {
                  setCreatingIn(n.id);
                  setNewName('');
                  setExpanded(prev => new Set(prev).add(n.id));
                }}
              />
            ))}
            {shown.length === 0 && (
              <div style={{ padding: '10px 14px', fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                {query ? 'No collection matches that.' : 'No collections in this workspace yet.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/*
        The environment.

        The scan works out a base URL and every request is written against
        `{{baseUrl}}` — so without an environment holding it, the collection
        arrives pointing at nothing until somebody makes one by hand. Stated as
        a thing that will happen, with the value visible, and refusable.
      */}
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
        padding: '10px 12px', borderRadius: 8,
        background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
      }}>
        <span
          onClick={e => { e.preventDefault(); onCreateEnv(!createEnv); }}
          style={{
            width: 15, height: 15, borderRadius: 4, marginTop: 1, flexShrink: 0,
            display: 'grid', placeItems: 'center',
            border: `1.5px solid ${createEnv ? ACCENT : 'var(--color-surface-border)'}`,
            background: createEnv ? ACCENT : 'transparent',
          }}
        >
          {createEnv && <CheckIcon size={10} color="var(--color-panel)" />}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}
              onClick={e => { e.preventDefault(); onCreateEnv(!createEnv); }}>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>
            Create an environment named <b>{envName}</b>
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
            baseUrl = {baseUrl ?? 'http://localhost:8080'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Every request is written against <code>{'{{baseUrl}}'}</code>. Without an environment
            holding it, the collection points at nothing until you make one.
          </span>
        </span>
      </label>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase',
      color: 'var(--color-text-muted)',
    }}>{children}</span>
  );
}

/**
 * Which workspace this lands in — shown, and changeable.
 *
 * A scan writes into the active workspace, and "active workspace" is a thing
 * people forget they changed. The pill is the same one the title bar uses, so
 * it reads as the same fact rather than as a setting this modal invented.
 */
function WorkspaceRow() {
  const workspaces = useWorkspaceStore(w => w.workspaces);
  const activeId = useWorkspaceStore(w => w.activeId);
  const [open, setOpen] = useState(false);
  const active = workspaces.find(w => w.id === activeId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Label>Workspace</Label>
      <div style={{ position: 'relative', alignSelf: 'flex-start' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '6px 11px', borderRadius: 7, fontSize: 12.5,
            color: 'var(--color-text-primary)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
          }}
        >
          <LayoutGridIcon size={13} color={ACCENT} />
          {active?.name ?? 'Workspace'}
          <ChevronDownIcon size={11} color="var(--color-text-muted)" />
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20,
            minWidth: 200, padding: 4, borderRadius: 7,
            background: 'var(--color-elevated)', border: '1px solid var(--color-border, var(--color-surface-border))',
            boxShadow: '0 12px 30px rgba(0,0,0,.55)',
          }}>
            {workspaces.map(w => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  if (w.id !== activeId) postMsg({ type: 'switchWorkspace', id: w.id });
                  setOpen(false);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '6px 9px', borderRadius: 5, cursor: 'pointer',
                  background: w.id === activeId ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'none',
                  border: 'none', textAlign: 'left', fontSize: 12.5,
                  color: w.id === activeId ? ACCENT : 'var(--color-text-secondary)',
                }}
              >
                <LayoutGridIcon size={12} />
                {w.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The inline "name it" row, for a new collection or a new folder inside one.
 *
 * It says which parent it is going into, because `+ New` at the top and `+` on
 * a folder produce the same-looking input and the difference is the whole
 * point of having both.
 */
function CreateRow({ parentName, value, onChange, onCommit, onCancel }: {
  parentName?: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
      borderBottom: '1px solid var(--color-surface-border)',
      background: 'var(--color-item-hover-bg)',
    }}>
      <FolderIcon size={13} color="var(--color-text-muted)" />
      <input
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onCommit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        placeholder={parentName ? `Folder inside ${parentName}…` : 'Collection name…'}
        style={{
          flex: 1, minWidth: 0, height: 24, background: 'transparent', border: 'none',
          outline: 'none', fontSize: 12, color: 'var(--color-text-primary)',
        }}
      />
      <button type="button" onClick={onCommit} disabled={!value.trim()}
              style={{
                background: 'none', border: 'none', cursor: value.trim() ? 'pointer' : 'default',
                fontSize: 11.5, color: value.trim() ? ACCENT : 'var(--color-text-muted)', padding: 0,
              }}>Create</button>
      <button type="button" onClick={onCancel}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5,
                       color: 'var(--color-text-muted)', padding: 0 }}>Cancel</button>
    </div>
  );
}

/** A folder's name, by id, anywhere in the tree. */
export function nameOfId(nodes: CollectionNode[], id: string): string | undefined {
  for (const n of nodes) {
    if (n.id === id) return n.name;
    const inner = nameOfId(n.children ?? [], id);
    if (inner) return inner;
  }
  return undefined;
}

function TreeRow({ node, depth, expanded, onToggleExpand, selectedId, onSelect, onCreateInside }: {
  node: CollectionNode; depth: number;
  expanded: Set<string>; onToggleExpand: (id: string) => void;
  selectedId?: string; onSelect: (n: CollectionNode) => void;
  onCreateInside: (n: CollectionNode) => void;
}) {
  const kids = node.children ?? [];
  const isOpen = expanded.has(node.id);
  const selected = selectedId === node.id;

  return (
    <>
      <div
        onClick={() => onSelect(node)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
          padding: '5px 12px', paddingLeft: 12 + depth * 16,
          background: selected ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : undefined,
          fontSize: 12.5, color: selected ? ACCENT : 'var(--color-text-secondary)',
        }}
      >
        <span
          onClick={e => { e.stopPropagation(); if (kids.length) onToggleExpand(node.id); }}
          style={{ width: 12, display: 'grid', placeItems: 'center', flexShrink: 0 }}
        >
          {kids.length > 0 && (isOpen
            ? <ChevronDownIcon size={10} color="var(--color-text-muted)" />
            : <ChevronRightIcon size={10} color="var(--color-text-muted)" />)}
        </span>
        {isOpen && kids.length
          ? <FolderOpenIcon size={13} color={selected ? ACCENT : 'var(--color-text-muted)'} />
          : <FolderIcon size={13} color={selected ? ACCENT : 'var(--color-text-muted)'} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
        <span style={{ flex: 1 }} />
        {selected && <CheckIcon size={12} color={ACCENT} />}
        {/* A folder inside this one. Without it the picker can only ever offer
            the tree as it already is, which is not a picker so much as a list. */}
        <button
          type="button"
          title={`New folder inside ${node.name}`}
          onClick={e => { e.stopPropagation(); onCreateInside(node); }}
          style={{
            background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer',
            display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)',
          }}
        >
          {/* The same folder-plus daakia uses for "new folder" everywhere else —
              a bare `+` beside a folder row reads as "add something", which is
              not the same promise. */}
          <FolderPlusIcon size={13} />
        </button>
      </div>
      {isOpen && kids.map(k => (
        <TreeRow
          key={k.id} node={k} depth={depth + 1}
          expanded={expanded} onToggleExpand={onToggleExpand}
          selectedId={selectedId} onSelect={onSelect} onCreateInside={onCreateInside}
        />
      ))}
    </>
  );
}

/**
 * Keep a node when it matches, or when anything under it does.
 *
 * A search that hid a matching child because its parent did not match would
 * make deep collections unsearchable, which is when searching matters most.
 */
export function filterTree(nodes: CollectionNode[], q: string): CollectionNode[] {
  if (!q) return nodes;
  const out: CollectionNode[] = [];
  for (const n of nodes) {
    const kids = filterTree(n.children ?? [], q);
    if (n.name.toLowerCase().includes(q) || kids.length) {
      out.push({ ...n, children: kids.length ? kids : n.children });
    }
  }
  return out;
}
