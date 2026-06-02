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

/** Get all registered shortcuts (for a future shortcut viewer/help panel) */
export function getRegisteredShortcuts(): ReadonlyArray<{ id: string; combo: KeyCombo; description?: string }> {
  return registry.map(({ id, combo, description }) => ({ id, combo, description }));
}

/** The global keydown listener — must be installed once at app start */
function globalKeydownHandler(e: KeyboardEvent) {
  for (const shortcut of registry) {
    if (matchesCombo(e, shortcut.combo)) {
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
