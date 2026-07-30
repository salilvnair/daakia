/**
 * useExtensionMessages — the single window "message" listener that routes every
 * extension-host → webview message (REST/GraphQL/gRPC/SOAP/WS/SSE/SIO/MQTT/AI/MCP,
 * debugger, mock server lifecycle, settings) into the right Zustand store.
 * Extracted from App.tsx — behavior is verbatim.
 */
import { useEffect } from 'react';
import { useTabsStore } from '../store/tabs-store';
import { useToastStore } from '../store/toast-store';
import { useEnvStore } from '../store/env-store';
import { useCollectionsStore } from '../store/collections-store';
import { useUrlSuggestionsStore } from '../store/url-suggestions-store';
import { useUiStateStore } from '../store/ui-state-store';
import { useDevToolsStore } from '../store/devtools-store';
import { useMockStore } from '../store/mock-store';
import { useDebugStore } from '../store/debug-store';
import { useAiProvidersStore } from '../store/ai-providers-store';
import { useSidebarDataStore } from '../store/sidebar-data-store';
import { useAiKeysStore } from '../store/ai-keys-store';
import { useAiFeaturesStore } from '../store/ai-features-store';
import { useDbStatusStore } from '../store/db-status-store';
import { useAppSettingsStore } from '../store/app-settings-store';
import { useAiHistoryStore } from '../store/ai-history-store';
import { useAiPromptTemplatesStore, AI_PROMPT_TEMPLATE_DEFAULTS } from '../store/prompt-template';
import { useAiConversationStore } from '../store/ai-conversation-store';
import { getVsCodeApi } from '../vscode';
import { sendRequest, saveRequest } from '../services/request';
import type { SidebarSection } from '../components/sidebar';
import { logProtocolMessage } from './protocol-logger';

import { handleGrpcMessages } from './messages/grpc-messages';
import { handleSoapMessages } from './messages/soap-messages';
import { handleDebuggerMessages } from './messages/debugger-messages';
import { handleMockMessages } from './messages/mock-messages';
import { handleAiMessages } from './messages/ai-messages';
import { handleMcpMessages } from './messages/mcp-messages';
import { handleRealtimeMessages } from './messages/realtime-messages';

export interface ExtensionMessageCtx {
  setSqliteStatus: (s: { ok: boolean; error?: string }) => void;
  setSaveAsTabId: (id: string | null) => void;
  setSplitPercent: (pct: number) => void;
  setFocusedPanel: (p: 'request' | 'response' | null) => void;
  setSidebarSection: (s: SidebarSection) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
}

