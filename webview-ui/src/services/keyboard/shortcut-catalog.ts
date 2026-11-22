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
  /** Handled by a focused field, not the window: may share a combo with a global shortcut. */
  field?: boolean;
}

export const SHORTCUT_CATALOG: ShortcutMeta[] = [
  // ── General ──
  { id: 'app.command-palette',      label: 'Command Palette',          category: 'General' },
  { id: 'app.toggle-sidebar',       label: 'Toggle sidebar',           category: 'General' },
  { id: 'app.toggle-split',         label: 'Toggle split layout',      category: 'General' },
  { id: 'app.open-workspace',       label: 'Open workspace',           category: 'General' },
  { id: 'app.open-settings',        label: 'Open settings',            category: 'General' },
  { id: 'app.open-environments',    label: 'Show environments',        category: 'General' },
  { id: 'app.open-history',         label: 'Show history',             category: 'General' },
  { id: 'app.daakia-ai',            label: 'Open Daakia AI',           category: 'General' },
  { id: 'app.mock-server',          label: 'Open mock servers',        category: 'General' },
  { id: 'app.open-wiki',            label: 'Open the wiki',            category: 'General' },

  // ── Request ──
  { id: 'app.send-request',         label: 'Send request',             category: 'Request' },
  { id: 'app.save-request',         label: 'Save request',             category: 'Request' },
  { id: 'app.focus-url',            label: 'Focus URL bar',            category: 'Request' },
  { id: 'kv.bulk-done',             label: 'Bulk edit: done, back to rows (in the bulk box)', category: 'Request', field: true },

  // ── Tabs ──
  { id: 'app.new-tab',              label: 'New tab, like the one in front', category: 'Tabs' },
  { id: 'app.close-tab',            label: 'Close tab',                category: 'Tabs' },
  { id: 'app.duplicate-tab',        label: 'Duplicate tab',            category: 'Tabs' },
  { id: 'app.next-tab',             label: 'Next tab',                 category: 'Tabs' },
  { id: 'app.prev-tab',             label: 'Previous tab',             category: 'Tabs' },
  { id: 'app.close-other-tabs',     label: 'Close other tabs',         category: 'Tabs' },
  { id: 'app.all-tabs',             label: 'All tabs (search, recently closed)', category: 'Tabs' },
  { id: 'app.reopen-tab',           label: 'Reopen closed tab',        category: 'Tabs' },
  { id: 'app.fold-tab-group',       label: 'Fold the tab group in front', category: 'Tabs' },

  // ── Scratchpads ──
  { id: 'app.new-scratchpad',       label: 'New scratchpad',           category: 'Scratchpads' },
  { id: 'app.open-scratchpads',     label: 'Open scratchpads',         category: 'Scratchpads' },

  // ── Collections ──
  { id: 'app.new-collection',       label: 'New collection',           category: 'Collections' },
  { id: 'app.search-collections',   label: 'Search all collections',   category: 'Collections' },
  { id: 'app.import-collection',    label: 'Import collection',        category: 'Collections' },
  { id: 'app.scan-code',            label: 'Scan code for requests',   category: 'Collections' },

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

export const CATEGORY_ORDER = ['General', 'Request', 'Tabs', 'Scratchpads', 'Collections', 'Mock Server', 'Debugger', 'Other'];

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
