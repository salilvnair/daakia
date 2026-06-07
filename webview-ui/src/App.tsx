import { useEffect, useState, useRef, useCallback } from 'react';
import '@salilvnair/convengine-chat/style.css';
import { installDaakiaBridges } from './ai/DaakiaVsCodeBridge';
import { installKeyboardListener } from './services/keyboard';

// Install bridges before any React render so ConvEngineChat fetch/EventSource is ready
installDaakiaBridges();
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { TabBar } from './components/tabs/TabBar';
import { UrlBar } from './components/rest/request/UrlBar';
import { SaveRequestModal, RightClickMenu } from './components/shared';
import { RequestConfig } from './components/rest/request/RequestConfig';
import { ResponsePanel } from './components/rest/response/ResponsePanel';
import { SqliteBanner, ToastContainer } from './components/shared';
import { sendRequest, saveRequest } from './services/request';
import { AppSidebar, SidebarSection } from './components/sidebar';
import { SettingsPanel } from './components/sidebar/SettingsPanel';
import { MockServerPanel } from './components/mock/MockServerPanel';
import { GraphQLPanel } from './components/graphql';
import { WebSocketPanel } from './components/websocket';
import { GrpcPanel } from './components/grpc';
import { SoapPanel } from './components/soap';
import { AiPanel } from './components/ai/AiPanel';
import { DaakiaAiPanel } from './components/ai/DaakiaAiPanel';
import { McpPanel } from './components/mcp/McpPanel';
import { useTabsStore } from './store/tabs-store';
import { useToastStore } from './store/toast-store';
import { useEnvStore } from './store/env-store';
import { useCollectionsStore } from './store/collections-store';
import { useUrlSuggestionsStore } from './store/url-suggestions-store';
import { useUiStateStore } from './store/ui-state-store';
import { useDevToolsStore } from './store/devtools-store';
import { useMockStore } from './store/mock-store';
import { useDebugStore } from './store/debug-store';
import { useAiProvidersStore } from './store/ai-providers-store';
import { useSidebarDataStore } from './store/sidebar-data-store';
import { useAiKeysStore } from './store/ai-keys-store';
import { useAiFeaturesStore } from './store/ai-features-store';
import { useAiHistoryStore } from './store/ai-history-store';
import { useAiPromptTemplatesStore, AI_PROMPT_TEMPLATE_DEFAULTS } from './store/ai-prompt-templates-store';
import { useAiConversationStore } from './store/ai-conversation-store';
import { getVsCodeApi, postMsg } from './vscode';
import { getProtocolAccent } from './colors';
import { ProtocolRestBadge, ProtocolGraphQLBadge, ProtocolRealtimeBadge, ProtocolGrpcBadge, ProtocolSoapBadge, ProtocolAiBadge, ProtocolMcpBadge, ServerIcon, DevToolsIcon } from './icons';
import { DevToolsPanel } from './components/shared/devtools';
import { DebugHud } from './components/shared/debugger';

type FocusedPanel = 'request' | 'response' | null;

// ─── Global Protocol Diagnostics Logger ──────────────────────────────────────
// Logs ALL protocol messages to browser DevTools console for full observability.
// Every request/response, error, connection event is logged with full metadata.

function logProtocolMessage(msg: Record<string, unknown>) {
  if (!msg?.type) return;
  const type = msg.type as string;

  // ── REST / SOAP / GraphQL response
  if (type === 'responseData') {
    const resp = msg.response as Record<string, unknown> | undefined;
    const status = (resp?.status as number) ?? 0;
    const isError = status === 0 || status >= 400;
    const color = isError ? '#ef4444' : '#22c55e';
    const icon = isError ? '🚨' : '✅';
    console.group(`%c${icon} ${msg.requestMethod || 'REQ'} ${msg.requestUrl || ''} → ${status} ${resp?.statusText || ''}`, `color:${color};font-weight:bold`);
    console.log('%cRequest:', 'font-weight:bold', { method: msg.requestMethod, url: msg.requestUrl, headers: msg.requestHeaders, body: msg.requestBody });
    console.log('%cResponse:', 'font-weight:bold', { status, statusText: resp?.statusText, headers: resp?.headers, size: resp?.size, time: resp?.time, contentType: resp?.contentType });
    if (resp?.body) console.log('%cBody Preview:', 'font-weight:bold', String(resp.body).slice(0, 1000));
    if (resp?.errorDetail) console.error('%cError Detail:', 'font-weight:bold', resp.errorDetail);
    if (msg.scriptLogs) console.log('%cScript Logs:', 'font-weight:bold', msg.scriptLogs);
    if (msg.scriptErrors) console.error('%cScript Errors:', 'font-weight:bold', msg.scriptErrors);
    if (msg.testResults) console.log('%cTest Results:', 'font-weight:bold', msg.testResults);
    console.groupEnd();
  }

  // ── REST / SOAP error
  if (type === 'requestError') {
    console.group('%c🚨 Request Error', 'color:#ef4444;font-weight:bold;font-size:12px');
    console.error('%cError:', 'font-weight:bold', msg.error);
    console.error('%cTab:', 'font-weight:bold', msg.tabId);
    if (msg.scriptLogs) console.log('%cScript Logs:', 'font-weight:bold', msg.scriptLogs);
    if (msg.scriptErrors) console.error('%cScript Errors:', 'font-weight:bold', msg.scriptErrors);
    if (msg.consoleLogs) console.log('%cConsole Logs:', 'font-weight:bold', msg.consoleLogs);
    console.groupEnd();
  }

  // ── GraphQL response
  if (type === 'graphqlResponse') {
    const status = (msg.status as number) ?? 0;
    const isError = status === 0 || status >= 400;
    const color = isError ? '#ef4444' : '#22c55e';
    console.group(`%c${isError ? '🚨' : '✅'} GraphQL ${msg.url || ''} → ${status}`, `color:${color};font-weight:bold`);
    console.log('%cRequest:', 'font-weight:bold', { url: msg.url, query: msg.query, variables: msg.variables, headers: msg.requestHeaders });
    console.log('%cResponse:', 'font-weight:bold', { status, headers: msg.responseHeaders, body: msg.body, time: msg.time, size: msg.size });
    if (msg.errors) console.error('%cGraphQL Errors:', 'font-weight:bold', msg.errors);
    console.groupEnd();
  }

  // ── GraphQL subscription events
  if (type === 'graphqlSubscriptionData') {
    console.log('%c📡 GraphQL Subscription Data', 'color:#7c3aed;font-weight:bold', msg.data);
  }

  // ── WebSocket events
  if (type === 'wsConnected') {
    console.log('%c🔌 WebSocket Connected', 'color:#22c55e;font-weight:bold', msg.url || msg.tabId);
  }
  if (type === 'wsMessage') {
    console.log('%c📨 WebSocket Message', 'color:#3b82f6;font-weight:bold', { direction: msg.direction, data: msg.data, timestamp: msg.timestamp });
  }
  if (type === 'wsDisconnected' || type === 'wsClosed') {
    console.log('%c⛔ WebSocket Disconnected', 'color:#6b7280;font-weight:bold', { code: msg.code, reason: msg.reason });
  }
  if (type === 'wsError') {
    console.error('%c🚨 WebSocket Error', 'color:#ef4444;font-weight:bold', msg.error || msg.message);
  }

  // ── SSE events
  if (type === 'sseConnected') {
    console.log('%c🔌 SSE Connected', 'color:#22c55e;font-weight:bold', msg.url || msg.tabId);
  }
  if (type === 'sseEvent' || type === 'sseMessage') {
    console.log('%c📨 SSE Event', 'color:#06b6d4;font-weight:bold', { event: msg.event, data: msg.data });
  }
  if (type === 'sseError') {
    console.error('%c🚨 SSE Error', 'color:#ef4444;font-weight:bold', msg.error || msg.message);
  }

  // ── Socket.IO events
  if (type === 'socketioConnected') {
    console.log('%c🔌 Socket.IO Connected', 'color:#22c55e;font-weight:bold', msg.url || msg.tabId);
  }
  if (type === 'socketioEvent') {
    console.log('%c📨 Socket.IO Event', 'color:#f59e0b;font-weight:bold', { event: msg.event, data: msg.data });
  }
  if (type === 'socketioError') {
    console.error('%c🚨 Socket.IO Error', 'color:#ef4444;font-weight:bold', msg.error || msg.message);
  }
  if (type === 'socketioDisconnected') {
    console.log('%c⛔ Socket.IO Disconnected', 'color:#6b7280;font-weight:bold', msg.reason);
  }

  // ── MQTT events
  if (type === 'mqttConnected') {
    console.log('%c🔌 MQTT Connected', 'color:#22c55e;font-weight:bold', msg.url || msg.tabId);
  }
  if (type === 'mqttMessage') {
    console.log('%c📨 MQTT Message', 'color:#059669;font-weight:bold', { topic: msg.topic, payload: msg.payload, qos: msg.qos });
  }
  if (type === 'mqttError') {
    console.error('%c🚨 MQTT Error', 'color:#ef4444;font-weight:bold', msg.error || msg.message);
  }
  if (type === 'mqttDisconnected') {
    console.log('%c⛔ MQTT Disconnected', 'color:#6b7280;font-weight:bold', msg.tabId);
  }

  // ── gRPC events
  if (type === 'grpcResponse') {
    const status = (msg.status as number) ?? 0;
    const isError = status !== 0;
    console.group(`%c${isError ? '🚨' : '✅'} gRPC ${msg.method || msg.service || ''} → ${msg.statusText || status}`, `color:${isError ? '#ef4444' : '#22c55e'};font-weight:bold`);
    console.log('%cRequest:', 'font-weight:bold', { service: msg.service, method: msg.method, metadata: msg.metadata, body: msg.requestBody });
    console.log('%cResponse:', 'font-weight:bold', { status, statusText: msg.statusText, metadata: msg.responseMetadata, body: msg.body, time: msg.time });
    if (msg.error) console.error('%cError:', 'font-weight:bold', msg.error);
    console.groupEnd();
  }

  // ── MCP events
  if (type === 'mcp:connected') {
    console.log('%c🔌 MCP Connected', 'color:#22c55e;font-weight:bold', { tabId: msg.tabId, tools: msg.tools });
  }
  if (type === 'mcp:response') {
    console.group('%c✅ MCP Response', 'color:#22c55e;font-weight:bold');
    console.log('%cMethod:', 'font-weight:bold', msg.method);
    console.log('%cResult:', 'font-weight:bold', msg.result);
    console.log('%cDuration:', 'font-weight:bold', msg.duration);
    console.groupEnd();
  }
  if (type === 'mcp:error') {
    console.group('%c🚨 MCP Error', 'color:#ef4444;font-weight:bold');
    console.error('%cError:', 'font-weight:bold', msg.error || msg.message);
    console.error('%cTab:', 'font-weight:bold', msg.tabId);
    if (msg.diagnostics) console.error('%cDiagnostics:', 'font-weight:bold', msg.diagnostics);
    console.groupEnd();
  }
  if (type === 'mcp:disconnected') {
    console.log('%c⛔ MCP Disconnected', 'color:#6b7280;font-weight:bold', msg.tabId);
  }
  if (type === 'mcp:activity') {
    console.log('%c📋 MCP Activity', 'color:#8b5cf6;font-weight:bold', { method: msg.method, params: msg.params, result: msg.result });
  }

  // ── SOAP response (uses responseData with protocol hint)
  // (handled by the general responseData case above)

  // ── Mock server lifecycle events
  if (type === 'mockServerLog') {
    console.log('%c🎭 Mock Server', 'color:#f59e0b;font-weight:bold', msg.entry);
  }
  if (type === 'mockServer:started') {
    console.group(`%c🟢 Mock Server Started`, 'color:#22c55e;font-weight:bold;font-size:12px');
    console.log('%cServer ID:', 'font-weight:bold', msg.id);
    console.log('%cPort:', 'font-weight:bold', msg.port);
    console.log('%cProtocol:', 'font-weight:bold', msg.protocol || 'rest');
    console.log('%cTimestamp:', 'font-weight:bold', new Date().toISOString());
    console.groupEnd();
  }
  if (type === 'mockServer:stopped') {
    console.group(`%c🔴 Mock Server Stopped`, 'color:#f59e0b;font-weight:bold;font-size:12px');
    console.log('%cServer ID:', 'font-weight:bold', msg.id);
    console.log('%cTimestamp:', 'font-weight:bold', new Date().toISOString());
    console.groupEnd();
  }
  if (type === 'mockServer:error') {
    console.group(`%c🚨 Mock Server Error`, 'color:#ef4444;font-weight:bold;font-size:12px');
    console.error('%cServer ID:', 'font-weight:bold', msg.id);
    console.error('%cError:', 'font-weight:bold', msg.error);
    if ((msg.error as string)?.includes('\n')) {
      console.error('%cStack:', 'font-weight:bold', msg.error);
    }
    console.groupEnd();
  }

  // ── Settings changes (audit trail)
  if (type === 'saveAiProviders' || type === 'aiProviders:save') {
    console.group('%c⚙️ Settings Changed — AI Providers', 'color:#8b5cf6;font-weight:bold;font-size:11px');
    console.log('%cProviders:', 'font-weight:bold', msg.providers);
    console.log('%cDefault Provider:', 'font-weight:bold', msg.defaultProviderId);
    console.log('%cDefault Model:', 'font-weight:bold', msg.defaultModelId);
    console.log('%cTimestamp:', 'font-weight:bold', new Date().toISOString());
    console.groupEnd();
  }
  if (type === 'saveSetting' || type === 'saveSettings') {
    console.log(`%c⚙️ Setting Saved: ${msg.key || msg.section || ''}`, 'color:#8b5cf6;font-weight:bold', { key: msg.key, value: msg.value, section: msg.section });
  }
}

