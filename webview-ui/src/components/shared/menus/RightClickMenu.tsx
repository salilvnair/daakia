/**
 * RightClickMenu — Global right-click context menu for Daakia.
 * Shows context-aware actions:
 *  - In Monaco editors: Compact clipboard row + grouped editor actions
 *  - In native inputs: Undo, Redo | Cut, Copy, Paste | Select All
 *  - On text selection anywhere: Copy
 *
 * Usage: Mount once in App.tsx. It listens for contextmenu events globally.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { UndoIcon, RedoIcon, CutIcon, CopyIcon, PasteIcon, SelectAllIcon, SearchIcon, WrapLinesIcon, ChevronRightIcon, SparkleIcon, HelpCircleIcon, FilterIcon, FilterClearIcon } from '../../../icons';
import { getFilterMenu, type FilterMenu } from './filter-provider';

type MenuContext = 'monaco' | 'input' | 'selection';

interface MenuState {
  x: number;
  y: number;
  context: MenuContext;
  target: HTMLElement | null;
  /**
   * The selected text, captured when the menu opened.
   *
   * Not read again at click time: moving through a submenu can collapse the
   * selection, and an action that silently does nothing because the selection
   * went away is worse than no action.
   */
  selection: string;
}

const INPUT_ITEMS: ContextMenuItem[] = [
  { id: 'undo', label: 'Undo', icon: <UndoIcon size={14} />, iconColor: 'var(--color-ctx-rename)', shortcut: 'Ctrl+Z' },
  { id: 'redo', label: 'Redo', icon: <RedoIcon size={14} />, iconColor: 'var(--color-ctx-rename)', shortcut: 'Ctrl+Y' },
  { id: 'sep1', label: '', separator: true },
  { id: 'cut', label: 'Cut', icon: <CutIcon size={14} />, iconColor: 'var(--color-ctx-close)', shortcut: 'Ctrl+X' },
  { id: 'copy', label: 'Copy', icon: <CopyIcon size={14} />, iconColor: 'var(--color-ctx-duplicate)', shortcut: 'Ctrl+C' },
  { id: 'paste', label: 'Paste', icon: <PasteIcon size={14} />, iconColor: 'var(--color-ctx-pin)', shortcut: 'Ctrl+V' },
  { id: 'sep2', label: '', separator: true },
  { id: 'selectAll', label: 'Select All', icon: <SelectAllIcon size={14} />, iconColor: 'var(--color-ctx-close-batch)', shortcut: 'Ctrl+A' },
];

const SELECTION_ITEMS: ContextMenuItem[] = [
  { id: 'copy', label: 'Copy', icon: <CopyIcon size={14} />, iconColor: 'var(--color-ctx-duplicate)', shortcut: 'Ctrl+C' },
];

/**
 * Extra entries a surface can contribute to the selection menu.
 *
 * A log view wants Search on a selection; a response body does not. Rather
 * than teaching this menu about dk8s, a surface marks itself with
 * `data-selection-actions` and answers a custom event with what it can do —
 * so the menu stays generic and the log-specific behaviour stays in the log
 * view that implements it.
 */
const AI_COLOR = 'var(--color-protocol-ai)';

/**
 * The two model calls, for a surface that opts into `ai`.
 *
 * These lived on a floating strip that appeared over the selection. The strip
 * was a second panel competing with this menu for the same gesture, so it had
 * to suppress itself on right-click and this menu had to stay out of its way —
 * two things arguing over one selection. One menu, and the strip is gone.
 *
 * The heading carries what the strip's only real content was: how much is
 * selected. "Ask AI why" on its own does not say why about what.
 */
function aiItems(lineCount: number, hasSelection: boolean): ContextMenuItem[] {
  return [
    { id: 'ai-sep', label: '', separator: true },
    {
      id: 'ai-count',
      // The heading carries what the strip's only real content was: how much
      // is selected. With nothing selected it says so, which is the reason the
      // two entries under it are greyed out.
      label: hasSelection
        ? `${lineCount} line${lineCount === 1 ? '' : 's'} selected`
        : 'Nothing selected',
      heading: true,
    },
    {
      id: 'ai:askWhy', label: 'Ask AI why',
      icon: <SparkleIcon size={14} />, iconColor: AI_COLOR,
    },
    {
      id: 'ai:explain', label: 'Explain',
      icon: <HelpCircleIcon size={14} />, iconColor: AI_COLOR,
    },
    { id: 'ai-sep-2', label: '', separator: true },
  ];
}

