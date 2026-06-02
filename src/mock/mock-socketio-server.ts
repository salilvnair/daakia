/**
 * Socket.IO Mock Server - handles Socket.IO connections, event matching, and responses.
 * Uses socket.io server (peer of socket.io-client).
 */
import * as http from 'http';
import type { MockServerConfig, SocketIOMockHandler, MockLogEntry } from './mock-types';
import { resolveAll } from '../services/variables';

export type LogCallback = (entry: MockLogEntry) => void;

// We use the ws-based approach: Socket.IO protocol over raw WS
// Since we already have 'ws' as a dependency, we emulate Socket.IO protocol handshake
// For simplicity, we use a lightweight Socket.IO-compatible approach using 'ws'
import { WebSocketServer, WebSocket } from 'ws';

interface ConnectedClient {
  id: string;
  ws: WebSocket;
}

const serverClients = new Map<string, ConnectedClient[]>();

/**
 * Socket.IO uses Engine.IO under the hood. For mock purposes, we implement
 * the Socket.IO protocol v4 framing over WebSocket:
 * - 0: CONNECT
 * - 1: DISCONNECT
 * - 2: EVENT
 * - 3: ACK
 * - 4: ERROR
 * - 40: connect to namespace /
 */
export function createSocketIOServer(server: http.Server, config: MockServerConfig, getConfig: () => MockServerConfig, onLog?: LogCallback): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/socket.io/' });
  let clientCounter = 0;

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const clientId = `sio-client-${++clientCounter}`;
    const socketId = generateSocketId();

    // Store client
    if (!serverClients.has(config.id)) serverClients.set(config.id, []);
    serverClients.get(config.id)!.push({ id: clientId, ws });

    // Engine.IO open handshake
    ws.send(JSON.stringify({
      type: 'open',
      data: { sid: socketId, upgrades: [], pingInterval: 25000, pingTimeout: 20000 }
    }));

    // Socket.IO connect acknowledgement (namespace /)
    ws.send('40' + JSON.stringify({ sid: socketId }));

    onLog?.({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      serverId: config.id,
      direction: 'incoming',
      protocol: 'socketio',
      event: 'connection',
      clientId,
    });

    // Fire connection handlers
    const currentConfig = getConfig();
    const connHandlers = (currentConfig.socketioHandlers || []).filter(h => h.enabled && h.event === 'connection');
    for (const handler of connHandlers) {
      const send = () => {
        const resolved = resolveAll(handler.response);
        const packet = `42${JSON.stringify([handler.emitEvent, safeJsonParse(resolved)])}`;
        if (handler.broadcast) {
          const clients = serverClients.get(config.id) || [];
          clients.forEach(c => { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(packet); });
        } else {
          ws.send(packet);
        }

        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'outgoing',
          protocol: 'socketio',
          event: handler.emitEvent,
          body: resolved,
          clientId,
        });
      };
      if (handler.delay > 0) setTimeout(send, handler.delay);
      else send();
    }

    ws.on('message', (data: Buffer | string) => {
      const message = data.toString();

      // Engine.IO ping/pong
      if (message === '2') { ws.send('3'); return; }
      if (message === '3') return;

      // ─── Socket.IO protocol validation ───
      // Valid Socket.IO packet types: 0=CONNECT, 1=DISCONNECT, 2=EVENT, 3=ACK, 4=ERROR, 5=BINARY_EVENT, 6=BINARY_ACK
      const packetType = message.charAt(0);
      const validTypes = ['0', '1', '2', '3', '4', '5', '6'];
      if (!validTypes.includes(packetType)) {
        const errorPacket = `44${JSON.stringify({ message: `Invalid Socket.IO packet type "${packetType}". Expected 0-6.` })}`;
        ws.send(errorPacket);
        onLog?.({
          id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
          direction: 'outgoing', protocol: 'socketio', event: 'error',
          body: `Invalid packet type: ${packetType}`, clientId,
        });
        return;
      }

      // Socket.IO EVENT packet: 42["eventName", data]
      if (message.startsWith('42')) {
        let payload: any;
        try {
          payload = JSON.parse(message.slice(2));
        } catch {
          // ─── Malformed EVENT packet — payload not valid JSON ───
          const errorPacket = `44${JSON.stringify({ message: 'Malformed EVENT packet: payload is not valid JSON. Expected format: 42["eventName", data]' })}`;
          ws.send(errorPacket);
          onLog?.({
            id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
            direction: 'outgoing', protocol: 'socketio', event: 'error',
            body: `Malformed packet: ${message.slice(0, 100)}`, clientId,
          });
          return;
        }

        // ─── EVENT payload must be an array: ["eventName", ...args] ───
        if (!Array.isArray(payload) || payload.length === 0 || typeof payload[0] !== 'string') {
          const errorPacket = `44${JSON.stringify({ message: 'Invalid EVENT payload: must be ["eventName", ...args] where eventName is a string' })}`;
          ws.send(errorPacket);
          onLog?.({
            id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
            direction: 'outgoing', protocol: 'socketio', event: 'error',
            body: `Invalid payload structure: ${JSON.stringify(payload).slice(0, 100)}`, clientId,
          });
          return;
        }

        const [eventName, eventData] = payload;

          onLog?.({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            serverId: config.id,
            direction: 'incoming',
            protocol: 'socketio',
            event: eventName,
            body: eventData !== undefined ? JSON.stringify(eventData) : undefined,
            clientId,
          });

          // Match handlers
          const liveConfig = getConfig();
          const msgHandlers = (liveConfig.socketioHandlers || []).filter(
            h => h.enabled && h.event === 'message' && h.listenEvent === eventName
          );

          for (const handler of msgHandlers) {
            const send = () => {
              const resolved = resolveAll(handler.response);
              const packet = `42${JSON.stringify([handler.emitEvent, safeJsonParse(resolved)])}`;
              if (handler.broadcast) {
                const clients = serverClients.get(config.id) || [];
                clients.forEach(c => { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(packet); });
              } else {
                ws.send(packet);
              }

              onLog?.({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                serverId: config.id,
                direction: 'outgoing',
                protocol: 'socketio',
                event: handler.emitEvent,
                body: resolved,
                clientId,
              });
            };
            if (handler.delay > 0) setTimeout(send, handler.delay);
            else send();
          }
      }
    });

    ws.on('close', () => {
      // Fire disconnect handlers
      const liveConfig = getConfig();
      const dcHandlers = (liveConfig.socketioHandlers || []).filter(h => h.enabled && h.event === 'disconnect');
      for (const handler of dcHandlers) {
        const clients = serverClients.get(config.id) || [];
        const resolved = resolveAll(handler.response);
        const packet = `42${JSON.stringify([handler.emitEvent, safeJsonParse(resolved)])}`;
        clients.forEach(c => {
          if (c.ws.readyState === WebSocket.OPEN && c.id !== clientId) c.ws.send(packet);
        });
      }

      // Remove client
      const clients = serverClients.get(config.id);
      if (clients) {
        const idx = clients.findIndex(c => c.id === clientId);
        if (idx !== -1) clients.splice(idx, 1);
      }

      onLog?.({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        serverId: config.id,
        direction: 'incoming',
        protocol: 'socketio',
        event: 'disconnect',
        clientId,
      });
    });
  });

  // Also handle Engine.IO polling (GET /socket.io/?EIO=4&transport=polling)
  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.url?.startsWith('/socket.io/') && req.url.includes('transport=polling')) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({
        sid: generateSocketId(),
        upgrades: ['websocket'],
        pingInterval: 25000,
        pingTimeout: 20000,
      }));
    }
  });

  return wss;
}

export function cleanupSocketIOClients(serverId: string) {
  const clients = serverClients.get(serverId);
  if (clients) {
    clients.forEach(c => {
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.send('41'); // Socket.IO disconnect packet
        c.ws.close();
      }
    });
    serverClients.delete(serverId);
  }
}

function generateSocketId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
