/**
 * A tab group's chip on the strip, and the panel that edits it — Chrome's
 * and Edge's design.
 *
 * The chip is only a label: a filled pill in the group's colour with its
 * name, or a dot when it has none. Click folds the group to the chip and a
 * count. Everything else — the name, the colour, the actions — lives in a
 * small panel under the chip: it opens by itself on a group just made, on a
 * double-click, a right-click, or F2.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlusIcon, CloseCircleIcon, ChevronRightIcon, LayersIcon, CheckIcon } from '../../icons';
import { GROUP_COLORS, type TabGroup } from '../../services/tabs/tab-groups';

const COLOR_NAMES = ['Blue', 'Amber', 'Green', 'Pink', 'Violet', 'Cyan', 'Red', 'Grey'];

export function TabGroupChip({
  group, count, editing, onEditDone, onToggle, onRename, onRecolor, onNewTab, onUngroup, onCloseGroup,
  isOver, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}: {
  group: TabGroup;
  count: number;
  /** Arrives with its panel open — a group just made. */
  editing: boolean;
  onEditDone: () => void;
  onToggle: () => void;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onNewTab: () => void;
  onUngroup: () => void;
  onCloseGroup: () => void;
  isOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const chipRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<DOMRect | null>(null);
  const open = () => { if (chipRef.current) setPanel(chipRef.current.getBoundingClientRect()); };
  const close = () => { setPanel(null); onEditDone(); };

  useEffect(() => { if (editing) open(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [editing]);

  const named = !!group.name;
  return (
    <>
      <div
        ref={chipRef}
        className={`dk-tgchip${named ? '' : ' is-dot'}${group.collapsed ? ' is-collapsed' : ''}${isOver ? ' is-over' : ''}${panel ? ' is-editing' : ''}`}
        style={{ '--tg': group.color } as React.CSSProperties}
        role="button"
        tabIndex={0}
        aria-expanded={!group.collapsed}
        aria-label={`${group.name || 'Unnamed group'}, ${count} tab${count === 1 ? '' : 's'}, ${group.collapsed ? 'folded' : 'open'}`}
        title={`${group.name || 'Group'} · ${count} tab${count === 1 ? '' : 's'}\nClick to ${group.collapsed ? 'open' : 'fold'} · double-click or right-click to edit`}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onToggle}
        onDoubleClick={e => { e.preventDefault(); open(); }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); open(); }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
          if (e.key === 'F2') { e.preventDefault(); open(); }
        }}
      >
        {named ? <span className="dk-tgchip__name">{group.name}</span> : <span className="dk-tgchip__dot" />}
        {group.collapsed && <span className="dk-tgchip__count">{count}</span>}
      </div>
      {panel && (
        <GroupPanel
          group={group}
          count={count}
          anchor={panel}
          onRename={onRename}
          onRecolor={onRecolor}
          onClose={close}
          actions={{
            newTab: () => { close(); onNewTab(); },
            toggle: () => { close(); onToggle(); },
            ungroup: () => { close(); onUngroup(); },
            closeGroup: () => { close(); onCloseGroup(); },
          }}
        />
      )}
    </>
  );
}

/** The panel under a chip: name, colour, and what to do with the group. */
function GroupPanel({ group, count, anchor, onRename, onRecolor, onClose, actions }: {
  group: TabGroup;
  count: number;
  anchor: DOMRect;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onClose: () => void;
  actions: { newTab: () => void; toggle: () => void; ungroup: () => void; closeGroup: () => void };
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(group.name);

  /* The name is kept as it is typed, so closing the panel any way keeps it. */
  useEffect(() => { if (name !== group.name) onRename(name); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [name]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose]);

  const colors = GROUP_COLORS.includes(group.color) ? GROUP_COLORS : [group.color, ...GROUP_COLORS];
  const width = 248;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));

  return createPortal(
    <div
      ref={boxRef}
      className="dk-tgpanel"
      style={{ left, top: anchor.bottom + 8, width, '--tg': group.color } as React.CSSProperties}
      role="dialog"
      aria-label="Edit tab group"
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
    >
      <input
        className="dk-tgpanel__name"
        value={name}
        placeholder="Name this group"
        aria-label="Group name"
        autoFocus
        spellCheck={false}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onClose(); } }}
      />
      <div className="dk-tgpanel__swatches" role="radiogroup" aria-label="Group colour">
        {colors.map(c => {
          const on = c === group.color;
          const label = GROUP_COLORS.includes(c) ? COLOR_NAMES[GROUP_COLORS.indexOf(c)] : 'Protocol colour';
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={label}
              title={label}
              className={`dk-tgpanel__swatch${on ? ' is-on' : ''}`}
              style={{ '--sw': c } as React.CSSProperties}
              onClick={() => onRecolor(c)}
            >
              {on && <CheckIcon size={10} strokeWidth={3} />}
            </button>
          );
        })}
      </div>
      <div className="dk-tgpanel__sep" />
      <button type="button" className="dk-tgpanel__item" onClick={actions.newTab}>
        <PlusIcon size={13} /> New tab in group
      </button>
      <button type="button" className="dk-tgpanel__item" onClick={actions.toggle}>
        <ChevronRightIcon size={13} style={{ transform: group.collapsed ? undefined : 'rotate(90deg)' }} />
        {group.collapsed ? 'Expand group' : 'Collapse group'}
      </button>
      <button type="button" className="dk-tgpanel__item" onClick={actions.ungroup}>
        <LayersIcon size={13} /> Ungroup
      </button>
      <button type="button" className="dk-tgpanel__item is-danger" onClick={actions.closeGroup}>
        <CloseCircleIcon size={13} /> {count === 1 ? 'Close group and its tab' : `Close group and its ${count} tabs`}
      </button>
    </div>,
    document.body,
  );
}
