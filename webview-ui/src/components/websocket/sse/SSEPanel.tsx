import { useState, useEffect, useRef, useCallback } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useUrlSuggestionsStore } from '../../../store/url-suggestions-store';
import { postMsg } from '../../../vscode';
import { saveRequest } from '../../../services/request';
import {
  ConnectIcon, DisconnectIcon, SaveIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon,
  ArrowDownLeftIcon, AutoScrollIcon, ChevronDownIcon, CopyIcon,
  CheckIcon, InfoCircleIcon, WarningTriangleIcon, CheckCircleFilledIcon, DownloadIcon, WrapLinesIcon, RadioIcon,
  MoreVerticalIcon, SparkleIcon,
} from '../../../icons';
import { HighlightedInput, SplitButton } from '../../shared';
import type { SplitButtonItem } from '../../shared';
import { useMockSuggestions } from '../../../hooks/useMockSuggestions';
import { AiRealtimeLogActions } from '../../ai/AiRealtimeLogActions';
import { AiPreflightPopover } from '../../ai/AiPreflightPopover';
import { PatternBaselinePopup } from '../../ai/AiRequestPatternStatus';
import { useAiFeaturesStore } from '../../../store/ai-features-store';

// ────────── Types ──────────

interface SseEvent {
  id: string;
  eventType: string;
  data: string;
  eventId?: string;
  timestamp: number;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

// ────────── Per-tab state cache (survives tab switches) ──────────
const eventsCache = new Map<string, SseEvent[]>();
const connStateCache = new Map<string, ConnectionState>();
const errorCache = new Map<string, string | null>();

// ────────── SSE Panel ──────────

export function SSEPanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);
  const updateTab = useTabsStore(s => s.updateTab);
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.sse);
  const mockSuggestions = useMockSuggestions('sse');

  const [connState, setConnStateLocal] = useState<ConnectionState>(connStateCache.get(activeTabId!) || 'disconnected');
  const [events, setEventsLocal] = useState<SseEvent[]>(eventsCache.get(activeTabId!) || []);
  const [autoScroll, setAutoScroll] = useState(true);
  const [error, setErrorLocal] = useState<string | null>(errorCache.get(activeTabId!) ?? null);

  // Wrap setters to also update cache
  const setConnState = useCallback((v: ConnectionState) => {
    setConnStateLocal(v);
    if (activeTabId) connStateCache.set(activeTabId, v);
  }, [activeTabId]);
  const setEvents = useCallback((v: SseEvent[] | ((prev: SseEvent[]) => SseEvent[])) => {
    setEventsLocal(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      if (activeTabId) eventsCache.set(activeTabId, next);
      return next;
    });
  }, [activeTabId]);
  const setError = useCallback((v: string | null) => {
    setErrorLocal(v);
    if (activeTabId) errorCache.set(activeTabId, v);
  }, [activeTabId]);

  // Persisted field — read from authData
  const ad = activeTab?.authData || {};
  const [eventType, setEventTypeLocal] = useState(ad['sse_eventType'] || 'data');

  const setEventType = useCallback((v: string) => {
    setEventTypeLocal(v);
    if (activeTab) updateTab(activeTab.id, { authData: { ...activeTab.authData, sse_eventType: v } });
  }, [activeTab, updateTab]);

  // Sync when tab changes
  useEffect(() => {
    const a = activeTab?.authData || {};
    setEventTypeLocal(a['sse_eventType'] || 'data');
  }, [activeTabId]);

  // Vertical split (same pattern as WebSocketPanel)
  const storedSplit = useUiStateStore(s => s.panelHeights['split.sse.main']);
  const [splitPercent, setSplitPercent] = useState(storedSplit ?? 50);
  const [isDragging, setIsDragging] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<'request' | 'log' | null>(null);
  const [showSplitterTip, setShowSplitterTip] = useState(false);
  const [showAiOverflow, setShowAiOverflow] = useState(false);
  const [aiOverflowDir, setAiOverflowDir] = useState<'down' | 'up'>('down');
  const [showPreflight, setShowPreflight] = useState(false);
  const [showPatternStatus, setShowPatternStatus] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiOverflowRef = useRef<HTMLDivElement>(null);
  const aiOverflowBtnRef = useRef<HTMLButtonElement>(null);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const openDaakiaAiTab = useTabsStore(s => s.openDaakiaAiTab);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && events.length > 0 && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Close AI overflow on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (aiOverflowRef.current && !aiOverflowRef.current.contains(e.target as Node)) setShowAiOverflow(false);
    };
    if (showAiOverflow) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAiOverflow]);

  // Listen for SSE events from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!activeTab || msg.tabId !== activeTab.id) return;

      switch (msg.type) {
        case 'sse:connected':
          setConnState('connected');
          setError(null);
          if (activeTab.url) useUrlSuggestionsStore.getState().addUrls([activeTab.url], 'sse');
          setEvents(prev => [...prev, {
            id: crypto.randomUUID(),
            eventType: '__system__',
            data: `Connected to ${activeTab.url}`,
            timestamp: Date.now(),
          }]);
          break;
        case 'sse:event':
          setEvents(prev => [...prev, {
            id: crypto.randomUUID(),
            eventType: msg.eventType || 'message',
            data: msg.data,
            eventId: msg.id,
            timestamp: msg.timestamp,
          }]);
          break;
        case 'sse:error':
          setError(msg.error);
          setConnState('disconnected');
          setEvents(prev => [...prev, {
            id: crypto.randomUUID(),
            eventType: '__error__',
            data: msg.error,
            timestamp: Date.now(),
          }]);
          break;
        case 'sse:disconnected':
          setConnState('disconnected');
          setError(null);
          setEvents(prev => [...prev, {
            id: crypto.randomUUID(),
            eventType: '__disconnect__',
            data: 'Disconnected',
            timestamp: Date.now(),
          }]);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [activeTab]);

  // Restore per-tab state on tab change
  useEffect(() => {
    setConnStateLocal(connStateCache.get(activeTabId!) || 'disconnected');
    setEventsLocal(eventsCache.get(activeTabId!) || []);
    setErrorLocal(errorCache.get(activeTabId!) ?? null);
  }, [activeTabId]);

  const handleConnect = useCallback(() => {
    if (!activeTab) return;
    const url = activeTab.url.trim();
    if (!url) return;
    setConnState('connecting');
    setError(null);
    postMsg({ type: 'sse:connect', tabId: activeTab.id, url, eventType, headers: activeTab.headers?.filter((h: any) => h.enabled && h.key) || [], envId: activeTab.envId });
  }, [activeTab, eventType]);

  const handleDisconnect = useCallback(() => {
    if (!activeTab) return;
    postMsg({ type: 'sse:disconnect', tabId: activeTab.id });
    setConnState('disconnected');
  }, [activeTab]);

  const handleClear = useCallback(() => setEvents([]), [setEvents]);

  // Splitter handlers
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
    useUiStateStore.getState().setHeight('split.sse.main', splitPercent);
  }, [splitPercent]);

  const handleRequestFocus = useCallback(() => {
    if (focusedPanel !== 'request') {
      setFocusedPanel('request');
      setSplitPercent(70);
    }
  }, [focusedPanel]);

  const handleLogFocus = useCallback(() => {
    if (focusedPanel !== 'log') {
      setFocusedPanel('log');
      setSplitPercent(25);
    }
  }, [focusedPanel]);

  if (!activeTab) return null;

  const statusColor = connState === 'connected' ? 'var(--color-protocol-sse)'
    : connState === 'connecting' ? 'var(--color-warning)'
    : 'var(--color-text-muted)';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
        {/* Protocol badge */}
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider text-[var(--color-protocol-sse)] bg-[rgba(245,158,11,0.12)]">
          SSE
        </span>

        {/* Connection indicator */}
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-colors"
          style={{ backgroundColor: statusColor }}
          title={connState}
        />

        {/* URL input */}
        <div className="flex-[2] min-w-0">
          <HighlightedInput
            value={activeTab.url}
            onChange={(v) => updateTab(activeTab.id, { url: v })}
            onKeyDown={(e) => { if (e.key === 'Enter') connState === 'disconnected' ? handleConnect() : handleDisconnect(); }}
            placeholder="https://api.example.com/events"
            disabled={connState === 'connected'}
            suggestions={urlSuggestions}
            mockServers={mockSuggestions}
            protocolHints={['http://', 'https://']}
            accentColor="var(--color-protocol-websocket)"
          />
        </div>

        {/* Event type input */}
        <div className="flex items-center gap-1.5 flex-[1] min-w-0">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded whitespace-nowrap" style={{ color: 'var(--color-protocol-sse)', backgroundColor: 'rgba(245,158,11,0.12)' }}>Event Type</span>
          <input
            type="text"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            disabled={connState === 'connected'}
            className="h-[36px] flex-1 min-w-[80px] px-2.5 text-[12px] font-mono rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
            placeholder="data"
          />
        </div>

        {/* Start/Stop button */}
        {connState === 'disconnected' ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={!activeTab.url.trim()}
            className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-protocol-sse)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity flex items-center gap-1.5 flex-shrink-0"
          >
            <ConnectIcon size={12} />
            Start
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDisconnect}
            className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[rgba(239,68,68,0.12)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.2)] cursor-pointer transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <DisconnectIcon size={12} />
            Stop
          </button>
        )}

        {/* Save SplitButton */}
        <SplitButton
          label="Save"
          variant="secondary"
          onClick={() => {
            const saved = saveRequest(activeTab);
            if (saved) updateTab(activeTab.id, { dirty: false });
          }}
          icon={<SaveIcon />}
          items={sseSaveItems}
        />

        {/* 9.12: AI Tools ⋮ menu */}
        <div className="flex-shrink-0 relative" ref={aiOverflowRef}>
          <button ref={aiOverflowBtnRef} type="button"
            onClick={() => {
              if (!showAiOverflow && aiOverflowBtnRef.current) {
                const rect = aiOverflowBtnRef.current.getBoundingClientRect();
                setAiOverflowDir((window.innerHeight - rect.bottom) < 160 ? 'up' : 'down');
              }
              setShowAiOverflow(p => !p);
            }}
            title="AI tools"
            className="flex items-center justify-center w-[36px] h-[36px] rounded-md cursor-pointer transition-colors"
            style={{ color: showAiOverflow ? 'var(--color-text-primary)' : 'var(--color-text-muted)', backgroundColor: showAiOverflow ? 'rgba(255,255,255,0.08)' : 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = showAiOverflow ? 'rgba(255,255,255,0.08)' : 'transparent'; e.currentTarget.style.color = showAiOverflow ? 'var(--color-text-primary)' : 'var(--color-text-muted)'; }}
          >
            <MoreVerticalIcon size={15} />
          </button>
          {showAiOverflow && (
            <div className={`absolute right-0 z-50 rounded-xl border shadow-2xl overflow-hidden min-w-[200px] ${aiOverflowDir === 'up' ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]'}`}
              style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
            >
              <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
                <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>AI Tools</p>
              </div>
              {activeTab.url.trim() && aiEnabled('preflightCheck') && (
                <button type="button" className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left" style={{ color: 'var(--color-protocol-ai)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  onClick={() => { setShowPreflight(true); setShowAiOverflow(false); }}
                >
                  <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />Pre-flight Check
                </button>
              )}
              {aiEnabled('daakiaAiChat') && (
                <button type="button" className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left" style={{ color: 'var(--color-protocol-ai)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  onClick={() => { openDaakiaAiTab(); setShowAiOverflow(false); }}
                >
                  <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />Ask AI
                </button>
              )}
              {activeTab.url.trim() && aiEnabled('patternBaseline') && (
                <button type="button" className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left" style={{ color: 'var(--color-protocol-ai)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  onClick={() => { setShowPatternStatus(p => !p); setShowAiOverflow(false); }}
                >
                  <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />Pattern Baseline
                </button>
              )}
            </div>
          )}
          {showPreflight && activeTab.url.trim() && <AiPreflightPopover tab={activeTab} onClose={() => setShowPreflight(false)} />}
          {showPatternStatus && activeTab.url.trim() && aiEnabled('patternBaseline') && (
            <PatternBaselinePopup method="SSE" url={activeTab.url} onClose={() => setShowPatternStatus(false)} dir={aiOverflowDir} />
          )}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 relative">
        {/* Top: Status / info area */}
        <div
          className="overflow-hidden flex flex-col"
          style={{
            height: `${splitPercent}%`,
            minHeight: 60,
            transition: isDragging ? 'none' : 'height 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          onFocus={handleRequestFocus}
        >
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-2">
            {error && (
              <div className="w-full px-3 py-2 text-[11px] text-[var(--color-error)] bg-[rgba(239,68,68,0.06)] border border-[var(--color-surface-border)] rounded-md mb-2">
                {error}
              </div>
            )}
            {connState === 'connected' ? (
              <>
                <span className="w-3 h-3 rounded-full bg-[var(--color-protocol-sse)] animate-pulse" />
                <p className="text-[12px] text-[var(--color-text-primary)]">Listening for events...</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  {events.length} event{events.length !== 1 ? 's' : ''} received
                </p>
              </>
            ) : (
              <>
                <RadioIcon size={28} className="text-[var(--color-text-muted)] opacity-30" />
                <p className="text-[12px] text-[var(--color-text-muted)]">Not connected</p>
                <p className="text-[11px] text-[var(--color-text-muted)] opacity-70">
                  Enter a URL and click Start to begin receiving server-sent events
                </p>
              </>
            )}
          </div>
        </div>

        {/* Splitter (pill-grip — same as WS) */}
        <div
          className="relative h-[6px] flex-shrink-0 cursor-row-resize group select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={() => { setSplitPercent(50); setFocusedPanel(null); useUiStateStore.getState().setHeight('split.sse.main', 50); }}
          onMouseEnter={() => setShowSplitterTip(true)}
          onMouseLeave={() => setShowSplitterTip(false)}
        >
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[3px] rounded-full transition-all duration-150 ${
            isDragging
              ? 'w-[80px] bg-[var(--color-protocol-sse)]'
              : 'w-[44px] bg-[var(--color-surface-border)] group-hover:bg-[var(--color-protocol-sse)] group-hover:w-[80px]'
          }`} />
          {showSplitterTip && !isDragging && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 bg-[var(--color-surface)] text-[var(--color-text-primary)] text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--color-surface-border)] shadow-lg whitespace-nowrap pointer-events-none z-50 flex flex-col gap-0.5 leading-tight">
              <div>Double-click to reset</div>
              <div>Drag to resize</div>
            </div>
          )}
        </div>

        {/* Bottom: Log panel */}
        <div
          className="flex-1 min-h-[60px] flex flex-col overflow-hidden"
          style={{ transition: isDragging ? 'none' : 'all 180ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          onFocus={handleLogFocus}
        >
          {/* Log header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Log</span>
              {events.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-[rgba(245,158,11,0.12)] text-[var(--color-protocol-sse)]">
                  {events.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleClear}
                disabled={events.length === 0}
                className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center rounded-md"
                title="Clear log"
              >
                <TrashIcon size={12} />
              </button>
              <button
                type="button"
                onClick={() => logContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                disabled={events.length === 0}
                className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center rounded-md"
                title="Scroll to top"
              >
                <ArrowUpIcon size={13} />
              </button>
              <button
                type="button"
                onClick={() => { if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight; }}
                disabled={events.length === 0}
                className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center rounded-md"
                title="Scroll to bottom"
              >
                <ArrowDownIcon size={13} />
              </button>
              <button
                type="button"
                onClick={() => setAutoScroll(!autoScroll)}
                className={`h-[26px] w-[26px] flex items-center justify-center cursor-pointer transition-colors rounded-md ${
                  autoScroll
                    ? 'text-[var(--color-protocol-sse)] hover:bg-[rgba(245,158,11,0.08)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                }`}
                title={autoScroll ? 'Autoscroll: Turn off' : 'Autoscroll: Turn on'}
              >
                <AutoScrollIcon size={14} />
              </button>
              {/* 9.10-9.16: AI log actions */}
              <AiRealtimeLogActions
                tabId={activeTab.id}
                url={activeTab.url || ''}
                protocol="sse"
                messages={events.filter(e => e.eventType !== '__system__' && e.eventType !== '__error__' && e.eventType !== '__disconnect__').map(e => e.data)}
                hasError={!!error}
                errorMsg={error || ''}
                accentColor="var(--color-protocol-sse)"
                trafficAnalyzerFlag="sseTrafficAnalyzer"
                showEventSuggester={true}
                observedEventTypes={[...new Set(events.filter(e => !['__system__','__error__','__disconnect__'].includes(e.eventType)).map(e => e.eventType))]}
              />
            </div>
          </div>

          {/* Events log */}
          <div ref={logContainerRef} className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
            {events.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-2">
                <span className="text-[28px] opacity-20">⟨/⟩</span>
                <p className="text-[12px]">
                  {connState === 'connected' ? 'Waiting for events...' : 'Connect to start receiving events'}
                </p>
              </div>
            ) : (
              events.map(evt => <SseLogEntry key={evt.id} event={evt} />)
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────── Copy Button ──────────

function CopyButton({ text, size = 13 }: { text: string; size?: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`h-[24px] w-[24px] flex items-center justify-center cursor-pointer rounded transition-colors ${
        copied
          ? 'text-[var(--color-success)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
      }`}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? <CheckIcon size={size} /> : <CopyIcon size={size} />}
    </button>
  );
}

// ────────── Save Items ──────────

const sseSaveItems: SplitButtonItem[] = [
  {
    id: 'save-as',
    label: 'Save as',
    icon: <SaveIcon />,
    iconColor: 'var(--color-ctx-close-saved)',
    onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }),
  },
];

