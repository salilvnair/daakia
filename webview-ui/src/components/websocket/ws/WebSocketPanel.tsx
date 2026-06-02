import { useState, useCallback, useRef, useEffect } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useUrlSuggestionsStore } from '../../../store/url-suggestions-store';
import { postMsg } from '../../../vscode';
import { ConnectIcon, DisconnectIcon, SendIcon, TrashIcon, CheckCircleFilledIcon, ArrowUpIcon, ArrowDownIcon, AutoScrollIcon, SaveIcon } from '../../../icons';
import { CodeEditor, StyledDropdown, SplitButton, HighlightedInput } from '../../shared';
import type { DropdownOption, SplitButtonItem } from '../../shared';
import { saveRequest } from '../../../services/request';
import { RealtimeProtocolSelector, type RealtimeProtocol } from '../RealtimeProtocolSelector';
import { SSEPanel } from '../sse/SSEPanel';
import { SocketIOPanel } from '../sio/SocketIOPanel';
import { MQTTPanel } from '../mqtt/MQTTPanel';
import { WsLogEntry, type WsMessage } from './WsLogEntry';
import { WsProtocolsTab } from './WsProtocolsTab';
import { useMockSuggestions } from '../../../hooks/useMockSuggestions';

// ────────── State Types ──────────

type ConnectionState = 'disconnected' | 'connecting' | 'connected';
type SubTab = 'communication' | 'protocols';
type MessageFormat = 'json' | 'raw';

// ────────── Per-tab state cache (survives tab switches) ──────────
const wsMessagesCache = new Map<string, WsMessage[]>();
const wsConnStateCache = new Map<string, ConnectionState>();

// ────────── WebSocket Panel ──────────

