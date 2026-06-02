import { useEffect } from 'react';
import { registerShortcut } from '../services/keyboard';

type KeyCombo = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
};

/**
 * React hook to register a keyboard shortcut that auto-unregisters on unmount.
 */
export function useKeyboardShortcut(
  id: string,
  combo: KeyCombo,
  handler: (e: KeyboardEvent) => void,
  description?: string,
  deps: unknown[] = []
) {
  useEffect(() => {
    return registerShortcut(id, combo, handler, description);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ...deps]);
}