/*
  Filter By, built from whatever the surface knows about its own content.

  The colour is the one thing hard-coded here: amber, because filtering is the
  only entry in this menu that changes what you are looking at rather than
  acting on what you selected, and it should not read as another neutral verb
  beside Copy.

  The actions come back as closures, so this renders a list of labels and calls
  one — it never learns what a thread is.
*/
const FILTER_COLOR = 'var(--color-warning)';

function filterItems(menu: FilterMenu): ContextMenuItem[] {
  const submenu: ContextMenuItem[] = [];

  if (menu.selection) {
    submenu.push({
      id: 'filter:selection',
      label: menu.selection.label,
      icon: <FilterIcon size={13} />,
      iconColor: FILTER_COLOR,
    });
    if (menu.groups.length) submenu.push({ id: 'filter:sel-sep', label: '', separator: true });
  }

  for (const g of menu.groups) {
    submenu.push({
      id: `filter:group:${g.id}`,
      label: g.label,
      icon: <FilterIcon size={13} />,
      iconColor: FILTER_COLOR,
      submenu: [
        // Said once, at the top, rather than on every row — see FilterGroup.note.
        ...(g.note ? [{ id: `filter:${g.id}:note`, label: g.note, heading: true }] : []),
        ...g.options.map((o, i) => ({
          id: `filter:${g.id}:${i}`,
          label: o.label,
          shortcut: o.hint,
        })),
      ],
    });
  }

  if (menu.clear) {
    if (submenu.length) submenu.push({ id: 'filter:clear-sep', label: '', separator: true });
    submenu.push({
      id: 'filter:clear',
      label: 'Clear filter',
      // The funnel says what is being cleared; the cross inside it is red on
      // its own, so no iconColor here — see FilterClearIcon.
      icon: <FilterClearIcon size={13} />,
      iconColor: 'var(--color-text-secondary)',
    });
  }

  if (!submenu.length) return [];

  return [
    { id: 'filter-sep', label: '', separator: true },
    {
      id: 'filter',
      label: 'Filter By',
      icon: <FilterIcon size={14} />,
      iconColor: FILTER_COLOR,
      submenu,
    },
  ];
}

const SEARCH_ITEMS: ContextMenuItem[] = [
  {
    id: 'search',
    label: 'Search',
    icon: <SearchIcon size={14} />,
    iconColor: 'var(--color-dk8s, #22d3ee)',
    submenu: [
      { id: 'search:here', label: 'Search Here', icon: <SearchIcon size={13} />, iconColor: 'var(--color-dk8s, #22d3ee)' },
      { id: 'search:everywhere', label: 'Search Everywhere', icon: <SearchIcon size={13} />, iconColor: 'var(--color-dk8s, #22d3ee)' },
    ],
  },
];

function isMonacoEditor(el: HTMLElement | null): boolean {
  if (!el) return false;
  return !!el.closest('.monaco-editor');
}

function isTextInput(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type;
    return type === 'text' || type === 'search' || type === 'url' || type === 'email' || type === 'password' || type === '';
  }
  if (el.getAttribute('contenteditable') === 'true') return true;
  return false;
}

function getMonacoEditorInstance(el: HTMLElement): any | null {
  const editorContainer = el.closest('.monaco-editor');
  if (!editorContainer) return null;
  const monacoGlobal = (window as any).monaco?.editor;
  if (!monacoGlobal) return null;
  const editors = monacoGlobal.getEditors?.() || [];
  for (const editor of editors) {
    try {
      const domNode = editor.getDomNode();
      if (domNode && (domNode === editorContainer || domNode.contains(editorContainer) || editorContainer.contains(domNode))) {
        return editor;
      }
    } catch { /* skip */ }
  }
  return null;
}

// --- Monaco Context Menu (custom layout with compact clipboard row + submenu) ---

interface MonacoMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  iconColor?: string;
  submenu?: MonacoMenuItem[];
}

const GOTO_SUBMENU: MonacoMenuItem[] = [
  { id: 'goToDefinition', label: 'Go to Definition', shortcut: 'F12' },
  { id: 'goToReferences', label: 'Go to References', shortcut: 'Shift+F12' },
  { id: 'goToSymbol', label: 'Go to Symbol...', shortcut: 'Ctrl+Shift+O' },
];

