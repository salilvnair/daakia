/**
 * A right-click menu of a surface's own, drawn with dui's ContextMenuView.
 *
 * The app's global RightClickMenu offers what it can know about any element:
 * Copy, Select All, the editor's clipboard row. On the Python tab, Loggers and
 * Ask the log that is the wrong menu — right-clicking a script should offer
 * Run and Delete, a logger Show in Logs, a cited line Open in Logs. So those
 * surfaces mark themselves `data-context-menu` (which the global menu leaves
 * alone) and build their menu from what was clicked, here.
 *
 * Regions nest: a row's own handler answers first and stops the event, and the
 * surface's handler is the fallback for whatever else was clicked — a text box
 * gets editing entries, a selection gets Copy, and nothing at all gets nothing,
 * never the browser's own menu.
 */
import { useCallback, useState } from 'react';
import { ContextMenuView, type ContextMenuItem } from '@salilvnair/dui';
import { CopyIcon, CutIcon, PasteIcon, SelectAllIcon, UndoIcon, RedoIcon } from '../../icons';
import { copyText } from '../../utils/clipboard';

export type { ContextMenuItem };

/** Wide enough for "Change All Occurrences" beside its Ctrl+F2 — `md` cut
    the longer entries to "Change All …". */
const MENU_WIDTH = 272;

export const SEP = (id: string): ContextMenuItem => ({ id, label: '', separator: true });

/** Copy what is selected, when something is. */
export function selectionItems(selection: string): ContextMenuItem[] {
  if (!selection.trim()) return [];
  return [{
    id: 'copy-selection', label: 'Copy', shortcut: 'Ctrl+C',
    icon: <CopyIcon size={14} />, iconColor: 'var(--color-ctx-duplicate)',
    onClick: () => { void copyText(selection); },
  }];
}

/** Copy a given value — a name, a line, a template. */
export function copyItem(id: string, label: string, value: string): ContextMenuItem {
  return {
    id, label, icon: <CopyIcon size={14} />, iconColor: 'var(--color-ctx-duplicate)',
    onClick: () => { void copyText(value); },
  };
}

/** Editing entries for a text box or text area. */
export function inputItems(el: HTMLInputElement | HTMLTextAreaElement): ContextMenuItem[] {
  const exec = (cmd: string) => { el.focus(); document.execCommand(cmd); };
  const selected = (el.selectionEnd ?? 0) > (el.selectionStart ?? 0);
  return [
    { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', icon: <UndoIcon size={14} />, iconColor: 'var(--color-ctx-rename)', onClick: () => exec('undo') },
    { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', icon: <RedoIcon size={14} />, iconColor: 'var(--color-ctx-rename)', onClick: () => exec('redo') },
    SEP('in-sep-1'),
    { id: 'cut', label: 'Cut', shortcut: 'Ctrl+X', disabled: !selected, icon: <CutIcon size={14} />, iconColor: 'var(--color-ctx-close)', onClick: () => exec('cut') },
    { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', disabled: !selected, icon: <CopyIcon size={14} />, iconColor: 'var(--color-ctx-duplicate)', onClick: () => exec('copy') },
    {
      id: 'paste', label: 'Paste', shortcut: 'Ctrl+V', icon: <PasteIcon size={14} />, iconColor: 'var(--color-ctx-pin)',
      onClick: () => {
        el.focus();
        void navigator.clipboard?.readText?.().then(t => { if (t) document.execCommand('insertText', false, t); });
      },
    },
    SEP('in-sep-2'),
    { id: 'select-all', label: 'Select All', shortcut: 'Ctrl+A', icon: <SelectAllIcon size={14} />, iconColor: 'var(--color-ctx-close-batch)', onClick: () => { el.focus(); el.select(); } },
  ];
}

/** The text box that was right-clicked, if it was one. */
export function textInputAt(target: HTMLElement): HTMLInputElement | HTMLTextAreaElement | undefined {
  const el = target.closest('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return undefined;
  if (el instanceof HTMLInputElement && !['text', 'search', 'url', 'email', 'number', ''].includes(el.type)) return undefined;
  return el;
}

/**
 * A surface's menu: the handler to put on its root, and the element to render.
 *
 * `build` gets what was clicked and the selected text, and returns the items;
 * an empty list shows no menu, and the browser's is suppressed either way.
 * The standard fallbacks — a text box's editing entries, Copy for a selection —
 * are added when `build` returns nothing of its own.
 */
export function useSurfaceMenu(build: (target: HTMLElement, selection: string) => ContextMenuItem[]) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  const open = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu(items.length ? { x: e.clientX, y: e.clientY, items } : null);
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const selection = window.getSelection()?.toString() ?? '';
    let items = build(target, selection);
    if (!items.length) {
      const input = textInputAt(target);
      items = input ? inputItems(input) : selectionItems(selection);
    }
    open(e, items);
  }, [build, open]);

  const element = menu ? (
    <ContextMenuView open anchorEl={null} position={{ x: menu.x, y: menu.y }} width={MENU_WIDTH}
                     onClose={() => setMenu(null)} items={menu.items} />
  ) : null;

  return { onContextMenu, element, open };
}
