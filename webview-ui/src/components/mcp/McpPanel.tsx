import { useState, useCallback, useRef } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { McpUrlBar } from './McpUrlBar';
import { McpRequestTabs } from './McpRequestTabs';
import { McpResponsePanel } from './McpResponsePanel';

/**
 * McpPanel — main panel shown when protocol=mcp.
 * Layout: URL bar → vertical split (config top / response bottom).
 */
export function McpPanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));

  // Vertical split state
  const storedSplit = useUiStateStore(s => s.panelHeights['split.mcp.main']);
  const [splitPercent, setSplitPercent] = useState(storedSplit ?? 50);
  const [isDragging, setIsDragging] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<'request' | 'response' | null>(null);
  const [showSplitterTip, setShowSplitterTip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const percent = ((e.clientY - rect.top) / rect.height) * 100;
    setSplitPercent(Math.max(10, Math.min(90, percent)));
    setFocusedPanel(null);
  }, [isDragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setIsDragging(false);
    useUiStateStore.getState().setHeight('split.mcp.main', splitPercent);
  }, [splitPercent]);

  const handleDoubleClick = useCallback(() => {
    setSplitPercent(50);
    setFocusedPanel(null);
    useUiStateStore.getState().setHeight('split.mcp.main', 50);
  }, []);

  const handleFocus = useCallback((panel: 'request' | 'response') => {
    if (isDragging) return;
    setFocusedPanel(panel);
    const target = panel === 'request' ? 70 : 25;
    setSplitPercent(target);
    useUiStateStore.getState().setHeight('split.mcp.main', target);
  }, [isDragging]);

  if (!activeTab) return null;

  const effectiveSplit = focusedPanel ? (focusedPanel === 'request' ? 70 : 25) : splitPercent;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <McpUrlBar />

      <div
        ref={containerRef}
        className="flex-1 flex flex-col overflow-hidden relative"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Request config (top) */}
        <div
          className="overflow-hidden"
          style={{ height: `${effectiveSplit}%`, transition: isDragging ? 'none' : 'height 200ms ease' }}
          onClick={() => handleFocus('request')}
        >
          <McpRequestTabs />
        </div>

        {/* Splitter (same style as REST/GraphQL) */}
        <div
          className="relative h-[6px] flex-shrink-0 cursor-row-resize group select-none"
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={() => setShowSplitterTip(true)}
          onMouseLeave={() => setShowSplitterTip(false)}
        >
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[3px] rounded-full transition-all duration-150 ${
            isDragging
              ? 'w-[80px] bg-[var(--color-protocol-mcp)]'
              : 'w-[44px] bg-[var(--color-surface-border)] group-hover:bg-[var(--color-protocol-mcp)] group-hover:w-[80px]'
          }`} />
          {showSplitterTip && !isDragging && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 bg-[var(--color-surface)] text-[var(--color-text-primary)] text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--color-surface-border)] shadow-lg whitespace-nowrap pointer-events-none z-50 flex flex-col gap-0.5 leading-tight">
              <div>Double-click to reset <kbd className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-panel)] font-mono">Alt+/</kbd></div>
              <div>Drag to resize</div>
            </div>
          )}
        </div>

        {/* Response panel (bottom) */}
        <div
          className="overflow-hidden"
          style={{ height: `${100 - effectiveSplit}%`, transition: isDragging ? 'none' : 'height 200ms ease' }}
          onClick={() => handleFocus('response')}
        >
          <McpResponsePanel />
        </div>
      </div>
    </div>
  );
}
