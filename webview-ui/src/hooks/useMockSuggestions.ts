/**
 * useMockSuggestions — shared hook that returns running mock server URLs for a given protocol.
 * For REST, also expands to individual route paths so users can pick any route from autocomplete.
 */
import { useMemo } from 'react';
import { useMockStore } from '../store/mock-store';
import type { MockServerSuggestion } from '../components/shared/controls/HighlightedInput';

type Protocol = 'rest' | 'graphql' | 'websocket' | 'sse' | 'socketio' | 'mqtt' | 'grpc' | 'soap';

/** URL path appended for certain protocols */
const PROTOCOL_PATHS: Partial<Record<Protocol, string>> = {
  graphql: '/graphql',
  sse: '/events',
};

/** URL scheme for realtime protocols */
const PROTOCOL_SCHEMES: Partial<Record<Protocol, string>> = {
  websocket: 'ws',
  mqtt: 'ws',
  grpc: '', // gRPC uses bare host:port (no scheme)
};

/**
 * Returns running mock server suggestions filtered by protocol.
 * For REST servers, expands to individual route paths filtered by the current HTTP method.
 * Routes with method 'ANY' always appear regardless of the filter.
 */
export function useMockSuggestions(protocol: Protocol, method?: string): MockServerSuggestion[] {
  const servers = useMockStore(s => s.servers);

  return useMemo(() => {
    const results: MockServerSuggestion[] = [];

    for (const s of servers) {
      if (s.protocol !== protocol || !s.running || !s.port) continue;

      const scheme = PROTOCOL_SCHEMES[protocol];
      const protocolPath = PROTOCOL_PATHS[protocol] || '';
      const prefix = scheme === '' ? '' : `${scheme || 'http'}://`;
      const baseUrl = `${prefix}localhost:${s.port}`;

      // Root server URL always comes first
      results.push({ url: `${baseUrl}${protocolPath}`, name: s.name });

      // For REST, expand to individual enabled routes (filtered by current HTTP method)
      if (protocol === 'rest' && s.routes?.length) {
        const pathMap = new Map<string, string[]>();
        for (const route of s.routes) {
          if (!route.enabled) continue;
          // ANY routes always show; method-specific routes only show when method matches
          if (method && route.method !== 'ANY' && route.method !== method) continue;
          const routePath = route.path.startsWith('/') ? route.path : `/${route.path}`;
          const existing = pathMap.get(routePath) ?? [];
          if (!existing.includes(route.method)) existing.push(route.method);
          pathMap.set(routePath, existing);
        }
        for (const [routePath, methods] of pathMap) {
          results.push({ url: `${baseUrl}${routePath}`, name: methods.join(' · ') });
        }
      }
    }

    return results;
  }, [servers, protocol, method]);
}
