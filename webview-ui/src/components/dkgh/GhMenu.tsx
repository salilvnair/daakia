/**
 * Right-click, anywhere in the tab.
 *
 * The webview's own menu offers Copy and Select All, which is what a browser
 * has to say about a page it knows nothing about. This one knows what is under
 * the pointer: right-click an issue and it offers the things you do to an
 * issue, right-click a facet and it offers `only` and `except`, right-click a
 * column heading and it offers the sort you were about to click twice for.
 *
 * **One listener, at the root.** Every place that can be right-clicked is
 * already marked in the DOM — `data-issue` on a card and a table row,
 * `data-view` on a saved view, `data-facet` on a facet row — so the menu is
 * resolved by walking up from the event target rather than by hanging a handler
 * on every element that might want one. A new place gets a menu by carrying a
 * data attribute, and nothing in this file has to be threaded through the tree.
 *
 * **What it offers is what is on screen.** Nothing here is a second way to do
 * something the tab cannot already do — every item maps onto a control that
 * exists, which is what keeps the menu honest as the board grows. The shortcut
 * column is the same reason: a menu that teaches you the key you should have
 * pressed is a menu you need less each time.
 */
import { useCallback, useState } from 'react';
import { ContextMenuView, type ContextMenuItem } from '@salilvnair/dui';
import {
  CopyIcon, LinkIcon, PinIcon, UnpinIcon, EyeOffIcon, TrashIcon, RefreshIcon,
  KeyboardIcon, FilterIcon, SettingsIcon, PlusIcon, PencilIcon, CheckIcon,
  ArrowUpIcon, ArrowDownIcon, IssueOpenedIcon, TagIcon, UsersIcon, ClockIcon,
} from '../../icons';
import type { BoardIssue } from './board-types';
import type { SavedView } from './views-model';

const SZ = 12;

/** Everything the menu can ask the board to do. */
export interface MenuCtx {
  repo: string;
  /** Looked up by number, because the DOM only carries the number. */
  issueAt: (number: number) => BoardIssue | undefined;
  selected: Set<number>;
  onPeek: (issue: BoardIssue) => void;
  onOpenExternal: (issue: BoardIssue) => void;
  onSelect: (issue: BoardIssue) => void;
  onAct: (kind: 'assign' | 'label' | 'milestone' | 'close', numbers: number[]) => void;

  views: SavedView[];
  activeView?: string;
  defaultViewId?: string;
  onOpenView: (id: string | undefined) => void;
  onEditView: (view: SavedView) => void;
  onDefaultView: (view: SavedView) => void;
  onDeleteView: (view: SavedView) => void;
  onNewView: () => void;
  onManageViews: () => void;

  sectionLabel: (id: string) => string;
  onSection: (id: string) => void;

  onOnly: (field: string, value: string) => void;
  onExcept: (field: string, value: string) => void;
  onClearField: (field: string) => void;
  onClearFilters: () => void;
  hasFilters: boolean;
  query: string;

  columnLabel: (key: string) => string;
  isPinned: (key: string) => boolean;
  onSort: (key: string, dir: 'asc' | 'desc') => void;
  onPinColumn: (key: string) => void;
  onHideColumn: (key: string) => void;

  onRefresh: () => void;
  onPanel: (panel: 'filters' | 'view') => void;
  onKeys: () => void;
}

interface Placed { x: number; y: number; items: ContextMenuItem[] }

/**
 * The handler and the menu, for the board to spread onto its root.
 *
 * Returns nothing to render when the pointer is somewhere this file has no
 * opinion about — a text selection in the composer, say, where the webview's
 * own Copy is the right menu and taking it away would be worse than leaving it.
 */
