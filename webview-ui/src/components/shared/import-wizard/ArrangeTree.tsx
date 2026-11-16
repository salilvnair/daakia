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
import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { CheckboxView, IconButtonView } from '@salilvnair/dui';
import { ChevronRightIcon, DragHandleIcon, FolderIcon, PlusIcon, TrashIcon } from '../../../icons';
import {
  moveInto, moveBefore, canDropInto, addFolder, unwrapFolder, renameFolder, toggleOpen, setOn,
  requestsUnder, treeRows, type Arrangement, type ArrangeRequest, type Dragged,
} from '../../../services/openapi-url/arrange';
import './import-wizard.css';

export function ArrangeTree({
  arr, setArr, rootName, onRootName, total, renderRequest, focusedId, onFocus, footer,
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
}) {
  const dragged = useRef<Dragged | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const onCount = arr.requests.filter(r => r.on).length;

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
      <div className="dk-swi-root">
        <FolderIcon size={15} />
        <input className="dk-swi-fname dk-swi-fname--root" value={rootName} onChange={e => onRootName(e.target.value)} aria-label="Collection name" />
        <span className="dk-swi-count">{onCount} of {total}</span>
      </div>
      {treeRows(arr).map(row => {
        const pad = 8 + row.depth * 22;
        if (row.kind === 'folder') {
          const f = row.folder;
          const key = `f:${f.id}`;
          const ids = new Set(requestsUnder(arr, f.id).map(r => r.opId));
          const all = row.total > 0 && row.on === row.total;
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
              <CheckboxView size="sm" checked={all} indeterminate={row.on > 0 && !all} onChange={() => setArr(a => setOn(a, ids, !all))} />
              <button type="button" className="dk-swi-caret" aria-expanded={f.open} aria-label={f.open ? 'Collapse' : 'Expand'} onClick={() => setArr(a => toggleOpen(a, f.id))}>
                <ChevronRightIcon size={12} style={{ transform: f.open ? 'rotate(90deg)' : undefined }} />
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
