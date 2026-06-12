import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '../../../icons';
import './BottomPanelView.css';

export interface BottomPanelTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
}

export interface BottomPanelViewProps {
  tabs: BottomPanelTab[];
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  defaultCollapsed?: boolean;
  accentColor?: string;
  className?: string;
}

export function BottomPanelView({
  tabs,
  defaultHeight = 200,
  minHeight = 80,
  maxHeight = 600,
  defaultCollapsed = false,
  accentColor,
  className = '',
}: BottomPanelViewProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');
  const [height, setHeight] = useState(defaultHeight);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startH = useRef(defaultHeight);
  const accent = accentColor || 'var(--color-primary)';

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return;
    const delta = startY.current - e.clientY;
    const next = Math.max(minHeight, Math.min(maxHeight, startH.current + delta));
    setHeight(next);
  }, [dragging, minHeight, maxHeight]);

  const onMouseUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, onMouseMove, onMouseUp]);

  const activeContent = tabs.find(t => t.id === activeTab)?.content;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-panel)',
        borderTop: '1px solid var(--color-panel-border)',
        height: collapsed ? 'auto' : height,
        userSelect: dragging ? 'none' : undefined,
      }}
    >
      {/* Drag handle */}
      <div
        className="dui_bottom-panel__drag-handle"
        style={{ height: 4, cursor: 'row-resize', background: 'transparent', flexShrink: 0 }}
        onMouseDown={e => {
          e.preventDefault();
          if (!collapsed) { setDragging(true); startY.current = e.clientY; startH.current = height; }
        }}
      />

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        borderBottom: collapsed ? 'none' : '1px solid var(--color-panel-border)',
        flexShrink: 0,
      }}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveTab(tab.id); if (collapsed) setCollapsed(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '5px 12px', height: 30,
                fontSize: '11px', fontWeight: isActive ? 600 : 400,
                color: isActive ? accent : 'var(--color-text-muted)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: isActive ? `2px solid ${accent}` : '2px solid transparent',
                transition: 'color 100ms',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--color-text-muted)', marginRight: '4px',
          }}
        >
          {collapsed ? <ChevronRightIcon size={12} style={{ transform: 'rotate(-90deg)' }} /> : <ChevronDownIcon size={12} />}
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          {activeContent}
        </div>
      )}
    </div>
  );
}
