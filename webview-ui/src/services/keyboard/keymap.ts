/**
 * Keymap — user-rebindable keyboard shortcuts.
 *
 * The registry (keyboard-registry.ts) holds the DEFAULT combo each feature registers with.
 * This module layers user overrides on top: `resolveCombo(id, default)` is what the global
 * listener matches against, so rebinding a shortcut needs no change at the call site.
 *
 * Overrides live in the same persisted `general` settings blob as everything else, under a
 * `keymap` key, so they survive restarts and ride along with Git Sync for free.
 */

export interface KeyCombo {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

/** id → combo, or `null` meaning the user explicitly unbound it. */
export type KeymapOverrides = Record<string, KeyCombo | null>;

let overrides: KeymapOverrides = {};
const listeners = new Set<() => void>();

export function setKeymapOverrides(next: KeymapOverrides): void {
  overrides = next || {};
  listeners.forEach(l => l());
}

export function getKeymapOverrides(): KeymapOverrides {
  return overrides;
}

export function onKeymapChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The combo actually in force for a shortcut: user override if set, else its default. */
export function resolveCombo(id: string, fallback: KeyCombo): KeyCombo | null {
  if (Object.prototype.hasOwnProperty.call(overrides, id)) return overrides[id];
  return fallback;
}

// ─── Display / capture helpers ───────────────────────────────────────────────

/** True on macOS, where the modifier glyphs and the Cmd-vs-Ctrl convention differ. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const KEY_LABELS: Record<string, string> = {
  ' ': 'Space', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: IS_MAC ? '↩' : 'Enter', Backspace: IS_MAC ? '⌫' : 'Backspace', Delete: 'Del', Tab: IS_MAC ? '⇥' : 'Tab',
};

/** Human label for a combo, using the platform's own conventions. */
export function formatCombo(combo: KeyCombo | null): string {
  if (!combo) return 'Unassigned';
  const parts: string[] = [];
  if (IS_MAC) {
    if (combo.ctrlKey)  parts.push('⌃');
    if (combo.altKey)   parts.push('⌥');
    if (combo.shiftKey) parts.push('⇧');
    if (combo.metaKey)  parts.push('⌘');
  } else {
    if (combo.ctrlKey)  parts.push('Ctrl');
    if (combo.metaKey)  parts.push('Win');
    if (combo.altKey)   parts.push('Alt');
    if (combo.shiftKey) parts.push('Shift');
  }
  const key = KEY_LABELS[combo.key] ?? (combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
  parts.push(key);
  return IS_MAC ? parts.join('') : parts.join('+');
}

/** Modifier-only keys — pressing one alone is never a complete binding. */
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'OS']);

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

/**
 * Turn a live keydown into a combo.
 *
 * Uses `e.code` for letters/digits rather than `e.key`, because with a modifier held the
 * printed character changes (Alt+B is "∫" on macOS, Shift+5 is "%"), and binding to that
 * would never match again once the modifier state was re-evaluated.
 */
export function comboFromEvent(e: KeyboardEvent): KeyCombo | null {
  if (isModifierKey(e.key)) return null;
  let key = e.key;
  if (e.code?.startsWith('Key'))       key = e.code.slice(3).toLowerCase();
  else if (e.code?.startsWith('Digit')) key = e.code.slice(5);
  return {
    key,
    altKey: e.altKey || undefined,
    ctrlKey: e.ctrlKey || undefined,
    shiftKey: e.shiftKey || undefined,
    metaKey: e.metaKey || undefined,
  };
}

export function combosEqual(a: KeyCombo | null, b: KeyCombo | null): boolean {
  if (!a || !b) return a === b;
  return a.key.toLowerCase() === b.key.toLowerCase()
    && !!a.altKey === !!b.altKey && !!a.ctrlKey === !!b.ctrlKey
    && !!a.shiftKey === !!b.shiftKey && !!a.metaKey === !!b.metaKey;
}