export function useExtensionMessages(ctx: ExtensionMessageCtx) {
  const { setSqliteStatus, setSaveAsTabId, setSplitPercent, setFocusedPanel, setSidebarSection, setSidebarOpen, setSidebarWidth, setPaletteOpen } = ctx;
  // Mounted once for the app lifetime — setters from useState are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;

      // ──── Global Protocol Diagnostics Logger ────
      // Logs all protocol responses, errors, and events to browser DevTools console
      logProtocolMessage(msg);

      // Protocol-specific handlers (app/messages/*) — first match wins
      if (
        handleGrpcMessages(msg) ||
        handleSoapMessages(msg) ||
        handleDebuggerMessages(msg, { setSplitPercent, setFocusedPanel, setSidebarSection: (s) => setSidebarSection(s as SidebarSection) }) ||
        handleMockMessages(msg) ||
        handleAiMessages(msg) ||
        handleMcpMessages(msg) ||
        handleRealtimeMessages(msg)
      ) return;

      switch (msg.type) {
        case 'init': {
          setSqliteStatus({ ok: msg.sqliteOk, error: msg.sqliteError });
          useDbStatusStore.getState().setDbStatus({ dbPath: msg.dbPath, sqliteOk: msg.sqliteOk, sqliteError: msg.sqliteError });
          // Load persisted Daakia AI conversation on startup
          useAiConversationStore.getState().loadFromDb();
          // Load persisted General/Encoding/Proxy settings once — Settings panel reads/writes
          // through this store instead of each sub-tab independently re-fetching on mount.
          useAppSettingsStore.getState().load();
          // Restore saved theme (7.6, E3.x system theme)
          const savedTheme = localStorage.getItem('daakia-theme');
          const resolvedTheme: 'dark' | 'light' =
            savedTheme === 'system'
              ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
              : savedTheme === 'light' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', resolvedTheme);
          document.body.setAttribute('data-theme', resolvedTheme);
          // If system mode: keep in sync with OS changes
          if (savedTheme === 'system') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            mq.addEventListener('change', (e) => {
              const t = e.matches ? 'dark' : 'light';
              document.documentElement.setAttribute('data-theme', t);
              document.body.setAttribute('data-theme', t);
            });
          }
          break;
        }
        case 'aiConversation:data': {
          useAiConversationStore.getState().setMessages(msg.messages || []);
          break;
        }
        case 'settingsData': {
          useAppSettingsStore.getState().setSettings(msg.settings || {});
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
            // Parse request cookies from Cookie header
            const rawCookieHeader = (msg.requestHeaders || {})['Cookie'] || (msg.requestHeaders || {})['cookie'] || '';
            const parsedRequestCookies = rawCookieHeader
              ? rawCookieHeader.split(';').map((c: string) => {
                  const eqIdx = c.indexOf('=');
                  return eqIdx > 0
                    ? { name: c.slice(0, eqIdx).trim(), value: c.slice(eqIdx + 1).trim() }
                    : { name: c.trim(), value: '' };
                }).filter((c: { name: string; value: string }) => c.name)
              : undefined;
            // Capture response cookies (from cookies array or Set-Cookie headers)
            const responseCookiesArr = (response.cookies || []).map((c: any) => ({
              name: c.name || c.key || '',
              value: c.value || '',
              domain: c.domain,
              path: c.path,
              httpOnly: c.httpOnly,
              secure: c.secure,
              sameSite: c.sameSite,
              expires: c.expires,
            })).filter((c: { name: string; value: string }) => c.name);
            // Detect blob content types
            const ct = (response.contentType || 'text/plain').toLowerCase();
            const isBlobContent = ct.startsWith('image/') || ct.startsWith('audio/') || ct.startsWith('video/') || ct === 'application/pdf' || ct === 'application/octet-stream' || ct.includes('zip') || ct.includes('binary');
            useDevToolsStore.getState().addNetworkEntry({
              timestamp: Date.now(),
              method: msg.requestMethod || reqTab?.method || 'GET',
              url: msg.requestUrl || reqTab?.url || '',
              requestHeaders: msg.requestHeaders || {},
              requestBody: msg.requestBody || undefined,
              requestCookies: parsedRequestCookies,
              status: response.status,
              statusText: response.statusText,
              responseHeaders: response.headers || {},
              responseBody: response.body || undefined,
              responseCookies: responseCookiesArr.length > 0 ? responseCookiesArr : undefined,
              duration: response.time || 0,
              size: response.size || 0,
              contentType: response.contentType || 'text/plain',
              isBlob: isBlobContent && !!response.body,
              blobMimeType: isBlobContent ? ct : undefined,
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
            const { gql_connected, ...restAuth } = (tab.authData || {}) as Record<string, string>;
            useTabsStore.getState().updateTab(tabId, {
              authData: restAuth,
              loading: false,
              response: {
                status: 0,
                statusText: 'Error',
                headers: {},
                body: JSON.stringify({ errors: [{ message: gqlErr }] }),
                size: 0,
                time: 0,
                contentType: 'application/json',
                cookies: [],
              },
            });
          }
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
        case 'openCommandPalette': {
          setPaletteOpen(prev => !prev);
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
        case 'navigate': {
          if (msg.panel === 'settings') {
            useTabsStore.getState().openSettingsTab();
            if (msg.section) {
              useUiStateStore.getState().setPref('settings.section', msg.section);
            }
          }
          break;
        }
      }
    };

    window.addEventListener('message', handler);
    getVsCodeApi().postMessage({ type: 'ready' });
    getVsCodeApi().postMessage({ type: 'getEnvironments' });
    // Preload URL suggestions from history + collections on startup — one request per protocol
    // so sidebar-data-store cache is never contaminated with cross-protocol entries
    (['rest', 'graphql', 'websocket', 'grpc', 'soap', 'mcp'] as const).forEach(p =>
      getVsCodeApi().postMessage({ type: 'getHistory', protocol: p })
    );
    getVsCodeApi().postMessage({ type: 'getCollections', protocol: 'rest' });
    getVsCodeApi().postMessage({ type: 'getCollections', protocol: 'graphql' });
    getVsCodeApi().postMessage({ type: 'getCollections', protocol: 'websocket' });
    getVsCodeApi().postMessage({ type: 'aiProviders:load' });
    getVsCodeApi().postMessage({ type: 'aiPromptTemplates:load' });
    return () => window.removeEventListener('message', handler);
  }, []);
}
