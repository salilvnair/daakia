import { create } from 'zustand';

export type SuggestionProtocol = 'rest' | 'graphql' | 'grpc' | 'websocket' | 'sse' | 'socketio' | 'mqtt' | 'soap';

interface UrlEntry {
  url: string;
  protocol: SuggestionProtocol;
}

type ProtocolUrlMap = Record<SuggestionProtocol, string[]>;

const EMPTY_URLS: string[] = [];

interface UrlSuggestionsState {
  /** All URL entries tagged with protocol */
  entries: UrlEntry[];
  /** Legacy flat accessor — returns all URLs (backward compat) */
  urls: string[];
  /** Pre-computed per-protocol URL arrays (stable references) */
  byProtocol: ProtocolUrlMap;
  addUrls: (newUrls: string[], protocol?: SuggestionProtocol) => void;
  setUrls: (urls: string[], protocol?: SuggestionProtocol) => void;
  /** Get URLs filtered by protocol — use byProtocol directly in selectors instead */
  getUrlsForProtocol: (protocol: SuggestionProtocol) => string[];
}

function buildProtocolMap(entries: UrlEntry[]): ProtocolUrlMap {
  const map: ProtocolUrlMap = { rest: [], graphql: [], grpc: [], websocket: [], sse: [], socketio: [], mqtt: [], soap: [] };
  for (const e of entries) {
    map[e.protocol].push(e.url);
  }
  return map;
}

export const useUrlSuggestionsStore = create<UrlSuggestionsState>((set, get) => ({
  entries: [],
  urls: [],
  byProtocol: { rest: [], graphql: [], grpc: [], websocket: [], sse: [], socketio: [], mqtt: [], soap: [] },

  addUrls: (newUrls, protocol = 'rest') => {
    set((s) => {
      const existingSet = new Set(s.byProtocol[protocol]);
      const additions = newUrls.filter(u => u && !existingSet.has(u));
      if (additions.length === 0) return s;
      const newEntries = [...s.entries, ...additions.map(url => ({ url, protocol }))];
      return {
        entries: newEntries,
        urls: [...new Set(newEntries.map(e => e.url))],
        byProtocol: buildProtocolMap(newEntries),
      };
    });
  },

  setUrls: (urls, protocol = 'rest') => {
    const unique = [...new Set(urls.filter(Boolean))];
    set((s) => {
      const otherEntries = s.entries.filter(e => e.protocol !== protocol);
      const newEntries = [...otherEntries, ...unique.map(url => ({ url, protocol }))];
      return {
        entries: newEntries,
        urls: [...new Set(newEntries.map(e => e.url))],
        byProtocol: buildProtocolMap(newEntries),
      };
    });
  },

  getUrlsForProtocol: (protocol) => {
    return get().byProtocol[protocol] || EMPTY_URLS;
  },
}));
