/**
 * Socket.IO client handler — manages Socket.IO connections per tab.
 * Uses the socket.io-client library for protocol handshake, namespaces, and events.
 */
import { io, Socket } from 'socket.io-client';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import { insertHistory, trimHistory, getSetting } from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

// Track active Socket.IO connections by tabId
const connections = new Map<string, Socket>();

export function handleSocketIOConnect(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;
  const namespace = msg.namespace as string | undefined;
  const headers = msg.headers as { key: string; value: string }[] | undefined;

  // Resolve environment variables
  const vars = loadEnvVars(envId);
  const url = resolveEnvString(msg.url as string, vars);
  const resolvedNamespace = namespace ? resolveEnvString(namespace, vars) : '/';

  // Close existing connection for this tab
  cleanupSocketIOConnection(tabId);

  // Build extra headers
  const extraHeaders: Record<string, string> = {};
  if (headers) {
    for (const h of headers) {
      if (h.key) extraHeaders[resolveEnvString(h.key, vars)] = resolveEnvString(h.value, vars);
    }
  }

  try {
    const fullUrl = resolvedNamespace !== '/'
      ? `${url.replace(/\/$/, '')}${resolvedNamespace}`
      : url;

    const socket = io(fullUrl, {
      transports: ['websocket'],
      extraHeaders,
      reconnection: false, // We handle reconnection manually if needed
      timeout: 15000,
    });

    connections.set(tabId, socket);

    socket.on('connect', () => {
      postMessage({
        type: 'socketio:connected',
        tabId,
        socketId: socket.id,
        namespace: resolvedNamespace,
      });

      // Record in history
      try {
        insertHistory({
          method: 'SIO',
          url,
          protocol: 'websocket',
          request_data: JSON.stringify({
            authData: {
              rt_protocol: 'socketio',
              sio_namespace: resolvedNamespace || '/',
            },
            headers: headers || [],
          }),
        });
        const maxHistory = parseInt(getSetting('maxHistoryEntries') || '100', 10);
        trimHistory(maxHistory);
      } catch { /* ignore history errors */ }
    });

    socket.on('disconnect', (reason: string) => {
      postMessage({ type: 'socketio:disconnected', tabId, reason });
      connections.delete(tabId);
    });

    socket.on('connect_error', (err: Error) => {
      console.error('[Socket.IO Connect Error]', { tabId, error: err.message, stack: err.stack });
      postMessage({ type: 'socketio:error', tabId, error: err.message });
      connections.delete(tabId);
    });

    // Catch-all listener for all incoming events
    socket.onAny((eventName: string, ...args: unknown[]) => {
      postMessage({
        type: 'socketio:event',
        tabId,
        event: eventName,
        data: JSON.stringify(args.length === 1 ? args[0] : args),
        timestamp: Date.now(),
      });
    });
  } catch (err: any) {
    console.error('[Socket.IO Error]', { tabId, error: err.message, stack: err.stack });
    postMessage({ type: 'socketio:error', tabId, error: err.message || 'Failed to connect' });
  }
}

export function handleSocketIODisconnect(msg: Record<string, unknown>, postMessage?: PostMessage) {
  const tabId = msg.tabId as string;
  cleanupSocketIOConnection(tabId);
  postMessage?.({ type: 'socketio:disconnected', tabId, reason: 'User disconnected' });
}

export function handleSocketIOEmit(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const event = msg.event as string;
  const dataRaw = msg.data as string | undefined;
  const envId = msg.envId as string | undefined;

  const socket = connections.get(tabId);
  if (!socket || !socket.connected) {
    postMessage({ type: 'socketio:error', tabId, error: 'Not connected' });
    return;
  }

  // Resolve env vars in event name and data
  const vars = loadEnvVars(envId);
  const resolvedEvent = resolveEnvString(event, vars);

  let parsedData: unknown;
  if (dataRaw && dataRaw.trim()) {
    try {
      parsedData = JSON.parse(resolveEnvString(dataRaw, vars));
    } catch {
      // Send as plain string if not valid JSON
      parsedData = resolveEnvString(dataRaw, vars);
    }
  }

  if (parsedData !== undefined) {
    socket.emit(resolvedEvent, parsedData);
  } else {
    socket.emit(resolvedEvent);
  }

  // Notify webview of sent event
  postMessage({
    type: 'socketio:sent',
    tabId,
    event: resolvedEvent,
    data: dataRaw ? JSON.stringify(parsedData) : undefined,
    timestamp: Date.now(),
  });
}

/** Listen to a specific event on the socket */
export function handleSocketIOListen(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const event = msg.event as string;
  const envId = msg.envId as string | undefined;

  const socket = connections.get(tabId);
  if (!socket || !socket.connected) {
    postMessage({ type: 'socketio:error', tabId, error: 'Not connected' });
    return;
  }

  const vars = loadEnvVars(envId);
  const resolvedEvent = resolveEnvString(event, vars);

  // Note: onAny already catches all events, but explicit listeners
  // allow the user to see which events they're actively listening to
  postMessage({
    type: 'socketio:listening',
    tabId,
    event: resolvedEvent,
  });
}

function cleanupSocketIOConnection(tabId: string) {
  const socket = connections.get(tabId);
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    connections.delete(tabId);
  }
}

/** Cleanup all Socket.IO connections (call on panel dispose) */
export function cleanupAllSocketIOConnections() {
  for (const [, socket] of connections) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  connections.clear();
}