export function useBoardMenu(ctx: MenuCtx) {
  const [placed, setPlaced] = useState<Placed | undefined>();

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    /* A selection means they are after Copy, and the browser's menu does that
       better than anything here could. */
    if (!window.getSelection()?.isCollapsed) return;

    const items = itemsFor(e.target as HTMLElement, ctx);
    if (items.length === 0) return;
    e.preventDefault();
    setPlaced({ x: e.clientX, y: e.clientY, items });
  }, [ctx]);

  const menu = (
    <ContextMenuView
      open={!!placed}
      anchorEl={null}
      position={placed ? { x: placed.x, y: placed.y } : undefined}
      onClose={() => setPlaced(undefined)}
      items={placed?.items ?? []}
      width="md"
    />
  );

  return { onContextMenu, node: menu };
}

/** Copy, and say nothing about it — the menu closing is the acknowledgement. */
function copy(text: string) {
  navigator.clipboard?.writeText(text);
}

function sep(id: string): ContextMenuItem {
  return { id, label: '', separator: true };
}

/**
 * What is under the pointer decides the menu.
 *
 * Most specific first: a facet row inside a panel inside the board matches all
 * three, and the row is what was clicked.
 */
export function itemsFor(from: HTMLElement, ctx: MenuCtx): ContextMenuItem[] {
  const at = <T extends Element>(sel: string) => from.closest(sel) as T | null;

  const issueEl = at<HTMLElement>('[data-issue]');
  if (issueEl) {
    const issue = ctx.issueAt(Number(issueEl.dataset.issue));
    if (issue) return issueItems(issue, ctx);
  }

  const viewEl = at<HTMLElement>('[data-view]');
  if (viewEl) {
    const view = ctx.views.find(v => v.id === viewEl.dataset.view);
    if (view) return viewItems(view, ctx);
  }

  const colEl = at<HTMLElement>('[data-col]');
  if (colEl?.dataset.col) return columnItems(colEl.dataset.col, ctx);

  const facetEl = at<HTMLElement>('[data-facet]');
  if (facetEl?.dataset.facet) {
    return facetItems(facetEl.dataset.facet, facetEl.dataset.value ?? '', ctx);
  }

  const chipEl = at<HTMLElement>('[data-chip]');
  if (chipEl?.dataset.chip) return chipItems(chipEl.dataset.chip, ctx);

  const secEl = at<HTMLElement>('[data-section]');
  if (secEl?.dataset.section) return sectionItems(secEl.dataset.section, ctx);

  return boardItems(ctx);
}

/**
 * An issue.
 *
 * The verbs act on the selection when there is one and this issue is in it,
 * and on this issue otherwise — the same rule the keyboard follows, said out
 * loud in the labels so nobody has to infer it. Anything else would mean the
 * menu and the keys disagreeing about what `close` closes.
 */
function issueItems(issue: BoardIssue, ctx: MenuCtx): ContextMenuItem[] {
  const inSelection = ctx.selected.has(issue.number);
  const numbers = inSelection ? [...ctx.selected] : [issue.number];
  const many = numbers.length > 1;
  const suffix = many ? ` (${numbers.length})` : '';

  return [
    {
      id: 'peek',
      label: 'Peek',
      shortcut: 'Space',
      icon: <IssueOpenedIcon size={SZ} />,
      onClick: () => ctx.onPeek(issue),
    },
    {
      id: 'open',
      label: 'Open on github.com',
      shortcut: 'O',
      icon: <LinkIcon size={SZ} />,
      onClick: () => ctx.onOpenExternal(issue),
    },
    {
      id: 'select',
      label: inSelection ? 'Take out of the selection' : 'Add to the selection',
      shortcut: 'Space',
      icon: <CheckIcon size={SZ} />,
      onClick: () => ctx.onSelect(issue),
    },
    sep('s1'),
    {
      id: 'assign',
      label: `Assign…${suffix}`,
      shortcut: 'A',
      icon: <UsersIcon size={SZ} />,
      onClick: () => ctx.onAct('assign', numbers),
    },
    {
      id: 'label',
      label: `Label…${suffix}`,
      shortcut: 'L',
      icon: <TagIcon size={SZ} />,
      onClick: () => ctx.onAct('label', numbers),
    },
    {
      id: 'milestone',
      label: `Milestone…${suffix}`,
      shortcut: 'M',
      icon: <ClockIcon size={SZ} />,
      onClick: () => ctx.onAct('milestone', numbers),
    },
    sep('s2'),
    {
      id: 'copy-number',
      label: `Copy #${issue.number}`,
      icon: <CopyIcon size={SZ} />,
      onClick: () => copy(`#${issue.number}`),
    },
    {
      id: 'copy-title',
      label: 'Copy the title',
      icon: <CopyIcon size={SZ} />,
      onClick: () => copy(issue.title),
    },
    {
      id: 'copy-link',
      label: 'Copy the link',
      icon: <LinkIcon size={SZ} />,
      onClick: () => copy(issue.url),
    },
    sep('s3'),
    {
      id: 'close',
      label: issue.state === 'OPEN' ? `Close${suffix}` : `Reopen${suffix}`,
      shortcut: 'C',
      danger: issue.state === 'OPEN',
      /* Closing is a write, so it goes through the same confirm screen the key
         does — the menu proposes it, it does not do it. */
      description: many ? 'Shows the commands before it runs any of them' : undefined,
      icon: <IssueOpenedIcon size={SZ} />,
      onClick: () => ctx.onAct('close', numbers),
    },
  ];
}

