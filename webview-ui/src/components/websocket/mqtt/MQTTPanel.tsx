import { useState, useEffect, useRef, useCallback } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useUrlSuggestionsStore } from '../../../store/url-suggestions-store';
import { postMsg } from '../../../vscode';
import { saveRequest } from '../../../services/request';
import {
  ConnectIcon, DisconnectIcon, SendIcon, TrashIcon, PlusIcon,
  ArrowUpIcon, ArrowDownIcon, AutoScrollIcon,
  ChevronDownIcon, SaveIcon,
} from '../../../icons';
import { HighlightedInput, SplitButton, StyledDropdown, CodeEditor, Checkbox } from '../../shared';
import type { SplitButtonItem, DropdownOption } from '../../shared';
import { MqttMessageRow, type MqttMessage, type MqttSubscription } from './MqttMessageRow';
import { MqttSubscriptionModal, SUB_COLORS } from './MqttSubscriptionModal';
import { useMockSuggestions } from '../../../hooks/useMockSuggestions';

// ---------- Constants ----------

const QOS_OPTIONS: DropdownOption[] = [
  { value: '0', label: 'QoS 0' },
  { value: '1', label: 'QoS 1' },
  { value: '2', label: 'QoS 2' },
];

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

// ---------- Per-tab state cache (survives tab switches) ----------
const messagesCache = new Map<string, MqttMessage[]>();
const connStateCache = new Map<string, ConnectionState>();
const errorCache = new Map<string, string | null>();

// ---------- MQTT Panel ----------

