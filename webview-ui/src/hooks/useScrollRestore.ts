import { useEffect, useRef, useCallback } from 'react';
import { useUiStateStore } from '../store/ui-state-store';

/**
 * Hook that saves/restores scroll position for a scrollable container.
 * Attaches to a DOM element ref and persists position in ui-state-store.
 *
 * @param scrollId - Unique identifier for this scrollable area (e.g., "rest.collections", "tab.{id}.response")
 * @param deps - Dependency array that triggers restore (e.g., [activeTabId])
 */
export function useScrollRestore(scrollId: string | undefined, deps: unknown[] = []) {
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced scroll save
  const handleScroll = useCallback(() => {
    if (!scrollId || !containerRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (containerRef.current) {
        useUiStateStore.getState().setScroll(scrollId, containerRef.current.scrollTop);
      }
    }, 300);
  }, [scrollId]);

  // Restore scroll position when deps change
  useEffect(() => {
    if (!scrollId || !containerRef.current) return;
    const saved = useUiStateStore.getState().getScroll(scrollId);
    if (saved > 0) {
      containerRef.current.scrollTop = saved;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollId, ...deps]);

  // Attach scroll listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !scrollId) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [handleScroll, scrollId]);

  return containerRef;
}