const PEEK_SUBMENU: MonacoMenuItem[] = [
  { id: 'peekDefinition', label: 'Peek Definition', shortcut: 'Alt+F12' },
  { id: 'peekReferences', label: 'Peek References' },
];

// Full menu for JS/TS editors (supports Go to Definition, Peek, etc.)
const MONACO_MENU_GROUPS_FULL: MonacoMenuItem[][] = [
  // Group 1: Edit actions
  [
    { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', icon: <UndoIcon size={14} />, iconColor: 'var(--color-ctx-rename)' },
    { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', icon: <RedoIcon size={14} />, iconColor: 'var(--color-ctx-rename)' },
  ],
  // Group 2: Search & Replace
  [
    { id: 'find', label: 'Find and Replace', shortcut: 'Ctrl+H', icon: <SearchIcon size={14} />, iconColor: 'var(--color-ctx-duplicate)' },
    { id: 'changeAll', label: 'Change All Occurrences', shortcut: 'Ctrl+F2' },
  ],
  // Group 3: Code actions
  [
    { id: 'comment', label: 'Toggle Comment', shortcut: 'Ctrl+/' },
    { id: 'format', label: 'Format Document', shortcut: 'Shift+Alt+F', icon: <WrapLinesIcon size={14} />, iconColor: 'var(--color-ctx-close-saved)' },
  ],
  // Group 4: Navigation
  [
    { id: 'goto', label: 'Go to...', submenu: GOTO_SUBMENU },
    { id: 'peek', label: 'Peek', submenu: PEEK_SUBMENU },
    { id: 'rename', label: 'Rename Symbol', shortcut: 'F2' },
  ],
  // Group 5: Selection & Command
  [
    { id: 'selectAll', label: 'Select All', shortcut: 'Ctrl+A', icon: <SelectAllIcon size={14} />, iconColor: 'var(--color-ctx-close-batch)' },
    { id: 'commandPalette', label: 'Command Palette', shortcut: 'F1' },
  ],
];

// Reduced menu for JSON/XML/other non-JS/TS editors
const MONACO_MENU_GROUPS_BASIC: MonacoMenuItem[][] = [
  [
    { id: 'goToSymbol', label: 'Go to Symbol...', shortcut: 'Ctrl+Shift+O' },
  ],
  [
    { id: 'changeAll', label: 'Change All Occurrences', shortcut: 'Ctrl+F2' },
    { id: 'format', label: 'Format Document', shortcut: 'Shift+Alt+F', icon: <WrapLinesIcon size={14} />, iconColor: 'var(--color-ctx-close-saved)' },
  ],
  [
    { id: 'selectAll', label: 'Select All', shortcut: 'Ctrl+A', icon: <SelectAllIcon size={14} />, iconColor: 'var(--color-ctx-close-batch)' },
    { id: 'commandPalette', label: 'Command Palette', shortcut: 'F1' },
  ],
];

/** Languages that support Go to Definition, Peek, Rename */
const TS_LANGUAGES = new Set(['javascript', 'typescript']);

function MonacoContextMenu({ position, target, onClose }: { position: { x: number; y: number }; target: HTMLElement; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(position);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  // Capture editor instance at mount time (while target is still in DOM)
  const editorInstanceRef = useRef<any>(getMonacoEditorInstance(target));

  // Adjust position to stay in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let { x, y } = position;
      if (x + rect.width > vw) x = vw - rect.width - 4;
      if (y + rect.height > vh) y = position.y - rect.height;
      if (x < 4) x = 4;
      if (y < 4) y = 4;
      setPos({ x, y });
    }
  }, [position]);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // The menu is placed at fixed coordinates against content that can move.
    // Capture phase because the scroller is usually an inner element, and
    // scroll does not bubble.
    const handleScroll = () => onClose();
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const executeAction = useCallback((id: string) => {
    const editor = editorInstanceRef.current;
    onClose();
    if (!editor) return;
    // Use requestAnimationFrame to ensure DOM is updated (menu removed) before refocusing
    requestAnimationFrame(() => {
      editor.focus();
      // Give the editor a frame to process focus before triggering actions
      requestAnimationFrame(async () => {
        switch (id) {
          case 'undo':
            editor.trigger('contextmenu', 'undo', null);
            break;
          case 'redo':
            editor.trigger('contextmenu', 'redo', null);
            break;
          case 'cut': {
            const sel = editor.getSelection();
            if (sel && !sel.isEmpty()) {
              const text = editor.getModel()?.getValueInRange(sel) || '';
              await navigator.clipboard.writeText(text);
              editor.executeEdits('contextmenu', [{ range: sel, text: '' }]);
            }
            break;
          }
          case 'copy': {
            const sel = editor.getSelection();
            if (sel && !sel.isEmpty()) {
              const text = editor.getModel()?.getValueInRange(sel) || '';
              await navigator.clipboard.writeText(text);
            }
            break;
          }
          case 'paste': {
            try {
              const text = await navigator.clipboard.readText();
              if (text) {
                const sel = editor.getSelection();
                if (sel) editor.executeEdits('contextmenu', [{ range: sel, text, forceMoveMarkers: true }]);
              }
            } catch { /* clipboard denied */ }
            break;
          }
          case 'selectAll':
            editor.trigger('contextmenu', 'editor.action.selectAll', null);
            break;
          case 'format':
            editor.trigger('contextmenu', 'editor.action.formatDocument', null);
            break;
          case 'comment':
            editor.trigger('contextmenu', 'editor.action.commentLine', null);
            break;
          case 'find':
            editor.trigger('contextmenu', 'editor.action.startFindReplaceAction', null);
            break;
          case 'changeAll':
            editor.trigger('contextmenu', 'editor.action.changeAll', null);
            break;
          case 'commandPalette':
            editor.trigger('contextmenu', 'editor.action.quickCommand', null);
            break;
          case 'goToDefinition':
            editor.trigger('contextmenu', 'editor.action.revealDefinition', null);
            break;
          case 'peekDefinition':
            editor.trigger('contextmenu', 'editor.action.peekDefinition', null);
            break;
          case 'peekReferences':
            editor.trigger('contextmenu', 'editor.action.referenceSearch.trigger', null);
            break;
          case 'goToReferences':
            editor.trigger('contextmenu', 'editor.action.goToReferences', null);
            break;
          case 'goToSymbol':
            editor.trigger('contextmenu', 'editor.action.quickOutline', null);
            break;
          case 'rename':
            editor.trigger('contextmenu', 'editor.action.rename', null);
            break;
        }
      });
    });
  }, [onClose]);

  // Check if there's a selection for disabling cut/copy
  const editor = editorInstanceRef.current;
  const hasSelection = editor ? (() => { const s = editor.getSelection(); return s && !s.isEmpty(); })() : false;

  // Determine menu items based on editor language
  const editorLang = editor?.getModel()?.getLanguageId?.() || '';
  const menuGroups = TS_LANGUAGES.has(editorLang) ? MONACO_MENU_GROUPS_FULL : MONACO_MENU_GROUPS_BASIC;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[240px] py-1.5 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-xl animate-[fadeSlideIn_100ms_ease-out]"
      style={{ top: pos.y, left: pos.x }}
    >
      {/* Compact clipboard row: Cut | Copy | Paste */}
      <div className="flex items-center gap-0.5 px-2 py-1">
        <button
          type="button"
          disabled={!hasSelection}
          onClick={() => executeAction('cut')}
          className="w-8 h-7 flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[var(--color-item-hover-bg)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ color: 'var(--color-ctx-close)' }}
          title="Cut (Ctrl+X)"
        >
          <CutIcon size={15} />
        </button>
        <button
          type="button"
          disabled={!hasSelection}
          onClick={() => executeAction('copy')}
          className="w-8 h-7 flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[var(--color-item-hover-bg)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ color: 'var(--color-ctx-duplicate)' }}
          title="Copy (Ctrl+C)"
        >
          <CopyIcon size={15} />
        </button>
        <button
          type="button"
          onClick={() => executeAction('paste')}
          className="w-8 h-7 flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[var(--color-item-hover-bg)]"
          style={{ color: 'var(--color-ctx-pin)' }}
          title="Paste (Ctrl+V)"
        >
          <PasteIcon size={15} />
        </button>
      </div>

      {/* Separator */}
      <div className="my-1 border-t border-[var(--color-surface-border)]" />

      {/* Grouped menu items */}
      {menuGroups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="my-1 border-t border-[var(--color-surface-border)]" />}
          {group.map(item => item.submenu ? (
            // Submenu item with hover-expand
            <div
              key={item.id}
              className="relative"
              onMouseEnter={() => setOpenSubmenu(item.id)}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-[12.5px] text-left cursor-pointer transition-colors text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]"
              >
                <span className="w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                <ChevronRightIcon size={12} className="text-[var(--color-text-muted)]" />
              </button>
              {openSubmenu === item.id && (
                <div className="absolute left-full -top-1.5 ml-0.5 min-w-[220px] py-1.5 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-xl z-[10000]">
                  {item.submenu.map(sub => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => executeAction(sub.id)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-[12.5px] text-left cursor-pointer transition-colors text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]"
                    >
                      <span className="w-4 shrink-0" />
                      <span className="flex-1">{sub.label}</span>
                      {sub.shortcut && (
                        <span className="text-[10px] text-[var(--color-text-muted)] ml-4 font-mono whitespace-nowrap">
                          {sub.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              key={item.id}
              type="button"
              onClick={() => executeAction(item.id)}
              className="w-full flex items-center gap-2.5 px-3.5 py-[6px] text-[12.5px] text-left cursor-pointer transition-colors text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)]"
            >
              {item.icon
                ? <span className="w-4 h-4 flex items-center justify-center shrink-0" style={{ color: item.iconColor || 'var(--color-text-muted)' }}>{item.icon}</span>
                : <span className="w-4 shrink-0" />
              }
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] text-[var(--color-text-muted)] ml-4 font-mono whitespace-nowrap">
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.body
  );
}

// --- Main RightClickMenu ---

export function RightClickMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // Don't intercept elements with their own context menu (e.g., TabBar tabs, sidebar rows)
    if (target.closest('[data-context-menu]')) return;

    // Don't intercept Monaco glyph margin (breakpoint gutter has own handler)
    if (target.closest('[data-daakia-bp-gutter]')) return;

    let context: MenuContext;
    if (isMonacoEditor(target)) {
      context = 'monaco';
    } else if (isTextInput(target)) {
      context = 'input';
    } else {
      const selected = window.getSelection()?.toString().trim() ?? '';
      /*
        No selection is still worth a menu — on a surface that has something to
        offer without one.

        Right-clicking a log line to filter by its thread never needed a
        selection, and requiring one meant right-click did nothing at all
        there. A surface says whether it has anything by opting in with
        `data-selection-actions`; anywhere else, an empty right-click falls
        through untouched.
      */
      const opted = !!target.closest('[data-selection-actions]');
      if (!selected && !opted) return;
      context = 'selection';
    }

    /*
      Suppressed only once a menu is actually going to appear.

      This used to run before the check above, so every right-click in the app
      with nothing selected swallowed the event and then showed nothing —
      leaving no menu of ours and no native one either.
    */
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    setMenu({
      x: e.clientX, y: e.clientY, context, target,
      selection: window.getSelection()?.toString() ?? '',
    });
  }, []);

  useEffect(() => {
    // Use capture phase to intercept before Monaco's internal context menu handler
    document.addEventListener('contextmenu', handleContextMenu, true);
    return () => document.removeEventListener('contextmenu', handleContextMenu, true);
  }, [handleContextMenu]);

  const handleClose = useCallback(() => setMenu(null), []);

  const handleInputSelect = useCallback(async (id: string, subId?: string) => {
    if (!menu) return;
    const { target, context, selection: selectedText } = menu;
    // A submenu reports the parent's id first and the chosen child second, so
    // the child is the action whenever there is one. Reading only the first
    // argument is why Search Here and Search Everywhere did nothing.
    const action = subId ?? id;
    setMenu(null);

    /*
      Filter actions, dispatched by id.

      Three levels deep — Filter By, a field, a value — and the menu reports a
      parent and a child rather than a full path. So the id encodes everything
      needed to act on it, and the more specific of the two arguments wins:
      `filter:thread:4` beats `filter:group:thread` regardless of which slot
      each arrived in.
    */
    const filterId = [subId, id]
      .filter((x): x is string => !!x && x.startsWith('filter:') && !x.startsWith('filter:group:'))
      .sort((a, b) => b.split(':').length - a.split(':').length)[0];

    if (filterId) {
      const fm = getFilterMenu();
      if (!fm) return;
      if (filterId === 'filter:clear') { fm.clear?.(); return; }
      if (filterId === 'filter:selection') { fm.selection?.apply(); return; }
      const [, groupId, index] = filterId.split(':');
      const group = fm.groups.find(g => g.id === groupId);
      group?.options[Number(index)]?.apply();
      return;
    }

    // Native input/textarea actions
    if (context === 'input' && target) {
      const inputEl = target as HTMLInputElement | HTMLTextAreaElement;
      inputEl.focus();
      switch (id) {
        case 'undo':
          document.execCommand('undo');
          break;
        case 'redo':
          document.execCommand('redo');
          break;
        case 'cut':
          document.execCommand('cut');
          break;
        case 'copy':
          document.execCommand('copy');
          break;
        case 'paste':
          try {
            const text = await navigator.clipboard.readText();
            document.execCommand('insertText', false, text);
          } catch {
            document.execCommand('paste');
          }
          break;
        case 'selectAll':
          inputEl.select();
          break;
      }
      return;
    }

    // General text selection — copy
    if (action === 'copy') {
      if (selectedText) await navigator.clipboard.writeText(selectedText);
      return;
    }

    // Handed to whichever surface contributed the entry.
    // Both groups leave the same way: the menu names an action and the surface
    // that opted in decides what it means. Nothing here knows about logs.
    if (action.startsWith('search:') || action.startsWith('ai:')) {
      target?.dispatchEvent(new CustomEvent('daakia:selection-action', {
        bubbles: true,
        detail: { action, text: selectedText },
      }));
    }
  }, [menu]);

  if (!menu) return null;

  // Monaco gets its own custom menu
  if (menu.context === 'monaco' && menu.target) {
    return <MonacoContextMenu position={{ x: menu.x, y: menu.y }} target={menu.target} onClose={handleClose} />;
  }

  // Input & selection contexts use the standard ContextMenu
  /*
    Copy first, then whatever the surface opted into.

    The order is the order of certainty: Copy always does the same thing, the
    AI entries act on what is selected, and Search leaves for somewhere else.
    Each opted-in group brings its own separators so the menu reads as sections
    rather than a list.
  */
  const wantsAi = !!menu.target?.closest('[data-selection-actions~="ai"]');
  const wantsSearch = !!menu.target?.closest('[data-selection-actions~="search"]');
  const wantsFilter = !!menu.target?.closest('[data-selection-actions~="filter"]');
  // Read once, when the menu opens. Calling the provider again at click time
  // would rebuild the facets from a buffer that has moved on, and the closure
  // chosen would belong to a different list than the one on screen.
  const filterMenu = wantsFilter ? getFilterMenu() : null;
  // Trailing newline from a line-wise selection would otherwise count as a line.
  const lineCount = menu.selection.replace(/\n+$/, '').split('\n').length;

  /*
    The same menu with or without a selection.

    Stripping the selection-dependent entries left a single "Filter By" row
    with a submenu hanging off it, which reads as a broken menu rather than a
    small one — and it moved every remaining entry to a different place
    depending on whether text happened to be selected. So the list is always
    the same shape and the entries that need a selection are disabled without
    one: what is unavailable stays visible, in its usual position, and the
    reason is legible from the greyed-out row.
  */
  const hasSelection = !!menu.selection.trim();

  const items = menu.context === 'input'
    ? INPUT_ITEMS
    : [
        ...SELECTION_ITEMS,
        ...(wantsAi ? aiItems(lineCount, hasSelection) : []),
        ...(wantsSearch ? (wantsAi ? SEARCH_ITEMS : [{ id: 'search-sep', label: '', separator: true }, ...SEARCH_ITEMS]) : []),
        ...(filterMenu ? filterItems(filterMenu) : []),
      ];
  /*
    One rule: an entry that acts on the selection needs one.

    Copy, Cut, the two AI actions and both Search entries all take the
    highlighted text as their input. Filter By does not — it reads the view —
    so it stays live, which is what makes an empty right-click worth opening.
  */
  const NEEDS_SELECTION = new Set([
    'cut', 'copy', 'ai:askWhy', 'ai:explain', 'search', 'search:here', 'search:everywhere',
  ]);

  const adjustedItems = items.map(item => {
    if (item.separator || item.heading) return item;
    if (!NEEDS_SELECTION.has(item.id)) return item;
    return { ...item, disabled: !hasSelection };
  });

  return (
    <ContextMenu
      items={adjustedItems}
      position={{ x: menu.x, y: menu.y }}
      onSelect={handleInputSelect}
      onClose={handleClose}
    />
  );
}
