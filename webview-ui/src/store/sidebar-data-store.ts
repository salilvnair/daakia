import { create } from 'zustand';

/**
 * Sidebar Data Store — caches collection trees and history entries per protocol.
 * Loaded once from DB on first access, then maintained in memory via mutations.
 * Prevents flickering on tab switch by avoiding re-fetches.
 */

// Stable empty arrays to avoid new reference on each selector call
const EMPTY_COLLECTIONS: CollectionTreeNode[] = [];
const EMPTY_HISTORY: HistoryEntry[] = [];

export interface CollectionTreeNode {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  children: CollectionTreeNode[];
  requests: { id: string; collection_id: string; name: string; method: string; url: string; data?: string }[];
}

export interface HistoryEntry {
  id: number;
  request_id?: string;
  method: string;
  url: string;
  status: number;
  status_text?: string;
  response_time?: number;
  response_size?: number;
  request_data?: string;
  response_data?: string;
  created_at?: string;
}

type Protocol = string;

interface SidebarDataState {
  /** Collection trees indexed by protocol */
  collections: Record<Protocol, CollectionTreeNode[]>;
  /** Whether collections have been loaded at least once per protocol */
  collectionsLoaded: Record<Protocol, boolean>;

  /** History entries indexed by protocol */
  history: Record<Protocol, HistoryEntry[]>;
  /** Whether history has been loaded at least once per protocol */
  historyLoaded: Record<Protocol, boolean>;

  // Collections
  setCollections: (protocol: Protocol, data: CollectionTreeNode[]) => void;
  getCollections: (protocol: Protocol) => CollectionTreeNode[];
  isCollectionsLoaded: (protocol: Protocol) => boolean;

  // History
  setHistory: (protocol: Protocol, data: HistoryEntry[]) => void;
  getHistory: (protocol: Protocol) => HistoryEntry[];
  isHistoryLoaded: (protocol: Protocol) => boolean;
}

export const useSidebarDataStore = create<SidebarDataState>((set, get) => ({
  collections: {},
  collectionsLoaded: {},
  history: {},
  historyLoaded: {},

  setCollections: (protocol, data) => {
    set(s => ({
      collections: { ...s.collections, [protocol]: data },
      collectionsLoaded: { ...s.collectionsLoaded, [protocol]: true },
    }));
  },

  getCollections: (protocol) => get().collections[protocol] || EMPTY_COLLECTIONS,

  isCollectionsLoaded: (protocol) => !!get().collectionsLoaded[protocol],

  setHistory: (protocol, data) => {
    set(s => ({
      history: { ...s.history, [protocol]: data },
      historyLoaded: { ...s.historyLoaded, [protocol]: true },
    }));
  },

  getHistory: (protocol) => get().history[protocol] || EMPTY_HISTORY,

  isHistoryLoaded: (protocol) => !!get().historyLoaded[protocol],
}));
