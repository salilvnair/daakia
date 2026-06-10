/**
 * DevToolsPanel — Resizable bottom panel (like browser DevTools) with Console + Network tabs.
 * Positioned at the bottom of the main content area, below response/graphql/websocket panels.
 */
import { useRef, useCallback, useState, useEffect } from 'react';
import { useDevToolsStore } from '../../../store/devtools-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { TerminalIcon, NetworkIcon, DevToolsIcon, CloseIcon, TrashIcon, GaugeIcon } from '../../../icons';
import { getProtocolAccent } from '../../../colors';
import { useTabsStore } from '../../../store/tabs-store';
import { ConsoleTab } from './ConsoleTab';
import { NetworkTab } from './NetworkTab';
import { PerformanceTab } from './PerformanceTab';
import { AiInsightsTab } from './AiInsightsTab';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { SparkleIcon } from '../../../icons';

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 500;
const DEFAULT_HEIGHT = 200;

export function DevToolsPanel() {
  const isOpen = useDevToolsStore(s => s.isOpen);
  const activeTab = useDevToolsStore(s => s.activeTab);
  const setActiveTab = useDevToolsStore(s => s.setActiveTab);
  const close = useDevToolsStore(s => s.close);
  const clearLogs = useDevToolsStore(s => s.clearLogs);
  const clearNetwork = useDevToolsStore(s => s.clearNetwork);
  const intelligenceDashboardEnabled = useAiFeaturesStore(s => s.isEnabled('intelligenceDashboard'));
  const logs = useDevToolsStore(s => s.logs);
  const networkEntries = useDevToolsStore(s => s.networkEntries);
  const panelHeight = useDevToolsStore(s => s.panelHeight);
  const setPanelHeight = useDevToolsStore(s => s.setPanelHeight);

  const activeProtocol = useTabsStore(s => s.activeProtocol);
  const accent = getProtocolAccent(activeProtocol);

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startY: 0, startHeight: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Persist height to UI state store
  useEffect(() => {
    const stored = useUiStateStore.getState().getHeight('devtools.panel', DEFAULT_HEIGHT);
    if (stored !== DEFAULT_HEIGHT) {
      setPanelHeight(stored);
    }
  }, [setPanelHeight]);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: panelHeight };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [panelHeight]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const delta = dragRef.current.startY - e.clientY;
    const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dragRef.current.startHeight + delta));
    setPanelHeight(newHeight);
  }, [isDragging, setPanelHeight]);

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    useUiStateStore.getState().setHeight('devtools.panel', panelHeight);
  }, [isDragging, panelHeight]);

  const handleClear = useCallback(() => {
    if (activeTab === 'console') clearLogs();
    else clearNetwork();
  }, [activeTab, clearLogs, clearNetwork]);

  if (!isOpen) return null;

  const tabs: { key: typeof activeTab; label: string; icon: React.ReactNode }[] = [
    { key: 'console', label: 'Console', icon: <TerminalIcon size={13} /> },
    { key: 'network', label: 'Network', icon: <NetworkIcon size={13} /> },
    { key: 'performance', label: 'Performance', icon: <GaugeIcon size={13} /> },
    ...(intelligenceDashboardEnabled ? [{ key: 'ai-insights' as const, label: 'AI Insights', icon: <SparkleIcon size={13} /> }] : []),
  ];

  return (
    <div
      ref={panelRef}
      className="flex flex-col border-t border-[var(--color-surface-border)] bg-[var(--color-panel)]"
      style={{ height: panelHeight, minHeight: MIN_HEIGHT }}
    >
      {/* Drag handle */}
      <div
        className="h-[4px] cursor-row-resize flex-shrink-0 group relative"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[2px] rounded-full transition-all ${
            isDragging ? 'w-[80px]' : 'w-[40px] bg-[var(--color-surface-border)] group-hover:w-[60px]'
          }`}
          style={{ backgroundColor: isDragging ? accent : undefined }}
          onMouseEnter={(e) => { if (!isDragging) (e.currentTarget as HTMLElement).style.backgroundColor = accent; }}
          onMouseLeave={(e) => { if (!isDragging) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
        />
      </div>

      {/* Tab bar */}
      <div className="flex items-center h-[30px] px-2 border-b border-[var(--color-surface-border)] flex-shrink-0 gap-0.5">
        {/* DevTools label */}
        <div className="flex items-center gap-1 mr-2 text-[11px] text-[var(--color-text-muted)] select-none">
          <DevToolsIcon size={12} />
          <span className="font-medium uppercase tracking-wide">DevTools</span>
        </div>

        {/* Tabs */}
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`flex items-center gap-1 px-2 h-[24px] text-[11px] rounded transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'text-[var(--color-text-primary)] font-medium'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
            style={activeTab === tab.key ? { backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)` } : undefined}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        {activeTab !== 'performance' && activeTab !== 'ai-insights' && (
          <button
            className={`flex items-center justify-center w-[22px] h-[22px] rounded transition-colors ${
              (activeTab === 'console' ? logs.length > 0 : networkEntries.length > 0)
                ? 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)] cursor-pointer'
                : 'text-[var(--color-text-muted)] opacity-40 cursor-not-allowed'
            }`}
            onClick={handleClear}
            disabled={activeTab === 'console' ? logs.length === 0 : networkEntries.length === 0}
            title={`Clear ${activeTab}`}
          >
            <TrashIcon size={13} />
          </button>
        )}
        <button
          className="flex items-center justify-center w-[22px] h-[22px] rounded text-[var(--color-text-muted)] hover:text-[#ef4444] hover:bg-[var(--color-input-bg)] transition-colors cursor-pointer"
          onClick={close}
          title="Close DevTools"
        >
          <CloseIcon size={13} />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'console' && <ConsoleTab />}
        {activeTab === 'network' && <NetworkTab />}
        {activeTab === 'performance' && <PerformanceTab />}
        {activeTab === 'ai-insights' && <AiInsightsTab />}
      </div>
    </div>
  );
}
