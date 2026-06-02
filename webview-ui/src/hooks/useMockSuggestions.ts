/**
 * useMockSuggestions — shared hook that returns running mock server URLs for a given protocol.
 * Prevents duplicate useMemo logic across every URL bar component.
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
 * Builds proper URL with scheme and path.
 */
export function useMockSuggestions(protocol: Protocol): MockServerSuggestion[] {
  const servers = useMockStore(s => s.servers);

  return useMemo(() => {
    return servers
      .filter(s => s.protocol === protocol && s.running && s.port)
      .map(s => {
        const scheme = PROTOCOL_SCHEMES[protocol];
        const path = PROTOCOL_PATHS[protocol] || '';
        const prefix = scheme === '' ? '' : `${scheme || 'http'}://`;
        return { url: `${prefix}localhost:${s.port}${path}`, name: s.name };
      });
  }, [servers, protocol]);
}
