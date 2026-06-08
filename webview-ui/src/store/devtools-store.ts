/**
 * DevTools Store — manages state for the DevTools bottom panel (Console + Network).
 * Stores console logs from script execution and network request entries.
 */
import { create } from 'zustand';

// ─── Types ───────────────────────────────────────────────────────────────────

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface ConsoleLogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  args: unknown[];
  /** Which request triggered this log (display name) */
  requestName?: string;
  /** Phase: pre-request, post-response, test, collection-pre, collection-post, folder-pre, folder-post */
  scriptPhase?: string;
}

/** A cookie entry (request or response) */
export interface CookieEntry {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  expires?: string;
}

/** A single network request/response captured by DevTools */
export interface NetworkEntry {
  id: string;
  timestamp: number;
  /** Request metadata */
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  /** Cookies sent with the request (parsed from Cookie header or explicit) */
  requestCookies?: CookieEntry[];
  /** Response metadata */
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody?: string;
  /** Cookies received in the response (from Set-Cookie headers or explicit) */
  responseCookies?: CookieEntry[];
  /** Duration in ms */
  duration: number;
  /** Response size in bytes */
  size: number;
  /** Content type */
  contentType: string;
  /** Protocol identifier for proper status interpretation */
  protocol?: 'http' | 'grpc' | 'graphql' | 'websocket' | 'soap';
  /** True when the response body is binary/blob content (base64 encoded in responseBody) */
  isBlob?: boolean;
  /** Original MIME type for blob responses */
  blobMimeType?: string;
}

export type DevToolsTab = 'console' | 'network' | 'performance';

export type LogFilter = 'all' | LogLevel;

interface DevToolsStore {
  // Panel state
  isOpen: boolean;
  activeTab: DevToolsTab;
  panelHeight: number;

  // Console
  logs: ConsoleLogEntry[];
  logFilter: LogFilter;

  // Network
  networkEntries: NetworkEntry[];
  selectedNetworkId: string | null;

  // Actions — Panel
  toggle: () => void;
  open: () => void;
  close: () => void;
  setActiveTab: (tab: DevToolsTab) => void;
  setPanelHeight: (height: number) => void;

  // Actions — Console
  addLog: (entry: Omit<ConsoleLogEntry, 'id'>) => void;
  addLogs: (entries: Omit<ConsoleLogEntry, 'id'>[]) => void;
  clearLogs: () => void;
  setLogFilter: (filter: LogFilter) => void;

  // Actions — Network
  addNetworkEntry: (entry: Omit<NetworkEntry, 'id'>) => void;
  clearNetwork: () => void;
  selectNetwork: (id: string | null) => void;
}

let _logCounter = 0;
let _networkCounter = 0;

export const useDevToolsStore = create<DevToolsStore>((set) => ({
  // Initial state
  isOpen: false,
  activeTab: 'console',
  panelHeight: 200,

  logs: [],
  logFilter: 'all',

  networkEntries: [],
  selectedNetworkId: null,

  // Panel actions
  toggle: () => set(s => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setPanelHeight: (height) => set({ panelHeight: Math.max(120, Math.min(height, 500)) }),

  // Console actions
  addLog: (entry) => set(s => ({
    logs: [...s.logs, { ...entry, id: `log-${++_logCounter}` }],
  })),
  addLogs: (entries) => set(s => ({
    logs: [
      ...s.logs,
      ...entries.map(e => ({ ...e, id: `log-${++_logCounter}` })),
    ],
  })),
  clearLogs: () => set({ logs: [] }),
  setLogFilter: (filter) => set({ logFilter: filter }),

  // Network actions
  addNetworkEntry: (entry) => set(s => ({
    networkEntries: [{ ...entry, id: `net-${++_networkCounter}` }, ...s.networkEntries],
  })),
  clearNetwork: () => set({ networkEntries: [], selectedNetworkId: null }),
  selectNetwork: (id) => set({ selectedNetworkId: id }),
}));
