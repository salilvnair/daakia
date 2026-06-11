import { useState, useRef, useCallback } from 'react';

export interface ResizablePanelViewProps {
  defaultHeight: number;
  minHeight?: number;
  maxHeight?: number;
  borderRadius?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ResizablePanelView({
  defaultHeight,
  minHeight = 40,
  maxHeight = 600,
  borderRadius = 8,
  children,
  className = '',
  style,
}: ResizablePanelViewProps) {
  const [height, setHeight] = useState(defaultHeight);
  const [gripHovered, setGripHovered] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startHeight: height };
  }, [height]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const delta = e.clientY - dragRef.current.startY;
    const newH = Math.max(minHeight, Math.min(maxHeight, dragRef.current.startHeight + delta));
    setHeight(newH);
  }, [minHeight, maxHeight]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }, []);

  return (
    <div
      className={className}
      style={{ position: 'relative', height, ...style }}
    >
      <div style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        borderRadius,
        border: '1px solid var(--color-surface-border)',
      }}>
        {children}
      </div>

      {/* Bottom-edge resize handle */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 10,
          cursor: 'ns-resize',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setGripHovered(true)}
        onMouseLeave={() => setGripHovered(false)}
      >
        {/* Dashed grip indicator */}
        <div style={{
          width: 40,
          height: 3,
          borderRadius: 9999,
          border: `1px dashed ${gripHovered ? 'var(--color-resizable-grip-hover)' : 'var(--color-resizable-grip)'}`,
          opacity: gripHovered ? 0.7 : 0.3,
          transition: 'opacity 150ms ease, border-color 150ms ease',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  );
}
