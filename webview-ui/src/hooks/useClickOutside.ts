import { useEffect, RefObject } from 'react';

/**
 * Hook that calls `onClose` when clicking outside the referenced element.
 * Attach the ref to the popup/dropdown container.
 */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;

    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use setTimeout to avoid catching the same click that opened the popup
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [ref, onClose, active]);
}
