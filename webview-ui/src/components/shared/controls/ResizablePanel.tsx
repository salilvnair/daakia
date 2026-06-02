/**
 * ResizablePanel — wraps content with a draggable bottom-edge handle to resize height.
 * Shows a dashed grip indicator at the bottom-center.
 * When `id` is provided, height is persisted in the UI state store.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useUiStateStore } from '../../../store/ui-state-store';

interface ResizablePanelProps {
  /** Unique ID for height persistence. If omitted, height is local only. */
  id?: string;
  defaultHeight: number;
  minHeight?: number;
  maxHeight?: number;
  children: React.ReactNode;
  className?: string;
}

export function ResizablePanel({ id, defaultHeight, minHeight = 40, maxHeight = 600, children, className = '' }: ResizablePanelProps) {
  const storedHeight = useUiStateStore(s => id ? s.panelHeights[id] : undefined);
  const setStoredHeight = useUiStateStore(s => s.setHeight);
  const [height, setHeight] = useState(storedHeight ?? defaultHeight);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync from store when hydrated (e.g., on reload)
  useEffect(() => {
    if (storedHeight !== undefined && storedHeight !== height) {
      setHeight(storedHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedHeight]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startHeight: height };
  }, [height]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const delta = e.clientY - dragRef.current.startY;
    const newHeight = Math.max(minHeight, Math.min(maxHeight, dragRef.current.startHeight + delta));
    setHeight(newHeight);
  }, [minHeight, maxHeight]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (dragRef.current && id) {
      // Persist final height
      setStoredHeight(id, height);
    }
    dragRef.current = null;
  }, [id, height, setStoredHeight]);

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ height }}>
      <div className="absolute inset-0 overflow-hidden rounded-lg border border-[var(--color-surface-border)]">
        {children}
      </div>
      {/* Resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[10px] cursor-ns-resize z-10 flex items-center justify-center group/handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Dashed grip indicator */}
        <div className="w-[40px] h-[3px] rounded-full border border-dashed border-[var(--color-text-muted)] opacity-30 group-hover/handle:opacity-70 group-hover/handle:border-[var(--color-primary)] transition-all" />
      </div>
    </div>
  );
}
