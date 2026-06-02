/**
 * WebSocket Mock Server - handles WS connections, message pattern matching, broadcasts.
 */
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { MockServerConfig, WebSocketMockHandler, MockLogEntry } from './mock-types';
import { resolveAll } from '../services/variables';

export type LogCallback = (entry: MockLogEntry) => void;

export function createWebSocketServer(server: http.Server, config: MockServerConfig, getConfig: () => MockServerConfig, onLog?: LogCallback): WebSocketServer {
  const wss = new WebSocketServer({ server });
  let clientCounter = 0;

  wss.on('connection', (ws: WebSocket) => {
    const clientId = `client-${++clientCounter}`;
    const currentConfig = getConfig();
    const handlers = currentConfig.wsHandlers;

    // Log connection
    onLog?.({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      serverId: config.id,
      direction: 'incoming',
      protocol: 'websocket',
      event: 'connection',
      clientId,
    });

    // Fire connection handlers
    const connHandlers = (handlers || []).filter(h => h.enabled && h.event === 'connection');
    for (const handler of connHandlers) {
      const send = () => {
        const resolved = resolveAll(handler.response);
        if (handler.broadcast) {
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(resolved);
          });
        } else {
          ws.send(resolved);
        }

        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'outgoing',
          protocol: 'websocket',
          event: 'connection',
          body: resolved,
          clientId,
        });
      };
      if (handler.delay > 0) setTimeout(send, handler.delay);
      else send();
    }

    // Message handlers
    ws.on('message', (data: Buffer | string) => {
      const message = data.toString();

      // ─── Frame size validation (1 MB max per message) ───
      if (message.length > 1 * 1024 * 1024) {
        const errorResponse = JSON.stringify({
          error: 'MESSAGE_TOO_LARGE',
          message: 'WebSocket message exceeds 1 MB limit',
          maxSize: '1 MB',
        });
        ws.send(errorResponse);
        onLog?.({
          id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
          direction: 'outgoing', protocol: 'websocket', event: 'error',
          body: errorResponse, clientId,
        });
        return;
      }

      const liveConfig = getConfig();
      const liveHandlers = liveConfig.wsHandlers;

      // Log incoming message
      onLog?.({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        serverId: config.id,
        direction: 'incoming',
        protocol: 'websocket',
        event: 'message',
        body: message,
        clientId,
      });

      const msgHandlers = (liveHandlers || []).filter(h => h.enabled && h.event === 'message');

      // ─── JSON validation: if ANY handler has jsonValidate flag or pattern looks like JSON key match ───
      const expectsJson = msgHandlers.some(h => (h as any).jsonValidate || (h.matchPattern && h.matchPattern.startsWith('{')));
      if (expectsJson && message.trim().startsWith('{')) {
        try {
          JSON.parse(message);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : 'Invalid JSON';
          const errorResponse = JSON.stringify({
            error: 'INVALID_JSON',
            message: `Malformed JSON message: ${errMsg}`,
          });
          ws.send(errorResponse);
          onLog?.({
            id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
            direction: 'outgoing', protocol: 'websocket', event: 'error',
            body: errorResponse, clientId,
          });
          return;
        }
      }

      let matched = false;
      for (const handler of msgHandlers) {
        if (matchesPattern(message, handler.matchPattern)) {
          matched = true;
          const send = () => {
            const resolved = resolveAll(handler.response);
            if (handler.broadcast) {
              wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(resolved);
              });
            } else {
              ws.send(resolved);
            }

            onLog?.({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              serverId: config.id,
              direction: 'outgoing',
              protocol: 'websocket',
              event: 'message',
              body: resolved,
              clientId,
            });
          };
          if (handler.delay > 0) setTimeout(send, handler.delay);
          else send();
        }
      }

      // Default echo if no handler matched
      if (!matched && msgHandlers.length === 0) {
        const echoResponse = JSON.stringify({ echo: message, timestamp: Date.now() });
        ws.send(echoResponse);

        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'outgoing',
          protocol: 'websocket',
          event: 'echo',
          body: echoResponse,
          clientId,
        });
      }
    });

    // Disconnect handlers
    ws.on('close', () => {
      onLog?.({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        serverId: config.id,
        direction: 'incoming',
        protocol: 'websocket',
        event: 'disconnect',
        clientId,
      });

      const liveConfig = getConfig();
      const liveHandlers = liveConfig.wsHandlers;
      const disconnectHandlers = (liveHandlers || []).filter(h => h.enabled && h.event === 'disconnect');
      for (const handler of disconnectHandlers) {
        if (handler.broadcast) {
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(handler.response);
          });
        }
      }
    });
  });

  return wss;
}

function matchesPattern(message: string, pattern: string): boolean {
  if (!pattern || pattern === '*') return true;
  try {
    const regex = new RegExp(pattern);
    return regex.test(message);
  } catch {
    return message === pattern;
  }
}
