import { useState, useRef } from 'react';

export type ResizeDirection = 'horizontal' | 'vertical';

export interface ResizablePanelViewProps {
  direction?: ResizeDirection;
  first: React.ReactNode;
  second: React.ReactNode;
  defaultSplit?: number; // 0–100 percent for first panel
  minFirst?: number;     // px min for first panel
  minSecond?: number;    // px min for second panel
  accentColor?: string;
  onResize?: (split: number) => void;
  className?: string;
}

export function ResizablePanelView({
  direction = 'horizontal',
  first,
  second,
  defaultSplit = 50,
  minFirst = 80,
  minSecond = 80,
  accentColor,
  onResize,
  className = '',
}: ResizablePanelViewProps) {
  const [split, setSplit] = useState(defaultSplit);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startPos: 0, startSplit: 0 });
  const isHoriz = direction === 'horizontal';
  const accent = accentColor || 'var(--color-primary)';
  const pillActive = dragging || hovered;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startPos: isHoriz ? e.clientX : e.clientY,
      startSplit: split,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const total = isHoriz ? rect.width : rect.height;
    const pos   = isHoriz ? e.clientX - rect.left : e.clientY - rect.top;
    const pct = Math.max(
      (minFirst  / total) * 100,
      Math.min((1 - minSecond / total) * 100, (pos / total) * 100),
    );
    setSplit(pct);
    onResize?.(pct);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current.active = false;
    setDragging(false);
  };

  const handleDoubleClick = () => {
    setSplit(defaultSplit);
    onResize?.(defaultSplit);
  };

  const firstStyle: React.CSSProperties = isHoriz
    ? { width: `${split}%`, minWidth: minFirst, height: '100%', overflow: 'hidden' }
    : { height: `${split}%`, minHeight: minFirst, width: '100%', overflow: 'hidden' };

  const secondStyle: React.CSSProperties = isHoriz
    ? { flex: 1, minWidth: minSecond, height: '100%', overflow: 'hidden' }
    : { flex: 1, minHeight: minSecond, width: '100%', overflow: 'hidden' };

  // Pill sizes — thin resting state, taller/wider on hover or drag (ditto PromptLibraryPanel)
  const pillW = isHoriz ? 3 : (pillActive ? 80 : 44);
  const pillH = isHoriz ? (pillActive ? 80 : 44) : 3;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: 'flex',
        flexDirection: isHoriz ? 'row' : 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={firstStyle}>{first}</div>

      {/* Drag area — 5px wide, transparent except for pill indicator */}
      <div
        style={{
          flexShrink: 0,
          width: isHoriz ? 5 : '100%',
          height: isHoriz ? '100%' : 5,
          cursor: isHoriz ? 'col-resize' : 'row-resize',
          position: 'relative',
          userSelect: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={handleDoubleClick}
      >
        {/* Pill indicator — same pattern as PromptLibraryPanel splitter */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: pillW,
            height: pillH,
            borderRadius: 9999,
            background: pillActive ? accent : 'var(--color-surface-border)',
            transition: `${isHoriz ? 'height' : 'width'} 150ms ease, background 150ms ease`,
            pointerEvents: 'none',
          }}
        />
      </div>

      <div style={secondStyle}>{second}</div>
    </div>
  );
}
