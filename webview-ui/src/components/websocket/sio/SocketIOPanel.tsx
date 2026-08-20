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
  CheckCircleFilledIcon, SSEIcon, MoreVerticalIcon, SparkleIcon,
} from '../../../icons';
import { ConnectPayloadModal } from '../shared/ConnectPayloadModal';
import {
  HighlightedInputView,
  ButtonView,
  DropDownButtonView,
  IconButtonView,
  TextInputView,
  SelectInputView,
  EditorView,
  TabView,
  CopyButtonView,
  type ContextMenuItem,
} from '@salilvnair/dui';
import { AuthEditor, AnchoredMenu } from '../../shared';
import { useMockSuggestions } from '../../../hooks/useMockSuggestions';
import { AiRealtimeLogActions } from '../../ai/AiRealtimeLogActions';
import { AiPreflightPopover } from '../../ai/AiPreflightPopover';
import { PatternBaselinePopup } from '../../ai/AiRequestPatternStatus';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { logUiEvent } from '../../../store/ui-audit-store';
import { isValidProtocolUrl, urlValidationHint } from '../../../services/url-validation';

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

// ────────── Format Options ──────────

const formatOptions = [
  { value: 'json', label: 'JSON' },
  { value: 'raw', label: 'RAW' },
];

// ────────── Save Items ──────────