export default function App() {
  const [sqliteStatus, setSqliteStatus] = useState<{ ok: boolean; error?: string }>({ ok: true });
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>('collections');
  const [saveAsTabId, setSaveAsTabId] = useState<string | null>(null);
  const activeProtocol = useTabsStore(s => s.activeProtocol);
  const switchProtocol = useTabsStore(s => s.switchProtocol);
  const devToolsOpen = useDevToolsStore(s => s.isOpen);
  const protocolAccent = getProtocolAccent(activeProtocol);

  // Expose devtools store reference for vscode.ts settings audit interceptor
  // This runs once on mount and gives the interceptor access to addLog
  useEffect(() => {
    (window as any).__devtoolsStoreRef = useDevToolsStore;
    (window as any).__tabsStore = useTabsStore;
    return () => {
      delete (window as any).__devtoolsStoreRef;
      delete (window as any).__tabsStore;
    };
  }, []);

  // Remap sidebar section when protocol changes so icons match active protocol
  const prevProtocolRef = useRef(activeProtocol);
  // Tracks protocols we've already auto-opened the sidebar for (first-visit only).
  // Initialized with the current protocol so the initial render never auto-opens.
  const autoOpenedProtocols = useRef<Set<string>>(new Set([activeProtocol]));
  useEffect(() => {
    if (prevProtocolRef.current === activeProtocol) return;
    prevProtocolRef.current = activeProtocol;
    // Auto-open sidebar on the FIRST visit to each protocol.
    // If user manually closes it afterwards, we won't re-open (protocol stays in set).
    if (!autoOpenedProtocols.current.has(activeProtocol)) {
      autoOpenedProtocols.current.add(activeProtocol);
      setSidebarOpen(true);
    }
    // Map current section to equivalent in new protocol
    if (activeProtocol === 'rest') {
      if (sidebarSection?.startsWith('gql-') || sidebarSection?.startsWith('ws-')) {
        const base = sidebarSection.replace(/^(gql|ws)-/, '');
        if (['collections', 'history'].includes(base)) setSidebarSection(base as SidebarSection);
        else setSidebarSection('collections');
      }
    } else if (activeProtocol === 'graphql') {
      if (sidebarSection === 'collections') setSidebarSection('gql-collections');
      else if (sidebarSection === 'history') setSidebarSection('gql-history');
      else if (sidebarSection?.startsWith('ws-')) {
        const base = sidebarSection.replace('ws-', 'gql-');
        setSidebarSection(base as SidebarSection);
      }
    } else if (activeProtocol === 'websocket') {
      if (sidebarSection === 'collections') setSidebarSection('ws-collections');
      else if (sidebarSection === 'history') setSidebarSection('ws-history');
      else if (sidebarSection?.startsWith('gql-')) {
        const base = sidebarSection.replace('gql-', '');
        if (['collections', 'history'].includes(base)) setSidebarSection(`ws-${base}` as SidebarSection);
        else setSidebarSection('ws-collections');
      }
    } else if (activeProtocol === 'grpc') {
      if (sidebarSection === 'collections' || sidebarSection?.startsWith('gql-') || sidebarSection?.startsWith('ws-')) {
        setSidebarSection('grpc-collections');
      } else if (sidebarSection === 'history') {
        setSidebarSection('grpc-history');
      }
    } else if (activeProtocol === 'soap') {
      if (sidebarSection === 'collections' || sidebarSection?.startsWith('gql-') || sidebarSection?.startsWith('ws-') || sidebarSection?.startsWith('grpc-')) {
        setSidebarSection('soap-collections');
      } else if (sidebarSection === 'history') {
        setSidebarSection('soap-history');
      }
    }
  }, [activeProtocol, sidebarSection]);

  // Sidebar resizable
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const [showSplitterTip, setShowSplitterTip] = useState(false);
  const [showReqSplitterTip, setShowReqSplitterTip] = useState(false);
  const sidebarDragRef = useRef({ startX: 0, startWidth: 0, moved: false });

  // Resizable split: percentage of height for request panel (10-90)
  const storedSplit = useUiStateStore(s => s.panelHeights['split.rest.main']);
  const [splitPercent, setSplitPercent] = useState(storedSplit ?? 50);
  const [isDragging, setIsDragging] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<FocusedPanel>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const prevResponseRef = useRef<string | null>(null);

  // Track response arrival → auto-maximize response
  const { tabs, activeTabId } = useTabsStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  // Subscribe to breakpoint changes for snapshot persistence
  const debugBreakpoints = useDebugStore(s => s.breakpoints);
  const debugDisabledBps = useDebugStore(s => s.disabledBreakpoints);
  const debugConditions = useDebugStore(s => s.conditions);
  const anyMockRunning = useMockStore(s => s.servers.some(srv => srv.running));
  const mockRunningCount = useMockStore(s => s.servers.filter(srv => srv.running).length);
  const mockIconGlow = useMockStore(s => s.mockIconGlow);

  useEffect(() => {
    if (activeTab?.response) {
      const responseKey = `${activeTab.id}-${activeTab.response.status}-${activeTab.response.time}`;
      if (prevResponseRef.current !== responseKey) {
        prevResponseRef.current = responseKey;
        setFocusedPanel('response');
        setSplitPercent(25);
      }
    }
  }, [activeTab?.response, activeTab?.id]);

  // Install centralized keyboard listener
  useEffect(() => installKeyboardListener(), []);

  // Dynamically set --color-accent based on active protocol/tab so all inputs + scrollbars inherit protocol color
  useEffect(() => {
    const map: Record<string, string> = {
      rest: 'var(--color-protocol-rest)',
      graphql: 'var(--color-protocol-graphql)',
      websocket: 'var(--color-protocol-websocket)',
      grpc: 'var(--color-protocol-grpc)',
      soap: 'var(--color-protocol-soap)',
      ai: 'var(--color-protocol-ai)',
      mcp: 'var(--color-protocol-mcp)',
    };
    const tabProtocol = activeTab?.protocol || activeProtocol;
    const accent = activeTab?.type === 'mock-server' ? 'var(--color-mock-server)'
      : activeTab?.type === 'settings' ? 'var(--color-settings)'
      : activeTab?.type === 'daakia-ai' ? 'var(--color-protocol-ai)'
      : map[tabProtocol] || map.rest;
    document.documentElement.style.setProperty('--color-accent', accent);
  }, [activeProtocol, activeTab?.type, activeTab?.protocol]);

  // Keyboard shortcuts
  useKeyboardShortcut('app.toggle-sidebar', { key: 'b', altKey: true }, (e) => {
    e.preventDefault();
    setSidebarOpen(prev => !prev);
  }, 'Toggle sidebar');

  useKeyboardShortcut('app.toggle-split', { key: '/', altKey: true }, (e) => {
    e.preventDefault();
    setSplitPercent(prev => prev === 50 ? 25 : 50);
  }, 'Toggle request/response split');

  // Ctrl+Enter — Send request
  useKeyboardShortcut('app.send-request', { key: 'Enter', ctrlKey: true }, (e) => {
    e.preventDefault();
    const { tabs: t, activeTabId: id, updateTab } = useTabsStore.getState();
    const tab = t.find(x => x.id === id);
    if (tab && !tab.loading && tab.url.trim()) {
      sendRequest(tab);
      updateTab(tab.id, { loading: true });
    }
  }, 'Send request');

  // Ctrl+S — Save request
  useKeyboardShortcut('app.save-request', { key: 's', ctrlKey: true }, (e) => {
    e.preventDefault();
    const { tabs: t, activeTabId: id, updateTab } = useTabsStore.getState();
    const tab = t.find(x => x.id === id);
    if (tab) {
      const saved = saveRequest(tab);
      if (saved) updateTab(tab.id, { dirty: false });
    }
  }, 'Save request');

  // Ctrl+N — New tab
  useKeyboardShortcut('app.new-tab', { key: 'n', ctrlKey: true }, (e) => {
    e.preventDefault();
    useTabsStore.getState().addTab();
  }, 'New tab');

  // Ctrl+W — Close current tab
  useKeyboardShortcut('app.close-tab', { key: 'w', ctrlKey: true }, (e) => {
    e.preventDefault();
    const { activeTabId: id, closeTab } = useTabsStore.getState();
    if (id) closeTab(id);
  }, 'Close tab');

  // Ctrl+Shift+I — Import collection
  useKeyboardShortcut('app.import-collection', { key: 'i', ctrlKey: true, shiftKey: true }, (e) => {
    e.preventDefault();
    postMsg({ type: 'importCollectionRequest' });
  }, 'Import collection');

  // Ctrl+L — Focus URL bar
  useKeyboardShortcut('app.focus-url', { key: 'l', ctrlKey: true }, (e) => {
    e.preventDefault();
    const input = document.querySelector<HTMLInputElement>('.url-bar input');
    if (input) { input.focus(); input.select(); }
  }, 'Focus URL bar');

  // Right-click context menu is handled by <RightClickMenu /> component

  // ── Sidebar splitter drag ──
  const handleSidebarPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setSidebarDragging(true);
    sidebarDragRef.current = { startX: e.clientX, startWidth: sidebarWidth, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [sidebarWidth]);

  const handleSidebarPointerMove = useCallback((e: React.PointerEvent) => {
    if (!sidebarDragging) return;
    sidebarDragRef.current.moved = true;
    const delta = sidebarDragRef.current.startX - e.clientX; // Reversed: drag left = grow
    const newWidth = Math.min(480, Math.max(180, sidebarDragRef.current.startWidth + delta));
    setSidebarWidth(newWidth);
  }, [sidebarDragging]);

  const handleSidebarPointerUp = useCallback((e: React.PointerEvent) => {
    setSidebarDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    // Click without drag = toggle
    if (!sidebarDragRef.current.moved) {
      setSidebarOpen(prev => !prev);
    }
  }, []);

  // ── Req/Resp splitter drag ──
  const handleSplitterPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleSplitterPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percent = Math.min(90, Math.max(10, (y / rect.height) * 100));
    setSplitPercent(percent);
    setFocusedPanel(null);
  }, [isDragging]);

  const handleSplitterPointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    // Persist the manually-chosen split
    useUiStateStore.getState().setHeight('split.rest.main', splitPercent);
  }, [splitPercent]);

  // Focus request when user starts typing in body
  const handleRequestFocus = useCallback(() => {
    if (focusedPanel !== 'request') {
      setFocusedPanel('request');
      setSplitPercent(70);
    }
  }, [focusedPanel]);

  // Focus response when user clicks in response panel
  const handleResponseFocus = useCallback(() => {
    if (focusedPanel !== 'response') {
      setFocusedPanel('response');
      setSplitPercent(25);
    }
  }, [focusedPanel]);

  // Double-click splitter to reset to 50/50
  const handleSplitterDoubleClick = useCallback(() => {
    setSplitPercent(50);
    setFocusedPanel(null);
  }, []);

  // Listen for messages from extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;

      // ──── Global Protocol Diagnostics Logger ────
      // Logs all protocol responses, errors, and events to browser DevTools console
      logProtocolMessage(msg);

      switch (msg.type) {
        case 'init': {
          setSqliteStatus({ ok: msg.sqliteOk, error: msg.sqliteError });
          // Load persisted Daakia AI conversation on startup
          useAiConversationStore.getState().loadFromDb();
          break;
        }
        case 'aiConversation:data': {
          useAiConversationStore.getState().setMessages(msg.messages || []);
          break;
        }
        case 'responseData': {
          const { tabId, response, scriptLogs, scriptErrors, testResults, consoleLogs } = msg;
          useTabsStore.getState().updateTab(tabId, {
            response: {
              ...response,
              scriptLogs,
              scriptErrors,
              testResults,
              consoleLogs: consoleLogs || undefined,
              requestHeaders: msg.requestHeaders || undefined,
              requestBody: msg.requestBody || undefined,
              scriptSubRequests: msg.scriptSubRequests || undefined,
            },
            loading: false,
            requestProgress: undefined,
          });
          // Push structured console logs to DevTools
          if (consoleLogs && consoleLogs.length > 0) {
            const reqTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
            const reqName = reqTab?.url || reqTab?.name || 'Request';
            useDevToolsStore.getState().addLogs(
              consoleLogs.map((l: { level: string; args: unknown[]; timestamp: number; scriptPhase?: string }) => ({
                level: l.level as any,
                args: l.args,
                timestamp: l.timestamp,
                requestName: reqName,
                scriptPhase: l.scriptPhase,
              }))
            );
          }
          // Push network entry to DevTools Network tab
          if (response) {
            const reqTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
            useDevToolsStore.getState().addNetworkEntry({
              timestamp: Date.now(),
              method: msg.requestMethod || reqTab?.method || 'GET',
              url: msg.requestUrl || reqTab?.url || '',
              requestHeaders: msg.requestHeaders || {},
              requestBody: msg.requestBody || undefined,
              status: response.status,
              statusText: response.statusText,
              responseHeaders: response.headers || {},
              responseBody: response.body || undefined,
              duration: response.time || 0,
              size: response.size || 0,
              contentType: response.contentType || 'text/plain',
            });
            // Log failed requests with real error detail to DevTools console
            if (response.status === 0 && response.errorDetail) {
              const errTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
              const reqName = errTab?.url || errTab?.name || 'Request';
              const errMsg = response.errorDetail.cause
                ? `[${response.errorDetail.code}] ${response.errorDetail.message} (cause: ${response.errorDetail.cause})`
                : `[${response.errorDetail.code}] ${response.errorDetail.message}`;
              useDevToolsStore.getState().addLog({
                level: 'error',
                args: [`Request failed: ${reqName}`, errMsg],
                timestamp: Date.now(),
                requestName: reqName,
              });
            }
          }
          // Add URL to suggestions
          const sentTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (sentTab?.url) {
            useUrlSuggestionsStore.getState().addUrls([sentTab.url], 'rest');
          }
          break;
        }
        case 'requestProgress': {
          const { tabId: progTabId, stage, status } = msg;
          const store = useTabsStore.getState();
          const progTab = store.tabs.find(t => t.id === progTabId);
          if (!progTab) break;
          const now = Date.now();
          const STAGE_LABELS: Record<string, string> = {
            'pre-request-script': 'Executing pre-request script',
            'rendering-request': 'Rendering request',
            'sending-request': 'Sending request',
          };
          let stages = progTab.requestProgress ? [...progTab.requestProgress] : [];
          const existing = stages.find(s => s.id === stage);
          if (existing) {
            existing.status = status;
            if (status === 'running' && !existing.startTime) existing.startTime = now;
            if (status === 'done' || status === 'error' || status === 'skipped') {
              if (!existing.startTime) existing.startTime = now;
              existing.endTime = now;
            }
          } else {
            stages.push({
              id: stage,
              label: STAGE_LABELS[stage] || stage,
              status,
              startTime: status === 'running' ? now : (status === 'done' || status === 'skipped' ? now : undefined),
              endTime: status === 'done' || status === 'skipped' ? now : undefined,
            });
          }
          store.updateTab(progTabId, { requestProgress: stages });
          break;
        }
        case 'requestAborted': {
          // Debug session stopped by user — just clear loading, no error
          const { tabId: abortTabId } = msg;
          useTabsStore.getState().updateTab(abortTabId, { loading: false, requestProgress: undefined });
          break;
        }
        case 'requestError': {
          const { tabId, error, scriptLogs, scriptErrors, consoleLogs: errorConsoleLogs } = msg;
          useTabsStore.getState().updateTab(tabId, {
            response: {
              status: 0,
              statusText: 'Error',
              headers: {},
              body: error,
              size: 0,
              time: 0,
              contentType: 'text/plain',
              cookies: [],
              scriptLogs,
              scriptErrors,
            },
            loading: false,
            requestProgress: undefined,
          });
          // Log the real error to DevTools console
          const errTab2 = useTabsStore.getState().tabs.find(t => t.id === tabId);
          const reqName2 = errTab2?.url || errTab2?.name || 'Request';
          useDevToolsStore.getState().addLog({
            level: 'error',
            args: [`Request failed: ${reqName2}`, error],
            timestamp: Date.now(),
            requestName: reqName2,
          });
          // Add failed entry to DevTools Network tab
          useDevToolsStore.getState().addNetworkEntry({
            timestamp: Date.now(),
            method: errTab2?.method || 'GET',
            url: errTab2?.url || '',
            requestHeaders: {},
            status: 0,
            statusText: 'Error',
            responseHeaders: {},
            responseBody: error,
            duration: 0,
            size: 0,
            contentType: 'text/plain',
          });
          // Push structured console logs to DevTools (from failed pre-request scripts)
          if (errorConsoleLogs && errorConsoleLogs.length > 0) {
            useDevToolsStore.getState().addLogs(
              errorConsoleLogs.map((l: { level: string; args: unknown[]; timestamp: number; scriptPhase?: string }) => ({
                level: l.level as any,
                args: l.args,
                timestamp: l.timestamp,
                requestName: reqName2,
                scriptPhase: l.scriptPhase,
              }))
            );
          }
          break;
        }
        // ─── gRPC Response Messages ───────────────────────────────────────
        case 'grpc:response': {
          const { tabId, response: grpcResp } = msg;
          useTabsStore.getState().updateTab(tabId, {
            response: {
              status: grpcResp.status,
              statusText: grpcResp.statusText,
              headers: grpcResp.headers || {},
              body: grpcResp.body || '',
              size: grpcResp.size || 0,
              time: grpcResp.time || 0,
              contentType: 'application/json',
              cookies: [],
            },
            loading: false,
            requestProgress: undefined,
          });
          // Log to DevTools
          const grpcTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          const grpcName = grpcTab?.grpcMethod || grpcTab?.url || 'gRPC';
          if (grpcResp.status !== 0) {
            useDevToolsStore.getState().addLog({
              level: 'error',
              args: [`[gRPC] ✕ ${grpcName}`, `Status ${grpcResp.status}: ${grpcResp.statusText}`],
              timestamp: Date.now(),
              requestName: grpcName,
              scriptPhase: 'grpc',
            });
          } else {
            useDevToolsStore.getState().addLog({
              level: 'info',
              args: [`[gRPC] ✓ ${grpcName}`, `${grpcResp.time}ms`],
              timestamp: Date.now(),
              requestName: grpcName,
              scriptPhase: 'grpc',
            });
          }
          // Network entry
          useDevToolsStore.getState().addNetworkEntry({
            timestamp: Date.now(),
            method: 'gRPC',
            url: grpcTab?.url || '',
            requestHeaders: Object.fromEntries((grpcTab?.grpcMetadata || []).filter((m: any) => m.enabled && m.key).map((m: any) => [m.key, m.value])),
            requestBody: grpcTab?.grpcMessage || undefined,
            status: grpcResp.status,
            statusText: grpcResp.statusText,
            responseHeaders: grpcResp.headers || {},
            responseBody: grpcResp.body || '',
            duration: grpcResp.time || 0,
            size: grpcResp.size || 0,
            contentType: 'application/grpc',
            protocol: 'grpc',
          });
          // URL suggestions
          if (grpcTab?.url) useUrlSuggestionsStore.getState().addUrls([grpcTab.url], 'grpc');
          break;
        }
        case 'grpc:streamEvent': {
          const { tabId, event: streamEvt } = msg;
          const currentTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          const existing = currentTab?.grpcStreamMessages || [];
          useTabsStore.getState().updateTab(tabId, {
            grpcStreamMessages: [
              ...existing,
              {
                id: crypto.randomUUID(),
                direction: streamEvt.direction,
                data: streamEvt.data,
                timestamp: streamEvt.timestamp,
              },
            ],
          });
          break;
        }
        case 'grpc:streamStatus': {
          const { tabId, status: streamSt } = msg;
          useTabsStore.getState().updateTab(tabId, {
            grpcStreamStatus: streamSt,
            loading: streamSt === 'streaming',
          });
          break;
        }
        case 'grpc:cancelled': {
          const { tabId } = msg;
          useTabsStore.getState().updateTab(tabId, {
            loading: false,
            grpcStreamStatus: 'idle',
          });
          break;
        }
        case 'grpc:reflectResult': {
          const { tabId, services, error, warning } = msg;
          if (error) {
            useTabsStore.getState().updateTab(tabId, {
              grpcReflectionStatus: 'error',
              grpcReflectionError: error,
              grpcServices: undefined,
            });
          } else if (warning) {
            useTabsStore.getState().updateTab(tabId, {
              grpcReflectionStatus: 'warning',
              grpcReflectionError: warning,
              grpcServices: [],
            });
          } else {
            useTabsStore.getState().updateTab(tabId, {
              grpcReflectionStatus: 'connected',
              grpcReflectionError: undefined,
              grpcServices: services || [],
            });
          }
          break;
        }
        case 'grpc:protoUploaded': {
          const { tabId, protoPath } = msg;
          useTabsStore.getState().updateTab(tabId, { grpcProtoFile: protoPath, dirty: true });
          break;
        }
        // ─── SOAP Response Messages ───────────────────────────────────────
        case 'soap:response': {
          const { tabId, response: soapResp } = msg;
          useTabsStore.getState().updateTab(tabId, {
            response: {
              status: soapResp.status,
              statusText: soapResp.statusText,
              headers: soapResp.headers || [],
              body: soapResp.body || '',
              size: soapResp.size || 0,
              time: soapResp.time || 0,
              contentType: 'application/xml',
              cookies: [],
            },
            loading: false,
            requestProgress: undefined,
          });
          // Log to DevTools
          const soapTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          const soapName = soapTab?.soapAction || soapTab?.url || 'SOAP';
          if (soapResp.hasFault || soapResp.status >= 400) {
            useDevToolsStore.getState().addLog({
              level: 'error',
              args: [`[SOAP] ✕ ${soapName}`, `Status ${soapResp.status}: ${soapResp.statusText}`],
              timestamp: Date.now(),
              requestName: soapName,
              scriptPhase: 'soap',
            });
          } else {
            useDevToolsStore.getState().addLog({
              level: 'info',
              args: [`[SOAP] ✓ ${soapName}`, `${soapResp.time}ms`],
              timestamp: Date.now(),
              requestName: soapName,
              scriptPhase: 'soap',
            });
          }
          // Network entry
          useDevToolsStore.getState().addNetworkEntry({
            timestamp: Date.now(),
            method: 'SOAP',
            url: soapTab?.url || '',
            requestHeaders: Object.fromEntries((soapTab?.headers || []).filter((h: any) => h.enabled && h.key).map((h: any) => [h.key, h.value])),
            requestBody: soapTab?.soapEnvelope || undefined,
            status: soapResp.status,
            statusText: soapResp.statusText,
            responseHeaders: soapResp.headers || {},
            responseBody: soapResp.body || '',
            duration: soapResp.time || 0,
            size: soapResp.size || 0,
            contentType: 'application/xml',
            protocol: 'soap',
          });
          // URL suggestions
          if (soapTab?.url) useUrlSuggestionsStore.getState().addUrls([soapTab.url], 'soap');
          break;
        }
        case 'soap:cancelled': {
          const { tabId } = msg;
          useTabsStore.getState().updateTab(tabId, { loading: false, requestProgress: undefined });
          break;
        }
        case 'soap:wsdlLoaded': {
          const { tabId, services, rawWsdl } = msg;
          useTabsStore.getState().updateTab(tabId, { soapServices: services, soapWsdlRaw: rawWsdl || undefined });
          break;
        }
        case 'soap:wsdlError': {
          // Handled by SoapWsdlImport component directly via its own listener
          break;
        }
        case 'soap:envelopeGenerated': {
          const { tabId, envelope } = msg;
          useTabsStore.getState().updateTab(tabId, { soapEnvelope: envelope });
          break;
        }
        case 'soap:securityGenerated': {
          const { tabId, securityXml } = msg;
          // Store security XML for injection into envelope
          const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (tab) {
            useTabsStore.getState().updateTab(tabId, {
              soapWsSecurity: { ...(tab.soapWsSecurity || {}), generatedXml: securityXml } as any,
            });
          }
          break;
        }
        case 'soap:securityInjected': {
          const { tabId, envelope } = msg;
          useTabsStore.getState().updateTab(tabId, { soapEnvelope: envelope });
          break;
        }
        case 'soap:fieldsExtracted': {
          const { tabId, fields } = msg;
          useTabsStore.getState().updateTab(tabId, { soapFormData: { fields, values: {} } });
          break;
        }
        case 'graphql:connected': {
          const { tabId, schema, sdl } = msg;
          const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (tab) {
            useTabsStore.getState().updateTab(tabId, {
              authData: { ...tab.authData, gql_connected: 'true', gql_schema: schema, gql_schema_sdl: sdl },
            });
            if (tab.url) useUrlSuggestionsStore.getState().addUrls([tab.url], 'graphql');
          }
          break;
        }
        case 'graphql:connectError': {
          const { tabId, error: gqlErr } = msg;
          const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (tab) {
            const { gql_connected, ...restAuth } = tab.authData || {};
            useTabsStore.getState().updateTab(tabId, { authData: restAuth });
          }
          useToastStore.getState().addToast({ type: 'error', message: `GraphQL: ${gqlErr}` });
          break;
        }
        case 'newRequest': {
          useTabsStore.getState().addTab();
          break;
        }
        case 'sendRequest': {
          const { tabs: st, activeTabId: sid, updateTab: su } = useTabsStore.getState();
          const stab = st.find(x => x.id === sid);
          if (stab && !stab.loading && stab.url.trim()) {
            sendRequest(stab);
            su(stab.id, { loading: true });
          }
          break;
        }
        case 'saveRequest': {
          const { tabs: svt, activeTabId: svi, updateTab: svu } = useTabsStore.getState();
          const svTab = svt.find(x => x.id === svi);
          if (svTab) {
            const saved = saveRequest(svTab);
            if (saved) svu(svTab.id, { dirty: false });
          }
          break;
        }
        case 'closeTab': {
          const { activeTabId: ctId, closeTab: ctFn } = useTabsStore.getState();
          if (ctId) ctFn(ctId);
          break;
        }
        case 'focusUrl': {
          const urlInput = document.querySelector<HTMLInputElement>('.url-bar input');
          if (urlInput) { urlInput.focus(); urlInput.select(); }
          break;
        }
        case 'openSaveAs': {
          setSaveAsTabId(msg.tabId);
          break;
        }
        case 'toast': {
          useToastStore.getState().addToast({
            type: msg.toastType || 'info',
            message: msg.message,
            duration: msg.duration,
          });
          break;
        }
        case 'checkFilePathsResult': {
          // Update form data row with file existence info
          const { tabId: fpTabId, rowId, fileExists } = msg;
          if (fpTabId && rowId) {
            const tab = useTabsStore.getState().tabs.find(t => t.id === fpTabId);
            if (tab) {
              const updatedFormData = tab.bodyFormData.map(r =>
                r.id === rowId ? { ...r, fileExists } : r
              );
              useTabsStore.getState().updateTab(fpTabId, { bodyFormData: updatedFormData });
            }
          }
          break;
        }
        // ─── Script Debugger Messages ────────────────────────────────────
        case 'scriptDebug:started': {
          const { tabId: debugTabId, phase: debugPhase } = msg;
          useDebugStore.getState().startDebug(debugTabId, debugPhase);
          // Auto-focus and enlarge request panel to show the script editor during debug
          setSplitPercent(70);
          setFocusedPanel('request');
          break;
        }
        case 'scriptDebug:paused': {
          const { line, variables, callStack } = msg;
          useDebugStore.getState().setPaused(line, variables, callStack);
          setSidebarSection('debug');
          break;
        }
        case 'scriptDebug:resumed': {
          useDebugStore.getState().setResumed();
          break;
        }
        case 'scriptDebug:completed': {
          useDebugStore.getState().setCompleted();
          break;
        }
        case 'scriptDebug:error': {
          useDebugStore.getState().setError(msg.message || 'Debug session error');
          break;
        }
        case 'scriptDebug:log': {
          const entry = msg.entry as { level: string; args: unknown[]; timestamp: number };
          if (entry) {
            useDebugStore.getState().addLog({
              level: entry.level as any,
              args: entry.args,
              timestamp: entry.timestamp,
            });
          }
          break;
        }
        case 'scriptDebug:subRequest': {
          const entry = msg.entry as { method: string; url: string; status: number; statusText: string; duration: number; timestamp: number; requestHeaders?: Record<string, string>; requestBody?: string; responseHeaders?: Record<string, string>; responseBody?: string };
          if (entry) {
            useDebugStore.getState().addSubRequest({ ...entry, phase: (msg.phase as string) || '' });
          }
          break;
        }
        case 'environmentsData': {
          const envs = msg.environments ?? [];
          const activeEnvId = msg.activeEnvId ?? null;
          useEnvStore.getState().hydrateEnvironments(envs, activeEnvId);
          // Sync active tab's envId with loaded environment
          const resolvedEnvId = activeEnvId && activeEnvId !== '__global__' ? activeEnvId : null;
          const { tabs, activeTabId, updateTab: tabUpdate } = useTabsStore.getState();
          const currentTab = tabs.find(t => t.id === activeTabId);
          if (currentTab && currentTab.envId === null && resolvedEnvId) {
            tabUpdate(currentTab.id, { envId: resolvedEnvId });
          }
          break;
        }
        case 'collectionPropertiesData': {
          const { id: colId, properties: colProps } = msg as { id: string; properties: Record<string, unknown> };
          useCollectionsStore.getState().setProperties(colId, {
            headers: (colProps.headers as []) ?? [],
            authType: (colProps.authType as string) ?? 'none',
            authData: (colProps.authData as Record<string, string>) ?? {},
            variables: (colProps.variables as []) ?? [],
            preRequestScript: (colProps.preRequestScript as string) ?? '',
            postResponseScript: (colProps.postResponseScript as string) ?? (colProps.testScript as string) ?? '',
          });
          break;
        }
        case 'historyData': {
          // Always sync store cache so HistoryPanel reflects latest data even if not mounted
          const historyProtocol = (msg.protocol as string) || 'rest';
          const historyEntries = (msg.entries ?? []) as any[];
          useSidebarDataStore.getState().setHistory(historyProtocol, historyEntries);
          // Feed history URLs into suggestions store, tagged by protocol
          const restUrls: string[] = [];
          const grpcUrls: string[] = [];
          const gqlUrls: string[] = [];
          const wsUrls: string[] = [];
          const sseUrls: string[] = [];
          const sioUrls: string[] = [];
          const mqttUrls: string[] = [];
          const soapUrls: string[] = [];
          for (const e of historyEntries as { url?: string; method?: string; protocol?: string }[]) {
            if (!e.url) continue;
            const m = (e.method || '').toUpperCase();
            const p = (e.protocol || '').toLowerCase();
            if (p === 'soap' || m === 'SOAP') soapUrls.push(e.url);
            else if (p === 'grpc' || m === 'GRPC') grpcUrls.push(e.url);
            else if (p === 'graphql' || m === 'GQL' || m === 'GRAPHQL') gqlUrls.push(e.url);
            else if (m === 'SSE' || p === 'sse') sseUrls.push(e.url);
            else if (m === 'SIO' || p === 'socketio') sioUrls.push(e.url);
            else if (m === 'MQTT' || p === 'mqtt') mqttUrls.push(e.url);
            else if (m === 'WS' || p === 'websocket') wsUrls.push(e.url);
            else restUrls.push(e.url);
          }
          if (restUrls.length > 0) useUrlSuggestionsStore.getState().addUrls(restUrls, 'rest');
          if (grpcUrls.length > 0) useUrlSuggestionsStore.getState().addUrls(grpcUrls, 'grpc');
          if (gqlUrls.length > 0) useUrlSuggestionsStore.getState().addUrls(gqlUrls, 'graphql');
          if (wsUrls.length > 0) useUrlSuggestionsStore.getState().addUrls(wsUrls, 'websocket');
          if (sseUrls.length > 0) useUrlSuggestionsStore.getState().addUrls(sseUrls, 'sse');
          if (sioUrls.length > 0) useUrlSuggestionsStore.getState().addUrls(sioUrls, 'socketio');
          if (mqttUrls.length > 0) useUrlSuggestionsStore.getState().addUrls(mqttUrls, 'mqtt');
          if (soapUrls.length > 0) useUrlSuggestionsStore.getState().addUrls(soapUrls, 'soap');
          break;
        }
        case 'collectionsData': {
          // Always sync store cache so panel reflects latest data even if not mounted
          const collectionsProtocol = (msg.protocol as string) || 'rest';
          useSidebarDataStore.getState().setCollections(collectionsProtocol, (msg.collections ?? []) as any);
          // Extract all request URLs from collection tree, tagged by protocol
          const extractTaggedUrls = (nodes: { children?: any[]; requests?: { url?: string; method?: string; protocol?: string }[] }[]) => {
            const rest: string[] = [];
            const grpc: string[] = [];
            const gql: string[] = [];
            const ws: string[] = [];
            const sse: string[] = [];
            const sio: string[] = [];
            const mqtt: string[] = [];
            const soap: string[] = [];
            const walk = (items: typeof nodes) => {
              for (const node of items) {
                if (node.requests) {
                  for (const r of node.requests) {
                    if (!r.url) continue;
                    const m = (r.method || '').toUpperCase();
                    const p = (r.protocol || '').toLowerCase();
                    if (p === 'soap' || m === 'SOAP') soap.push(r.url);
                    else if (p === 'grpc' || m === 'GRPC') grpc.push(r.url);
                    else if (p === 'graphql' || m === 'GQL' || m === 'GRAPHQL') gql.push(r.url);
                    else if (m === 'SSE' || p === 'sse') sse.push(r.url);
                    else if (m === 'SIO' || p === 'socketio') sio.push(r.url);
                    else if (m === 'MQTT' || p === 'mqtt') mqtt.push(r.url);
                    else if (m === 'WS' || p === 'websocket') ws.push(r.url);
                    else rest.push(r.url);
                  }
                }
                if (node.children) walk(node.children);
              }
            };
            walk(nodes);
            return { rest, grpc, gql, ws, sse, sio, mqtt, soap };
          };
          const tagged = extractTaggedUrls(msg.collections ?? []);
          if (tagged.rest.length > 0) useUrlSuggestionsStore.getState().addUrls(tagged.rest, 'rest');
          if (tagged.grpc.length > 0) useUrlSuggestionsStore.getState().addUrls(tagged.grpc, 'grpc');
          if (tagged.gql.length > 0) useUrlSuggestionsStore.getState().addUrls(tagged.gql, 'graphql');
          if (tagged.ws.length > 0) useUrlSuggestionsStore.getState().addUrls(tagged.ws, 'websocket');
          if (tagged.sse.length > 0) useUrlSuggestionsStore.getState().addUrls(tagged.sse, 'sse');
          if (tagged.sio.length > 0) useUrlSuggestionsStore.getState().addUrls(tagged.sio, 'socketio');
          if (tagged.mqtt.length > 0) useUrlSuggestionsStore.getState().addUrls(tagged.mqtt, 'mqtt');
          if (tagged.soap.length > 0) useUrlSuggestionsStore.getState().addUrls(tagged.soap, 'soap');
          break;
        }
        case 'uiStateData': {
          const uiData = msg.data as { panelHeights?: Record<string, number>; scrollPositions?: Record<string, number> };
          useUiStateStore.getState().hydrate(uiData);
          break;
        }
        case 'workspaceSnapshot': {
          const snapshot = msg.data as { tabs?: unknown[]; activeTabId?: string; activeProtocol?: string; sidebarSection?: string; sidebarOpen?: boolean; sidebarWidth?: number; breakpoints?: Record<string, number[]>; disabledBreakpoints?: Record<string, number[]>; conditions?: Record<string, Record<number, string>> } | null;
          if (snapshot && snapshot.tabs && snapshot.tabs.length > 0) {
            const tabsStore = useTabsStore.getState();
            // Only restore if app started with no tabs (fresh load)
            if (tabsStore.tabs.length === 0) {
              // Mark the restored protocol as already auto-opened so the protocol-change
              // effect doesn't override the saved sidebarOpen state from the snapshot.
              if (snapshot.activeProtocol) autoOpenedProtocols.current.add(snapshot.activeProtocol);
              tabsStore.hydrateSnapshot(snapshot.tabs as any[], snapshot.activeTabId || '', snapshot.activeProtocol as any || 'rest');
              if (snapshot.sidebarSection) setSidebarSection(snapshot.sidebarSection as SidebarSection);
              if (snapshot.sidebarOpen !== undefined) setSidebarOpen(snapshot.sidebarOpen);
              if (snapshot.sidebarWidth) setSidebarWidth(snapshot.sidebarWidth);
              // Restore breakpoints from snapshot
              if (snapshot.breakpoints || snapshot.disabledBreakpoints || snapshot.conditions) {
                useDebugStore.setState({
                  ...(snapshot.breakpoints && { breakpoints: snapshot.breakpoints }),
                  ...(snapshot.disabledBreakpoints && { disabledBreakpoints: snapshot.disabledBreakpoints }),
                  ...(snapshot.conditions && { conditions: snapshot.conditions }),
                });
              }
            }
          }
          break;
        }
        case 'mockServer:log': {
          useMockStore.getState().addLog(msg.entry);
          // God-level DevTools logging for mock server traffic
          const entry = msg.entry as {
            direction?: string; protocol?: string; event?: string;
            body?: string; clientId?: string; path?: string;
            method?: string; statusCode?: number; responseTime?: number;
            error?: string; serverId?: string; serverName?: string;
          };
          const dir = entry.direction === 'incoming' ? '⬇' : entry.direction === 'outgoing' ? '⬆' : '↔';
          const proto = (entry.protocol || 'mock').toUpperCase();
          const isError = !!entry.error || (entry.statusCode !== undefined && entry.statusCode >= 400);
          useDevToolsStore.getState().addLog({
            level: isError ? 'error' : 'info',
            args: [
              `[Mock ${proto}] ${dir} ${entry.event || entry.method || ''} ${entry.path || ''}`,
              ...(entry.statusCode !== undefined ? [`→ ${entry.statusCode}`] : []),
              ...(entry.responseTime !== undefined ? [`${entry.responseTime}ms`] : []),
              ...(entry.body ? [entry.body.slice(0, 500)] : []),
              ...(entry.clientId ? [`client:${entry.clientId}`] : []),
              ...(entry.error ? [`ERROR: ${entry.error}`] : []),
            ].filter(Boolean),
            timestamp: Date.now(),
            requestName: entry.serverName ? `Mock/${entry.serverName}` : 'Mock Server',
            scriptPhase: 'mock',
          });
          break;
        }

        // ─── Mock Server Lifecycle (global handler — mirrored from MockServerPanel local listener) ───
        case 'mockServer:started': {
          const { id: startedId, port: startedPort, name: startedName, protocol: startedProto } = msg as { id: string; port: number; name?: string; protocol?: string };
          // Update the store so running count badge is accurate
          useMockStore.getState().updateServer(startedId, { running: true, port: startedPort } as any);
          useDevToolsStore.getState().addLog({
            level: 'info',
            args: [
              `🟢 Mock Server Started`,
              startedName ? `"${startedName}"` : startedId,
              `port ${startedPort}`,
              startedProto ? `protocol: ${startedProto.toUpperCase()}` : '',
            ].filter(Boolean),
            timestamp: Date.now(),
            requestName: `Mock Server`,
            scriptPhase: 'mock',
          });
          break;
        }
        case 'mockServer:stopped': {
          const { id: stoppedId, name: stoppedName } = msg as { id: string; name?: string };
          useMockStore.getState().updateServer(stoppedId, { running: false, port: null } as any);
          useDevToolsStore.getState().addLog({
            level: 'info',
            args: [`🔴 Mock Server Stopped`, stoppedName ? `"${stoppedName}"` : stoppedId],
            timestamp: Date.now(),
            requestName: `Mock Server`,
            scriptPhase: 'mock',
          });
          break;
        }
        case 'mockServer:error': {
          const { id: errId, error: mockErr, name: errName } = msg as { id: string; error: string; name?: string };
          useMockStore.getState().updateServer(errId, { running: false } as any);
          useDevToolsStore.getState().addLog({
            level: 'error',
            args: [
              `🚨 Mock Server Error`,
              errName ? `"${errName}"` : errId,
              mockErr,
            ].filter(Boolean),
            timestamp: Date.now(),
            requestName: `Mock Server`,
            scriptPhase: 'mock',
          });
          break;
        }

        // ─── AI Protocol Messages ─────────────────────────────────────────
        case 'ai:chunk': {
          const { tabId, delta } = msg;
          const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (tab?.type === 'daakia-ai') {
            // Global conversation store for Daakia AI tab — persisted, survives close/reopen
            useAiConversationStore.getState().appendAssistantChunk(delta || '');
          } else if (tab) {
            const conv = [...(tab.aiConversation || [])];
            const lastMsg = conv[conv.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              conv[conv.length - 1] = { ...lastMsg, content: lastMsg.content + (delta || '') };
            } else {
              conv.push({ id: crypto.randomUUID(), role: 'assistant', content: delta || '', timestamp: Date.now() });
            }
            useTabsStore.getState().updateTab(tabId, { aiConversation: conv });
          }
          break;
        }
        case 'ai:complete': {
          const { tabId, message: aiMsg, tokens, duration } = msg;
          console.group('%c✅ AI Request Complete', 'color:#22c55e;font-weight:bold;font-size:12px');
          console.log('%cDuration:', 'font-weight:bold', `${duration}ms`);
          console.log('%cTokens:', 'font-weight:bold', tokens);
          console.log('%cTool Calls:', 'font-weight:bold', aiMsg.toolCalls?.length || 0);
          console.log('%cContent Preview:', 'font-weight:bold', (aiMsg.content || '').slice(0, 200));
          console.groupEnd();

          // Push to internal DevTools Console + Network
          const successTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          const successReqName = successTab ? `AI ${successTab.aiProvider || ''}/${successTab.aiModel || ''}` : 'AI Request';
          useDevToolsStore.getState().addLog({
            level: 'info',
            args: [`✅ AI Complete (${duration}ms)`, { tokens, toolCalls: aiMsg.toolCalls?.length || 0, contentPreview: (aiMsg.content || '').slice(0, 300) }],
            timestamp: Date.now(),
            requestName: successReqName,
          });
          useDevToolsStore.getState().addNetworkEntry({
            timestamp: Date.now(),
            method: 'POST',
            url: successTab?.url || '',
            requestHeaders: {},
            requestBody: undefined,
            status: 200,
            statusText: 'OK',
            responseHeaders: {},
            responseBody: (aiMsg.content || '').slice(0, 5000),
            duration: duration || 0,
            size: (aiMsg.content || '').length,
            contentType: 'application/json',
          });

          const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (tab?.type === 'daakia-ai') {
            useAiConversationStore.getState().finalizeAssistantMessage(aiMsg);
            useTabsStore.getState().updateTab(tabId, { aiStreaming: false, loading: false });
          } else if (tab) {
            const conv = [...(tab.aiConversation || [])];
            const lastMsg = conv[conv.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              conv[conv.length - 1] = { ...aiMsg, id: lastMsg.id };
            } else {
              conv.push(aiMsg);
            }
            useTabsStore.getState().updateTab(tabId, {
              aiConversation: conv,
              aiStreaming: false,
              loading: false,
            });
          }
          break;
        }
        case 'ai:error': {
          const { tabId, message: errMsg, code, diagnostics } = msg;

          // ──── Full DevTools Console Diagnostics ────
          console.group('%c🚨 AI Request Failed', 'color:#ef4444;font-weight:bold;font-size:14px');
          console.error(`Status: ${code || 'UNKNOWN'} — ${errMsg}`);
          if (diagnostics) {
            if (diagnostics.request) {
              console.group('%c📤 Request', 'color:#3b82f6;font-weight:bold');
              console.log('%cURL:', 'font-weight:bold', diagnostics.request.url);
              console.log('%cMethod:', 'font-weight:bold', diagnostics.request.method);
              console.log('%cHeaders:', 'font-weight:bold', diagnostics.request.headers);
              console.log('%cBody:', 'font-weight:bold', diagnostics.request.body);
              console.groupEnd();
            }
            if (diagnostics.response) {
              console.group('%c📥 Response', 'color:#f59e0b;font-weight:bold');
              console.log('%cStatus:', 'font-weight:bold', diagnostics.response.statusCode, diagnostics.response.statusMessage);
              console.log('%cHeaders:', 'font-weight:bold', diagnostics.response.headers);
              console.log('%cBody:', 'font-weight:bold', diagnostics.response.body);
              console.groupEnd();
            }
            if (diagnostics.error) {
              console.group('%c💥 Error Details', 'color:#dc2626;font-weight:bold');
              console.log('%cName:', 'font-weight:bold', diagnostics.error.name);
              console.log('%cMessage:', 'font-weight:bold', diagnostics.error.message);
              console.log('%cCode:', 'font-weight:bold', diagnostics.error.code);
              console.log('%cStack:', 'font-weight:bold', diagnostics.error.stack);
              console.groupEnd();
            }
            if (diagnostics.meta) {
              console.group('%c📊 Meta', 'color:#8b5cf6;font-weight:bold');
              console.table(diagnostics.meta);
              console.groupEnd();
            }
            console.log('%cFull Diagnostics JSON:', 'font-weight:bold', JSON.parse(JSON.stringify(diagnostics)));
          }
          console.groupEnd();
          // ──── End DevTools Diagnostics ────

          // Push to internal DevTools Console + Network
          const aiTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          const aiReqName = aiTab ? `AI ${aiTab.aiProvider || 'unknown'}/${aiTab.aiModel || 'unknown'}` : 'AI Request';
          useDevToolsStore.getState().addLog({
            level: 'error',
            args: [`🚨 AI Error [${code || '?'}]: ${errMsg}`, diagnostics || {}],
            timestamp: Date.now(),
            requestName: aiReqName,
          });
          if (diagnostics?.request) {
            useDevToolsStore.getState().addNetworkEntry({
              timestamp: Date.now(),
              method: 'POST',
              url: diagnostics.request.url || aiTab?.url || '',
              requestHeaders: diagnostics.request.headers || {},
              requestBody: typeof diagnostics.request.body === 'string' ? diagnostics.request.body : JSON.stringify(diagnostics.request.body, null, 2),
              status: diagnostics.response?.statusCode || parseInt(code || '0') || 0,
              statusText: diagnostics.response?.statusMessage || errMsg,
              responseHeaders: diagnostics.response?.headers || {},
              responseBody: typeof diagnostics.response?.body === 'string' ? diagnostics.response.body : JSON.stringify(diagnostics.response?.body, null, 2),
              duration: diagnostics.meta?.duration || 0,
              size: 0,
              contentType: 'application/json',
            });
          }

          const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (tab?.type === 'daakia-ai') {
            const errorDetail = code ? `[${code}] ${errMsg}` : errMsg;
            useAiConversationStore.getState().addErrorMessage(`❌ Error: ${errorDetail}`);
            useTabsStore.getState().updateTab(tabId, { aiStreaming: false, loading: false });
          } else if (tab) {
            const conv = [...(tab.aiConversation || [])];
            const errorDetail = code ? `[${code}] ${errMsg}` : errMsg;
            conv.push({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `❌ Error: ${errorDetail}`,
              timestamp: Date.now(),
            });
            useTabsStore.getState().updateTab(tabId, {
              aiConversation: conv,
              aiStreaming: false,
              loading: false,
            });
          }
          break;
        }
        case 'ai:cancelled': {
          const { tabId } = msg;
          console.log('%c⛔ AI Request Cancelled', 'color:#6b7280;font-weight:bold', { tabId });
          useTabsStore.getState().updateTab(tabId, { aiStreaming: false, loading: false });
          break;
        }
        case 'ai:debug': {
          const { phase, data, tabId: debugTabId } = msg;
          if (phase === 'request') {
            console.group('%c📡 AI Request Sent', 'color:#3b82f6;font-weight:bold;font-size:12px');
            console.log('%cProvider:', 'font-weight:bold', data.provider);
            console.log('%cModel:', 'font-weight:bold', data.model);
            console.log('%cBase URL:', 'font-weight:bold', data.baseUrl);
            console.log('%cChat Endpoint:', 'font-weight:bold', data.chatEndpoint);
            console.log('%cMessages:', 'font-weight:bold', data.messageCount);
            console.log('%cSystem Prompts:', 'font-weight:bold', data.systemPrompts);
            console.log('%cUser Prompt:', 'font-weight:bold', data.userPrompt);
            console.log('%cTools:', 'font-weight:bold', data.toolCount, data.toolNames);
            console.log('%cMCP Tools:', 'font-weight:bold', data.mcpToolCount);
            console.log('%cSettings:', 'font-weight:bold', data.settings);
            console.log('%cAuth Type:', 'font-weight:bold', data.authType);
            console.groupEnd();

            // Push to internal DevTools Console
            useDevToolsStore.getState().addLog({
              level: 'info',
              args: [`📡 AI Request → ${data.provider}/${data.model}`, { url: data.baseUrl, endpoint: data.chatEndpoint, messages: data.messageCount, tools: data.toolCount, systemPrompts: data.systemPrompts, userPrompt: data.userPrompt, settings: data.settings }],
              timestamp: Date.now(),
              requestName: `AI ${data.provider}/${data.model}`,
            });
          }
          break;
        }

        // ─── AI Key Status ────────────────────────────────────────────────
        case 'aiKeys:status':
          useAiKeysStore.getState().setKeyStatus(msg.status || {});
          break;

        // ─── AI Feature Flags ─────────────────────────────────────────────
        case 'aiFeatures:data':
          useAiFeaturesStore.getState().setFeatures(msg.features || {});
          break;

        // ─── AI Prompt Templates ──────────────────────────────────────────
        case 'aiPromptTemplates:data': {
          const merged = { ...AI_PROMPT_TEMPLATE_DEFAULTS, ...(msg.templates || {}) };
          useAiPromptTemplatesStore.getState().setTemplates(merged as any);
          break;
        }

        // ─── AI Chat History ─────────────────────────────────────────────
        case 'aiHistory:data':
          useAiHistoryStore.getState().setSessions(msg.sessions || []);
          break;

        case 'aiHistory:results':
          useAiHistoryStore.getState().setSearchResults(msg.sessions || []);
          break;

        // ─── MCP Protocol Messages ────────────────────────────────────────
        case 'mcp:connected': {
          const { tabId, capabilities, serverInfo } = msg;
          useTabsStore.getState().updateTab(tabId, {
            mcpConnected: true,
            mcpCapabilities: capabilities,
            loading: false,
          });
          useDevToolsStore.getState().addLog({
            timestamp: Date.now(), level: 'info',
            args: [`[MCP] Connected to ${(serverInfo as { name?: string })?.name || 'server'}`, capabilities],
          });
          break;
        }
        case 'mcp:disconnected': {
          const { tabId } = msg;
          useTabsStore.getState().updateTab(tabId, {
            mcpConnected: false,
            loading: false,
          });
          useDevToolsStore.getState().addLog({
            timestamp: Date.now(), level: 'info', args: ['[MCP] Disconnected'],
          });
          break;
        }
        case 'mcp:connectFailed': {
          const { tabId } = msg;
          useTabsStore.getState().updateTab(tabId, { loading: false });
          useDevToolsStore.getState().addLog({
            timestamp: Date.now(), level: 'error', args: ['[MCP] Connection failed'],
          });
          break;
        }
        case 'mcp:error': {
          const { tabId, message: errMsg } = msg;
          useDevToolsStore.getState().addLog({
            timestamp: Date.now(), level: 'error', args: [`[MCP] Error: ${errMsg}`],
          });
          const mcpTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (mcpTab) {
            const conv = [...(mcpTab.mcpConversation || [])];
            conv.push({
              id: crypto.randomUUID(),
              type: 'error',
              serverName: '',
              name: 'Error',
              output: errMsg as string,
              timestamp: Date.now(),
              success: false,
            });
            useTabsStore.getState().updateTab(tabId, { mcpConversation: conv });
          }
          break;
        }
        case 'mcp:toolResult': {
          const { tabId, success, toolName, result, error, duration } = msg;
          const mcpTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (mcpTab) {
            const conv = [...(mcpTab.mcpConversation || [])];
            conv.push({
              id: crypto.randomUUID(),
              type: 'tool-call',
              serverName: '',
              name: toolName as string || '',
              output: success ? JSON.stringify(result, null, 2) : (error as string),
              duration: duration as number,
              timestamp: Date.now(),
              success: success as boolean,
            });
            useTabsStore.getState().updateTab(tabId, { mcpConversation: conv });
          }
          useDevToolsStore.getState().addLog({
            timestamp: Date.now(),
            level: success ? 'info' : 'error',
            args: [`[MCP] Tool: ${toolName}`, success ? result : error],
          });
          useDevToolsStore.getState().addNetworkEntry({
            method: 'MCP',
            url: `tool/${toolName}`,
            status: success ? 200 : 500,
            statusText: success ? 'OK' : 'Error',
            duration: duration as number || 0,
            size: success ? JSON.stringify(result).length : 0,
            timestamp: Date.now(),
            requestHeaders: { 'X-MCP-Tool': toolName as string },
            responseHeaders: {},
            requestBody: undefined,
            responseBody: success ? JSON.stringify(result, null, 2) : (error as string),
            contentType: 'application/json',
          });
          break;
        }
        case 'mcp:promptResult': {
          const { tabId, success, promptName, result, error, duration } = msg;
          const mcpTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (mcpTab) {
            const conv = [...(mcpTab.mcpConversation || [])];
            conv.push({
              id: crypto.randomUUID(),
              type: 'prompt-run',
              serverName: '',
              name: promptName as string || '',
              output: success ? JSON.stringify(result, null, 2) : (error as string),
              duration: duration as number,
              timestamp: Date.now(),
              success: success as boolean,
            });
            useTabsStore.getState().updateTab(tabId, { mcpConversation: conv });
          }
          break;
        }
        case 'mcp:resourceResult': {
          const { tabId, success, uri, result, error, duration } = msg;
          const mcpTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (mcpTab) {
            const conv = [...(mcpTab.mcpConversation || [])];
            conv.push({
              id: crypto.randomUUID(),
              type: 'resource-read',
              serverName: '',
              name: uri as string || '',
              output: success ? JSON.stringify(result, null, 2) : (error as string),
              duration: duration as number,
              timestamp: Date.now(),
              success: success as boolean,
            });
            useTabsStore.getState().updateTab(tabId, { mcpConversation: conv });
          }
          break;
        }

        // ─── AI Providers Config ──────────────────────────────────────────
        case 'aiProviders:data': {
          const { providers, defaultProviderId, defaultModelId } = msg;
          if (providers && Array.isArray(providers) && providers.length > 0) {
            useAiProvidersStore.getState().setProviders(
              providers as any,
              (defaultProviderId as string) || 'copilot',
              (defaultModelId as string) || 'auto',
            );
          } else {
            useAiProvidersStore.getState().seedDefaults();
          }
          break;
        }

        // ─── Realtime Protocol DevTools Logging ───────────────────────────
        case 'ws:connected':
        case 'ws:disconnected':
        case 'ws:message':
        case 'ws:error':
        case 'sse:connected':
        case 'sse:disconnected':
        case 'sse:event':
        case 'sse:error':
        case 'socketio:connected':
        case 'socketio:disconnected':
        case 'socketio:event':
        case 'socketio:sent':
        case 'socketio:error':
        case 'mqtt:connected':
        case 'mqtt:disconnected':
        case 'mqtt:message':
        case 'mqtt:published':
        case 'mqtt:subscribed':
        case 'mqtt:error': {
          const rtTab = useTabsStore.getState().tabs.find(t => t.id === msg.tabId);
          const rtName = rtTab?.url || rtTab?.name || msg.tabId || 'Realtime';
          const [, protocol, action] = msg.type.match(/^(\w+):(.+)$/) || [];
          const proto = (protocol || '').toUpperCase();
          let level: 'info' | 'error' | 'warn' | 'log' = 'info';
          let logArgs: unknown[] = [];

          switch (msg.type) {
            case 'ws:connected':
              logArgs = [`[WS] ✓ Connected`];
              break;
            case 'ws:disconnected':
              logArgs = [`[WS] ✕ Disconnected`, msg.reason || ''];
              break;
            case 'ws:message':
              logArgs = [`[WS] ⬇ Received`, msg.data || ''];
              break;
            case 'ws:error':
              level = 'error';
              logArgs = [`[WS] ✕ Error`, msg.error || ''];
              break;
            case 'sse:connected':
              logArgs = [`[SSE] ✓ Connected`];
              break;
            case 'sse:disconnected':
              logArgs = [`[SSE] ✕ Disconnected`, msg.reason || ''];
              break;
            case 'sse:event':
              logArgs = [`[SSE] ⬇ Event: ${msg.event || 'message'}`, msg.data || ''];
              break;
            case 'sse:error':
              level = 'error';
              logArgs = [`[SSE] ✕ Error`, msg.error || ''];
              break;
            case 'socketio:connected':
              logArgs = [`[SIO] ✓ Connected`];
              break;
            case 'socketio:disconnected':
              logArgs = [`[SIO] ✕ Disconnected`, msg.reason || ''];
              break;
            case 'socketio:event':
              logArgs = [`[SIO] ⬇ Event: ${msg.event || ''}`, msg.data || ''];
              break;
            case 'socketio:sent':
              logArgs = [`[SIO] ⬆ Emit: ${msg.event || ''}`, msg.data || ''];
              break;
            case 'socketio:error':
              level = 'error';
              logArgs = [`[SIO] ✕ Error`, msg.error || ''];
              break;
            case 'mqtt:connected':
              logArgs = [`[MQTT] ✓ Connected`];
              break;
            case 'mqtt:disconnected':
              logArgs = [`[MQTT] ✕ Disconnected`, msg.reason || ''];
              break;
            case 'mqtt:message':
              logArgs = [`[MQTT] ⬇ ${msg.topic || ''}`, msg.payload || ''];
              break;
            case 'mqtt:published':
              logArgs = [`[MQTT] ⬆ Published: ${msg.topic || ''}`, msg.payload || ''];
              break;
            case 'mqtt:subscribed':
              logArgs = [`[MQTT] ✓ Subscribed: ${msg.topic || ''}`];
              break;
            case 'mqtt:error':
              level = 'error';
              logArgs = [`[MQTT] ✕ Error`, msg.error || ''];
              break;
            default:
              logArgs = [`[${proto}] ${action}`, JSON.stringify(msg)];
          }

          useDevToolsStore.getState().addLog({
            level,
            args: logArgs.filter(a => a !== ''),
            timestamp: Date.now(),
            requestName: rtName,
            scriptPhase: protocol,
          });
          break;
        }
      }
    };

    window.addEventListener('message', handler);
    getVsCodeApi().postMessage({ type: 'ready' });
    getVsCodeApi().postMessage({ type: 'getEnvironments' });
    // Preload URL suggestions from history + collections on startup
    getVsCodeApi().postMessage({ type: 'getHistory' });
    getVsCodeApi().postMessage({ type: 'getCollections', protocol: 'rest' });
    getVsCodeApi().postMessage({ type: 'getCollections', protocol: 'graphql' });
    getVsCodeApi().postMessage({ type: 'getCollections', protocol: 'websocket' });
    getVsCodeApi().postMessage({ type: 'aiProviders:load' });
    getVsCodeApi().postMessage({ type: 'aiPromptTemplates:load' });
    return () => window.removeEventListener('message', handler);
  }, []);

  // Persist env store changes (activeEnvId, environments) to DB — always mounted
  useEffect(() => {
    const unsubscribe = useEnvStore.subscribe((state) => {
      postMsg({
        type: 'saveEnvironments',
        environments: state.environments,
        activeEnvId: state.activeEnvId,
      });
    });
    return unsubscribe;
  }, []);

  // ─── Settings Audit Trail → DevTools ─────────────────────────────────────
  // Logs any AI provider changes to DevTools console so the user can see what changed
  useEffect(() => {
    let prevProviders = useAiProvidersStore.getState().providers;
    let prevDefaultProviderId = useAiProvidersStore.getState().defaultProviderId;
    let prevDefaultModelId = useAiProvidersStore.getState().defaultModelId;

    const unsub = useAiProvidersStore.subscribe((state) => {
      const changed: string[] = [];
      if (state.defaultProviderId !== prevDefaultProviderId) changed.push(`Default Provider: ${prevDefaultProviderId} → ${state.defaultProviderId}`);
      if (state.defaultModelId !== prevDefaultModelId) changed.push(`Default Model: ${prevDefaultModelId} → ${state.defaultModelId}`);
      if (state.providers !== prevProviders) changed.push(`Providers list updated (${state.providers.length} providers)`);

      if (changed.length > 0) {
        useDevToolsStore.getState().addLog({
          level: 'info',
          args: [
            `⚙️ [Settings Audit] AI Providers Changed`,
            ...changed,
            { providers: state.providers.map(p => ({ id: p.id, name: p.name, enabled: p.enabled, models: p.models.map(m => m.id) })), defaultProviderId: state.defaultProviderId, defaultModelId: state.defaultModelId, changedAt: new Date().toISOString() },
          ],
          timestamp: Date.now(),
          requestName: 'Settings',
          scriptPhase: 'settings',
        });
      }
      prevProviders = state.providers;
      prevDefaultProviderId = state.defaultProviderId;
      prevDefaultModelId = state.defaultModelId;
    });
    return unsub;
  }, []);

  // Save workspace snapshot on state changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      const { tabs: allTabs, activeTabId: atId, activeProtocol: ap } = useTabsStore.getState();
      // Only save request tabs (strip response data to keep snapshot small)
      const tabSnapshot = allTabs.map(t => ({ ...t, response: null, loading: false }));
      // Include breakpoint state for persistence across sessions
      const { breakpoints: bps, disabledBreakpoints: dBps, conditions: conds } = useDebugStore.getState();
      getVsCodeApi().postMessage({
        type: 'saveWorkspaceSnapshot',
        data: {
          tabs: tabSnapshot,
          activeTabId: atId,
          activeProtocol: ap,
          sidebarSection,
          sidebarOpen,
          sidebarWidth,
          breakpoints: bps,
          disabledBreakpoints: dBps,
          conditions: conds,
        },
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [tabs, activeTabId, activeProtocol, sidebarSection, sidebarOpen, sidebarWidth, debugBreakpoints, debugDisabledBps, debugConditions]);

  const tabProtocol = activeTab?.protocol || activeProtocol;
  const accentVar = activeTab?.type === 'mock-server' ? 'var(--color-mock-server)'
    : activeTab?.type === 'settings' ? 'var(--color-settings)'
    : activeTab?.type === 'daakia-ai' ? 'var(--color-protocol-ai)'
    : tabProtocol === 'graphql' ? 'var(--color-protocol-graphql)'
    : tabProtocol === 'websocket' ? 'var(--color-protocol-websocket)'
    : tabProtocol === 'grpc' ? 'var(--color-protocol-grpc)'
    : tabProtocol === 'soap' ? 'var(--color-protocol-soap)'
    : tabProtocol === 'ai' ? 'var(--color-protocol-ai)'
    : tabProtocol === 'mcp' ? 'var(--color-protocol-mcp)'
    : 'var(--color-protocol-rest)';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-panel)]" style={{ '--color-accent': accentVar } as React.CSSProperties}>
      {/* Debug HUD — floating toolbar shown during debug sessions */}
      <DebugHud />
      {/* Left protocol icon rail */}
      <div className="flex flex-col items-center w-12 bg-[var(--color-panel)] border-r border-[var(--color-surface-border)] py-2 gap-1 flex-shrink-0">
        <ProtocolIcon
          active={activeProtocol === 'rest'}
          accentColor="var(--color-protocol-rest)"
          onClick={() => switchProtocol('rest')}
          title="REST"
        >
          <ProtocolRestBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={activeProtocol === 'graphql'}
          accentColor="var(--color-protocol-graphql)"
          onClick={() => switchProtocol('graphql')}
          title="GraphQL"
        >
          <ProtocolGraphQLBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={activeProtocol === 'websocket'}
          accentColor="var(--color-protocol-websocket)"
          onClick={() => switchProtocol('websocket')}
          title="Real time"
        >
          <ProtocolRealtimeBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={activeProtocol === 'grpc'}
          accentColor="var(--color-protocol-grpc)"
          onClick={() => switchProtocol('grpc')}
          title="gRPC"
        >
          <ProtocolGrpcBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={activeProtocol === 'soap'}
          accentColor="var(--color-protocol-soap)"
          onClick={() => switchProtocol('soap')}
          title="SOAP"
        >
          <ProtocolSoapBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={activeProtocol === 'ai'}
          accentColor="var(--color-protocol-ai)"
          onClick={() => switchProtocol('ai')}
          title="AI"
        >
          <ProtocolAiBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={activeProtocol === 'mcp'}
          accentColor="var(--color-protocol-mcp)"
          onClick={() => switchProtocol('mcp')}
          title="MCP"
        >
          <ProtocolMcpBadge size={32} />
        </ProtocolIcon>

        {/* Spacer pushes bottom icons down */}
        <div className="flex-1" />

        {/* Mock Server icon — bg stays while tab is open, iOS badge when servers running */}
        <div className="relative">
          <ProtocolIcon
            active={activeTab?.type === 'mock-server'}
            open={tabs.some(t => t.type === 'mock-server')}
            accentColor="var(--color-mock-server)"
            onClick={() => useTabsStore.getState().openMockServerTab()}
            title={anyMockRunning ? `Mock Server (${mockRunningCount} running)` : 'Mock Server'}
            className={anyMockRunning && mockIconGlow ? 'mock-server-running' : ''}
          >
            <ServerIcon size={16} strokeWidth={1.8} />
          </ProtocolIcon>
          {/* iOS-style red badge showing running server count */}
          {anyMockRunning && mockRunningCount > 0 && (
            <span
              className="absolute top-0 right-0 mock-badge-enter flex items-center justify-center font-bold pointer-events-none"
              style={{
                minWidth: 15,
                height: 15,
                borderRadius: 8,
                fontSize: 9,
                lineHeight: 1,
                backgroundColor: '#ef4444',
                color: '#fff',
                border: '1.5px solid var(--color-panel)',
                padding: '0 3px',
                transform: 'translate(20%, -20%)',
              }}
            >
              {mockRunningCount > 99 ? '99+' : mockRunningCount}
            </span>
          )}
        </div>

        {/* DevTools toggle */}
        <ProtocolIcon
          active={devToolsOpen}
          accentColor={protocolAccent}
          onClick={() => useDevToolsStore.getState().toggle()}
          title="DevTools (Console / Timeline)"
        >
          <DevToolsIcon size={15} strokeWidth={1.8} />
        </ProtocolIcon>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* SQLite status banner */}
        <SqliteBanner sqliteOk={sqliteStatus.ok} error={sqliteStatus.error} />

        {/* Tab bar */}
        <TabBar requestAccentColor={protocolAccent} onEnvironmentsClick={() => setSidebarSection('environments')} />

        {/* DaakiaAiPanel — always mounted when a daakia-ai tab exists so ConvEngineChat
            never loses its internal state across tab switches. Hidden via display:none when
            a different tab is active; shown via display:flex when daakia-ai is active. */}
        {tabs.some(t => t.type === 'daakia-ai') && (
          <div
            className="flex-1 flex flex-col min-w-0 overflow-hidden"
            style={{ display: activeTab?.type === 'daakia-ai' ? 'flex' : 'none' }}
          >
            <DaakiaAiPanel />
          </div>
        )}

        {activeTab?.type === 'settings' ? (
          <SettingsPanel />
        ) : activeTab?.type === 'mock-server' ? (
          <MockServerPanel />
        ) : activeTab?.type === 'daakia-ai' ? null
        : (activeTab?.protocol || activeProtocol) === 'rest' ? (
          !activeTab ? (
            <EmptyState protocol="rest" onNewTab={() => useTabsStore.getState().addTab()} />
          ) : (
          <>
            {/* URL bar */}
            <UrlBar />

            {/* Resizable split: request (top) / response (bottom) */}
            <div
              ref={splitContainerRef}
              className="flex-1 flex flex-col min-h-0 relative"
            >
              {/* Request configuration panel */}
              <div
                className="overflow-hidden flex flex-col"
                style={{
                  height: `${splitPercent}%`,
                  minHeight: 60,
                  transition: isDragging ? 'none' : 'height 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
                onFocus={handleRequestFocus}
              >
                <RequestConfig />
              </div>

              {/* Splitter handle */}
              <div
                className="relative h-[6px] flex-shrink-0 cursor-row-resize group select-none"
                onPointerDown={handleSplitterPointerDown}
                onPointerMove={handleSplitterPointerMove}
                onPointerUp={handleSplitterPointerUp}
                onDoubleClick={handleSplitterDoubleClick}
                onMouseEnter={() => setShowReqSplitterTip(true)}
                onMouseLeave={() => setShowReqSplitterTip(false)}
                aria-label="Resize request/response split"
              >
                {/* Pill grip */}
                <div
                  className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[3px] rounded-full transition-all duration-150 ${
                    isDragging
                      ? 'w-[80px]'
                      : 'w-[44px] bg-[var(--color-surface-border)] group-hover:w-[80px]'
                  }`}
                  style={{ backgroundColor: isDragging ? protocolAccent : undefined }}
                  onMouseEnter={(e) => { if (!isDragging) (e.currentTarget as HTMLElement).style.backgroundColor = protocolAccent; }}
                  onMouseLeave={(e) => { if (!isDragging) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                />
                {/* Tooltip */}
                {showReqSplitterTip && !isDragging && (
                  <div className="absolute left-1/2 top-4 -translate-x-1/2 bg-[var(--color-surface)] text-[var(--color-text-primary)] text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--color-surface-border)] shadow-lg whitespace-nowrap pointer-events-none z-50 flex flex-col gap-0.5 leading-tight">
                    <div>Double-click to reset <kbd className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-panel)] font-mono">Alt+/</kbd></div>
                    <div>Drag to resize</div>
                  </div>
                )}
              </div>

              {/* Response panel */}
              <div
                className="flex-1 min-h-[60px] flex flex-col overflow-hidden"
                style={{
                  transition: isDragging ? 'none' : 'all 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
                onFocus={handleResponseFocus}
              >
                <ResponsePanel />
              </div>
            </div>
          </>
          )
        ) : (activeTab?.protocol || activeProtocol) === 'graphql' ? (
          !activeTab ? (
            <EmptyState protocol="graphql" onNewTab={() => useTabsStore.getState().addTab()} />
          ) : (
            <GraphQLPanel />
          )
        ) : (activeTab?.protocol || activeProtocol) === 'websocket' ? (
          !activeTab ? (
            <EmptyState protocol="websocket" onNewTab={() => useTabsStore.getState().addTab()} />
          ) : (
            <WebSocketPanel />
          )
        ) : (activeTab?.protocol || activeProtocol) === 'grpc' ? (
          !activeTab ? (
            <EmptyState protocol="grpc" onNewTab={() => useTabsStore.getState().addTab()} />
          ) : (
            <GrpcPanel />
          )
        ) : (activeTab?.protocol || activeProtocol) === 'soap' ? (
          !activeTab ? (
            <EmptyState protocol="soap" onNewTab={() => useTabsStore.getState().addTab()} />
          ) : (
            <SoapPanel />
          )
        ) : (activeTab?.protocol || activeProtocol) === 'ai' ? (
          !activeTab ? (
            <EmptyState protocol="ai" onNewTab={() => useTabsStore.getState().addTab()} />
          ) : (
            <AiPanel />
          )
        ) : (activeTab?.protocol || activeProtocol) === 'mcp' ? (
          !activeTab ? (
            <EmptyState protocol="mcp" onNewTab={() => useTabsStore.getState().addTab()} />
          ) : (
            <McpPanel />
          )
        ) : null}

        {/* DevTools bottom panel */}
        <DevToolsPanel />
      </div>

      {/* Sidebar splitter */}
      <div
        className="w-[6px] flex-shrink-0 cursor-col-resize relative select-none group"
        onPointerDown={handleSidebarPointerDown}
        onPointerMove={handleSidebarPointerMove}
        onPointerUp={handleSidebarPointerUp}
        onMouseEnter={() => setShowSplitterTip(true)}
        onMouseLeave={() => setShowSplitterTip(false)}
        aria-label="Resize or collapse sidebar"
      >
        {/* Pill grip */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-150 ${
            sidebarDragging
              ? 'h-[80px]'
              : sidebarOpen
                ? 'h-[44px] bg-[var(--color-surface-border)] group-hover:h-[80px]'
                : 'h-[48px] group-hover:h-[80px]'
          }`}
          style={{
            backgroundColor: sidebarDragging
              ? protocolAccent
              : sidebarOpen
                ? undefined
                : `color-mix(in srgb, ${protocolAccent} 30%, transparent)`,
            ...((!sidebarDragging) ? { '--hover-accent': protocolAccent } as React.CSSProperties : {}),
          }}
          onMouseEnter={(e) => { if (!sidebarDragging) (e.currentTarget as HTMLElement).style.backgroundColor = protocolAccent; }}
          onMouseLeave={(e) => { if (!sidebarDragging) (e.currentTarget as HTMLElement).style.backgroundColor = sidebarOpen ? '' : `color-mix(in srgb, ${protocolAccent} 30%, transparent)`; }}
        />
        {/* Tooltip */}
        {showSplitterTip && !sidebarDragging && (
          <div className="absolute top-1/2 right-4 -translate-y-1/2 bg-[var(--color-surface)] text-[var(--color-text-primary)] text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--color-surface-border)] shadow-lg whitespace-nowrap pointer-events-none z-50 flex flex-col gap-0.5 leading-tight">
            <div>Click to {sidebarOpen ? 'collapse' : 'expand'} <kbd className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-panel)] font-mono">Alt+B</kbd></div>
            <div>Drag to resize</div>
          </div>
        )}
      </div>

      {/* Right sidebar: icon rail + expandable panel */}
      <AppSidebar activeSection={sidebarSection} onSectionChange={setSidebarSection} sidebarOpen={sidebarOpen} sidebarWidth={sidebarWidth} sidebarDragging={sidebarDragging} />

      {/* Toast notifications */}
      <ToastContainer />
      <RightClickMenu />
      <SaveRequestModal
        open={!!saveAsTabId}
        tab={tabs.find(t => t.id === saveAsTabId) ?? null}
        onClose={() => setSaveAsTabId(null)}
      />
    </div>
  );
}

