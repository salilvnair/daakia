import { useState, useCallback, useRef, useEffect } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useUrlSuggestionsStore } from '../../../store/url-suggestions-store';
import { postMsg } from '../../../vscode';
import { ConnectIcon, DisconnectIcon, SendIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, AutoScrollIcon, SaveIcon, MoreVerticalIcon, SparkleIcon } from '../../../icons';
import { ConnectPayloadModal } from '../shared/ConnectPayloadModal';
import {
  HighlightedInputView,
  DropDownButtonView,
  ButtonView,
  IconButtonView,
  SelectInputView,
  CheckboxView,
  EditorView,
  TabView,
  ContextMenuView,
  type ContextMenuItem,
  type TabItem,
  type SelectOption,
} from '@salilvnair/dui';
import { saveRequest } from '../../../services/request';
import { RealtimeProtocolSelector, type RealtimeProtocol } from '../RealtimeProtocolSelector';
import { SSEPanel } from '../sse/SSEPanel';
import { SocketIOPanel } from '../sio/SocketIOPanel';
import { MQTTPanel } from '../mqtt/MQTTPanel';
import { WsLogEntry, type WsMessage } from './WsLogEntry';
import { logUiEvent, isAuditEventEnabled } from '../../../store/ui-audit-store';
import { WsProtocolsTab } from './WsProtocolsTab';
import { WsTemplatesTab } from './WsTemplatesTab';
import { useMockSuggestions } from '../../../hooks/useMockSuggestions';
import { AiRealtimeLogActions } from '../../ai/AiRealtimeLogActions';
import { AiBodyGenerate } from '../../ai/AiBodyGenerate';
import type { AiBodyGenerateHandle } from '../../ai/AiBodyGenerate';
import { AiPreflightPopover } from '../../ai/AiPreflightPopover';
import { PatternBaselinePopup } from '../../ai/AiRequestPatternStatus';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { isValidProtocolUrl, urlValidationHint } from '../../../services/url-validation';

// ────────── State Types ──────────

type ConnectionState = 'disconnected' | 'connecting' | 'connected';
type SubTab = 'communication' | 'protocols' | 'templates';
type MessageFormat = 'json' | 'raw';

const ACCENT = 'var(--color-protocol-websocket)';

