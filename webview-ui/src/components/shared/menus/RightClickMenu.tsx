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
import { UndoIcon, RedoIcon, CutIcon, CopyIcon, PasteIcon, SelectAllIcon, SearchIcon, WrapLinesIcon, ChevronRightIcon } from '../../../icons';

type MenuContext = 'monaco' | 'input' | 'selection';

interface MenuState {
  x: number;
  y: number;
  context: MenuContext;
  target: HTMLElement | null;
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
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
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

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    let context: MenuContext;
    if (isMonacoEditor(target)) {
      context = 'monaco';
    } else if (isTextInput(target)) {
      context = 'input';
    } else {
      // Only show selection context menu if there's actual text selected
      const selection = window.getSelection();
      if (!selection || !selection.toString().trim()) {
        // No text selected — don't show any menu
        return;
      }
      context = 'selection';
    }

    setMenu({ x: e.clientX, y: e.clientY, context, target });
  }, []);

  useEffect(() => {
    // Use capture phase to intercept before Monaco's internal context menu handler
    document.addEventListener('contextmenu', handleContextMenu, true);
    return () => document.removeEventListener('contextmenu', handleContextMenu, true);
  }, [handleContextMenu]);

  const handleClose = useCallback(() => setMenu(null), []);

  const handleInputSelect = useCallback(async (id: string) => {
    if (!menu) return;
    const { target, context } = menu;
    setMenu(null);

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
    if (id === 'copy') {
      const selection = window.getSelection();
      if (selection && selection.toString()) {
        await navigator.clipboard.writeText(selection.toString());
      }
    }
  }, [menu]);

  if (!menu) return null;

  // Monaco gets its own custom menu
  if (menu.context === 'monaco' && menu.target) {
    return <MonacoContextMenu position={{ x: menu.x, y: menu.y }} target={menu.target} onClose={handleClose} />;
  }

  // Input & selection contexts use the standard ContextMenu
  const items = menu.context === 'input' ? INPUT_ITEMS : SELECTION_ITEMS;
  const adjustedItems = items.map(item => {
    if (item.separator) return item;
    if (item.id === 'cut' || item.id === 'copy') {
      const selection = window.getSelection();
      return { ...item, disabled: !selection || !selection.toString().trim() };
    }
    return item;
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
