import { useState, useCallback, useRef } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { SoapUrlBar } from './SoapUrlBar';
import { SoapRequestConfig } from './SoapRequestConfig';
import { SoapResponsePanel } from './SoapResponsePanel';

const ACCENT = 'var(--color-protocol-soap)';

/**
 * SoapPanel — main panel shown when protocol=soap.
 * Layout: URL bar → vertical split (request config top / response bottom).
 */
export function SoapPanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));

  // Vertical split state
  const storedSplit = useUiStateStore(s => s.panelHeights['split.soap.main']);
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
    useUiStateStore.getState().setHeight('split.soap.main', splitPercent);
  }, [splitPercent]);

  const handleDoubleClick = useCallback(() => {
    setSplitPercent(50);
    setFocusedPanel(null);
    useUiStateStore.getState().setHeight('split.soap.main', 50);
  }, []);

  const handleRequestFocus = useCallback(() => {
    if (focusedPanel !== 'request') {
      setFocusedPanel('request');
      setSplitPercent(70);
    }
  }, [focusedPanel]);

  const handleResponseFocus = useCallback(() => {
    if (focusedPanel !== 'response') {
      setFocusedPanel('response');
      setSplitPercent(25);
    }
  }, [focusedPanel]);

  if (!activeTab) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* URL bar + SOAP action */}
      <SoapUrlBar />

      {/* Vertical split: request config (top) / response (bottom) */}
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 relative">
        {/* Top: Request config */}
        <div
          className="overflow-hidden flex flex-col"
          style={{
            height: `${splitPercent}%`,
            minHeight: 60,
            transition: isDragging ? 'none' : 'height 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          onFocus={handleRequestFocus}
        >
          <SoapRequestConfig />
        </div>

        {/* Splitter (pill-grip style matching REST) */}
        <div
          className="relative h-[6px] flex-shrink-0 cursor-row-resize group select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={() => setShowSplitterTip(true)}
          onMouseLeave={() => setShowSplitterTip(false)}
          aria-label="Resize request/response split"
        >
          {/* Pill grip */}
          <div
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[3px] rounded-full transition-all duration-150 ${
              isDragging
                ? 'w-[80px]'
                : 'w-[44px] bg-[var(--color-surface-border)] group-hover:w-[80px]'
            }`}
            style={{ backgroundColor: isDragging ? ACCENT : undefined }}
            onMouseEnter={(e) => { if (!isDragging) (e.currentTarget as HTMLElement).style.backgroundColor = ACCENT; }}
            onMouseLeave={(e) => { if (!isDragging) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
          />
          {/* Tooltip */}
          {showSplitterTip && !isDragging && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 bg-[var(--color-surface)] text-[var(--color-text-primary)] text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--color-surface-border)] shadow-lg whitespace-nowrap pointer-events-none z-50 flex flex-col gap-0.5 leading-tight">
              <div>Double-click to reset <kbd className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-panel)] font-mono">Alt+/</kbd></div>
              <div>Drag to resize</div>
            </div>
          )}
        </div>

        {/* Bottom: Response */}
        <div
          className="flex-1 min-h-[60px] flex flex-col overflow-hidden"
          style={{ transition: isDragging ? 'none' : 'all 180ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          onFocus={handleResponseFocus}
        >
          <SoapResponsePanel />
        </div>
      </div>
    </div>
  );
}