export function MQTTPanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);
  const updateTab = useTabsStore(s => s.updateTab);
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.mqtt);
  const mockSuggestions = useMockSuggestions('mqtt');

  const [connState, setConnStateLocal] = useState<ConnectionState>(connStateCache.get(activeTabId!) || 'disconnected');
  const [messages, setMessagesLocal] = useState<MqttMessage[]>(messagesCache.get(activeTabId!) || []);
  const [activeSubFilter, setActiveSubFilter] = useState<string | null>(null); // null = All Topics
  const [error, setErrorLocal] = useState<string | null>(errorCache.get(activeTabId!) ?? null);

  // Wrap setters to also update cache
  const setConnState = useCallback((v: ConnectionState) => {
    setConnStateLocal(v);
    if (activeTabId) connStateCache.set(activeTabId, v);
  }, [activeTabId]);
  const setMessages = useCallback((v: MqttMessage[] | ((prev: MqttMessage[]) => MqttMessage[])) => {
    setMessagesLocal(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      if (activeTabId) messagesCache.set(activeTabId, next);
      return next;
    });
  }, [activeTabId]);
  const setError = useCallback((v: string | null) => {
    setErrorLocal(v);
    if (activeTabId) errorCache.set(activeTabId, v);
  }, [activeTabId]);

  // Persisted fields � read from authData, write back on change
  const ad = activeTab?.authData || {};
  const [subscriptions, setSubscriptionsLocal] = useState<MqttSubscription[]>(() => {
    try { return ad['mqtt_subscriptions'] ? JSON.parse(ad['mqtt_subscriptions']) : []; } catch { return []; }
  });

  // Connection config (persisted)
  const [clientId, setClientIdLocal] = useState(ad['mqtt_clientId'] || `daakia_${Date.now().toString(36)}`);
  const [username, setUsernameLocal] = useState(ad['mqtt_username'] || '');
  const [password, setPasswordLocal] = useState(ad['mqtt_password'] || '');
  const [keepAlive, setKeepAliveLocal] = useState(Number(ad['mqtt_keepAlive']) || 60);
  const [cleanSession, setCleanSessionLocal] = useState(ad['mqtt_cleanSession'] !== 'false');
  const [lastWillTopic, setLastWillTopicLocal] = useState(ad['mqtt_lwTopic'] || '');
  const [lastWillMessage, setLastWillMessageLocal] = useState(ad['mqtt_lwMessage'] || '');
  const [lastWillQos, setLastWillQosLocal] = useState<0 | 1 | 2>((Number(ad['mqtt_lwQos']) || 0) as 0 | 1 | 2);
  const [lastWillRetain, setLastWillRetainLocal] = useState(ad['mqtt_lwRetain'] === 'true');
  const [showConfig, setShowConfig] = useState(true);

  // Publish area (persisted)
  const [pubTopic, setPubTopicLocal] = useState(ad['mqtt_pubTopic'] || '');
  const [pubPayload, setPubPayloadLocal] = useState(ad['mqtt_pubPayload'] || '{"message": "Hello MQTT"}');
  const [pubQos, setPubQosLocal] = useState<0 | 1 | 2>((Number(ad['mqtt_pubQos']) || 0) as 0 | 1 | 2);
  const [pubRetain, setPubRetainLocal] = useState(ad['mqtt_pubRetain'] === 'true');

  // Helper to persist MQTT fields to authData
  const persistMqtt = useCallback((key: string, value: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { authData: { ...activeTab.authData, [key]: value } });
  }, [activeTab, updateTab]);

  const setClientId = (v: string) => { setClientIdLocal(v); persistMqtt('mqtt_clientId', v); };
  const setUsername = (v: string) => { setUsernameLocal(v); persistMqtt('mqtt_username', v); };
  const setPassword = (v: string) => { setPasswordLocal(v); persistMqtt('mqtt_password', v); };
  const setKeepAlive = (v: number) => { setKeepAliveLocal(v); persistMqtt('mqtt_keepAlive', String(v)); };
  const setCleanSession = (v: boolean) => { setCleanSessionLocal(v); persistMqtt('mqtt_cleanSession', String(v)); };
  const setLastWillTopic = (v: string) => { setLastWillTopicLocal(v); persistMqtt('mqtt_lwTopic', v); };
  const setLastWillMessage = (v: string) => { setLastWillMessageLocal(v); persistMqtt('mqtt_lwMessage', v); };
  const setLastWillQos = (v: 0 | 1 | 2) => { setLastWillQosLocal(v); persistMqtt('mqtt_lwQos', String(v)); };
  const setLastWillRetain = (v: boolean) => { setLastWillRetainLocal(v); persistMqtt('mqtt_lwRetain', String(v)); };
  const setPubTopic = (v: string) => { setPubTopicLocal(v); persistMqtt('mqtt_pubTopic', v); };
  const setPubPayload = (v: string) => { setPubPayloadLocal(v); persistMqtt('mqtt_pubPayload', v); };
  const setPubQos = (v: 0 | 1 | 2) => { setPubQosLocal(v); persistMqtt('mqtt_pubQos', String(v)); };
  const setPubRetain = (v: boolean) => { setPubRetainLocal(v); persistMqtt('mqtt_pubRetain', String(v)); };
  const setSubscriptions = (subsOrUpdater: MqttSubscription[] | ((prev: MqttSubscription[]) => MqttSubscription[])) => {
    setSubscriptionsLocal(prev => {
      const newSubs = typeof subsOrUpdater === 'function' ? subsOrUpdater(prev) : subsOrUpdater;
      if (activeTab) updateTab(activeTab.id, { authData: { ...activeTab.authData, mqtt_subscriptions: JSON.stringify(newSubs) } });
      return newSubs;
    });
  };

  // Sync local state from authData when tab switches
  useEffect(() => {
    const a = activeTab?.authData || {};
    setClientIdLocal(a['mqtt_clientId'] || `daakia_${Date.now().toString(36)}`);
    setUsernameLocal(a['mqtt_username'] || '');
    setPasswordLocal(a['mqtt_password'] || '');
    setKeepAliveLocal(Number(a['mqtt_keepAlive']) || 60);
    setCleanSessionLocal(a['mqtt_cleanSession'] !== 'false');
    setLastWillTopicLocal(a['mqtt_lwTopic'] || '');
    setLastWillMessageLocal(a['mqtt_lwMessage'] || '');
    setLastWillQosLocal((Number(a['mqtt_lwQos']) || 0) as 0 | 1 | 2);
    setLastWillRetainLocal(a['mqtt_lwRetain'] === 'true');
    setPubTopicLocal(a['mqtt_pubTopic'] || '');
    setPubPayloadLocal(a['mqtt_pubPayload'] || '{"message": "Hello MQTT"}');
    setPubQosLocal((Number(a['mqtt_pubQos']) || 0) as 0 | 1 | 2);
    setPubRetainLocal(a['mqtt_pubRetain'] === 'true');
    try { setSubscriptionsLocal(a['mqtt_subscriptions'] ? JSON.parse(a['mqtt_subscriptions']) : []); } catch { setSubscriptionsLocal([]); }
  }, [activeTabId]);

  // New subscription modal
  const [showSubModal, setShowSubModal] = useState(false);
  const [newSubTopic, setNewSubTopic] = useState('');
  const [newSubQos, setNewSubQos] = useState<0 | 1 | 2>(0);
  const [newSubLabel, setNewSubLabel] = useState('');
  const [newSubColor, setNewSubColor] = useState(SUB_COLORS[0]);

  // Splitter + scroll
  const storedSplit = useUiStateStore(s => s.panelHeights['split.mqtt.main']);
  const [splitPercent, setSplitPercent] = useState(storedSplit ?? 50);
  const [isDragging, setIsDragging] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<'request' | 'log' | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && messages.length > 0 && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Listen for MQTT events from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!activeTab || msg.tabId !== activeTab.id) return;

      switch (msg.type) {
        case 'mqtt:connected':
          setConnState('connected');
          setError(null);
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            topic: '',
            payload: `Connected as "${msg.clientId}"`,
            qos: 0,
            retain: false,
            direction: 'system',
            timestamp: Date.now(),
          }]);
          if (activeTab.url) useUrlSuggestionsStore.getState().addUrls([activeTab.url], 'mqtt');
          // Auto-subscribe to all persisted subscriptions
          for (const sub of subscriptions) {
            if (sub.active) {
              postMsg({ type: 'mqtt:subscribe', tabId: activeTab.id, topic: sub.topic, qos: sub.qos });
            }
          }
          break;
        case 'mqtt:message':
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            topic: msg.topic,
            payload: msg.payload,
            qos: msg.qos,
            retain: msg.retain,
            direction: 'received',
            timestamp: msg.timestamp,
          }]);
          break;
        case 'mqtt:published':
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            topic: msg.topic,
            payload: msg.payload,
            qos: msg.qos,
            retain: msg.retain,
            direction: 'published',
            timestamp: msg.timestamp,
          }]);
          break;
        case 'mqtt:subscribed':
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            topic: msg.topic,
            payload: `Subscribed to "${msg.topic}" (QoS ${msg.qos})`,
            qos: msg.qos,
            retain: false,
            direction: 'system',
            timestamp: Date.now(),
          }]);
          break;
        case 'mqtt:unsubscribed':
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            topic: msg.topic,
            payload: `Unsubscribed from "${msg.topic}"`,
            qos: 0,
            retain: false,
            direction: 'system',
            timestamp: Date.now(),
          }]);
          break;
        case 'mqtt:error':
          setError(msg.error);
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            topic: '',
            payload: `Error: ${msg.error}`,
            qos: 0,
            retain: false,
            direction: 'system',
            timestamp: Date.now(),
          }]);
          break;
        case 'mqtt:disconnected':
          setConnState('disconnected');
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            topic: '',
            payload: `Disconnected: ${msg.reason || 'Connection closed'}`,
            qos: 0,
            retain: false,
            direction: 'system',
            timestamp: Date.now(),
          }]);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [activeTab, subscriptions]);

  // Restore per-tab state on tab change (persisted fields handled by sync useEffect above)
  useEffect(() => {
    setConnStateLocal(connStateCache.get(activeTabId!) || 'disconnected');
    setMessagesLocal(messagesCache.get(activeTabId!) || []);
    setErrorLocal(errorCache.get(activeTabId!) ?? null);
  }, [activeTabId]);

  const handleConnect = useCallback(() => {
    if (!activeTab) return;
    const url = activeTab.url.trim();
    if (!url) return;
    setConnState('connecting');
    setError(null);
    postMsg({
      type: 'mqtt:connect',
      tabId: activeTab.id,
      url,
      clientId,
      username: username || undefined,
      password: password || undefined,
      keepAlive,
      cleanSession,
      lastWillTopic: lastWillTopic || undefined,
      lastWillMessage: lastWillMessage || undefined,
      lastWillQos,
      lastWillRetain,
      subscriptions,
      pubTopic,
      pubPayload,
      pubQos,
      pubRetain,
      envId: activeTab.envId,
    });
  }, [activeTab, clientId, username, password, keepAlive, cleanSession, lastWillTopic, lastWillMessage, lastWillQos, lastWillRetain]);

  const handleDisconnect = useCallback(() => {
    if (!activeTab) return;
    postMsg({ type: 'mqtt:disconnect', tabId: activeTab.id });
    setConnState('disconnected');
  }, [activeTab]);

  const handleSubscribe = useCallback(() => {
    if (!activeTab || !newSubTopic.trim()) return;
    postMsg({ type: 'mqtt:subscribe', tabId: activeTab.id, topic: newSubTopic, qos: newSubQos });
    setSubscriptions(prev => [...prev, {
      id: crypto.randomUUID(),
      topic: newSubTopic,
      qos: newSubQos,
      label: newSubLabel || newSubTopic,
      color: newSubColor,
      active: true,
    }]);
    setShowSubModal(false);
    setNewSubTopic('');
    setNewSubLabel('');
    setNewSubQos(0);
    setNewSubColor(SUB_COLORS[(subscriptions.length + 1) % SUB_COLORS.length]);
  }, [activeTab, newSubTopic, newSubQos, newSubLabel, newSubColor, subscriptions.length]);

  const handleUnsubscribe = useCallback((sub: MqttSubscription) => {
    if (!activeTab) return;
    postMsg({ type: 'mqtt:unsubscribe', tabId: activeTab.id, topic: sub.topic });
    setSubscriptions(prev => prev.filter(s => s.id !== sub.id));
  }, [activeTab]);

  const handlePublish = useCallback(() => {
    if (!activeTab || !pubTopic.trim()) return;
    postMsg({
      type: 'mqtt:publish',
      tabId: activeTab.id,
      topic: pubTopic,
      payload: pubPayload,
      qos: pubQos,
      retain: pubRetain,
    });
  }, [activeTab, pubTopic, pubPayload, pubQos, pubRetain]);

  const handleClear = useCallback(() => setMessages([]), [setMessages]);

  // Save handlers
  const handleSave = useCallback(() => {
    if (!activeTab) return;
    saveRequest(activeTab);
  }, [activeTab]);

  const saveItems: SplitButtonItem[] = [
    { id: 'save-as', label: 'Save As...', icon: <SaveIcon size={12} />, iconColor: 'var(--color-ctx-close-saved)', onClick: () => postMsg({ type: 'openSaveAs', tabId: activeTab?.id }) },
  ];

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
    useUiStateStore.getState().setHeight('split.mqtt.main', splitPercent);
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

  // Filter messages by active subscription
  const filteredMessages = activeSubFilter
    ? messages.filter(m => m.direction === 'system' || m.topic === activeSubFilter)
    : messages;

  if (!activeTab) return null;

  const statusColor = connState === 'connected' ? 'var(--color-protocol-mqtt)'
    : connState === 'connecting' ? 'var(--color-warning)'
    : 'var(--color-text-muted)';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider text-[var(--color-protocol-mqtt)] bg-[rgba(139,92,246,0.12)]">
          MQTT
        </span>

        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-colors"
          style={{ backgroundColor: statusColor }}
          title={connState}
        />

        <div className="flex-[2] min-w-0">
          <HighlightedInput
            value={activeTab.url}
            onChange={(v) => updateTab(activeTab.id, { url: v })}
            onKeyDown={(e) => { if (e.key === 'Enter') connState === 'disconnected' ? handleConnect() : handleDisconnect(); }}
            placeholder="wss://test.mosquitto.org:8081"
            disabled={connState === 'connected'}
            suggestions={urlSuggestions}
            mockServers={mockSuggestions}
            protocolHints={['wss://']}
          />
        </div>

        {/* Client ID */}
        <div className="flex items-center gap-1.5 flex-[1] min-w-0">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded whitespace-nowrap" style={{ color: 'var(--color-protocol-mqtt)', backgroundColor: 'rgba(139,92,246,0.12)' }}>Client ID</span>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={connState === 'connected'}
            className="h-[36px] flex-1 min-w-[80px] px-2.5 text-[12px] font-mono rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
            placeholder="daakia"
          />
        </div>

        {/* Connect / Disconnect */}
        {connState === 'disconnected' ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={!activeTab.url.trim()}
            className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-protocol-mqtt)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity flex items-center gap-1.5 flex-shrink-0"
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

        {/* Save */}
        <SplitButton
          label="Save"
          items={saveItems}
          onClick={handleSave}
          variant="secondary"
          icon={<SaveIcon size={13} />}
        />
      </div>

      {/* Main content � vertical split */}
      <div
        ref={containerRef}
        className="flex-1 flex flex-col min-h-0 overflow-hidden relative"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Top section � Connection Config + Publish */}
        <div className="flex flex-col overflow-hidden" style={{ height: `${splitPercent}%` }} onFocus={handleRequestFocus}>
          {/* Connection config toggle */}
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer border-b border-[var(--color-surface-border)] bg-[var(--color-surface)] flex-shrink-0 transition-colors"
          >
            <ChevronDownIcon size={10} className={`transition-transform ${showConfig ? '' : '-rotate-90'}`} />
            Connection Config
            {connState === 'connected' && (
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-[rgba(139,92,246,0.12)] text-[var(--color-protocol-mqtt)]">
                ? Clean Session {cleanSession ? 'ON' : 'OFF'}
              </span>
            )}
          </button>

          {showConfig && (
            <div className="px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
              {/* Left column � credentials */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-[70px] text-[var(--color-text-muted)]">Username</span>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} disabled={connState === 'connected'} placeholder="Username" className="flex-1 h-[28px] px-2 rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:opacity-50" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-[70px] text-[var(--color-text-muted)]">Password</span>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={connState === 'connected'} placeholder="Password" className="flex-1 h-[28px] px-2 rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:opacity-50" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-[70px] text-[var(--color-text-muted)]">Keep Alive</span>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={keepAlive} onChange={e => setKeepAlive(parseInt(e.target.value) || 60)} disabled={connState === 'connected'} className="w-[70px] h-[28px] px-2 rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none disabled:opacity-50" />
                  <div className="ml-auto">
                    <Checkbox checked={cleanSession} onChange={setCleanSession} label="Clean Session" />
                  </div>
                </div>
              </div>
              {/* Right column � Last Will */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-[90px] text-[var(--color-text-muted)]">Last-Will Topic</span>
                  <input type="text" value={lastWillTopic} onChange={e => setLastWillTopic(e.target.value)} disabled={connState === 'connected'} placeholder="Last-Will Topic" className="flex-1 h-[28px] px-2 rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:opacity-50" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-[90px] text-[var(--color-text-muted)]">Last-Will Msg</span>
                  <input type="text" value={lastWillMessage} onChange={e => setLastWillMessage(e.target.value)} disabled={connState === 'connected'} placeholder="Last-Will Message" className="flex-1 h-[28px] px-2 rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:opacity-50" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-[90px] text-[var(--color-text-muted)]">Last-Will QoS</span>
                  <StyledDropdown size="sm" options={QOS_OPTIONS} value={String(lastWillQos)} onChange={v => setLastWillQos(parseInt(v) as 0 | 1 | 2)} accentColor="var(--color-protocol-mqtt)" />
                  <div className="ml-auto">
                    <Checkbox checked={lastWillRetain} onChange={setLastWillRetain} label="Last-Will Retain" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Publish area */}
          <div className="px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={pubTopic}
                onChange={e => setPubTopic(e.target.value)}
                placeholder="Topic to publish (e.g. test/hello)"
                className="flex-1 h-[30px] px-2.5 text-[12px] font-mono rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <StyledDropdown size="sm" options={QOS_OPTIONS} value={String(pubQos)} onChange={v => setPubQos(parseInt(v) as 0 | 1 | 2)} accentColor="var(--color-protocol-mqtt)" />
              <Checkbox checked={pubRetain} onChange={setPubRetain} label="Retain" />
              <button
                type="button"
                onClick={handlePublish}
                disabled={connState !== 'connected' || !pubTopic.trim()}
                className="h-[30px] px-4 text-[11px] font-medium rounded-md bg-[var(--color-protocol-mqtt)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity flex items-center gap-1.5"
              >
                <SendIcon size={11} />
                Publish
              </button>
            </div>
            <div className="h-[60px]">
              <CodeEditor
                value={pubPayload}
                onChange={setPubPayload}
                language="json"
                height="60px"
              />
            </div>
          </div>
        </div>

        {/* Splitter */}
        <div
          className="h-[6px] flex items-center justify-center cursor-row-resize group relative flex-shrink-0 z-10"
          style={{ borderTop: '1px solid var(--color-surface-border)' }}
          onPointerDown={handlePointerDown}
          onDoubleClick={() => { setSplitPercent(50); setFocusedPanel(null); useUiStateStore.getState().setHeight('split.mqtt.main', 50); }}
        >
          <div className="w-8 h-[3px] rounded-full bg-[var(--color-text-muted)] opacity-40 group-hover:opacity-80 transition-opacity" />
        </div>

        {/* Bottom section � Subscriptions + Log */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ height: `${100 - splitPercent}%` }} onFocus={handleLogFocus}>
          {/* Subscription tabs */}
          <div className="flex items-center gap-0 px-3 border-b border-[var(--color-surface-border)] bg-[var(--color-surface)] flex-shrink-0 overflow-x-auto [scrollbar-gutter:stable]">
            {/* All Topics tab */}
            <button
              type="button"
              onClick={() => setActiveSubFilter(null)}
              className={`px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-colors border-b-2 whitespace-nowrap ${
                activeSubFilter === null
                  ? 'text-[var(--color-protocol-mqtt)] border-[var(--color-protocol-mqtt)]'
                  : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'
              }`}
            >
              All Topics
            </button>

            {subscriptions.map(sub => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setActiveSubFilter(sub.topic)}
                className={`px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-colors border-b-2 whitespace-nowrap flex items-center gap-1 group ${
                  activeSubFilter === sub.topic
                    ? 'border-current'
                    : 'border-transparent hover:text-[var(--color-text-primary)]'
                }`}
                style={{ color: activeSubFilter === sub.topic ? sub.color : 'var(--color-text-muted)' }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sub.color }} />
                {sub.label}
                <span
                  className="ml-1 opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-opacity"
                  onClick={(e) => { e.stopPropagation(); handleUnsubscribe(sub); }}
                  title="Unsubscribe"
                >
                  �
                </span>
              </button>
            ))}

            {/* New Subscription button */}
            <button
              type="button"
              onClick={() => connState === 'connected' && setShowSubModal(true)}
              disabled={connState !== 'connected'}
              className="ml-auto px-2.5 py-1 text-[10px] font-medium text-[var(--color-protocol-mqtt)] hover:bg-[rgba(139,92,246,0.08)] rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              <PlusIcon size={10} />
              New Subscription
            </button>
          </div>

          {/* Log toolbar */}
          <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--color-surface-border)] flex-shrink-0">
            <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Log</span>
            <div className="flex-1" />
            <button type="button" onClick={handleClear} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer" title="Clear log">
              <TrashIcon size={12} />
            </button>
            <button type="button" className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer" title="Scroll to top" onClick={() => { /* scroll top */ }}>
              <ArrowUpIcon size={12} />
            </button>
            <button type="button" className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer" title="Scroll to bottom" onClick={() => { if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight; }}>
              <ArrowDownIcon size={12} />
            </button>
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1 cursor-pointer transition-colors ${autoScroll ? 'text-[var(--color-protocol-mqtt)]' : 'text-[var(--color-text-muted)]'}`}
              title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
            >
              <AutoScrollIcon size={12} />
            </button>
          </div>

          {/* Messages log */}
          <div ref={logContainerRef} className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-3 py-1">
            {filteredMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[12px] text-[var(--color-text-muted)]">
                {connState === 'connected' ? 'No messages yet. Subscribe to topics or publish a message.' : 'Connect to a broker to start.'}
              </div>
            ) : (
              filteredMessages.map(msg => (
                <MqttMessageRow key={msg.id} message={msg} subscriptions={subscriptions} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* New Subscription Modal */}
      {showSubModal && (
        <MqttSubscriptionModal
          topic={newSubTopic}
          setTopic={setNewSubTopic}
          qos={newSubQos}
          setQos={setNewSubQos}
          label={newSubLabel}
          setLabel={setNewSubLabel}
          color={newSubColor}
          setColor={setNewSubColor}
          onSubscribe={handleSubscribe}
          onCancel={() => setShowSubModal(false)}
        />
      )}
    </div>
  );
}