const sioSaveItems: ContextMenuItem[] = [
  {
    id: 'save-as',
    label: 'Save as',
    icon: <SaveIcon size={13} />,
    iconColor: 'var(--color-ctx-close-saved)',
    onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }),
  },
];

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
  const [showConnectPayload, setShowConnectPayload] = useState(false);
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

  // Test-only hook for the wiki capture harness — seeds a realistic connected
  // state + event log without a real Socket.IO connection (see CaptureBridge.tsx).
  useEffect(() => {
    (window as any).__sioCaptureSeed = (evts: SocketIOEvent[], state: ConnectionState, sockId?: string) => {
      setEvents(evts);
      setConnState(state);
      if (sockId) setSocketId(sockId);
    };
  }, [setEvents, setConnState, setSocketId]);

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
  const [showAiOverflow, setShowAiOverflow] = useState(false);
  const [aiOverflowDir, setAiOverflowDir] = useState<'down' | 'up'>('down');
  const [showPreflight, setShowPreflight] = useState(false);
  const [showPatternStatus, setShowPatternStatus] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiOverflowRef = useRef<HTMLDivElement>(null);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const openDaakiaAiTab = useTabsStore(s => s.openDaakiaAiTab);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && events.length > 0 && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // NOTE: the old "close overflow menu on outside click" effect that lived here has been
  // removed. It tested `overflowRef.contains(target)`, which worked only while the menu was a
  // DOM child of that ref. AnchoredMenu portals the menu to <body>, so a click on a menu ITEM
  // no longer counted as "inside" — the effect fired on mousedown and unmounted the menu
  // before mouseup, meaning no click event ever reached the item and its action silently never
  // ran. AnchoredMenu owns outside-click and Escape itself, and correctly treats both its own
  // content and the anchor as inside.

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

  const handleConnect = useCallback((withPayload = false) => {
    if (!activeTab) return;
    const url = activeTab.url.trim();
    if (!url) return;
    logUiEvent('sio.connect', { url, withPayload });
    setConnState('connecting');
    setError(null);
    postMsg({
      type: 'socketio:connect', tabId: activeTab.id, url, namespace,
      headers: activeTab.headers?.filter((h: any) => h.enabled && h.key) || [],
      authType: activeTab.authType, authData: activeTab.authData, envId: activeTab.envId,
      ...(withPayload ? { initBody: activeTab.authData?.['sio_init_body'] || '' } : {}),
    });
  }, [activeTab, namespace]);

  const handleSendAndConnect = useCallback(() => {
    setShowConnectPayload(false);
    handleConnect(true);
  }, [handleConnect]);

  const setInitField = useCallback((key: string, v: string) => {
    if (activeTab) updateTab(activeTab.id, { authData: { ...activeTab.authData, [key]: v } });
  }, [activeTab, updateTab]);

  // In-component (unlike the module-level sioSaveItems) because it closes over modal state.
  const sioConnectItems: ContextMenuItem[] = [
    {
      id: 'send-and-connect',
      label: 'Send and Connect',
      icon: <SendIcon size={13} />,
      iconColor: 'var(--color-success)',
      onClick: () => setShowConnectPayload(true),
    },
  ];

  const handleDisconnect = useCallback(() => {
    if (!activeTab) return;
    logUiEvent('sio.disconnect');
    postMsg({ type: 'socketio:disconnect', tabId: activeTab.id });
  }, [activeTab]);

  const handleSend = useCallback(() => {
    if (!activeTab || connState !== 'connected' || !eventName.trim()) return;
    logUiEvent('sio.emit', { event: eventName.trim() });
    postMsg({ type: 'socketio:emit', tabId: activeTab.id, event: eventName.trim(), data: eventData.trim() || undefined, envId: activeTab.envId });
    if (clearOnSend) { setEventName(''); setEventData(''); }
  }, [activeTab, connState, eventName, eventData, clearOnSend]);

  const handleClearMessages = useCallback(() => { logUiEvent('sio.clear'); setEvents([]); }, [setEvents]);

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

  const subTabItems = [
    { id: 'communication', label: 'Communication' },
    { id: 'authorization', label: 'Authorization' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0 overflow-x-auto overflow-y-hidden">
        <span className="flex-shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider text-[var(--color-protocol-socketio)] bg-[rgba(167,139,250,0.12)]">SIO</span>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-colors" style={{ backgroundColor: statusColor }} title={connState} />

        {/* URL input — shrinks down to minWidth; past that the bar scrolls horizontally
            instead of squeezing/overlapping. */}
        <div className="flex-1 min-w-0" style={{ minWidth: 160 }}>
          <HighlightedInputView
            value={activeTab.url}
            onChange={(v) => updateTab(activeTab.id, { url: v })}
            onKeyDown={(e) => { if (e.key === 'Enter') connState === 'disconnected' ? handleConnect() : handleDisconnect(); }}
            placeholder="wss://echo.websocket.org"
            disabled={connState === 'connected'}
            suggestions={urlSuggestions}
            mockServers={mockSuggestions}
            accentColor="var(--color-protocol-socketio)"
            size="lg"
            borderRadius={6}
          />
        </div>

        {/* Namespace / path */}
        <TextInputView
          value={namespace}
          onChange={(e) => setNamespace(e.target.value)}
          disabled={connState === 'connected'}
          title="Namespace / Path"
          placeholder="/socket.io"
          size="lg"
          className="flex-shrink-0"
          style={{ width: 200 }}
        />

        {connState === 'disconnected' ? (
          <DropDownButtonView
            className="flex-shrink-0"
            label="Connect"
            icon={<ConnectIcon size={12} />}
            size="lg"
            variant="primary"
            accentColor="var(--color-protocol-socketio)"
            disabled={!isValidProtocolUrl(activeTab.url, 'socketio')}
            onPrimaryClick={() => handleConnect(false)}
            items={sioConnectItems}
            align="right"
          />
        ) : (
          <ButtonView
            className="flex-shrink-0"
            label="Disconnect"
            iconLeft={<DisconnectIcon size={12} />}
            size="lg"
            variant="danger"
            onClick={handleDisconnect}
          />
        )}

        {/* Save SplitButton */}
        <DropDownButtonView
          className="flex-shrink-0"
          label="Save"
          icon={<SaveIcon size={12} />}
          items={sioSaveItems}
          size="lg"
          variant="secondary"
          accentColor="var(--color-surface-border)"
          onPrimaryClick={() => {
            const saved = saveRequest(activeTab);
            if (saved) updateTab(activeTab.id, { dirty: false });
          }}
          align="right"
        />

        {/* AI Tools ⋮ menu */}
        <div className="flex-shrink-0 relative" ref={aiOverflowRef}>
          <IconButtonView
            icon={<MoreVerticalIcon size={15} />}
            title="AI tools"
            size="lg"
            active={showAiOverflow}
            onClick={(e) => {
              if (!showAiOverflow) {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setAiOverflowDir((window.innerHeight - rect.bottom) < 160 ? 'up' : 'down');
              }
              setShowAiOverflow(p => !p);
            }}
          />
          {showAiOverflow && (
            <AnchoredMenu
            anchorRef={aiOverflowRef}
            open={showAiOverflow}
            onClose={() => setShowAiOverflow(false)}
            side="bottom"
            align="end"
            minWidth={200}
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
            </AnchoredMenu>
          )}
          {showPreflight && activeTab.url.trim() && <AiPreflightPopover tab={activeTab} onClose={() => setShowPreflight(false)} />}
          {showPatternStatus && activeTab.url.trim() && aiEnabled('patternBaseline') && (
            <PatternBaselinePopup method="SIO" url={activeTab.url} onClose={() => setShowPatternStatus(false)} />
          )}
        </div>
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
              <TabView
                tabs={subTabItems.map(t => ({
                  ...t,
                  badge: t.id === 'communication' && events.length > 0 ? events.length : undefined,
                }))}
                activeTab={activeSubTab}
                onChange={(id) => setActiveSubTab(id as SubTab)}
                variant="underline"
                size="md"
                accentColor="var(--color-protocol-websocket)"
              />
            </div>

            {/* Sub-tab content */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {activeSubTab === 'communication' && (
                <>
                  {/* Event name input */}
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
                    <SSEIcon size={14} className="text-[var(--color-protocol-socketio)] flex-shrink-0" />
                    <TextInputView
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      placeholder="Event/Topic Name"
                      size="md"
                      style={{ flex: 1 }}
                    />
                  </div>
                  {/* Toolbar: Message + JSON/Raw + Send + Clear */}
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Message</span>
                      <SelectInputView
                        options={formatOptions}
                        value={messageFormat}
                        onChange={(v) => setMessageFormat(v as MessageFormat)}
                        size="md"
                        accentColor="var(--color-protocol-socketio)"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <ButtonView
                        label="Send"
                        iconLeft={<SendIcon size={11} />}
                        size="xs"
                        variant="ghost"
                        accentColor="var(--color-protocol-socketio)"
                        disabled={connState !== 'connected' || !eventName.trim()}
                        onClick={handleSend}
                      />
                      <button type="button" onClick={() => setClearOnSend(!clearOnSend)}
                        className="h-[26px] px-2 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] cursor-pointer transition-colors flex items-center gap-1.5 rounded-md">
                        <CheckCircleFilledIcon size={13} checked={clearOnSend} /> Clear input
                      </button>
                    </div>
                  </div>
                  {/* Code editor */}
                  <div className="flex-1 min-h-0">
                    <EditorView value={eventData} onChange={setEventData} language={messageFormat === 'json' ? 'json' : 'plaintext'} height="100%" placeholder="Message" />
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
              <IconButtonView
                icon={<TrashIcon size={12} />}
                size="xs"
                title="Clear log"
                disabled={events.length === 0}
                onClick={handleClearMessages}
                accentColor="var(--color-error)"
              />
              <IconButtonView
                icon={<ArrowUpIcon size={13} />}
                size="xs"
                title="Scroll to top"
                disabled={events.length === 0}
                onClick={() => logContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              />
              <IconButtonView
                icon={<ArrowDownIcon size={13} />}
                size="xs"
                title="Scroll to bottom"
                disabled={events.length === 0}
                onClick={() => { if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight; }}
              />
              <IconButtonView
                icon={<AutoScrollIcon size={14} />}
                size="xs"
                title={autoScroll ? 'Autoscroll: on' : 'Autoscroll: off'}
                active={autoScroll}
                accentColor="var(--color-success)"
                onClick={() => setAutoScroll(!autoScroll)}
              />
              {/* 9.24-9.28: AI log actions */}
              <AiRealtimeLogActions
                tabId={activeTab.id}
                url={activeTab.url || ''}
                protocol="socketio"
                messages={events.filter(e => e.direction === 'received' && e.data).map(e => e.data!)}
                hasError={!!error}
                errorMsg={error || ''}
                accentColor="var(--color-protocol-ai)"
                trafficAnalyzerFlag="sioTrafficAnalyzer"
              />
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

      {showConnectPayload && (
        <ConnectPayloadModal
          protocol="socketio"
          accentColor="var(--color-protocol-socketio)"
          contentType={activeTab.authData?.['sio_init_format'] || 'json'}
          body={activeTab.authData?.['sio_init_body'] || ''}
          onContentTypeChange={(v) => setInitField('sio_init_format', v)}
          onBodyChange={(v) => setInitField('sio_init_body', v)}
          onSendAndConnect={handleSendAndConnect}
          onClose={() => setShowConnectPayload(false)}
        />
      )}
    </div>
  );
}

// ────────── Log Entry ──────────

function SioLogEntry({ event }: { event: SocketIOEvent }) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'json' | 'raw'>('json');
  const [wordWrap, setWordWrap] = useState(false);

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

  const logTabItems = [
    ...(isJson ? [{ id: 'json', label: 'JSON' }] : []),
    { id: 'raw', label: 'Raw' },
  ];

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
            <div className="opacity-0 group-hover/row:opacity-100 transition-opacity">
              <CopyButtonView text={event.data} size="xs" />
            </div>
          )}
          {!isSystem && event.data && <ChevronDownIcon size={14} className={`text-[var(--color-text-muted)] transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && event.data && (
        <div className="border-t border-[var(--color-surface-border)] bg-[var(--color-panel)]">
          <div className="flex items-center justify-between px-3 py-1">
            <TabView
              tabs={logTabItems}
              activeTab={viewMode}
              onChange={(id) => setViewMode(id as 'json' | 'raw')}
              variant="underline"
              size="xs"
              accentColor="var(--color-protocol-socketio)"
            />
            <div className="flex items-center gap-0.5">
              <IconButtonView
                icon={<WrapLinesIcon size={12} />}
                size="xs"
                title="Word wrap"
                active={wordWrap}
                accentColor="var(--color-protocol-socketio)"
                onClick={() => setWordWrap(!wordWrap)}
              />
              <IconButtonView
                icon={<DownloadIcon size={12} />}
                size="xs"
                title="Download"
                onClick={(e) => {
                  e.stopPropagation();
                  const blob = new Blob([event.data!], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `sio-${event.id.slice(0, 8)}.${isJson ? 'json' : 'txt'}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              />
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