// ────────── SSE Log Entry (collapsible, like WS) ──────────

function SseLogEntry({ event }: { event: SseEvent }) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'json' | 'raw'>('json');
  const [wordWrap, setWordWrap] = useState(false);

  const timeStr = new Date(event.timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  let formattedData = event.data;
  let isJson = false;
  try {
    const parsed = JSON.parse(event.data);
    formattedData = JSON.stringify(parsed, null, 2);
    isJson = true;
  } catch { /* keep raw */ }

  const singleLine = isJson ? JSON.stringify(JSON.parse(event.data)) : event.data;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const content = viewMode === 'json' && isJson ? formattedData : event.data;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sse-event-${event.id.slice(0, 8)}.${isJson ? 'json' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isSystem = event.eventType === '__system__';
  const isError = event.eventType === '__error__';
  const isDisconnect = event.eventType === '__disconnect__';
  const isStatusMsg = isSystem || isError || isDisconnect;

  return (
    <div className="border-b border-[var(--color-surface-border)] last:border-b-0 group/row">
      {/* Collapsed row */}
      <div
        onClick={() => !isStatusMsg && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left ${isStatusMsg ? '' : 'cursor-pointer hover:bg-[var(--color-hover)]'}`}
      >
        {/* Direction icon */}
        {isError ? (
          <WarningTriangleIcon size={14} className="flex-shrink-0 text-[var(--color-error)]" />
        ) : isDisconnect ? (
          <InfoCircleIcon size={14} className="flex-shrink-0 text-[var(--color-warning)]" />
        ) : isSystem ? (
          <CheckCircleFilledIcon size={14} className="flex-shrink-0 text-[var(--color-success)]" />
        ) : (
          <ArrowDownLeftIcon size={14} className="flex-shrink-0 text-[var(--color-protocol-sse)]" />
        )}

        {/* Event type badge */}
        {!isStatusMsg && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(245,158,11,0.12)] text-[var(--color-protocol-sse)] flex-shrink-0">
            {event.eventType}
          </span>
        )}

        {/* Timestamp */}
        <span className="text-[11px] text-[var(--color-text-muted)] flex-shrink-0 whitespace-nowrap">{timeStr}</span>

        {/* Data preview */}
        <span className={`flex-1 text-[12px] font-mono truncate ${isError ? 'text-[var(--color-error)]' : isDisconnect ? 'text-[var(--color-warning)]' : isSystem ? 'text-[var(--color-success)]' : 'text-[var(--color-text-primary)]'}`}>
          {singleLine}
        </span>

        {/* Hover actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {!isStatusMsg && (
            <div className="opacity-0 group-hover/row:opacity-100 transition-opacity">
              <CopyButton text={event.data} size={12} />
            </div>
          )}
          {!isStatusMsg && (
            <ChevronDownIcon
              size={14}
              className={`text-[var(--color-text-muted)] transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`}
            />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && !isStatusMsg && (
        <div className="border-t border-[var(--color-surface-border)] bg-[var(--color-panel)]">
          {/* Tabs + actions */}
          <div className="flex items-center justify-between px-3 py-1">
            <div className="flex items-center gap-0">
              {isJson && (
                <button
                  type="button"
                  onClick={() => setViewMode('json')}
                  className={`px-2 py-1 text-[11px] font-bold cursor-pointer transition-colors border-b-2 ${
                    viewMode === 'json'
                      ? 'text-[var(--color-text-primary)] border-[var(--color-protocol-sse)]'
                      : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  JSON
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`px-2 py-1 text-[11px] font-bold cursor-pointer transition-colors border-b-2 ${
                  viewMode === 'raw' || !isJson
                    ? 'text-[var(--color-text-primary)] border-[var(--color-protocol-sse)]'
                    : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'
                }`}
              >
                Raw
              </button>
            </div>
            <div className="flex items-center">
              <span className="text-[10px] text-[var(--color-text-muted)] mr-2">Event Data</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setWordWrap(!wordWrap); }}
                className={`h-[24px] w-[24px] flex items-center justify-center cursor-pointer rounded transition-colors ${
                  wordWrap ? 'text-[var(--color-protocol-sse)] bg-[rgba(245,158,11,0.08)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                }`}
                title="Toggle word wrap"
              >
                <WrapLinesIcon size={13} />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="h-[24px] w-[24px] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] cursor-pointer rounded transition-colors"
                title="Download"
              >
                <DownloadIcon size={13} />
              </button>
              <CopyButton text={viewMode === 'json' && isJson ? formattedData : event.data} />
            </div>
          </div>

          {/* Data viewer */}
          <div className="max-h-[160px] overflow-y-auto [scrollbar-gutter:stable] border-t border-[var(--color-surface-border)]">
            <pre className={`p-3 text-[11px] font-mono text-[var(--color-text-primary)] leading-relaxed ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'}`}>
              {viewMode === 'json' && isJson ? formattedData : event.data}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
