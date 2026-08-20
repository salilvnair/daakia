/**
 * Which protocol list a generated collection belongs in.
 *
 * Collections are stored PER PROTOCOL — `collections.protocol` in SQLite, and the tree is
 * queried with a protocol filter. Anything that creates a collection therefore has to file
 * it under the protocol the user was actually working in. Several AI features hardcoded
 * 'rest', so exporting from a GraphQL (or SOAP, or gRPC) tab produced a collection that
 * simply never appeared in that protocol's list.
 */

/** Protocols that own a collection list. Mirrors Protocol in tabs-store, minus 'ai'. */
export const COLLECTION_PROTOCOLS = ['rest', 'graphql', 'soap', 'grpc', 'websocket', 'mcp'] as const;

export const COLLECTION_PROTOCOL_LABELS: Record<string, string> = {
  rest: 'REST', graphql: 'GraphQL', soap: 'SOAP',
  grpc: 'gRPC', websocket: 'Realtime', mcp: 'MCP',
};

/**
 * Coerce a protocol hint to one that owns a collection list.
 *
 * 'ai' deliberately falls through to REST: the AI tab has no collection list of its own, so
 * a collection generated while sitting there has to live somewhere reachable.
 */
export function normalizeCollectionProtocol(hint: string | undefined | null): string {
  const p = hint?.toLowerCase().trim();
  return p && (COLLECTION_PROTOCOLS as readonly string[]).includes(p) ? p : 'rest';
}

/**
 * Preferred protocol for a generated collection: what the model declared, else the tab the
 * feature was launched from, else REST.
 */
export function resolveCollectionProtocol(declared: string | undefined, context: string | undefined): string {
  const d = declared?.toLowerCase().trim();
  if (d && (COLLECTION_PROTOCOLS as readonly string[]).includes(d)) return d;
  return normalizeCollectionProtocol(context);
}
