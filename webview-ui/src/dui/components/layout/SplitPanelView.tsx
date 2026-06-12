import { useState, useRef, useEffect } from 'react';

export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitPanelViewProps {
  direction?: SplitDirection;
  first: React.ReactNode;
  second: React.ReactNode;
  /** Initial split (0–100%) for the first panel. Uncontrolled default. */
  defaultSplit?: number;
  /** Controlled split value. When provided, overrides internal state — wire with onResize. */
  split?: number;
  /** Min px size for first panel */
  minFirst?: number;
  /** Min px size for second panel */
  minSecond?: number;
  accentColor?: string;
  /** Fired on every drag move and on double-click reset */
  onResize?: (split: number) => void;
  /** Fired once when drag ends (pointer up) or on double-click reset */
  onResizeEnd?: (split: number) => void;
  /**
   * Tooltip shown on pill hover. Pass `null` to suppress.
   * Defaults to "Double-click to reset Alt+/ / Drag to resize" with a styled kbd badge.
   */
  pillTooltip?: React.ReactNode | null;
  style?: React.CSSProperties;
  className?: string;
}

const KBD: React.CSSProperties = {
  fontSize: 9,
  padding: '1px 5px',
  borderRadius: 3,
  background: 'var(--color-panel)',
  fontFamily: 'monospace',
  border: '1px solid color-mix(in srgb, var(--color-text-primary) 15%, transparent)',
};

const DEFAULT_PILL_TOOLTIP = (
  <>
    <div>Double-click to reset <kbd style={KBD}>Alt+/</kbd></div>
    <div>Drag to resize</div>
  </>
);

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export function SplitPanelView({
  direction = 'horizontal',
  first,
  second,
  defaultSplit = 50,
  split: splitProp,
  minFirst = 80,
  minSecond = 80,
  accentColor,
  onResize,
  onResizeEnd,
  pillTooltip = DEFAULT_PILL_TOOLTIP,
  style,
  className = '',
}: SplitPanelViewProps) {
  const [internalSplit, setInternalSplit] = useState(splitProp ?? defaultSplit);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragActiveRef = useRef(false);
  const isHoriz = direction === 'horizontal';
  const accent = accentColor || 'var(--color-primary)';
  const pillActive = dragging || hovered;

  // Sync internal split when controlled prop changes
  useEffect(() => {
    if (splitProp !== undefined) setInternalSplit(splitProp);
  }, [splitProp]);

  const currentSplit = splitProp !== undefined ? splitProp : internalSplit;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragActiveRef.current = true;
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragActiveRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const total = isHoriz ? rect.width : rect.height;
    const pos = isHoriz ? e.clientX - rect.left : e.clientY - rect.top;
    const pct = Math.max(
      (minFirst / total) * 100,
      Math.min((1 - minSecond / total) * 100, (pos / total) * 100),
    );
    setInternalSplit(pct);
    onResize?.(pct);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragActiveRef.current = false;
    setDragging(false);
    onResizeEnd?.(internalSplit);
  };

  const handleDoubleClick = () => {
    setInternalSplit(defaultSplit);
    onResize?.(defaultSplit);
    onResizeEnd?.(defaultSplit);
  };

  const firstStyle: React.CSSProperties = isHoriz
    ? { width: `${currentSplit}%`, minWidth: minFirst, height: '100%', overflow: 'hidden',
        transition: dragging ? 'none' : `width 180ms ${EASE}` }
    : { height: `${currentSplit}%`, minHeight: minFirst, width: '100%', overflow: 'hidden',
        transition: dragging ? 'none' : `height 180ms ${EASE}` };

  const secondStyle: React.CSSProperties = isHoriz
    ? { flex: 1, minWidth: minSecond, height: '100%', overflow: 'hidden' }
    : { flex: 1, minHeight: minSecond, width: '100%', overflow: 'hidden',
        transition: dragging ? 'none' : `all 180ms ${EASE}` };

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
        ...style,
      }}
    >
      <div style={firstStyle}>{first}</div>

      {/* Drag handle */}
      <div
        style={{
          flexShrink: 0,
          width: isHoriz ? 6 : '100%',
          height: isHoriz ? '100%' : 6,
          cursor: isHoriz ? 'col-resize' : 'row-resize',
          position: 'relative',
          userSelect: 'none',
          zIndex: 10,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={handleDoubleClick}
        aria-label="Resize panels"
      >
        {/* Pill indicator */}
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

        {/* Tooltip — anchored below pill (vertical) or to the right (horizontal) */}
        {pillTooltip != null && hovered && !dragging && (
          <div
            style={{
              position: 'absolute',
              ...(isHoriz
                ? { left: 'calc(100% + 4px)', top: '50%', transform: 'translateY(-50%)' }
                : { left: '50%', top: 'calc(100% + 4px)', transform: 'translateX(-50%)' }
              ),
              background: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              fontSize: 11,
              lineHeight: 1.7,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid var(--color-surface-border)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          >
            {pillTooltip}
          </div>
        )}
      </div>

      <div style={secondStyle}>{second}</div>
    </div>
  );
}
