import { useEffect, useState, useRef, useCallback } from 'react';
import '@salilvnair/convengine-chat/style.css';
import { installDaakiaBridges } from './ai/DaakiaVsCodeBridge';
import { installKeyboardListener } from './services/keyboard';

// Install bridges before any React render so ConvEngineChat fetch/EventSource is ready
installDaakiaBridges();
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { SplitPanelView, ButtonView } from '@salilvnair/dui';
import { TabBar } from './components/tabs/TabBar';
import { UrlBar } from './components/rest/request/UrlBar';
import { SaveRequestModal, RightClickMenu } from './components/shared';
import { RequestPanel } from './components/rest/request/RequestPanel';
import { ResponsePanel } from './components/rest/response/ResponsePanel';
import { SqliteBanner, ToastContainer } from './components/shared';
import { sendRequest, saveRequest } from './services/request';
import { AppSidebar, SidebarSection } from './components/sidebar';
import { SettingsPanel } from './components/sidebar/SettingsPanel';
import { MockServerPanel } from './components/mock/MockServerPanel';
import { DoctorPanel } from './components/doctor/DoctorPanel';
import { K8sPanel } from './components/k8s/K8sPanel';
import { SmStateMachineTabPage } from './components/mock/SmStateMachineTabPage';
import { GraphQLPanel } from './components/graphql';
import { WebSocketPanel } from './components/websocket';
import { GrpcPanel } from './components/grpc';
import { SoapPanel } from './components/soap';
import { AiPanel } from './components/ai/AiPanel';
import { DaakiaAiPanel } from './components/ai/DaakiaAiPanel';
import { McpPanel } from './components/mcp/McpPanel';
import { CommandPaletteView } from './components/shared/command-palette/CommandPaletteView';
import { ApiMonitor } from './components/power/ApiMonitor';
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
import { useAiPromptTemplatesStore, AI_PROMPT_TEMPLATE_DEFAULTS } from './store/prompt-template';
import { useAiConversationStore } from './store/ai-conversation-store';
import { getVsCodeApi, postMsg } from './vscode';
import { useSMWorkspaceStore } from '@salilvnair/state-machine';
import { DaakiaSMConsumer } from './consumer/DaakiaSMConsumer';
import { getProtocolAccent } from './colors';
import { ProtocolRestBadge, ProtocolGraphQLBadge, ProtocolRealtimeBadge, ProtocolGrpcBadge, ProtocolSoapBadge, ProtocolAiBadge, ProtocolMcpBadge, ServerIcon, StethoscopeIcon, Dk8sIcon, DevToolsIcon } from './icons';
import { DevToolsPanel } from './components/shared/devtools';
import { DebugHud } from './components/shared/debugger';
import { useExtensionMessages } from './app/use-extension-messages';
import { ProtocolIcon, ProtocolPlaceholder, EmptyState } from './app/app-shell';
import { CaptureBridge } from './pages/wiki/daakia-view/capture/CaptureBridge';
import { DaakiaViewPage } from './pages/wiki/daakia-view/DaakiaViewPage';

type FocusedPanel = 'request' | 'response' | null;

const PROTOCOL_SIDEBAR_PREFIX: Record<string, string> = {
  rest: '', graphql: 'gql-', websocket: 'ws-', grpc: 'grpc-', soap: 'soap-', ai: 'ai-', mcp: 'mcp-',
};

