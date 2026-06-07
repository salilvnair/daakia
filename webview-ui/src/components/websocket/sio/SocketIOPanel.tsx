import { useState, useEffect, useRef, useCallback } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useUrlSuggestionsStore } from '../../../store/url-suggestions-store';
import { postMsg } from '../../../vscode';
import { saveRequest } from '../../../services/request';
import {
  ConnectIcon, DisconnectIcon, SaveIcon, SendIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon,
  ArrowUpRightIcon, ArrowDownLeftIcon, AutoScrollIcon, ChevronDownIcon,
  CopyIcon, CheckIcon, InfoCircleIcon, WarningTriangleIcon, DownloadIcon, WrapLinesIcon,
  CheckCircleFilledIcon, SSEIcon,
} from '../../../icons';
import { HighlightedInput, CodeEditor, StyledDropdown, AuthEditor, SplitButton } from '../../shared';
import type { DropdownOption, SplitButtonItem } from '../../shared';
import { useMockSuggestions } from '../../../hooks/useMockSuggestions';

// ────────── Types ──────────

interface SocketIOEvent {
  id: string;
  direction: 'sent' | 'received' | 'system';
  event: string;
  data?: string;
  timestamp: number;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected';
type SubTab = 'communication' | 'authorization';
type MessageFormat = 'json' | 'raw';

// ────────── Per-tab state cache (survives tab switches) ──────────
const eventsCache = new Map<string, SocketIOEvent[]>();
const connStateCache = new Map<string, ConnectionState>();
const errorCache = new Map<string, string | null>();
const socketIdCache = new Map<string, string | null>();

// ────────── Socket.IO Panel ──────────

export function SocketIOPanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);
  const updateTab = useTabsStore(s => s.updateTab);
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.socketio);
  const mockSuggestions = useMockSuggestions('socketio');

  const [connState, setConnStateLocal] = useState<ConnectionState>(connStateCache.get(activeTabId!) || 'disconnected');
  const [events, setEventsLocal] = useState<SocketIOEvent[]>(eventsCache.get(activeTabId!) || []);
  const [socketId, setSocketIdLocal] = useState<string | null>(socketIdCache.get(activeTabId!) ?? null);
  const [error, setErrorLocal] = useState<string | null>(errorCache.get(activeTabId!) ?? null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Wrap setters to also update cache
  const setConnState = useCallback((v: ConnectionState) => {
    setConnStateLocal(v);
    if (activeTabId) connStateCache.set(activeTabId, v);
  }, [activeTabId]);
  const setEvents = useCallback((v: SocketIOEvent[] | ((prev: SocketIOEvent[]) => SocketIOEvent[])) => {
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
  const setSocketId = useCallback((v: string | null) => {
    setSocketIdLocal(v);
    if (activeTabId) socketIdCache.set(activeTabId, v);
  }, [activeTabId]);

  // Persisted fields — read from authData, write back on change
  const ad = activeTab?.authData || {};
  const [namespace, setNamespaceLocal] = useState(ad['sio_namespace'] || '/socket.io');
  const [eventName, setEventNameLocal] = useState(ad['sio_eventName'] || '');
  const [eventData, setEventDataLocal] = useState(ad['sio_eventData'] || '');
  const [messageFormat, setMessageFormatLocal] = useState<MessageFormat>((ad['sio_format'] as MessageFormat) || 'json');
  const [clearOnSend, setClearOnSendLocal] = useState(ad['sio_clearOnSend'] === 'true');
  const [activeSubTab, setActiveSubTabLocal] = useState<SubTab>((ad['sio_subTab'] as SubTab) || 'communication');

  // Helpers to persist to authData
  const persistField = useCallback((key: string, value: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { authData: { ...activeTab.authData, [key]: value } });
  }, [activeTab, updateTab]);

  const setNamespace = (v: string) => { setNamespaceLocal(v); persistField('sio_namespace', v); };
  const setEventName = (v: string) => { setEventNameLocal(v); persistField('sio_eventName', v); };
  const setEventData = (v: string) => { setEventDataLocal(v); persistField('sio_eventData', v); };
  const setMessageFormat = (v: MessageFormat) => { setMessageFormatLocal(v); persistField('sio_format', v); };
  const setClearOnSend = (v: boolean) => { setClearOnSendLocal(v); persistField('sio_clearOnSend', String(v)); };
  const setActiveSubTab = (v: SubTab) => { setActiveSubTabLocal(v); persistField('sio_subTab', v); };

  // Sync local state from authData when tab switches
  useEffect(() => {
    const a = activeTab?.authData || {};
    setNamespaceLocal(a['sio_namespace'] || '/socket.io');
    setEventNameLocal(a['sio_eventName'] || '');
    setEventDataLocal(a['sio_eventData'] || '');
    setMessageFormatLocal((a['sio_format'] as MessageFormat) || 'json');
    setClearOnSendLocal(a['sio_clearOnSend'] === 'true');
    setActiveSubTabLocal((a['sio_subTab'] as SubTab) || 'communication');
  }, [activeTabId]);

  // Vertical split (same pattern as WebSocketPanel)
  const storedSplit = useUiStateStore(s => s.panelHeights['split.sio.main']);
  const [splitPercent, setSplitPercent] = useState(storedSplit ?? 50);
  const [isDragging, setIsDragging] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<'request' | 'log' | null>(null);
  const [showSplitterTip, setShowSplitterTip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && events.length > 0 && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Listen for Socket.IO events from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!activeTab || msg.tabId !== activeTab.id) return;

      switch (msg.type) {
        case 'socketio:connected':
          setConnState('connected');
          setSocketId(msg.socketId || null);
          setError(null);
          setEvents(prev => [...prev, { id: crypto.randomUUID(), direction: 'system', event: 'connection', data: `Connected${msg.socketId ? ` (${msg.socketId})` : ''}`, timestamp: Date.now() }]);
          if (activeTab.url) useUrlSuggestionsStore.getState().addUrls([activeTab.url], 'socketio');
          break;
        case 'socketio:disconnected':
          setConnState('disconnected');
          setSocketId(null);
          setEvents(prev => [...prev, { id: crypto.randomUUID(), direction: 'system', event: 'disconnect', data: 'Disconnected', timestamp: Date.now() }]);
          break;
        case 'socketio:event':
          setEvents(prev => [...prev, { id: crypto.randomUUID(), direction: 'received', event: msg.event, data: msg.data, timestamp: msg.timestamp }]);
          break;
        case 'socketio:sent':
          setEvents(prev => [...prev, { id: crypto.randomUUID(), direction: 'sent', event: msg.event, data: msg.data, timestamp: msg.timestamp }]);
          break;
        case 'socketio:error':
          setError(msg.error);
          setConnState('disconnected');
          setEvents(prev => [...prev, { id: crypto.randomUUID(), direction: 'system', event: 'error', data: msg.error, timestamp: Date.now() }]);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [activeTab?.id]);

  // Restore per-tab state on tab change
  useEffect(() => {
    setConnStateLocal(connStateCache.get(activeTabId!) || 'disconnected');
    setEventsLocal(eventsCache.get(activeTabId!) || []);
    setErrorLocal(errorCache.get(activeTabId!) ?? null);
    setSocketIdLocal(socketIdCache.get(activeTabId!) ?? null);
  }, [activeTabId]);

  const handleConnect = useCallback(() => {
    if (!activeTab) return;
    const url = activeTab.url.trim();
    if (!url) return;
    setConnState('connecting');
    setError(null);
    postMsg({ type: 'socketio:connect', tabId: activeTab.id, url, namespace, headers: activeTab.headers?.filter((h: any) => h.enabled && h.key) || [], authType: activeTab.authType, authData: activeTab.authData, envId: activeTab.envId });
  }, [activeTab, namespace]);

  const handleDisconnect = useCallback(() => {
    if (!activeTab) return;
    postMsg({ type: 'socketio:disconnect', tabId: activeTab.id });
  }, [activeTab]);

  const handleSend = useCallback(() => {
    if (!activeTab || connState !== 'connected' || !eventName.trim()) return;
    postMsg({ type: 'socketio:emit', tabId: activeTab.id, event: eventName.trim(), data: eventData.trim() || undefined, envId: activeTab.envId });
    if (clearOnSend) { setEventName(''); setEventData(''); }
  }, [activeTab, connState, eventName, eventData, clearOnSend]);

  const handleClearMessages = useCallback(() => setEvents([]), [setEvents]);

  // Splitter handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); setIsDragging(true); }, []);
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
    useUiStateStore.getState().setHeight('split.sio.main', splitPercent);
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

  const statusColor = connState === 'connected' ? 'var(--color-success)' : connState === 'connecting' ? 'var(--color-warning)' : 'var(--color-text-muted)';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider text-[var(--color-protocol-socketio)] bg-[rgba(167,139,250,0.12)]">SIO</span>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-colors" style={{ backgroundColor: statusColor }} title={connState} />

        <div className="flex-[2] min-w-0">
          <HighlightedInput
            value={activeTab.url}
            onChange={(v) => updateTab(activeTab.id, { url: v })}
            onKeyDown={(e) => { if (e.key === 'Enter') connState === 'disconnected' ? handleConnect() : handleDisconnect(); }}
            placeholder="wss://echo.websocket.org"
            disabled={connState === 'connected'}
            suggestions={urlSuggestions}
            mockServers={mockSuggestions}
            protocolHints={['wss://']}
            accentColor="var(--color-protocol-websocket)"
          />
        </div>

        {/* Namespace / path */}
        <input
          type="text"
          value={namespace}
          onChange={(e) => setNamespace(e.target.value)}
          disabled={connState === 'connected'}
          className="w-[200px] h-[36px] px-2.5 text-[12px] font-mono bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] rounded-md outline-none focus:border-[var(--color-accent)] disabled:opacity-50 placeholder:text-[var(--color-text-muted)]"
          title="Namespace / Path"
          placeholder="/socket.io"
        />

        {connState === 'disconnected' ? (
          <button type="button" onClick={handleConnect} disabled={!activeTab.url.trim()} className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-protocol-socketio)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity flex items-center gap-1.5 flex-shrink-0">
            <ConnectIcon size={12} /> Connect
          </button>
        ) : (
          <button type="button" onClick={handleDisconnect} className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[rgba(239,68,68,0.12)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.2)] cursor-pointer transition-colors flex items-center gap-1.5 flex-shrink-0">
            <DisconnectIcon size={12} /> Disconnect
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
          items={sioSaveItems}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-1.5 text-[11px] text-[var(--color-error)] bg-[rgba(239,68,68,0.06)] border-b border-[var(--color-surface-border)] flex-shrink-0">{error}</div>
      )}

      {/* Vertical split: editor (top) / log (bottom) */}
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 relative">
        {/* Top: Communication / Authorization */}
        <div className="overflow-hidden flex flex-col" style={{ height: `${splitPercent}%`, minHeight: 60, transition: isDragging ? 'none' : 'height 180ms cubic-bezier(0.2, 0.8, 0.2, 1)' }} onFocus={handleRequestFocus}>
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Sub-tabs */}
            <div className="flex items-center border-b border-[var(--color-surface-border)] bg-[var(--color-panel)] px-2">
              {(['communication', 'authorization'] as SubTab[]).map(tab => (
                <button key={tab} type="button" onClick={() => setActiveSubTab(tab)}
                  className={`px-3 py-2 text-[11px] font-medium capitalize cursor-pointer transition-colors border-b-2 ${activeSubTab === tab ? 'text-[var(--color-protocol-socketio)] border-[var(--color-protocol-socketio)]' : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'}`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === 'communication' && events.length > 0 && <span className="ml-1 w-1.5 h-1.5 inline-block rounded-full relative -top-[1px] bg-[var(--color-protocol-socketio)]" />}
                </button>
              ))}
            </div>

            {/* Sub-tab content */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {activeSubTab === 'communication' && (
                <>
                  {/* Event name input */}
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
                    <SSEIcon size={14} className="text-[var(--color-protocol-socketio)] flex-shrink-0" />
                    <input
                      type="text"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      placeholder="Event/Topic Name"
                      className="flex-1 h-[28px] px-2.5 text-[12px] bg-transparent text-[var(--color-text-primary)] border-none outline-none placeholder:text-[var(--color-text-muted)]"
                    />
                  </div>
                  {/* Toolbar: Message + JSON/Raw + Send + Clear */}
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Message</span>
                      <StyledDropdown options={formatOptions} value={messageFormat} onChange={(v) => setMessageFormat(v as MessageFormat)} size="xs" accentColor="var(--color-protocol-socketio)" />
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={handleSend} disabled={connState !== 'connected' || !eventName.trim()}
                        className="h-[26px] px-2.5 text-[11px] font-medium text-[var(--color-protocol-socketio)] hover:bg-[rgba(20,184,166,0.08)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center gap-1.5 rounded-md">
                        <SendIcon size={11} /> Send
                      </button>
                      <button type="button" onClick={() => setClearOnSend(!clearOnSend)}
                        className="h-[26px] px-2 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] cursor-pointer transition-colors flex items-center gap-1.5 rounded-md">
                        <CheckCircleFilledIcon size={13} checked={clearOnSend} /> Clear input
                      </button>
                    </div>
                  </div>
                  {/* Code editor */}
                  <div className="flex-1 min-h-0">
                    <CodeEditor value={eventData} onChange={setEventData} language={messageFormat === 'json' ? 'json' : 'plaintext'} height="100%" placeholder="Message" />
                  </div>
                </>
              )}
              {activeSubTab === 'authorization' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                  <AuthEditor
                    authType={activeTab.authType}
                    authData={activeTab.authData}
                    onAuthTypeChange={(v) => updateTab(activeTab.id, { authType: v as any })}
                    onAuthDataChange={(data) => updateTab(activeTab.id, { authData: data as any })}
                    accentColor="var(--color-protocol-socketio)"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Splitter */}
        <div className="relative h-[6px] flex-shrink-0 cursor-row-resize group select-none"
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
          onDoubleClick={() => { setSplitPercent(50); setFocusedPanel(null); useUiStateStore.getState().setHeight('split.sio.main', 50); }}
          onMouseEnter={() => setShowSplitterTip(true)} onMouseLeave={() => setShowSplitterTip(false)}
        >
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[3px] rounded-full transition-all duration-150 ${isDragging ? 'w-[80px] bg-[var(--color-protocol-socketio)]' : 'w-[44px] bg-[var(--color-surface-border)] group-hover:bg-[var(--color-protocol-socketio)] group-hover:w-[80px]'}`} />
          {showSplitterTip && !isDragging && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 bg-[var(--color-surface)] text-[var(--color-text-primary)] text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--color-surface-border)] shadow-lg whitespace-nowrap pointer-events-none z-50 flex flex-col gap-0.5 leading-tight">
              <div>Double-click to reset</div><div>Drag to resize</div>
            </div>
          )}
        </div>

        {/* Bottom: Log panel */}
        <div className="flex-1 min-h-[60px] flex flex-col overflow-hidden" style={{ transition: isDragging ? 'none' : 'all 180ms cubic-bezier(0.2, 0.8, 0.2, 1)' }} onFocus={handleLogFocus}>
          {/* Log header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
            <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Log</span>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={handleClearMessages} disabled={events.length === 0} className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center rounded-md" title="Clear log"><TrashIcon size={12} /></button>
              <button type="button" onClick={() => logContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} disabled={events.length === 0} className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center rounded-md" title="Scroll to top"><ArrowUpIcon size={13} /></button>
              <button type="button" onClick={() => { if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight; }} disabled={events.length === 0} className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center rounded-md" title="Scroll to bottom"><ArrowDownIcon size={13} /></button>
              <button type="button" onClick={() => setAutoScroll(!autoScroll)} className={`h-[26px] w-[26px] flex items-center justify-center cursor-pointer transition-colors rounded-md ${autoScroll ? 'text-[var(--color-success)] hover:bg-[rgba(34,197,94,0.08)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'}`} title={autoScroll ? 'Autoscroll: on' : 'Autoscroll: off'}><AutoScrollIcon size={14} /></button>
            </div>
          </div>

          {/* Log entries */}
          <div ref={logContainerRef} className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
            {events.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-2 h-full">
                <span className="text-[28px] opacity-20">⟨/⟩</span>
                <p className="text-[12px]">{connState === 'connected' ? 'Connected — send an event' : 'Connect to start communication'}</p>
              </div>
            ) : (
              events.map(evt => <SioLogEntry key={evt.id} event={evt} />)
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────── Format Options ──────────

const formatOptions: DropdownOption[] = [
  { value: 'json', label: 'JSON' },
  { value: 'raw', label: 'RAW' },
];

// ────────── Save Items ──────────

const sioSaveItems: SplitButtonItem[] = [
  {
    id: 'save-as',
    label: 'Save as',
    icon: <SaveIcon />,
    iconColor: 'var(--color-ctx-close-saved)',
    onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }),
  },
];

// ────────── Log Entry ──────────

function SioLogEntry({ event }: { event: SocketIOEvent }) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'json' | 'raw'>('json');
  const [wordWrap, setWordWrap] = useState(false);
  const [copied, setCopied] = useState(false);

  const isSent = event.direction === 'sent';
  const isSystem = event.direction === 'system';
  const isError = isSystem && event.event === 'error';
  const isDisconnect = isSystem && event.event === 'disconnect';
  const timeStr = new Date(event.timestamp).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let formattedData = event.data || '';
  let isJson = false;
  if (event.data) {
    try { const p = JSON.parse(event.data); formattedData = JSON.stringify(p, null, 2); isJson = true; } catch { /* keep raw */ }
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(event.data || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border-b border-[var(--color-surface-border)] last:border-b-0 group/row">
      <div onClick={() => !isSystem && event.data && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left ${isSystem ? '' : event.data ? 'cursor-pointer hover:bg-[var(--color-hover)]' : ''}`}>
        {/* Direction icon */}
        {isError ? (
          <WarningTriangleIcon size={14} className="flex-shrink-0 text-[var(--color-error)]" />
        ) : isDisconnect ? (
          <InfoCircleIcon size={14} className="flex-shrink-0 text-[var(--color-warning)]" />
        ) : isSystem ? (
          <CheckCircleFilledIcon size={14} className="flex-shrink-0 text-[var(--color-success)]" />
        ) : isSent ? (
          <ArrowUpRightIcon size={14} className="flex-shrink-0 text-[var(--color-protocol-socketio)]" />
        ) : (
          <ArrowDownLeftIcon size={14} className="flex-shrink-0 text-[var(--color-protocol-graphql)]" />
        )}
        {/* Event name badge */}
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${isError ? 'bg-[rgba(239,68,68,0.1)] text-[var(--color-error)]' : isDisconnect ? 'bg-[rgba(245,158,11,0.1)] text-[var(--color-warning)]' : isSent ? 'bg-[rgba(20,184,166,0.1)] text-[var(--color-protocol-socketio)]' : isSystem ? 'bg-[rgba(34,197,94,0.1)] text-[var(--color-success)]' : 'bg-[rgba(99,102,241,0.1)] text-[var(--color-protocol-rest)]'}`}>
          {event.event}
        </span>
        {/* Timestamp */}
        <span className="text-[11px] text-[var(--color-text-muted)] flex-shrink-0">{timeStr}</span>
        {/* Data preview */}
        <span className={`flex-1 text-[12px] font-mono truncate ${isError ? 'text-[var(--color-error)]' : isDisconnect ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-primary)]'}`}>{event.data || ''}</span>
        {/* Copy + chevron */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {event.data && (
            <button type="button" onClick={handleCopy} className={`h-[24px] w-[24px] flex items-center justify-center cursor-pointer rounded transition-colors opacity-0 group-hover/row:opacity-100 ${copied ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'}`} title="Copy">
              {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
            </button>
          )}
          {!isSystem && event.data && <ChevronDownIcon size={14} className={`text-[var(--color-text-muted)] transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && event.data && (
        <div className="border-t border-[var(--color-surface-border)] bg-[var(--color-panel)]">
          <div className="flex items-center justify-between px-3 py-1">
            <div className="flex items-center gap-0">
              {isJson && <button type="button" onClick={() => setViewMode('json')} className={`px-2 py-1 text-[11px] font-bold cursor-pointer transition-colors border-b-2 ${viewMode === 'json' ? 'text-[var(--color-text-primary)] border-[var(--color-protocol-socketio)]' : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'}`}>JSON</button>}
              <button type="button" onClick={() => setViewMode('raw')} className={`px-2 py-1 text-[11px] font-bold cursor-pointer transition-colors border-b-2 ${viewMode === 'raw' || !isJson ? 'text-[var(--color-text-primary)] border-[var(--color-protocol-socketio)]' : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'}`}>Raw</button>
            </div>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => setWordWrap(!wordWrap)} className={`h-[24px] w-[24px] flex items-center justify-center cursor-pointer rounded transition-colors ${wordWrap ? 'text-[var(--color-protocol-socketio)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`} title="Word wrap"><WrapLinesIcon size={12} /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); const blob = new Blob([event.data!], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `sio-${event.id.slice(0,8)}.${isJson ? 'json' : 'txt'}`; a.click(); URL.revokeObjectURL(url); }}
                className="h-[24px] w-[24px] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer rounded transition-colors" title="Download"><DownloadIcon size={12} /></button>
            </div>
          </div>
          <pre className={`px-3 pb-2 text-[11px] font-mono text-[var(--color-text-primary)] leading-relaxed ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'}`}>
            {viewMode === 'json' && isJson ? formattedData : event.data}
          </pre>
        </div>
      )}
    </div>
  );
}
