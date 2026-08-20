/**
 * Human-facing catalogue of every rebindable shortcut.
 *
 * The registry knows each shortcut's id and default combo but nothing about how to describe
 * it — the `useKeyboardShortcut` call sites never passed a description. Rather than touch
 * seventeen call sites, the labels live here, keyed by the same id. The Keymap settings
 * section walks this list and reads the live default out of the registry, so a shortcut that
 * is registered but missing from this catalogue still shows up (under "Other") rather than
 * silently becoming unrebindable.
 */
export interface ShortcutMeta {
  id: string;
  label: string;
  category: string;
}

export const SHORTCUT_CATALOG: ShortcutMeta[] = [
  // ── General ──
  { id: 'app.command-palette-meta', label: 'Command Palette (⌘)',      category: 'General' },
  { id: 'app.command-palette-ctrl', label: 'Command Palette (Ctrl)',   category: 'General' },
  { id: 'app.toggle-sidebar',       label: 'Toggle sidebar',           category: 'General' },
  { id: 'app.toggle-split',         label: 'Toggle split layout',      category: 'General' },

  // ── Request ──
  { id: 'app.send-request',         label: 'Send request',             category: 'Request' },
  { id: 'app.save-request',         label: 'Save request',             category: 'Request' },
  { id: 'app.focus-url',            label: 'Focus URL bar',            category: 'Request' },

  // ── Tabs ──
  { id: 'app.new-tab',              label: 'New tab',                  category: 'Tabs' },
  { id: 'app.close-tab',            label: 'Close tab',                category: 'Tabs' },

  // ── Collections ──
  { id: 'app.import-collection',    label: 'Import collection',        category: 'Collections' },

  // ── Mock Server ──
  { id: 'mock.toggle-log',          label: 'Toggle request log',       category: 'Mock Server' },

  // ── Debugger ──
  { id: 'debug.continue',           label: 'Continue',                 category: 'Debugger' },
  { id: 'debug.stop',               label: 'Stop',                     category: 'Debugger' },
  { id: 'debug.restart',            label: 'Restart',                  category: 'Debugger' },
  { id: 'debug.stepOver',           label: 'Step over',                category: 'Debugger' },
  { id: 'debug.stepInto',           label: 'Step into',                category: 'Debugger' },
  { id: 'debug.stepOut',            label: 'Step out',                 category: 'Debugger' },
];

export const CATEGORY_ORDER = ['General', 'Request', 'Tabs', 'Collections', 'Mock Server', 'Debugger', 'Other'];

/**
 * Editing shortcuts handled natively by the focused input/editor rather than by our global
 * listener. Listed read-only so the Keymap page is a complete answer to "what shortcuts do
 * I have", instead of silently omitting the ones people ask about most.
 */
export const NATIVE_EDITING_SHORTCUTS: { label: string; mac: string; win: string }[] = [
  { label: 'Copy',            mac: '⌘C', win: 'Ctrl+C' },
  { label: 'Cut',             mac: '⌘X', win: 'Ctrl+X' },
  { label: 'Paste',           mac: '⌘V', win: 'Ctrl+V' },
  { label: 'Select all',      mac: '⌘A', win: 'Ctrl+A' },
  { label: 'Undo',            mac: '⌘Z', win: 'Ctrl+Z' },
  { label: 'Redo',            mac: '⇧⌘Z', win: 'Ctrl+Y' },
  { label: 'Find in editor',  mac: '⌘F', win: 'Ctrl+F' },
  { label: 'Find & replace',  mac: '⇧⌘H', win: 'Ctrl+Shift+H' },
  { label: 'Format document', mac: '⇧⌥F', win: 'Shift+Alt+F' },
];