export default function App() {
  const [sqliteStatus, setSqliteStatus] = useState<{ ok: boolean; error?: string }>({ ok: true });
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>('collections');
  const [saveAsTabId, setSaveAsTabId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [monitorPrefill, setMonitorPrefill] = useState<{ name: string; method: string; url: string } | null>(null);

  // Sidebar "Monitor Request" — opens the Power Features API Monitor pre-filled
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'openMonitorFor') {
        setMonitorPrefill({ name: event.data.name, method: event.data.method, url: event.data.url });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);
  const activeProtocol = useTabsStore(s => s.activeProtocol);
  // Tabs that take over the whole surface, so the protocol rail should show
  // nothing as selected while one of them is open.
  const STANDALONE_TABS = ['settings', 'mock-server', 'doctor', 'dk8s', 'state-machine', 'wiki', 'daakia-ai'];
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

  // Remap sidebar section when protocol changes so icons match active protocol.
  // Generic + symmetric: strips whichever protocol prefix is present, then
  // re-applies the new protocol's prefix. A per-protocol if/else here previously
  // only recognized a subset of "from" prefixes per branch (e.g. rest's branch
  // never recognized `soap-`/`grpc-`), so a `soap-collections` section left over
  // from a prior SOAP visit would survive untouched on every other protocol —
  // invisible there (didn't match that protocol's own section list) but still set —
  // and would then pop back open the instant the user returned to SOAP, looking
  // like SOAP "always" force-opens the panel even after the user closed it.
  const prevProtocolRef = useRef(activeProtocol);
  useEffect(() => {
    if (prevProtocolRef.current === activeProtocol) return;
    prevProtocolRef.current = activeProtocol;
    if (!sidebarSection || sidebarSection === 'environments' || sidebarSection === 'debug') return;
    // gql-docs / gql-schema have no equivalent section in other protocols
    if (sidebarSection === 'gql-docs' || sidebarSection === 'gql-schema') {
      if (activeProtocol !== 'graphql') {
        setSidebarSection(activeProtocol === 'rest' ? 'collections' : `${PROTOCOL_SIDEBAR_PREFIX[activeProtocol]}collections` as SidebarSection);
      }
      return;
    }
    const base = sidebarSection.replace(/^(gql|ws|grpc|soap|ai|mcp)-/, '');
    if (base !== 'collections' && base !== 'history') return;
    const next = `${PROTOCOL_SIDEBAR_PREFIX[activeProtocol] ?? ''}${base}` as SidebarSection;
    if (next !== sidebarSection) setSidebarSection(next);
  }, [activeProtocol, sidebarSection]);

  // Sidebar resizable
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const [showSplitterTip, setShowSplitterTip] = useState(false);
  const sidebarDragRef = useRef({ startX: 0, startWidth: 0, moved: false });

  // sidebarWidth is a persisted, user-set preference (e.g. dragged to its 480px max on a
  // wide window) that otherwise never shrinks back down — reopening on a narrower VS Code
  // panel left the sidebar pinned at its old width, overflowing past the viewport instead
  // of adapting. Track available width and clamp what's actually rendered; the raw
  // preference in state is untouched so it snaps back once there's room again.
  const rootRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const RAIL_WIDTH = 48;
  const MIN_MAIN_CONTENT_WIDTH = 160;
  const maxSidebarWidth = Math.max(0, containerWidth - RAIL_WIDTH - MIN_MAIN_CONTENT_WIDTH);
  const effectiveSidebarWidth = Math.min(sidebarWidth, maxSidebarWidth);

  // Resizable split: percentage of height for request panel (10-90)
  const storedSplit = useUiStateStore(s => s.panelHeights['split.rest.main']);
  const [splitPercent, setSplitPercent] = useState(storedSplit ?? 50);
  const [focusedPanel, setFocusedPanel] = useState<FocusedPanel>(null);
  const prevResponseRef = useRef<string | null>(null);

  // Track response arrival → auto-maximize response
  const { tabs, activeTabId } = useTabsStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const standaloneActive = !!activeTab?.type && STANDALONE_TABS.includes(activeTab.type);
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

  // Register SM workflow consumer once — loads persisted workflows from extension host DB
  useEffect(() => {
    useSMWorkspaceStore.getState().registerConsumer(new DaakiaSMConsumer());
  }, []);

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
      : activeTab?.type === 'dk8s' ? 'var(--color-dk8s)'
      : activeTab?.type === 'doctor' ? 'var(--color-doctor)'
      : activeTab?.type === 'state-machine' ? 'var(--color-mock-server)'
      : activeTab?.type === 'settings' ? 'var(--color-settings)'
      : activeTab?.type === 'wiki' ? 'var(--color-wiki)'
      : activeTab?.type === 'daakia-ai' ? 'var(--color-protocol-ai)'
      : map[tabProtocol] || map.rest;
    document.documentElement.style.setProperty('--color-accent', accent);
  }, [activeProtocol, activeTab?.type, activeTab?.protocol]);

  // Keyboard shortcuts
  useKeyboardShortcut('app.toggle-sidebar', { key: 'b', altKey: true }, (e) => {
    e.preventDefault();
    setSidebarOpen(prev => {
      const next = !prev;
      // When opening, ensure a section is active so the panel actually appears
      if (next && !sidebarSection) {
        const proto = activeProtocol;
        if (proto === 'graphql') setSidebarSection('gql-collections');
        else if (proto === 'websocket') setSidebarSection('ws-collections');
        else if (proto === 'grpc') setSidebarSection('grpc-collections');
        else if (proto === 'soap') setSidebarSection('soap-collections');
        else if (proto === 'ai') setSidebarSection('ai-collections');
        else if (proto === 'mcp') setSidebarSection('mcp-collections');
        else setSidebarSection('collections');
      }
      return next;
    });
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

  // Cmd+K (Mac) / Ctrl+K (Win/Linux) — Global command palette
  useKeyboardShortcut('app.command-palette-meta', { key: 'k', metaKey: true }, (e) => {
    e.preventDefault();
    setPaletteOpen(prev => !prev);
  }, 'Command palette');
  useKeyboardShortcut('app.command-palette-ctrl', { key: 'k', ctrlKey: true }, (e) => {
    e.preventDefault();
    setPaletteOpen(prev => !prev);
  }, 'Command palette');

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
    const delta = sidebarDragRef.current.startX - e.clientX;
    const newWidth = Math.min(480, maxSidebarWidth, Math.max(180, sidebarDragRef.current.startWidth + delta));
    setSidebarWidth(newWidth);
  }, [sidebarDragging, maxSidebarWidth]);

  const handleSidebarPointerUp = useCallback((e: React.PointerEvent) => {
    setSidebarDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (!sidebarDragRef.current.moved) {
      setSidebarOpen(prev => {
        const next = !prev;
        if (next && !sidebarSection) {
          const proto = activeProtocol;
          if (proto === 'graphql') setSidebarSection('gql-collections');
          else if (proto === 'websocket') setSidebarSection('ws-collections');
          else if (proto === 'grpc') setSidebarSection('grpc-collections');
          else if (proto === 'soap') setSidebarSection('soap-collections');
          else if (proto === 'ai') setSidebarSection('ai-collections');
          else if (proto === 'mcp') setSidebarSection('mcp-collections');
          else setSidebarSection('collections');
        }
        return next;
      });
    }
  }, [sidebarSection, activeProtocol]);

  // ── Req/Resp split callbacks ──
  const handleSplitResize = useCallback((pct: number) => {
    setSplitPercent(pct);
    setFocusedPanel(null);
  }, []);

  const handleSplitResizeEnd = useCallback((pct: number) => {
    useUiStateStore.getState().setHeight('split.rest.main', pct);
  }, []);

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

  // Extension host → webview message routing (extracted to app/use-extension-messages.ts)
  useExtensionMessages({ setSqliteStatus, setSaveAsTabId, setSplitPercent, setFocusedPanel, setSidebarSection, setSidebarOpen, setSidebarWidth, setPaletteOpen });

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

  // Save workspace snapshot — flush function shared by the debounced autosave
  // and the immediate flush-on-hide/unload listeners below.
  const flushWorkspaceSnapshot = useCallback(() => {
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
  }, [sidebarSection, sidebarOpen, sidebarWidth]);

  useEffect(() => {
    const timer = setTimeout(flushWorkspaceSnapshot, 2000);
    return () => clearTimeout(timer);
  }, [tabs, activeTabId, activeProtocol, sidebarSection, sidebarOpen, sidebarWidth, debugBreakpoints, debugDisabledBps, debugConditions, flushWorkspaceSnapshot]);

  // The debounced save above can be lost if the webview is disposed (window/panel
  // closed, VS Code quit) within the 2s window — leaving a stale snapshot (e.g. a
  // tab the user already closed) as "latest". Flush immediately when the webview
  // becomes hidden or is about to unload so the snapshot always reflects the real
  // last state.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushWorkspaceSnapshot();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushWorkspaceSnapshot);
    window.addEventListener('beforeunload', flushWorkspaceSnapshot);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushWorkspaceSnapshot);
      window.removeEventListener('beforeunload', flushWorkspaceSnapshot);
    };
  }, [flushWorkspaceSnapshot]);

  const tabProtocol = activeTab?.protocol || activeProtocol;
  const accentVar = activeTab?.type === 'mock-server' ? 'var(--color-mock-server)'
    : activeTab?.type === 'dk8s' ? 'var(--color-dk8s)'
    : activeTab?.type === 'doctor' ? 'var(--color-doctor)'
    : activeTab?.type === 'state-machine' ? 'var(--color-mock-server)'
    : activeTab?.type === 'settings' ? 'var(--color-settings)'
    : activeTab?.type === 'wiki' ? 'var(--color-wiki)'
    : activeTab?.type === 'daakia-ai' ? 'var(--color-protocol-ai)'
    : tabProtocol === 'graphql' ? 'var(--color-protocol-graphql)'
    : tabProtocol === 'websocket' ? 'var(--color-protocol-websocket)'
    : tabProtocol === 'grpc' ? 'var(--color-protocol-grpc)'
    : tabProtocol === 'soap' ? 'var(--color-protocol-soap)'
    : tabProtocol === 'ai' ? 'var(--color-protocol-ai)'
    : tabProtocol === 'mcp' ? 'var(--color-protocol-mcp)'
    : 'var(--color-protocol-rest)';

  return (
    <div ref={rootRef} className="flex h-screen w-screen overflow-hidden bg-[var(--color-panel)]" style={{ '--color-accent': accentVar } as React.CSSProperties}>
      {/* Debug HUD — floating toolbar shown during debug sessions */}
      <DebugHud />
      {/* Headless wiki capture automation driver — passive until wiki:capture:run is received */}
      <CaptureBridge />
      {/* Global Cmd+K / Ctrl+K command palette */}
      <CommandPaletteView
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenSidebarSection={(section) => { setSidebarOpen(true); setSidebarSection(section); }}
      />
      {/* Sidebar "Monitor Request" — pre-filled API Monitor */}
      {monitorPrefill && (
        <ApiMonitor prefill={monitorPrefill} onClose={() => setMonitorPrefill(null)} />
      )}
      {/* A standalone tab — settings, dk8s, doctor, mock-server, wiki, the AI
          tab, the state machine — owns the whole surface. The protocol rail
          must not keep showing REST as selected underneath it. */}
      {/* Left protocol icon rail */}
      <div className="flex flex-col items-center w-12 bg-[var(--color-panel)] border-r border-[var(--color-surface-border)] py-2 gap-1 flex-shrink-0">
        <ProtocolIcon
          active={!standaloneActive && activeProtocol === 'rest'}
          accentColor="var(--color-protocol-rest)"
          onClick={() => switchProtocol('rest')}
          title="REST"
        >
          <ProtocolRestBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={!standaloneActive && activeProtocol === 'graphql'}
          accentColor="var(--color-protocol-graphql)"
          onClick={() => switchProtocol('graphql')}
          title="GraphQL"
        >
          <ProtocolGraphQLBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={!standaloneActive && activeProtocol === 'websocket'}
          accentColor="var(--color-protocol-websocket)"
          onClick={() => switchProtocol('websocket')}
          title="Real time"
        >
          <ProtocolRealtimeBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={!standaloneActive && activeProtocol === 'grpc'}
          accentColor="var(--color-protocol-grpc)"
          onClick={() => switchProtocol('grpc')}
          title="gRPC"
        >
          <ProtocolGrpcBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={!standaloneActive && activeProtocol === 'soap'}
          accentColor="var(--color-protocol-soap)"
          onClick={() => switchProtocol('soap')}
          title="SOAP"
        >
          <ProtocolSoapBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={!standaloneActive && activeProtocol === 'ai'}
          accentColor="var(--color-protocol-ai)"
          onClick={() => switchProtocol('ai')}
          title="AI"
        >
          <ProtocolAiBadge size={32} />
        </ProtocolIcon>

        <ProtocolIcon
          active={!standaloneActive && activeProtocol === 'mcp'}
          accentColor="var(--color-protocol-mcp)"
          onClick={() => switchProtocol('mcp')}
          title="MCP"
        >
          <ProtocolMcpBadge size={32} />
        </ProtocolIcon>

        {/* Spacer pushes bottom icons down */}
        <div className="flex-1" />

        {/* dk8s — Kubernetes. Sits above Doctor because that is the workflow:
            dk8s collects the artifact, Doctor analyses it. */}
        <ProtocolIcon
          active={activeTab?.type === 'dk8s'}
          open={tabs.some(t => t.type === 'dk8s')}
          accentColor="var(--color-dk8s)"
          onClick={() => useTabsStore.getState().openDk8sTab()}
          title="dk8s — Kubernetes diagnostics"
        >
          <Dk8sIcon size={16} strokeWidth={1.8} />
        </ProtocolIcon>

        {/* Doctor — heap / thread / log diagnostics */}
        <ProtocolIcon
          active={activeTab?.type === 'doctor'}
          open={tabs.some(t => t.type === 'doctor')}
          accentColor="var(--color-doctor)"
          onClick={() => useTabsStore.getState().openDoctorTab()}
          title="Doctor — Diagnostics"
        >
          <StethoscopeIcon size={16} strokeWidth={1.8} />
        </ProtocolIcon>

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
                backgroundColor: 'var(--color-error)',
                color: 'var(--color-btn-primary-text)',
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

      {/* Main content + sidebar (flex row: content | splitter | sidebar) */}
      <div className="flex-1 min-w-0 overflow-hidden" style={{ height: '100%', display: 'flex' }}>

        {/* Main content */}
        <div className="flex flex-col h-full flex-1 min-w-0 overflow-hidden">
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

        {/* DoctorPanel — kept mounted so a parsed dump and the selected analyzer
            survive Daakia tab switches instead of being re-parsed on every visit. */}
        {tabs.some(t => t.type === 'dk8s') && (
          <div
            className="flex-1 flex flex-col min-w-0 overflow-hidden"
            style={{ display: activeTab?.type === 'dk8s' ? 'flex' : 'none' }}
          >
            <K8sPanel />
          </div>
        )}

        {tabs.some(t => t.type === 'doctor') && (
          <div
            className="flex-1 flex flex-col min-w-0 overflow-hidden"
            style={{ display: activeTab?.type === 'doctor' ? 'flex' : 'none' }}
          >
            <DoctorPanel />
          </div>
        )}

        {/* MockServerPanel — always mounted when any mock-server tab exists.
            Keeps ServerDetail sub-tab selection (State Machine, Traffic, etc.)
            alive across Daakia tab switches. */}
        {tabs.some(t => t.type === 'mock-server') && (
          <div
            className="flex-1 flex flex-col min-w-0 overflow-hidden"
            style={{ display: activeTab?.type === 'mock-server' ? 'flex' : 'none' }}
          >
            <MockServerPanel />
          </div>
        )}

        {/* SmStateMachineTabPage — one keep-alive instance per SM tab so the
            canvas, workflow tabs, and registered DaakiaSMConsumer survive
            Daakia tab switches without remounting from scratch. */}
        {tabs.filter(t => t.type === 'state-machine').map(smTab => (
          <div
            key={smTab.id}
            className="flex-1 flex flex-col min-w-0 overflow-hidden"
            style={{ display: activeTab?.id === smTab.id ? 'flex' : 'none' }}
          >
            <SmStateMachineTabPage tabId={smTab.id} />
          </div>
        ))}

        {/* DaakiaViewPage (Wiki) — always mounted when a wiki tab exists so the
            selected wiki page/scroll position survives Daakia tab switches. */}
        {tabs.some(t => t.type === 'wiki') && (
          <div
            className="flex-1 flex flex-col min-w-0 overflow-hidden"
            style={{ display: activeTab?.type === 'wiki' ? 'flex' : 'none' }}
          >
            <DaakiaViewPage />
          </div>
        )}

        {activeTab?.type === 'settings' ? (
          <SettingsPanel />
        ) : activeTab?.type === 'mock-server' ? null
        : activeTab?.type === 'dk8s' ? null
        : activeTab?.type === 'doctor' ? null
        : activeTab?.type === 'state-machine' ? null
        : activeTab?.type === 'wiki' ? null
        : activeTab?.type === 'daakia-ai' ? null
        : (activeTab?.protocol || activeProtocol) === 'rest' ? (
          !activeTab ? (
            <EmptyState protocol="rest" onNewTab={() => useTabsStore.getState().addTab()} />
          ) : (
          <>
            {/* URL bar */}
            <UrlBar />

            {/* Resizable split: request (top) / response (bottom) */}
            <SplitPanelView
              direction="vertical"
              split={splitPercent}
              defaultSplit={50}
              minFirst={60}
              minSecond={60}
              accentColor={protocolAccent}
              onResize={handleSplitResize}
              onResizeEnd={handleSplitResizeEnd}
              style={{ flex: 1, minHeight: 0 }}
              first={
                <div
                  className="flex flex-col h-full overflow-hidden"
                  onFocus={handleRequestFocus}
                >
                  <RequestPanel />
                </div>
              }
              second={
                <div
                  className="flex flex-col h-full overflow-hidden"
                  onFocus={handleResponseFocus}
                >
                  <ResponsePanel />
                </div>
              }
            />
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

        {/* Sidebar splitter — only for protocol tabs that have an expandable panel */}
        {!(activeTab?.type === 'mock-server' || activeTab?.type === 'doctor' || activeTab?.type === 'dk8s' || activeTab?.type === 'state-machine' || activeTab?.type === 'settings') && (
          <div
            className="w-[6px] flex-shrink-0 cursor-col-resize relative select-none group"
            onPointerDown={handleSidebarPointerDown}
            onPointerMove={handleSidebarPointerMove}
            onPointerUp={handleSidebarPointerUp}
            onMouseEnter={() => setShowSplitterTip(true)}
            onMouseLeave={() => setShowSplitterTip(false)}
            aria-label="Resize or collapse sidebar"
          >
            <div
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-150 ${
                sidebarDragging ? 'h-[80px]' : sidebarOpen ? 'h-[44px] bg-[var(--color-surface-border)] group-hover:h-[80px]' : 'h-[48px] group-hover:h-[80px]'
              }`}
              style={{
                backgroundColor: sidebarDragging ? protocolAccent : sidebarOpen ? undefined : `color-mix(in srgb, ${protocolAccent} 30%, transparent)`,
              }}
              onMouseEnter={(e) => { if (!sidebarDragging) (e.currentTarget as HTMLElement).style.backgroundColor = protocolAccent; }}
              onMouseLeave={(e) => { if (!sidebarDragging) (e.currentTarget as HTMLElement).style.backgroundColor = sidebarOpen ? '' : `color-mix(in srgb, ${protocolAccent} 30%, transparent)`; }}
            />
            {showSplitterTip && !sidebarDragging && (
              <div className="absolute top-1/2 right-4 -translate-y-1/2 bg-[var(--color-surface)] text-[var(--color-text-primary)] text-[11px] px-2.5 py-1.5 rounded-lg border border-[var(--color-surface-border)] shadow-lg whitespace-nowrap pointer-events-none z-50 flex flex-col gap-0.5 leading-tight">
                <div>Click to {sidebarOpen ? 'collapse' : 'expand'} <kbd style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--color-panel)', fontFamily: 'monospace', border: '1px solid color-mix(in srgb, var(--color-text-primary) 15%, transparent)' }}>Alt+B</kbd></div>
                <div>Drag to resize</div>
              </div>
            )}
          </div>
        )}

        {/* Right sidebar — always visible; icon rail only for mock-server/SM/settings */}
        <AppSidebar activeSection={sidebarSection} onSectionChange={setSidebarSection} onOpenChange={setSidebarOpen} sidebarOpen={sidebarOpen} sidebarWidth={effectiveSidebarWidth} sidebarDragging={sidebarDragging} />

      </div>

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
