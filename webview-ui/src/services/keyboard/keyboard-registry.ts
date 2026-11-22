/**
 * Centralized keyboard shortcut registry.
 * All keyboard shortcuts register here — provides single source of truth.
 */

type KeyCombo = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
};

import { resolveCombo } from './keymap';

type ShortcutHandler = (e: KeyboardEvent) => void;

interface RegisteredShortcut {
  id: string;
  combo: KeyCombo;
  handler: ShortcutHandler;
  description?: string;
}

const registry: RegisteredShortcut[] = [];

function matchesCombo(e: KeyboardEvent, combo: KeyCombo): boolean {
  // Check key match: direct e.key OR via e.code for digits/letters
  // (Shift+5 gives e.key='%' but e.code='Digit5', so we check both)
  const keyMatch =
    e.key.toLowerCase() === combo.key.toLowerCase() ||
    (e.code?.startsWith('Digit') && e.code.slice(5) === combo.key) ||
    (e.code?.startsWith('Key') && e.code.slice(3).toLowerCase() === combo.key.toLowerCase());

  return (
    keyMatch &&
    !!e.altKey === !!combo.altKey &&
    !!e.ctrlKey === !!combo.ctrlKey &&
    !!e.shiftKey === !!combo.shiftKey &&
    !!e.metaKey === !!combo.metaKey
  );
}

/**
 * Register a keyboard shortcut. Returns an unregister function.
 */
export function registerShortcut(
  id: string,
  combo: KeyCombo,
  handler: ShortcutHandler,
  description?: string
): () => void {
  // Remove existing with same id to allow re-registration
  const idx = registry.findIndex(s => s.id === id);
  if (idx >= 0) registry.splice(idx, 1);

  registry.push({ id, combo, handler, description });
  return () => unregisterShortcut(id);
}

export function unregisterShortcut(id: string): void {
  const idx = registry.findIndex(s => s.id === id);
  if (idx >= 0) registry.splice(idx, 1);
}

/*
  Shortcuts that belong to a focused field, not to the window — Ctrl+Enter in
  a bulk-edit box means "done", while everywhere else it sends the request.
  The global listener never matches these; the field asks `matchesShortcut`
  in its own keydown and stops the event there. Declaring them here is what
  puts them on the Keymap page, rebindable like the rest.
*/
const declared = new Map<string, { combo: KeyCombo; description?: string }>();

export function declareShortcut(id: string, combo: KeyCombo, description?: string): void {
  declared.set(id, { combo, description });
}

/* Declared here, not in the field's module, so the Keymap page lists it before any such field has loaded. */
declareShortcut('kv.bulk-done', { key: 'Enter', ctrlKey: true }, 'Bulk edit: done, back to rows');

/** True when `e` is the combo in force for a declared (or registered) shortcut. */
export function matchesShortcut(e: KeyboardEvent | { key: string; code?: string; altKey: boolean; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }, id: string): boolean {
  const fallback = declared.get(id)?.combo ?? registry.find(s => s.id === id)?.combo;
  if (!fallback) return false;
  const active = resolveCombo(id, fallback);
  return !!active && matchesCombo(e as KeyboardEvent, active);
}

/** Every registered shortcut with the DEFAULT combo it registered under — the Keymap
 *  settings section lists these and layers user overrides on top. */
export function getRegisteredShortcuts(): ReadonlyArray<{ id: string; combo: KeyCombo; description?: string }> {
  return [
    ...registry.map(({ id, combo, description }) => ({ id, combo, description })),
    ...[...declared].filter(([id]) => !registry.some(s => s.id === id)).map(([id, d]) => ({ id, ...d })),
  ];
}

/*
  When each shortcut last ran here. In VS Code the same keypress reaches the
  extension too: the webview hands every keydown to the workbench, which runs
  the keybinding Daakia declares for it (package.json — there so VS Code's own
  Ctrl+N or Ctrl+W does not fire instead), and that command posts the action
  back. Handled twice, Ctrl+N opened two tabs and Ctrl+W closed two.
*/
const lastRun = new Map<string, number>();
const ECHO_MS = 600;

/**
 * True when the shortcut `id` has just run in the webview, so a host command
 * arriving now is the echo of that same keypress, not a second request. When
 * the key never got here — an editor kept it — the host command still acts.
 */
export function ranLocally(id: string, now = Date.now()): boolean {
  const at = lastRun.get(id);
  return at !== undefined && now - at < ECHO_MS;
}

/** The global keydown listener — must be installed once at app start */
export function globalKeydownHandler(e: KeyboardEvent) {
  for (const shortcut of registry) {
    // `combo` is the DEFAULT the feature registered with; the user may have rebound it.
    // Resolving here means every shortcut is rebindable without its call site knowing.
    const active = resolveCombo(shortcut.id, shortcut.combo);
    if (active && matchesCombo(e, active)) {
      lastRun.set(shortcut.id, Date.now());
      shortcut.handler(e);
      return; // first match wins
    }
  }
}

let installed = false;

/** Install the global keyboard listener. Call once in App mount. */
export function installKeyboardListener(): () => void {
  if (installed) return () => {};
  installed = true;
  window.addEventListener('keydown', globalKeydownHandler);
  return () => {
    window.removeEventListener('keydown', globalKeydownHandler);
    installed = false;
  };
}