// ────────── Per-tab state cache (survives tab switches) ──────────
const wsMessagesCache = new Map<string, WsMessage[]>();
const wsConnStateCache = new Map<string, ConnectionState>();
const wsReconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

  // Test-only hook for the wiki capture harness — seeds a realistic connected
  // state + message log without a real socket connection (see CaptureBridge.tsx).
  useEffect(() => {
    (window as any).__wsCaptureSeed = (msgs: WsMessage[], state: ConnectionState) => {
      setMessages(msgs);
      setConnState(state);
    };
  }, [setMessages, setConnState]);

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
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [aiOverflowDir, setAiOverflowDir] = useState<'down' | 'up'>('down');
  const [showPreflight, setShowPreflight] = useState(false);
  const [showPatternStatus, setShowPatternStatus] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showConnectPayload, setShowConnectPayload] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const aiMenuBtnRef = useRef<HTMLDivElement>(null);
  const bodyGenRef = useRef<AiBodyGenerateHandle>(null);
  const reconnectAttemptRef = useRef(0);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const openDaakiaAiTab = useTabsStore(s => s.openDaakiaAiTab);

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
            reconnectAttemptRef.current = 0; // reset backoff on successful connect
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
            // Auto-reconnect with exponential backoff (5.3.12)
            if (activeTab.wsAutoReconnect && activeTab.url) {
              const attempt = reconnectAttemptRef.current++;
              const baseBackoff = activeTab.wsReconnectBackoff || 1000;
              const delay = Math.min(baseBackoff * Math.pow(2, attempt), 30000);
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                direction: 'system',
                data: `Auto-reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1})…`,
                timestamp: Date.now(),
              }]);
              const timer = setTimeout(() => {
                wsReconnectTimers.delete(activeTab.id);
                postMsg({ type: 'ws:connect', tabId: activeTab.id, auditEnabled: isAuditEventEnabled('ws.connect'), url: activeTab.url, protocols: activeTab.authData?.['ws_protocols'] || '', envId: activeTab.envId });
                setConnState('connecting');
              }, delay);
              wsReconnectTimers.set(activeTab.id, timer);
            }
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
        // Connect-time payload the host sent for us the moment the socket opened — logged as
        // outbound so the transcript reads in the true order it went over the wire.
        case 'ws:initSent':
          if (msg.tabId === activeTab.id) {
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              direction: 'sent',
              data: msg.data,
              timestamp: Date.now(),
            }]);
          }
          break;
        case 'ws:error':
          if (msg.tabId === activeTab.id) {
            setConnState('disconnected');
            setLastError(msg.error || 'Connection error');
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

  const handleConnect = useCallback((withPayload = false) => {
    if (!activeTab) return;
    const url = activeTab.url.trim();
    if (!url) return;

    // The full session record is written by the extension host when the
    // connection ends, where the traffic counts and the reason exist.
    // Logging on click as well would put two rows in the log per connect,
    // the click-time one carrying only the URL.
    setConnState('connecting');
    postMsg({
      type: 'ws:connect',
      tabId: activeTab.id,
      auditEnabled: isAuditEventEnabled('ws.connect'),
      url,
      protocols: activeTab.authData?.['ws_protocols'] || '',
      envId: activeTab.envId,
      ...(withPayload ? { initBody: activeTab.authData?.['ws_init_body'] || '' } : {}),
    });
  }, [activeTab]);

  const handleSendAndConnect = useCallback(() => {
    setShowConnectPayload(false);
    handleConnect(true);
  }, [handleConnect]);

  const setInitField = useCallback((key: string, v: string) => {
    if (activeTab) updateTab(activeTab.id, { authData: { ...activeTab.authData, [key]: v } });
  }, [activeTab, updateTab]);

  // In-component (unlike the module-level wsSaveItems) because it closes over modal state.
  const wsConnectItems: ContextMenuItem[] = [
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
    logUiEvent('ws.disconnect', { url: activeTab.url });
    postMsg({ type: 'ws:disconnect', tabId: activeTab.id });
    setConnState('disconnected');
  }, [activeTab]);

  const handleSend = useCallback(() => {
    if (!activeTab || connState !== 'connected' || !inputMsg.trim()) return;
    logUiEvent('ws.send', { url: activeTab.url });
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
    logUiEvent('ws.clear');
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

  // Protocols count for badge
  const protocolsCount = (() => {
    try {
      const e = JSON.parse(activeTab.authData?.['ws_protocol_entries'] || '[]');
      return e.filter((p: { enabled: boolean; value: string }) => p.enabled && p.value?.trim()).length;
    } catch { return 0; }
  })();

  // Sub-tabs for TabView
  const subTabItems: TabItem[] = [
    {
      id: 'communication',
      label: 'Communication',
      dot: messages.length > 0,
      dotColor: ACCENT,
    },
    {
      id: 'protocols',
      label: 'Protocols',
      badge: protocolsCount > 0 ? protocolsCount : undefined,
      badgeColor: ACCENT,
    },
    { id: 'templates', label: 'Templates' },
  ];

  // AI overflow context menu items
  const aiMenuItems: ContextMenuItem[] = [
    ...(activeTab.url.trim() && aiEnabled('preflightCheck') ? [{
      id: 'preflight',
      label: 'Pre-flight Check',
      icon: <SparkleIcon size={12} style={{ color: 'var(--color-warning)' }} />,
      onClick: () => { setShowPreflight(true); setShowAiMenu(false); },
    }] : []),
    ...(aiEnabled('daakiaAiChat') ? [{
      id: 'ask-ai',
      label: 'Ask AI',
      icon: <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)' }} />,
      onClick: () => { openDaakiaAiTab(); setShowAiMenu(false); },
    }] : []),
    ...(activeTab.url.trim() && aiEnabled('patternBaseline') ? [{
      id: 'pattern-baseline',
      label: 'Pattern Baseline',
      icon: <SparkleIcon size={12} style={{ color: 'var(--color-info)' }} />,
      onClick: () => { setShowPatternStatus(p => !p); setShowAiMenu(false); },
    }] : []),
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Realtime protocol selector */}
      <RealtimeProtocolSelector />

      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0 overflow-x-auto overflow-y-hidden">
        {/* Protocol badge */}
        <span className="flex-shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider text-[var(--color-protocol-websocket)] bg-[rgba(76,175,80,0.12)]">
          WS
        </span>

        {/* Connection indicator */}
        <span
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-colors ${connState === 'connected' ? 'breathing-connected' : ''}`}
          style={{ backgroundColor: statusColor, color: statusColor }}
          title={connState}
        />

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
            accentColor={ACCENT}
            size="lg"
            borderRadius={6}
          />
        </div>

        {/* Connect/Disconnect button */}
        {connState === 'disconnected' ? (
          <DropDownButtonView
            className="flex-shrink-0"
            label="Connect"
            icon={<ConnectIcon size={12} />}
            variant="primary"
            size="lg"
            accentColor={ACCENT}
            disabled={!isValidProtocolUrl(activeTab.url, 'websocket')}
            onPrimaryClick={() => handleConnect(false)}
            items={wsConnectItems}
            align="right"
          />
        ) : (
          <ButtonView
            className="flex-shrink-0"
            label="Disconnect"
            iconLeft={<DisconnectIcon size={12} />}
            variant="primary"
            size="lg"
            accentColor="var(--color-error)"
            onClick={handleDisconnect}
          />
        )}

        {/* Save DropDownButton */}
        <DropDownButtonView
          className="flex-shrink-0"
          label="Save"
          icon={<SaveIcon size={12} />}
          variant="secondary"
          size="lg"
          onPrimaryClick={() => {
            const saved = saveRequest(activeTab);
            if (saved) updateTab(activeTab.id, { dirty: false });
          }}
          items={wsSaveItems}
          align="right"
          accentColor="var(--color-surface-border)"
        />

        {/* AI Tools ⋮ menu */}
        <div ref={aiMenuBtnRef} className="flex-shrink-0 relative">
          <IconButtonView
            icon={<MoreVerticalIcon size={13} />}
            title="AI tools"
            size="lg"
            active={showAiMenu}
            onClick={() => {
              if (!showAiMenu && aiMenuBtnRef.current) {
                const rect = aiMenuBtnRef.current.getBoundingClientRect();
                setAiOverflowDir((window.innerHeight - rect.bottom) < 160 ? 'up' : 'down');
              }
              setShowAiMenu(p => !p);
            }}
          />
          <ContextMenuView
            items={aiMenuItems}
            anchorEl={aiMenuBtnRef.current}
            open={showAiMenu}
            onClose={() => setShowAiMenu(false)}
            width="md"
            align="right"
          />
          {showPreflight && activeTab.url.trim() && <AiPreflightPopover tab={activeTab} onClose={() => setShowPreflight(false)} />}
          {showPatternStatus && activeTab.url.trim() && aiEnabled('patternBaseline') && (
            <PatternBaselinePopup method="WS" url={activeTab.url} onClose={() => setShowPatternStatus(false)} />
          )}
        </div>
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
          {/* Sub-tabs: Communication | Protocols | Templates */}
          <div className="flex items-center px-3 pt-1.5 pb-0 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
            <TabView
              tabs={subTabItems}
              activeTab={activeSubTab}
              onChange={(id) => setActiveSubTab(id as SubTab)}
              variant="underline"
              size="md"
              accentColor={ACCENT}
            />
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
                    <SelectInputView
                      options={formatOptions}
                      value={messageFormat}
                      onChange={(v) => setMessageFormat(v as MessageFormat)}
                      size="md"
                      accentColor={ACCENT}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {/* 9.6: Generate — ghost button, matches SOAP/REST AI toolbar style */}
                    {aiEnabled('bodyGenerator') && (
                      <ButtonView
                        size="xs"
                        variant="ghost"
                        iconLeft={<SparkleIcon size={10} />}
                        title="AI Message Generator"
                        onClick={() => bodyGenRef.current?.open()}
                        style={{ color: 'var(--color-protocol-ai)' }}
                      >
                        Generate
                      </ButtonView>
                    )}
                    {/* Send */}
                    <ButtonView
                      size="xs"
                      variant="ghost"
                      iconLeft={<SendIcon size={11} />}
                      label="Send"
                      onClick={handleSend}
                      disabled={connState !== 'connected' || !inputMsg.trim()}
                      accentColor={ACCENT}
                    />
                    {/* Clear input checkbox */}
                    <CheckboxView
                      size="xs"
                      checked={clearOnSend}
                      onChange={(v) => setClearOnSend(v)}
                      label="Clear input"
                    />
                  </div>
                </div>
                {/* 9.6: AiBodyGenerate drawer — above editor so it pushes content down */}
                <AiBodyGenerate
                  ref={bodyGenRef}
                  tabId={activeTab.id}
                  method="WS"
                  url={activeTab.url}
                  contentType="application/json"
                  onApply={(body) => setInputMsg(body)}
                />
                {/* Code editor */}
                <div className="flex-1 min-h-0">
                  <EditorView
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
            {activeSubTab === 'templates' && (
              <WsTemplatesTab
                onLoad={(msg) => { setInputMsg(msg); setActiveSubTab('communication'); }}
                currentMessage={inputMsg}
              />
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

        {/* Bottom: Log panel */}
        <div
          className="flex-1 min-h-[60px] flex flex-col overflow-hidden"
          style={{ transition: isDragging ? 'none' : 'all 180ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          onFocus={handleLogFocus}
        >
          {/* Log header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
            <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Log</span>
            <div className="flex items-center gap-0.5">
              <IconButtonView
                size="xs"
                icon={<TrashIcon size={12} />}
                title="Clear log"
                disabled={messages.length === 0}
                accentColor="var(--color-error)"
                onClick={handleClearMessages}
              />
              <IconButtonView
                size="xs"
                icon={<ArrowUpIcon size={13} />}
                title="Scroll to top"
                disabled={messages.length === 0}
                onClick={() => logContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              />
              <IconButtonView
                size="xs"
                icon={<ArrowDownIcon size={13} />}
                title="Scroll to bottom"
                disabled={messages.length === 0}
                onClick={() => { if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight; }}
              />
              <IconButtonView
                size="xs"
                icon={<AutoScrollIcon size={14} />}
                title={autoScroll ? 'Autoscroll: Turn off' : 'Autoscroll: Turn on'}
                active={autoScroll}
                accentColor={ACCENT}
                onClick={() => setAutoScroll(!autoScroll)}
              />
              {/* Auto-reconnect toggle (5.3.12) */}
              <ButtonView
                size="xs"
                variant="ghost"
                label="⟳ Auto"
                accentColor={activeTab?.wsAutoReconnect ? 'var(--color-warning)' : 'var(--color-text-muted)'}
                title={activeTab?.wsAutoReconnect ? 'Auto-reconnect: On (click to disable)' : 'Auto-reconnect: Off (click to enable)'}
                onClick={() => { if (activeTab) updateTab(activeTab.id, { wsAutoReconnect: !activeTab.wsAutoReconnect }); }}
              />
              {/* 9.1-9.5, 9.7, 9.9: AI log actions */}
              <AiRealtimeLogActions
                tabId={activeTab.id}
                url={activeTab.url || ''}
                protocol="websocket"
                messages={messages.filter(m => m.direction === 'received').map(m => m.data)}
                hasError={!!lastError}
                errorMsg={lastError || ''}
                accentColor="var(--color-protocol-ai)"
                trafficAnalyzerFlag="wsTrafficAnalyzer"
              />
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

      {showConnectPayload && (
        <ConnectPayloadModal
          protocol="websocket"
          accentColor={ACCENT}
          contentType={activeTab.authData?.['ws_init_format'] || 'json'}
          body={activeTab.authData?.['ws_init_body'] || ''}
          onContentTypeChange={(v) => setInitField('ws_init_format', v)}
          onBodyChange={(v) => setInitField('ws_init_body', v)}
          onSendAndConnect={handleSendAndConnect}
          onClose={() => setShowConnectPayload(false)}
        />
      )}
    </div>
  );
}

// ────────── Constants ──────────

const formatOptions: SelectOption[] = [
  { value: 'json', label: 'JSON' },
  { value: 'raw', label: 'RAW' },
];

const wsSaveItems: ContextMenuItem[] = [
  {
    id: 'save-as',
    label: 'Save as',
    icon: <SaveIcon size={12} />,
    iconColor: 'var(--color-ctx-close-saved)',
    onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }),
  },
];
