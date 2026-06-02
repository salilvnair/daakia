/**
 * Mock server store — persists logs, server configs, and running state across tab switches.
 * MockServerPanel is only mounted when mock tab is active, so data must live here.
 * Caches server configs from DB to prevent flickering on remount.
 */
import { create } from 'zustand';
import type { MockLogEntry, MockServer } from '../components/mock/mock-types';

const MAX_LOGS = 500;

const EMPTY_SERVERS: MockServer[] = [];

interface MockStoreState {
  // Logs
  logs: MockLogEntry[];
  addLog: (entry: MockLogEntry) => void;
  clearLogs: (serverId?: string) => void;

  // Server configs cache (prevents DB re-fetch on remount)
  servers: MockServer[];
  serversLoaded: boolean;
  setServers: (servers: MockServer[]) => void;
  getServers: () => MockServer[];
  isServersLoaded: () => boolean;
  updateServer: (id: string, patch: Partial<MockServer>) => void;
  addServer: (server: MockServer) => void;
  removeServer: (id: string) => void;
  clearServers: () => void;
}

export const useMockStore = create<MockStoreState>((set, get) => ({
  // Logs
  logs: [],
  addLog: (entry) => set((s) => ({
    logs: [...s.logs, entry].slice(-MAX_LOGS),
  })),
  clearLogs: (serverId) => set((s) => ({
    logs: serverId ? s.logs.filter(l => l.serverId !== serverId) : [],
  })),

  // Servers cache
  servers: EMPTY_SERVERS,
  serversLoaded: false,
  setServers: (servers) => set({ servers, serversLoaded: true }),
  getServers: () => get().servers,
  isServersLoaded: () => get().serversLoaded,
  updateServer: (id, patch) => set((s) => ({
    servers: s.servers.map(srv => srv.id === id ? { ...srv, ...patch } : srv),
  })),
  addServer: (server) => set((s) => ({ servers: [...s.servers, server] })),
  removeServer: (id) => set((s) => ({ servers: s.servers.filter(srv => srv.id !== id) })),
  clearServers: () => set({ servers: [], serversLoaded: true }),
}));
