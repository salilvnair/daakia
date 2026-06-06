/**
 * WebSocket client handler — manages WS connections per tab.
 */
import WebSocket from 'ws';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import { insertHistory, trimHistory, getSetting } from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

// Track active connections by tabId
const connections = new Map<string, WebSocket>();

export function handleWsConnect(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
  refreshHistory?: () => void,
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;
  const protocols = msg.protocols as string | undefined;

  // Resolve environment variables in URL and protocols
  const vars = loadEnvVars(envId);
  const url = resolveEnvString(msg.url as string, vars);
  const resolvedProtocols = protocols ? resolveEnvString(protocols, vars) : undefined;

  // Close existing connection for this tab
  const existing = connections.get(tabId);
  if (existing) {
    existing.removeAllListeners();
    existing.close();
    connections.delete(tabId);
  }

  // Parse protocols (comma-separated)
  const protocolList = resolvedProtocols
    ? resolvedProtocols.split(',').map(p => p.trim()).filter(Boolean)
    : undefined;

  try {
    const ws = protocolList?.length
      ? new WebSocket(url, protocolList)
      : new WebSocket(url);

    connections.set(tabId, ws);

    ws.on('open', () => {
      postMessage({ type: 'ws:connected', tabId });

      // Record in history
      try {
        insertHistory({
          method: 'WS',
          url,
          protocol: 'websocket',
          request_data: JSON.stringify({
            authData: {
              rt_protocol: 'websocket',
              ws_protocols: resolvedProtocols || '',
            },
          }),
        });
        const maxHistory = parseInt(getSetting('maxHistoryEntries') || '100', 10);
        trimHistory(maxHistory);
        if (refreshHistory) refreshHistory();
      } catch { /* ignore history errors */ }
    });

    ws.on('message', (data: WebSocket.Data) => {
      const str = typeof data === 'string' ? data : data.toString();
      postMessage({ type: 'ws:message', tabId, data: str });
    });

    ws.on('close', () => {
      connections.delete(tabId);
      postMessage({ type: 'ws:disconnected', tabId });
    });

    ws.on('error', (err: Error) => {
      console.error('[WebSocket Error]', { tabId, url, error: err.message, stack: (err as any).stack });
      connections.delete(tabId);
      postMessage({ type: 'ws:error', tabId, error: err.message });
    });
  } catch (err: any) {
    console.error('[WebSocket Connect Error]', { tabId, url, error: err.message, stack: err.stack });
    postMessage({ type: 'ws:error', tabId, error: err.message || 'Failed to connect' });
  }
}

export function handleWsDisconnect(msg: Record<string, unknown>, postMessage?: PostMessage) {
  const tabId = msg.tabId as string;
  const ws = connections.get(tabId);
  if (ws) {
    ws.removeAllListeners();
    ws.close();
    connections.delete(tabId);
  }
  postMessage?.({ type: 'ws:disconnected', tabId, reason: 'User disconnected' });
}

export function handleWsSend(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;
  const ws = connections.get(tabId);

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    postMessage({ type: 'ws:error', tabId, error: 'Not connected' });
    return;
  }

  // Resolve environment variables in message data
  const vars = loadEnvVars(envId);
  const data = resolveEnvString(msg.data as string, vars);

  ws.send(data, (err) => {
    if (err) {
      postMessage({ type: 'ws:error', tabId, error: err.message });
    }
  });
}

/** Cleanup all connections (call on panel dispose) */
export function cleanupAllWsConnections() {
  for (const [, ws] of connections) {
    ws.removeAllListeners();
    ws.close();
  }
  connections.clear();
}