export function WebSocketPanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);
  const updateTab = useTabsStore(s => s.updateTab);
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.websocket);
  const mockSuggestions = useMockSuggestions('websocket');

  const [connState, setConnStateLocal] = useState<ConnectionState>(wsConnStateCache.get(activeTabId!) || 'disconnected');
  const [messages, setMessagesLocal] = useState<WsMessage[]>(wsMessagesCache.get(activeTabId!) || []);

  // Wrap setters to also update cache
  const setConnState = useCallback((v: ConnectionState) => {
    setConnStateLocal(v);
    if (activeTabId) wsConnStateCache.set(activeTabId, v);
  }, [activeTabId]);
  const setMessages = useCallback((v: WsMessage[] | ((prev: WsMessage[]) => WsMessage[])) => {
    setMessagesLocal(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      if (activeTabId) wsMessagesCache.set(activeTabId, next);
      return next;
    });
  }, [activeTabId]);

  // Restore per-tab state on tab change
  useEffect(() => {
    setConnStateLocal(wsConnStateCache.get(activeTabId!) || 'disconnected');
    setMessagesLocal(wsMessagesCache.get(activeTabId!) || []);
  }, [activeTabId]);

  // Persisted fields — read from authData
  const ad = activeTab?.authData || {};
  const [inputMsg, setInputMsgLocal] = useState(ad['ws_inputMsg'] || '{\n  "type": "ping"\n}');
  const [messageFormat, setMessageFormatLocal] = useState<MessageFormat>((ad['ws_format'] as MessageFormat) || 'json');
  const [clearOnSend, setClearOnSendLocal] = useState(ad['ws_clearOnSend'] === 'true');

  const persistWsField = useCallback((key: string, value: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { authData: { ...activeTab.authData, [key]: value } });
  }, [activeTab, updateTab]);

  const setInputMsg = (v: string) => { setInputMsgLocal(v); persistWsField('ws_inputMsg', v); };
  const setMessageFormat = (v: MessageFormat) => { setMessageFormatLocal(v); persistWsField('ws_format', v); };
  const setClearOnSend = (v: boolean) => { setClearOnSendLocal(v); persistWsField('ws_clearOnSend', String(v)); };

  const storedSubTab = useUiStateStore(s => s.prefs[`ws.subtab.${activeTabId}`]);
  const [activeSubTab, setActiveSubTabLocal] = useState<SubTab>((storedSubTab as SubTab) || 'communication');

  // Sync when active tab changes
  useEffect(() => {
    const pref = useUiStateStore.getState().getPref(`ws.subtab.${activeTabId}`, 'communication') as SubTab;
    setActiveSubTabLocal(pref);
    // Sync persisted fields
    const a = activeTab?.authData || {};
    setInputMsgLocal(a['ws_inputMsg'] || '{\n  "type": "ping"\n}');
    setMessageFormatLocal((a['ws_format'] as MessageFormat) || 'json');
    setClearOnSendLocal(a['ws_clearOnSend'] === 'true');
  }, [activeTabId]);

  const setActiveSubTab = (tab: SubTab) => {
    setActiveSubTabLocal(tab);
    useUiStateStore.getState().setPref(`ws.subtab.${activeTabId}`, tab);
  };

  // Vertical split
  const storedSplit = useUiStateStore(s => s.panelHeights['split.ws.main']);
  const [splitPercent, setSplitPercent] = useState(storedSplit ?? 50);
  const [isDragging, setIsDragging] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<'request' | 'log' | null>(null);
  const [showSplitterTip, setShowSplitterTip] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages (when autoScroll is on)
  useEffect(() => {
    if (autoScroll && messages.length > 0 && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Listen for WebSocket events from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!activeTab) return;

      switch (msg.type) {
        case 'ws:connected':
          if (msg.tabId === activeTab.id) {
            setConnState('connected');
            if (activeTab.url) useUrlSuggestionsStore.getState().addUrls([activeTab.url], 'websocket');
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              direction: 'system',
              data: `Connected to ${activeTab.url}`,
              timestamp: Date.now(),
            }]);
          }
          break;
        case 'ws:disconnected':
          if (msg.tabId === activeTab.id) {
            setConnState('disconnected');
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              direction: 'disconnect',
              data: `Disconnected${msg.reason ? `: ${msg.reason}` : ''}`,
              timestamp: Date.now(),
            }]);
          }
          break;
        case 'ws:message':
          if (msg.tabId === activeTab.id) {
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              direction: 'received',
              data: msg.data,
              timestamp: Date.now(),
            }]);
          }
          break;
        case 'ws:error':
          if (msg.tabId === activeTab.id) {
            setConnState('disconnected');
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              direction: 'error',
              data: msg.error || 'Connection error',
              timestamp: Date.now(),
            }]);
          }
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [activeTab?.id]);

  const handleConnect = useCallback(() => {
    if (!activeTab) return;
    const url = activeTab.url.trim();
    if (!url) return;

    setConnState('connecting');
    postMsg({
      type: 'ws:connect',
      tabId: activeTab.id,
      url,
      protocols: activeTab.authData?.['ws_protocols'] || '',
      envId: activeTab.envId,
    });
  }, [activeTab]);

  const handleDisconnect = useCallback(() => {
    if (!activeTab) return;
    postMsg({ type: 'ws:disconnect', tabId: activeTab.id });
    setConnState('disconnected');
  }, [activeTab]);

  const handleSend = useCallback(() => {
    if (!activeTab || connState !== 'connected' || !inputMsg.trim()) return;
    postMsg({
      type: 'ws:send',
      tabId: activeTab.id,
      data: inputMsg,
      envId: activeTab.envId,
    });
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      direction: 'sent',
      data: inputMsg,
      timestamp: Date.now(),
    }]);
    if (clearOnSend) setInputMsg('');
  }, [activeTab, connState, inputMsg, clearOnSend]);

  const handleClearMessages = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

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
    useUiStateStore.getState().setHeight('split.ws.main', splitPercent);
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

  const rtProtocol: RealtimeProtocol = (activeTab.authData?.['rt_protocol'] as RealtimeProtocol) || 'websocket';

  // SSE mode — render SSE panel instead of WebSocket
  if (rtProtocol === 'sse') {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <RealtimeProtocolSelector />
        <SSEPanel />
      </div>
    );
  }

  // Socket.IO mode
  if (rtProtocol === 'socketio') {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <RealtimeProtocolSelector />
        <SocketIOPanel />
      </div>
    );
  }

  // MQTT mode
  if (rtProtocol === 'mqtt') {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <RealtimeProtocolSelector />
        <MQTTPanel />
      </div>
    );
  }

  const statusColor = connState === 'connected' ? 'var(--color-success)'
    : connState === 'connecting' ? 'var(--color-warning)'
    : 'var(--color-text-muted)';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Realtime protocol selector */}
      <RealtimeProtocolSelector />

      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
        {/* Protocol badge */}
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider text-[var(--color-protocol-websocket)] bg-[rgba(76,175,80,0.12)]">
          WS
        </span>

        {/* Connection indicator */}
        <span
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-colors ${connState === 'connected' ? 'breathing-connected' : ''}`}
          style={{ backgroundColor: statusColor, color: statusColor }}
          title={connState}
        />

        {/* URL input */}
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

        {/* Connect/Disconnect button */}
        {connState === 'disconnected' ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={!activeTab.url.trim()}
            className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-protocol-websocket)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity flex items-center gap-1.5 flex-shrink-0"
          >
            <ConnectIcon size={12} />
            Connect
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDisconnect}
            className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[rgba(239,68,68,0.12)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.2)] cursor-pointer transition-colors flex items-center gap-1.5 flex-shrink-0 breathing-btn"
          >
            <DisconnectIcon size={12} />
            Disconnect
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
          items={wsSaveItems}
        />
      </div>

      {/* Vertical split: editor (top) / response log (bottom) */}
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 relative">
        {/* Top: Message editor + sub-tabs */}
        <div
          className="overflow-hidden flex flex-col"
          style={{
            height: `${splitPercent}%`,
            minHeight: 60,
            transition: isDragging ? 'none' : 'height 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          onFocus={handleRequestFocus}
        >
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Sub-tabs: Communication | Protocols */}
          <div className="flex items-center border-b border-[var(--color-surface-border)] bg-[var(--color-panel)] px-2">
            {(['communication', 'protocols'] as SubTab[]).map(tab => {
              const protocolsCount = tab === 'protocols'
                ? (() => { try { const e = JSON.parse(activeTab.authData?.['ws_protocol_entries'] || '[]'); return e.filter((p: any) => p.enabled && p.value?.trim()).length; } catch { return 0; } })()
                : 0;
              return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveSubTab(tab)}
                className={`px-3 py-2 text-[11px] font-medium capitalize cursor-pointer transition-colors border-b-2 ${
                  activeSubTab === tab
                    ? 'text-[var(--color-protocol-websocket)] border-[var(--color-protocol-websocket)]'
                    : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'protocols' && protocolsCount > 0 && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'color-mix(in srgb, #4caf50 15%, transparent)', color: '#4caf50' }}>
                    {protocolsCount}
                  </span>
                )}
                {tab === 'communication' && messages.length > 0 && (
                  <span className="ml-1 w-1.5 h-1.5 inline-block rounded-full relative -top-[1px] bg-[var(--color-protocol-websocket)]" />
                )}
              </button>
              );
            })}
          </div>

          {/* Sub-tab content */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {activeSubTab === 'communication' && (
              <>
                {/* Toolbar: Message label + JSON/Raw left, Send + Clear input right */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Message</span>
                    {/* JSON/Raw format selector */}
                    <StyledDropdown
                      options={formatOptions}
                      value={messageFormat}
                      onChange={(v) => setMessageFormat(v as MessageFormat)}
                      size="xs"
                      accentColor="var(--color-protocol-websocket)"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Send */}
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={connState !== 'connected' || !inputMsg.trim()}
                      className="h-[26px] px-2.5 text-[11px] font-medium text-[var(--color-protocol-websocket)] hover:bg-[rgba(76,175,80,0.08)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center gap-1.5 rounded-md"
                    >
                      <SendIcon size={11} />
                      Send
                    </button>
                    {/* Clear input checkbox */}
                    <button
                      type="button"
                      onClick={() => setClearOnSend(!clearOnSend)}
                      className="h-[26px] px-2 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] cursor-pointer transition-colors flex items-center gap-1.5 rounded-md"
                    >
                      <CheckCircleFilledIcon size={13} checked={clearOnSend} />
                      Clear input
                    </button>
                  </div>
                </div>
                {/* Code editor */}
                <div className="flex-1 min-h-0">
                  <CodeEditor
                    value={inputMsg}
                    onChange={setInputMsg}
                    language={messageFormat === 'json' ? 'json' : 'plaintext'}
                    height="100%"
                    placeholder="Type a message to send..."
                  />
                </div>
              </>
            )}

            {activeSubTab === 'protocols' && (
              <WsProtocolsTab />
            )}
          </div>
          </div>
        </div>

        {/* Splitter (pill-grip — same as REST/GraphQL) */}
        <div
          className="relative h-[6px] flex-shrink-0 cursor-row-resize group select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={() => { setSplitPercent(50); setFocusedPanel(null); useUiStateStore.getState().setHeight('split.ws.main', 50); }}
          onMouseEnter={() => setShowSplitterTip(true)}
          onMouseLeave={() => setShowSplitterTip(false)}
        >
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[3px] rounded-full transition-all duration-150 ${
            isDragging
              ? 'w-[80px] bg-[var(--color-protocol-websocket)]'
              : 'w-[44px] bg-[var(--color-surface-border)] group-hover:bg-[var(--color-protocol-websocket)] group-hover:w-[80px]'
          }`} />
          {showSplitterTip && !isDragging && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 bg-[var(--color-surface)] text-[var(--color-text-primary)] text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--color-surface-border)] shadow-lg whitespace-nowrap pointer-events-none z-50 flex flex-col gap-0.5 leading-tight">
              <div>Double-click to reset <kbd className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-panel)] font-mono">Alt+/</kbd></div>
              <div>Drag to resize</div>
            </div>
          )}
        </div>

        {/* Bottom: Log panel — TESTING: header only, no messages */}
        <div
          className="flex-1 min-h-[60px] flex flex-col overflow-hidden"
          style={{ transition: isDragging ? 'none' : 'all 180ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          onFocus={handleLogFocus}
        >
          {/* Log header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
            <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Log</span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleClearMessages}
                disabled={messages.length === 0}
                className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center rounded-md"
                title="Clear log"
              >
                <TrashIcon size={12} />
              </button>
              <button
                type="button"
                onClick={() => logContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                disabled={messages.length === 0}
                className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center rounded-md"
                title="Scroll to top"
              >
                <ArrowUpIcon size={13} />
              </button>
              <button
                type="button"
                onClick={() => { if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight; }}
                disabled={messages.length === 0}
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
                    ? 'text-[var(--color-success)] hover:bg-[rgba(34,197,94,0.08)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(197, 34, 34, 0.08)]'
                }`}
                title={autoScroll ? 'Autoscroll: Turn off' : 'Autoscroll: Turn on'}
              >
                <AutoScrollIcon size={14} />
              </button>
            </div>
          </div>

          {/* Messages log */}
          <div ref={logContainerRef} className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-2">
                <span className="text-[28px] opacity-20">⟨/⟩</span>
                <p className="text-[12px]">
                  {connState === 'connected' ? 'Connected — send a message' : 'Connect to start communication'}
                </p>
                <p className="text-[10px] opacity-60">Ctrl+Enter to send</p>
              </div>
            ) : (
              messages.map(msg => (
                <WsLogEntry key={msg.id} message={msg} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────── Constants ──────────

const formatOptions: DropdownOption[] = [
  { value: 'json', label: 'JSON' },
  { value: 'raw', label: 'RAW' },
];

const wsSaveItems: SplitButtonItem[] = [
  {
    id: 'save-as',
    label: 'Save as',
    icon: <SaveIcon />,
    iconColor: 'var(--color-ctx-close-saved)',
    onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }),
  },
];

