import { useRef, useCallback, useEffect } from 'react';
import './HudView.css';

export interface HudItem {
  id: string;
  icon: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  /** Renders a highlighted active state (e.g. "mute breakpoints" toggled on) */
  active?: boolean;
  /** Separator before this item */
  separator?: boolean;
}

export interface HudViewProps {
  items: HudItem[];
  /** Short status text rendered after the last item */
  status?: string;
  /** Optional accent color — sets --dui-hud-accent CSS custom property */
  accentColor?: string;
  /** Optional color used for the active (toggled) button state — sets --dui-hud-active-color */
  activeColor?: string;
  className?: string;
  onDragEnd?: (x: number, y: number) => void;
  /** Embed in a positioned container — uses position:relative, drag disabled. For showcase/preview use. */
  contained?: boolean;
}

export function HudView({
  items,
  status,
  accentColor,
  activeColor,
  className = '',
  onDragEnd,
  contained = false,
}: HudViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; originLeft: number; originTop: number }>({
    dragging: false,
    startX: 0,
    startY: 0,
    originLeft: 0,
    originTop: 0,
  });

  const onMouseMove = useCallback((e: MouseEvent) => {
    const d = dragState.current;
    if (!d.dragging || !rootRef.current) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const el = rootRef.current;
    const newLeft = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, d.originLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, d.originTop + dy));
    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
    el.style.transform = 'none';
  }, []);

  const onMouseUp = useCallback((e: MouseEvent) => {
    const d = dragState.current;
    if (!d.dragging) return;
    d.dragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    if (rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      onDragEnd?.(rect.left, rect.top);
    }
    e.stopPropagation();
  }, [onMouseMove, onDragEnd]);

  const onDragMouseDown = useCallback((e: React.MouseEvent) => {
    if (!rootRef.current) return;
    e.preventDefault();
    const rect = rootRef.current.getBoundingClientRect();
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
    };
    rootRef.current.style.left = `${rect.left}px`;
    rootRef.current.style.top = `${rect.top}px`;
    rootRef.current.style.transform = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [onMouseMove, onMouseUp]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const customStyle = {
    ...(accentColor ? { '--dui-hud-accent': accentColor } : {}),
    ...(activeColor ? { '--dui-hud-active-color': activeColor } : {}),
  } as React.CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`dui_hud${contained ? ' dui_hud--contained' : ''}${className ? ` ${className}` : ''}`}
      style={customStyle}
    >
      {/* Drag handle — hidden grip in contained/showcase mode */}
      <div
        className="dui_hud__drag"
        onMouseDown={contained ? undefined : onDragMouseDown}
        title={contained ? undefined : 'Drag to move'}
        style={contained ? { cursor: 'default', opacity: 0.25 } : undefined}
      >
        <span className="dui_hud__grip" />
      </div>

      {/* Items */}
      {items.map(item => (
        <div key={item.id} style={{ display: 'contents' }}>
          {item.separator && <div className="dui_hud__sep" />}
          <button
            type="button"
            className={`dui_hud__btn${item.active ? ' dui_hud__btn--active' : ''}`}
            onClick={item.onClick}
            disabled={item.disabled}
            title={item.title}
          >
            {item.icon}
          </button>
        </div>
      ))}

      {/* Status text */}
      {status && <span className="dui_hud__status">{status}</span>}
    </div>
  );
}