/** A saved view — the same list as the Manage dialog, where you are standing. */
function viewItems(view: SavedView, ctx: MenuCtx): ContextMenuItem[] {
  const on = ctx.activeView === view.id;
  const isDefault = ctx.defaultViewId === view.id;

  return [
    {
      id: 'open',
      label: on ? 'Leave this view' : `Open “${view.name}”`,
      icon: <CheckIcon size={SZ} />,
      onClick: () => ctx.onOpenView(on ? undefined : view.id),
    },
    sep('s1'),
    {
      id: 'edit',
      label: 'Rename and re-capture…',
      icon: <PencilIcon size={SZ} />,
      onClick: () => ctx.onEditView(view),
    },
    {
      id: 'default',
      label: isDefault ? 'Stop opening on this' : 'Open the board on this',
      icon: isDefault ? <UnpinIcon size={SZ} /> : <PinIcon size={SZ} />,
      onClick: () => ctx.onDefaultView(view),
    },
    sep('s2'),
    {
      id: 'new',
      label: 'Save what is on screen as a view…',
      icon: <PlusIcon size={SZ} />,
      onClick: ctx.onNewView,
    },
    {
      id: 'manage',
      label: 'Manage views…',
      icon: <SettingsIcon size={SZ} />,
      onClick: ctx.onManageViews,
    },
    sep('s3'),
    {
      id: 'delete',
      label: view.preset ? 'Hide this view' : 'Delete this view',
      danger: true,
      description: view.preset
        ? 'A built-in view is hidden rather than deleted'
        : 'Deletes a saved filter, never an issue',
      icon: view.preset ? <EyeOffIcon size={SZ} /> : <TrashIcon size={SZ} />,
      onClick: () => ctx.onDeleteView(view),
    },
  ];
}

/** A facet value — `only` and `except`, which is what the row is hiding. */
function facetItems(field: string, value: string, ctx: MenuCtx): ContextMenuItem[] {
  const name = value || '(blank)';
  return [
    {
      id: 'only',
      label: `Only ${name}`,
      icon: <FilterIcon size={SZ} />,
      onClick: () => ctx.onOnly(field, value),
    },
    {
      id: 'except',
      label: `Everything except ${name}`,
      danger: true,
      icon: <FilterIcon size={SZ} />,
      onClick: () => ctx.onExcept(field, value),
    },
    sep('s1'),
    {
      id: 'copy',
      label: `Copy “${name}”`,
      icon: <CopyIcon size={SZ} />,
      onClick: () => copy(value),
    },
    sep('s2'),
    {
      id: 'clear-field',
      label: `Clear ${field}`,
      icon: <RefreshIcon size={SZ} />,
      onClick: () => ctx.onClearField(field),
    },
    {
      id: 'clear-all',
      label: 'Clear every filter',
      disabled: !ctx.hasFilters,
      icon: <RefreshIcon size={SZ} />,
      onClick: ctx.onClearFilters,
    },
  ];
}

