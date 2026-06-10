/**
 * WebSocket Mock Server — Sprint 13.6-13.10 enhanced.
 * WS bidirectional state machine, message sequences, fault injection, rate limiting, record/playback stubs.
 */
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { MockServerConfig, WebSocketMockHandler, MockLogEntry } from './mock-types';
import { resolveAll } from '../services/variables';
import {
  pickSequenceItem, evaluateFault, checkRateLimit, getState, setState, sleep,
} from './mock-protocol-helpers';

export type LogCallback = (entry: MockLogEntry) => void;

export function createWebSocketServer(server: http.Server, config: MockServerConfig, getConfig: () => MockServerConfig, onLog?: LogCallback): WebSocketServer {
  const wss = new WebSocketServer({ server });
  let clientCounter = 0;

  wss.on('connection', (ws: WebSocket) => {
    const clientId = `client-${++clientCounter}`;
    const serverId = config.id;

    onLog?.({
      id: crypto.randomUUID(), timestamp: Date.now(), serverId,
      direction: 'incoming', protocol: 'websocket', event: 'connection', clientId,
    });

    // ── Connection handlers ──
    const currentConfig = getConfig();
    const connHandlers = (currentConfig.wsHandlers || []).filter(h => h.enabled && h.event === 'connection');
    for (const handler of connHandlers) {
      // Sprint 13.6: state machine gate — only fire if current state matches (or handler has no state gate)
      if (handler.stateMachineState) {
        const curState = getState(serverId, clientId);
        if (curState !== handler.stateMachineState) continue;
      }
      sendHandlerResponse(handler, ws, wss, serverId, clientId, onLog, 'connection').then(() => {
        if (handler.nextState) setState(serverId, clientId, handler.nextState);
      });
    }

    // ── Message handler ──
    ws.on('message', (data: Buffer | string) => {
      const message = data.toString();

      if (message.length > 1 * 1024 * 1024) {
        ws.send(JSON.stringify({ error: 'MESSAGE_TOO_LARGE', message: 'WebSocket message exceeds 1 MB limit' }));
        return;
      }

      const liveConfig = getConfig();
      const msgHandlers = (liveConfig.wsHandlers || []).filter(h => h.enabled && h.event === 'message');

      onLog?.({
        id: crypto.randomUUID(), timestamp: Date.now(), serverId,
        direction: 'incoming', protocol: 'websocket', event: 'message', body: message, clientId,
      });

      let matched = false;
      for (const handler of msgHandlers) {
        if (!matchesPattern(message, handler.matchPattern)) continue;

        // Sprint 13.6: state machine gate
        if (handler.stateMachineState) {
          if (getState(serverId, clientId) !== handler.stateMachineState) continue;
        }

        // Rate limit check (13.9)
        if (!checkRateLimit(handler.id, handler.rateLimit)) {
          ws.send(JSON.stringify({ error: 'RATE_LIMITED', retryAfterMs: handler.rateLimit?.windowMs }));
          matched = true;
          break;
        }

        matched = true;
        const nextState = handler.nextState;
        sendHandlerResponse(handler, ws, wss, serverId, clientId, onLog, 'message').then(() => {
          if (nextState) setState(serverId, clientId, nextState);
        });
        break; // first matching handler wins
      }

      if (!matched && msgHandlers.length === 0) {
        const echo = JSON.stringify({ echo: message, timestamp: Date.now() });
        ws.send(echo);
        onLog?.({ id: crypto.randomUUID(), timestamp: Date.now(), serverId, direction: 'outgoing', protocol: 'websocket', event: 'echo', body: echo, clientId });
      }
    });

    // ── Disconnect ──
    ws.on('close', () => {
      onLog?.({ id: crypto.randomUUID(), timestamp: Date.now(), serverId, direction: 'incoming', protocol: 'websocket', event: 'disconnect', clientId });
      const liveConfig = getConfig();
      const discHandlers = (liveConfig.wsHandlers || []).filter(h => h.enabled && h.event === 'disconnect');
      for (const h of discHandlers) {
        if (h.broadcast) wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(h.response); });
      }
    });
  });

  return wss;
}

async function sendHandlerResponse(
  handler: WebSocketMockHandler,
  ws: WebSocket,
  wss: WebSocketServer,
  serverId: string,
  clientId: string,
  onLog: LogCallback | undefined,
  event: string,
) {
  // Sprint 13.8: fault injection
  const fault = evaluateFault(handler.fault);
  if (fault.delayMs > 0) await sleep(fault.delayMs);

  if (fault.triggered && fault.errorMessage) {
    if (fault.errorMessage === 'Connection reset (fault injection)') {
      ws.close(1011, 'Fault injection: connection reset');
      return;
    }
    ws.send(JSON.stringify({ error: 'FAULT_INJECTED', message: fault.errorMessage }));
    return;
  }

  // Sprint 13.7: sequences
  const seqItem = handler.responses?.length
    ? pickSequenceItem(handler.id, handler.responses, handler.sequenceMode)
    : null;

  const body = seqItem?.body ?? resolveAll(handler.response);
  if (handler.delay > 0) await sleep(handler.delay);

  const send = (payload: string) => {
    if (handler.broadcast) {
      wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(payload); });
    } else {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
    onLog?.({
      id: crypto.randomUUID(), timestamp: Date.now(), serverId,
      direction: 'outgoing', protocol: 'websocket', event, body: payload, clientId,
    });
  };

  send(body);
}

function matchesPattern(message: string, pattern: string): boolean {
  if (!pattern || pattern === '*') return true;
  try {
    return new RegExp(pattern).test(message);
  } catch {
    return message === pattern;
  }
}