// ─── Protocol Icon ───

function ProtocolIcon({ active, open, accentColor, onClick, title, children, className }: { active: boolean; open?: boolean; accentColor: string; onClick: () => void; title: string; children: React.ReactNode; className?: string }) {
  const highlighted = active || open;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${
        highlighted
          ? 'text-[var(--protocol-accent)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--protocol-accent)]'
      } ${className || ''}`}
      style={{
        ['--protocol-accent' as string]: accentColor,
        backgroundColor: highlighted
          ? `color-mix(in srgb, ${accentColor} ${active ? '15%' : '10%'}, transparent)`
          : undefined,
      }}
    >
      {children}
    </button>
  );
}

// ─── Protocol Placeholder ───

function ProtocolPlaceholder({ name, icon }: { name: string; icon: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[var(--color-text-muted)]">
      {icon === 'graphql' ? (
        <ProtocolGraphQLBadge size={56} className="opacity-30" />
      ) : (
        <ProtocolRealtimeBadge size={56} className="opacity-30" />
      )}
      <div className="text-center">
        <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)] mb-1">{name}</h3>
        <p className="text-[13px]">Coming soon in upcoming sprint</p>
      </div>
    </div>
  );
}

// ─── Empty State (no tabs open) ───

function EmptyState({ onNewTab, protocol }: { onNewTab: () => void; protocol: 'rest' | 'graphql' | 'websocket' | 'grpc' | 'soap' | 'ai' | 'mcp' }) {
  const config = {
    rest: { icon: <ProtocolRestBadge size={48} className="opacity-80" />, label: '+ New Request', color: 'var(--color-primary)' },
    graphql: { icon: <ProtocolGraphQLBadge size={48} className="opacity-80" />, label: '+ New GQL Request', color: 'var(--color-protocol-graphql)' },
    websocket: { icon: <ProtocolRealtimeBadge size={48} className="opacity-80" />, label: '+ New Realtime', color: 'var(--color-protocol-websocket)' },
    grpc: { icon: <ProtocolGrpcBadge size={48} className="opacity-80" />, label: '+ New gRPC Request', color: 'var(--color-protocol-grpc)' },
    soap: { icon: <ProtocolSoapBadge size={48} className="opacity-80" />, label: '+ New SOAP Request', color: 'var(--color-protocol-soap)' },
    ai: { icon: <ProtocolAiBadge size={48} className="opacity-80" />, label: '+ New AI Request', color: 'var(--color-protocol-ai)' },
    mcp: { icon: <ProtocolMcpBadge size={48} className="opacity-80" />, label: '+ New MCP Request', color: 'var(--color-protocol-mcp)' },
  }[protocol];

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
      {config.icon}
      <p className="text-[13px]">No open tabs</p>
      <button
        type="button"
        onClick={onNewTab}
        className="mt-1 h-[30px] px-3 text-[12px] rounded-md text-white hover:opacity-90 cursor-pointer transition-opacity"
        style={{ backgroundColor: config.color }}
      >
        {config.label}
      </button>
    </div>
  );
}