/** A chip in the SHOWING row — one filter, and the query it is part of. */
function chipItems(field: string, ctx: MenuCtx): ContextMenuItem[] {
  return [
    {
      id: 'drop',
      label: `Take ${field} off`,
      icon: <TrashIcon size={SZ} />,
      onClick: () => ctx.onClearField(field),
    },
    {
      id: 'clear-all',
      label: 'Clear every filter',
      icon: <RefreshIcon size={SZ} />,
      onClick: ctx.onClearFilters,
    },
    sep('s1'),
    {
      id: 'copy-query',
      label: 'Copy the query',
      description: ctx.query || 'nothing is filtering the list',
      icon: <CopyIcon size={SZ} />,
      disabled: !ctx.query,
      onClick: () => copy(ctx.query),
    },
    {
      id: 'save',
      label: 'Save this as a view…',
      icon: <PlusIcon size={SZ} />,
      onClick: ctx.onNewView,
    },
  ];
}

/** A column heading — the sort you were about to click twice for. */
function columnItems(key: string, ctx: MenuCtx): ContextMenuItem[] {
  const label = ctx.columnLabel(key);
  const pinned = ctx.isPinned(key);
  return [
    {
      id: 'asc',
      label: 'Sort ascending',
      icon: <ArrowUpIcon size={SZ} />,
      onClick: () => ctx.onSort(key, 'asc'),
    },
    {
      id: 'desc',
      label: 'Sort descending',
      icon: <ArrowDownIcon size={SZ} />,
      onClick: () => ctx.onSort(key, 'desc'),
    },
    sep('s1'),
    {
      id: 'pin',
      label: pinned ? `Unpin ${label}` : `Pin ${label} to the left`,
      icon: pinned ? <UnpinIcon size={SZ} /> : <PinIcon size={SZ} />,
      onClick: () => ctx.onPinColumn(key),
    },
    {
      id: 'hide',
      label: `Hide ${label}`,
      disabled: pinned,
      description: pinned ? 'A pinned column has to be unpinned first' : undefined,
      icon: <EyeOffIcon size={SZ} />,
      onClick: () => ctx.onHideColumn(key),
    },
    sep('s2'),
    {
      id: 'columns',
      label: 'Choose columns…',
      description: 'The same list the export writes',
      icon: <SettingsIcon size={SZ} />,
      onClick: () => ctx.onPanel('view'),
    },
  ];
}

/** A section tab. */
function sectionItems(id: string, ctx: MenuCtx): ContextMenuItem[] {
  return [
    {
      id: 'go',
      label: `Go to ${ctx.sectionLabel(id)}`,
      icon: <CheckIcon size={SZ} />,
      onClick: () => ctx.onSection(id),
    },
    sep('s1'),
    ...boardItems(ctx),
  ];
}

/** Anywhere else in the tab. */
function boardItems(ctx: MenuCtx): ContextMenuItem[] {
  return [
    {
      id: 'refresh',
      label: 'Read it again now',
      icon: <RefreshIcon size={SZ} />,
      onClick: ctx.onRefresh,
    },
    {
      id: 'filters',
      label: 'Filters',
      shortcut: 'F',
      icon: <FilterIcon size={SZ} />,
      onClick: () => ctx.onPanel('filters'),
    },
    sep('s1'),
    {
      id: 'copy-query',
      label: 'Copy the query',
      description: ctx.query || 'nothing is filtering the list',
      disabled: !ctx.query,
      icon: <CopyIcon size={SZ} />,
      onClick: () => copy(ctx.query),
    },
    {
      id: 'clear',
      label: 'Clear every filter',
      disabled: !ctx.hasFilters,
      icon: <RefreshIcon size={SZ} />,
      onClick: ctx.onClearFilters,
    },
    sep('s2'),
    {
      id: 'keys',
      label: 'Keyboard shortcuts',
      shortcut: '?',
      icon: <KeyboardIcon size={SZ} />,
      onClick: ctx.onKeys,
    },
  ];
}
