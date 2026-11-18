/**
 * A tab group's chip on the strip: its colour and name, in front of its tabs.
 *
 * Click folds the group to just the chip and a count, and opens it again.
 * Double-click renames it in place; a new group arrives already renaming.
 * Right-click for the rest: colour, a new tab in the group, ungroup, close.
 */
import { useEffect, useRef, useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '../shared';
import { RenameIcon, PlusIcon, CloseCircleIcon, ChevronRightIcon, LayersIcon } from '../../icons';
import { GROUP_COLORS, type TabGroup } from '../../services/tabs/tab-groups';

const COLOR_NAMES = ['Blue', 'Amber', 'Green', 'Pink', 'Violet', 'Cyan', 'Red', 'Grey'];

const Dot = ({ color }: { color: string }) => (
  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color }} />
);

export function TabGroupChip({
  group, count, editing, onEditDone, onToggle, onRename, onRecolor, onNewTab, onUngroup, onCloseGroup,
  isOver, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}: {
  group: TabGroup;
  count: number;
  /** Arrives renaming — a group just made. */
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
  const [renaming, setRenaming] = useState(editing);
  const [value, setValue] = useState(group.name);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) { setValue(group.name); setRenaming(true); } }, [editing, group.name]);
  useEffect(() => { if (renaming) inputRef.current?.select(); }, [renaming]);

  const finish = (commit: boolean) => {
    if (commit) onRename(value);
    setRenaming(false);
    onEditDone();
  };

  /* The colours offered: the eight, plus the group's own when a protocol group wears its protocol's. */
  const colors = GROUP_COLORS.includes(group.color) ? GROUP_COLORS : [group.color, ...GROUP_COLORS];
  const items: ContextMenuItem[] = [
    { id: 'rename', label: 'Rename group', icon: <RenameIcon size={13} />, iconColor: 'var(--color-ctx-rename)' },
    {
      id: 'color', label: 'Colour', icon: <Dot color={group.color} />,
      submenu: colors.map(c => ({
        id: c,
        label: GROUP_COLORS.includes(c) ? COLOR_NAMES[GROUP_COLORS.indexOf(c)] : 'Protocol colour',
        icon: <Dot color={c} />,
        checked: c === group.color,
      })),
    },
    { id: 'new-tab', label: 'New tab in group', icon: <PlusIcon size={13} />, iconColor: group.color },
    { id: 'toggle', label: group.collapsed ? 'Expand group' : 'Collapse group', icon: <ChevronRightIcon size={13} />, iconColor: 'var(--color-text-muted)' },
    { id: 'sep', label: '', separator: true },
    { id: 'ungroup', label: 'Ungroup', icon: <LayersIcon size={13} />, iconColor: 'var(--color-text-muted)' },
    { id: 'close', label: count === 1 ? 'Close group and its tab' : `Close group and its ${count} tabs`, icon: <CloseCircleIcon size={13} />, danger: true },
  ];

  const onSelect = (id: string, subId?: string) => {
    if (id === 'rename') { setValue(group.name); setRenaming(true); }
    else if (id === 'color' && subId) onRecolor(subId);
    else if (id === 'new-tab') onNewTab();
    else if (id === 'toggle') onToggle();
    else if (id === 'ungroup') onUngroup();
    else if (id === 'close') onCloseGroup();
  };

  return (
    <>
      <div
        className={`dk-tabgroup-chip${group.collapsed ? ' is-collapsed' : ''}${isOver ? ' is-over' : ''}${group.name || renaming ? '' : ' is-unnamed'}`}
        style={{ '--tg': group.color } as React.CSSProperties}
        role="button"
        tabIndex={0}
        aria-expanded={!group.collapsed}
        aria-label={`${group.name || 'Unnamed group'}, ${count} tab${count === 1 ? '' : 's'}, ${group.collapsed ? 'folded' : 'open'}`}
        title={`${group.name || 'Group'} · ${count} tab${count === 1 ? '' : 's'} — click to ${group.collapsed ? 'open' : 'fold'}, double-click to rename`}
        draggable={!renaming}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => { if (!renaming) onToggle(); }}
        onDoubleClick={e => { e.preventDefault(); setValue(group.name); setRenaming(true); }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
        onKeyDown={e => {
          if (renaming) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
          if (e.key === 'F2') setRenaming(true);
        }}
      >
        <span className="dk-tabgroup-chip__dot" />
        {renaming ? (
          <input
            ref={inputRef}
            className="dk-tabgroup-chip__input"
            value={value}
            placeholder="Name this group"
            aria-label="Group name"
            onChange={e => setValue(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') finish(true);
              if (e.key === 'Escape') finish(false);
            }}
            onBlur={() => finish(true)}
            autoFocus
          />
        ) : group.name ? (
          <span className="dk-tabgroup-chip__name">{group.name}</span>
        ) : null}
        {group.collapsed && !renaming && <span className="dk-tabgroup-chip__count">{count}</span>}
      </div>
      {menu && (
        <ContextMenu items={items} position={menu} onSelect={onSelect} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
