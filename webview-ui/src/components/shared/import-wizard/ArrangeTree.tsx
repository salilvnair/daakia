/**
 * The folder tree an import is arranged in before anything is created.
 *
 * Drag a request by its handle onto a folder to move it there, or onto
 * another request to go just above it; drag a folder onto a folder to nest
 * it. Folder names are edited in place. Every change is one of the pure
 * functions in `arrange.ts`, so this file is only the pointer work.
 *
 * What a request row says is the wizard's business — `renderRequest` draws
 * everything after the tick box.
 */
import { useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ButtonView, CheckboxView, IconButtonView, TextInputView } from '@salilvnair/dui';
import { ChevronRightIcon, DragHandleIcon, FolderIcon, PlusIcon, SearchIcon, TrashIcon } from '../../../icons';
import {
  moveInto, moveBefore, canDropInto, addFolder, unwrapFolder, renameFolder, toggleOpen, setOn,
  requestsUnder, treeRows, type Arrangement, type ArrangeRequest, type Dragged,
} from '../../../services/openapi-url/arrange';
import './import-wizard.css';

/** What the filter bar reads off a request: its verb, and the words a search looks in. */
export interface RequestFacts { method: string; text: string }

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function ArrangeTree({
  arr, setArr, rootName, onRootName, total, renderRequest, focusedId, onFocus, footer, describe,
}: {
  arr: Arrangement;
  setArr: Dispatch<SetStateAction<Arrangement>>;
  rootName: string;
  onRootName: (name: string) => void;
  total: number;
  renderRequest: (r: ArrangeRequest) => ReactNode;
  /** A request the wizard is showing more of, beside the tree. */
  focusedId?: string;
  onFocus?: (opId: string) => void;
  /** Drawn under the tree, inside its scroll. */
  footer?: ReactNode;
  /**
   * Given, the tree gets a filter bar: a search box, a chip per method, and
   * Check all / Uncheck all for what the filter shows.
   */
  describe?: (r: ArrangeRequest) => RequestFacts;
}) {
  const dragged = useRef<Dragged | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const onCount = arr.requests.filter(r => r.on).length;

  /* -- Filter: a search and a set of methods, empty meaning every one. -- */
  const [query, setQuery] = useState('');
  const [methods, setMethods] = useState<ReadonlySet<string>>(() => new Set());
  const facts = useMemo(
    () => new Map(describe ? arr.requests.map(r => [r.opId, describe(r)] as const) : []),
    [arr.requests, describe],
  );
  const methodCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of facts.values()) m.set(f.method, (m.get(f.method) ?? 0) + 1);
    return [...m.entries()].sort((a, b) =>
      (METHOD_ORDER.indexOf(a[0]) + 1 || 99) - (METHOD_ORDER.indexOf(b[0]) + 1 || 99) || a[0].localeCompare(b[0]));
  }, [facts]);
  const q = query.trim().toLowerCase();
  const filtering = !!describe && (!!q || methods.size > 0);
  const matches = (r: ArrangeRequest) => {
    if (!filtering) return true;
    const f = facts.get(r.opId);
    if (!f) return false;
    return (methods.size === 0 || methods.has(f.method)) && (!q || f.text.toLowerCase().includes(q));
  };
  const shown = filtering ? arr.requests.filter(matches) : arr.requests;
  const shownIds = new Set(shown.map(r => r.opId));
  const shownOn = shown.filter(r => r.on).length;
  const toggleMethod = (m: string) => setMethods(prev => {
    const next = new Set(prev);
    if (next.has(m)) next.delete(m); else next.add(m);
    return next;
  });
  /* While filtering every folder is open: a match inside a closed folder is
     a match nobody sees. Folders with no match in them drop out. */
  const rows = filtering
    ? treeRows({ ...arr, folders: arr.folders.map(f => ({ ...f, open: true })) }).filter(row =>
      row.kind === 'request' ? shownIds.has(row.request.opId) : requestsUnder(arr, row.folder.id).some(r => shownIds.has(r.opId)))
    : treeRows(arr);

  const startDrag = (d: Dragged) => (e: React.DragEvent) => {
    dragged.current = d;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', d.id); } catch { /* some engines refuse custom data */ }
    setTimeout(() => setDragId(d.id), 0);
  };
  const endDrag = () => { dragged.current = null; setDragId(null); setOver(null); };
  const overTarget = (key: string, ok: () => boolean) => (e: React.DragEvent) => {
    if (!dragged.current || !ok()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (over !== key) setOver(key);
  };
  const leave = (key: string) => () => { if (over === key) setOver(null); };
  /*
    Read the dragged item before endDrag clears it: React runs the updater
    later, and an updater reading the ref found null and threw — which took
    the whole page down on the first drop.
  */
  const dropInto = (folderId: string | null) => (e: React.DragEvent) => {
    e.preventDefault();
    const d = dragged.current;
    if (d) setArr(a => moveInto(a, d, folderId));
    endDrag();
  };
  const dropBefore = (opId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const d = dragged.current;
    if (d) setArr(a => moveBefore(a, d, opId));
    endDrag();
  };

  return (
    <div className="dk-swi-tree">
      {describe && (
        <div className="dk-swi-filter">
          <div className="dk-swi-filter__row">
            <TextInputView
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name or path"
              iconLeft={<SearchIcon size={12} />}
              size="sm"
              width="fullWidth"
              spellCheck={false}
              aria-label="Search requests"
            />
            <ButtonView size="sm" variant="ghost" disabled={shown.length === 0 || shownOn === shown.length}
              onClick={() => setArr(a => setOn(a, shownIds, true))}>
              Check all
            </ButtonView>
            <ButtonView size="sm" variant="ghost" disabled={shownOn === 0}
              onClick={() => setArr(a => setOn(a, shownIds, false))}>
              Uncheck all
            </ButtonView>
          </div>
          <div className="dk-swi-filter__chips" role="group" aria-label="Filter by method">
            <button type="button" className={`dk-swi-chip${methods.size === 0 ? ' is-on' : ''}`} aria-pressed={methods.size === 0} onClick={() => setMethods(new Set())}>
              All <span>{arr.requests.length}</span>
            </button>
            {methodCounts.map(([m, n]) => (
              <button key={m} type="button" className={`dk-swi-chip${methods.has(m) ? ' is-on' : ''}`} aria-pressed={methods.has(m)}
                style={{ '--chip': METHOD_ORDER.includes(m) ? `var(--color-method-${m.toLowerCase()})` : 'var(--color-text-secondary)' } as React.CSSProperties}
                onClick={() => toggleMethod(m)}>
                {m} <span>{n}</span>
              </button>
            ))}
            {filtering && (
              <span className="dk-swi-filter__note">
                {shown.length} shown{shown.length ? ' · Check all and Uncheck all act on these' : ''}
              </span>
            )}
          </div>
        </div>
      )}
      <div className="dk-swi-root">
        <FolderIcon size={15} />
        <input className="dk-swi-fname dk-swi-fname--root" value={rootName} onChange={e => onRootName(e.target.value)} aria-label="Collection name" />
        <span className="dk-swi-count">{onCount} of {total}</span>
      </div>
      {filtering && shown.length === 0 && (
        <p className="dk-swi-filter__none">
          No request matches{q ? ` "${query.trim()}"` : ''}{methods.size ? ` in ${[...methods].join(', ')}` : ''}.
        </p>
      )}
      {rows.map(row => {
        const pad = 8 + row.depth * 22;
        if (row.kind === 'folder') {
          const f = row.folder;
          const key = `f:${f.id}`;
          /* Filtering, a folder's tick covers what the filter shows in it. */
          const under = requestsUnder(arr, f.id).filter(r => !filtering || shownIds.has(r.opId));
          const ids = new Set(under.map(r => r.opId));
          const underOn = under.filter(r => r.on).length;
          const all = under.length > 0 && underOn === under.length;
          return (
            <div
              key={key}
              className={`dk-swi-row${over === key ? ' is-over' : ''}${dragId === f.id ? ' is-dragging' : ''}`}
              style={{ paddingLeft: pad }}
              onDragOver={overTarget(key, () => canDropInto(arr, dragged.current!, f.id))}
              onDragLeave={leave(key)}
              onDrop={dropInto(f.id)}
            >
              <span className="dk-swi-grip" draggable onDragStart={startDrag({ kind: 'folder', id: f.id })} onDragEnd={endDrag} title="Drag to move"><DragHandleIcon size={13} /></span>
              <CheckboxView size="sm" checked={all} indeterminate={underOn > 0 && !all} onChange={() => setArr(a => setOn(a, ids, !all))} />
              <button type="button" className="dk-swi-caret" aria-expanded={f.open} aria-label={f.open ? 'Collapse' : 'Expand'} onClick={() => setArr(a => toggleOpen(a, f.id))}>
                <ChevronRightIcon size={12} style={{ transform: f.open || filtering ? 'rotate(90deg)' : undefined }} />
              </button>
              <FolderIcon size={14} className="dk-swi-folder" />
              <input className="dk-swi-fname" value={f.name} onChange={e => setArr(a => renameFolder(a, f.id, e.target.value))} aria-label="Folder name" />
              <span className="dk-swi-count">{row.on}/{row.total}</span>
              <span className="dk-swi-rowbtns">
                <IconButtonView size="sm" icon={<PlusIcon size={12} />} tooltip="New subfolder" onClick={() => setArr(a => addFolder(a, f.id).next)} />
                <IconButtonView size="sm" icon={<TrashIcon size={12} />} tooltip="Remove folder, keep its requests" onClick={() => setArr(a => unwrapFolder(a, f.id))} />
              </span>
            </div>
          );
        }
        const r = row.request;
        const key = `r:${r.opId}`;
        return (
          <div
            key={key}
            className={`dk-swi-row${over === key ? ' is-before' : ''}${dragId === r.opId ? ' is-dragging' : ''}${r.on ? '' : ' is-off'}${focusedId === r.opId ? ' is-focused' : ''}${onFocus ? ' dk-swi-row--click' : ''}`}
            style={{ paddingLeft: pad + 22 }}
            onClick={onFocus ? () => onFocus(r.opId) : undefined}
            onDragOver={overTarget(key, () => true)}
            onDragLeave={leave(key)}
            onDrop={dropBefore(r.opId)}
          >
            <span className="dk-swi-grip" draggable onDragStart={startDrag({ kind: 'request', id: r.opId })} onDragEnd={endDrag} title="Drag to move"><DragHandleIcon size={13} /></span>
            <span onClick={e => e.stopPropagation()} style={{ display: 'contents' }}>
              <CheckboxView size="sm" checked={r.on} onChange={on => setArr(a => setOn(a, new Set([r.opId]), on))} />
            </span>
            {renderRequest(r)}
          </div>
        );
      })}
      <div
        className={`dk-swi-droproot${over === 'root' ? ' is-over' : ''}`}
        onDragOver={overTarget('root', () => true)}
        onDragLeave={leave('root')}
        onDrop={dropInto(null)}
      >
        Drop here for the top level
      </div>
      {footer}
    </div>
  );
}
