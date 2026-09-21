/**
 * Everything scoped to a workspace, asked for again.
 *
 * Called on startup and after every workspace switch. One list, because
 * "loaded at boot" and "reloaded after a switch" are the same requirement, and
 * two lists that have to stay in step is a bug waiting to happen.
 *
 * ── Why every protocol ──
 *
 * The host scopes history and collections by workspace for every protocol, but
 * this used to ask again for only some of them — history without AI, SSE,
 * Socket.IO or MQTT, collections for three protocols out of seven. Whatever
 * was not asked for kept the previous workspace's rows in the sidebar cache,
 * so the Workspace page's History tab showed the same 110 AI requests in every
 * workspace, a teammate's read-only one included. The data was right; the
 * screen was stale.
 *
 * These match `MainPanel._broadcastSyncedData`, which re-sends the same set
 * after a sync.
 */
import { getVsCodeApi } from '../vscode';

export const WORKSPACE_HISTORY_PROTOCOLS = [
  'rest', 'graphql', 'websocket', 'sse', 'socketio', 'mqtt', 'grpc', 'soap', 'ai', 'mcp',
] as const;

export const WORKSPACE_COLLECTION_PROTOCOLS = [
  'rest', 'graphql', 'websocket', 'grpc', 'soap', 'ai', 'mcp',
] as const;

export function loadWorkspaceScopedData(): void {
  const api = getVsCodeApi();
  api.postMessage({ type: 'getEnvironments' });
  // One request per protocol so the sidebar cache is never contaminated with
  // cross-protocol entries.
  for (const protocol of WORKSPACE_HISTORY_PROTOCOLS) api.postMessage({ type: 'getHistory', protocol });
  for (const protocol of WORKSPACE_COLLECTION_PROTOCOLS) api.postMessage({ type: 'getCollections', protocol });
}
