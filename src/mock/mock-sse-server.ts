/**
 * SSE Mock Server - serves Server-Sent Events streams to connected clients.
 */
import * as http from 'http';
import * as crypto from 'crypto';
import type { MockServerConfig, SSEMockEvent, MockLogEntry } from './mock-types';
import { resolveAll } from '../services/variables';

export type LogCallback = (entry: MockLogEntry) => void;

interface SSEClient {
  id: string;
  res: http.ServerResponse;
  intervals: NodeJS.Timeout[];
}

const clients = new Map<string, SSEClient[]>();

export function createSSEHandler(config: MockServerConfig, getConfig: () => MockServerConfig, onLog?: LogCallback) {
  let clientCounter = 0;

  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      });
      res.end();
      return;
    }

    // Only handle GET requests to the SSE endpoint
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Method Not Allowed', message: `SSE only accepts GET requests, received ${req.method}` }));
      return;
    }

    // ─── Accept header validation (like real SSE endpoints) ───
    const accept = (req.headers['accept'] || '').toLowerCase();
    if (accept && !accept.includes('text/event-stream') && !accept.includes('*/*') && !accept.includes('text/*')) {
      res.writeHead(406, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        error: 'Not Acceptable',
        message: `SSE requires Accept: text/event-stream. Received: "${req.headers['accept']}"`,
      }));
      onLog?.({
        id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
        direction: 'incoming', protocol: 'sse', event: 'rejected',
        path: req.url || '/', body: `Rejected: bad Accept header: ${req.headers['accept']}`,
      });
      return;
    }

    const clientId = `sse-client-${++clientCounter}`;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Log connection
    onLog?.({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      serverId: config.id,
      direction: 'incoming',
      protocol: 'sse',
      event: 'connection',
      clientId,
      path: req.url || '/',
    });

    const client: SSEClient = { id: clientId, res, intervals: [] };

    // Store client
    if (!clients.has(config.id)) clients.set(config.id, []);
    clients.get(config.id)!.push(client);

    // Send initial comment to establish connection
    res.write(':ok\n\n');

    // Set up event emitters based on config
    const currentConfig = getConfig();
    const events = (currentConfig.sseEvents || []).filter(e => e.enabled);

    for (const evt of events) {
      const sendEvent = () => {
        if (res.destroyed) return;
        const resolvedData = resolveAll(evt.data);
        const lines: string[] = [];
        if (evt.eventName && evt.eventName !== 'message') {
          lines.push(`event: ${evt.eventName}`);
        }
        lines.push(`data: ${resolvedData}`);
        lines.push(`id: ${Date.now()}`);
        lines.push('');
        lines.push('');

        res.write(lines.join('\n'));

        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'outgoing',
          protocol: 'sse',
          event: evt.eventName || 'message',
          body: resolvedData,
          clientId,
        });
      };

      if (evt.repeat && evt.intervalMs > 0) {
        // Send after initial delay, then repeat
        const timeout = setTimeout(() => {
          sendEvent();
          const interval = setInterval(sendEvent, evt.intervalMs);
          client.intervals.push(interval);
        }, evt.delay);
        client.intervals.push(timeout as unknown as NodeJS.Timeout);
      } else {
        // Send once after delay
        const timeout = setTimeout(sendEvent, evt.delay);
        client.intervals.push(timeout as unknown as NodeJS.Timeout);
      }
    }

    // Handle client disconnect
    req.on('close', () => {
      // Clear all intervals
      for (const interval of client.intervals) {
        clearInterval(interval);
        clearTimeout(interval);
      }

      // Remove from clients list
      const serverClients = clients.get(config.id);
      if (serverClients) {
        const idx = serverClients.indexOf(client);
        if (idx !== -1) serverClients.splice(idx, 1);
      }

      onLog?.({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        serverId: config.id,
        direction: 'incoming',
        protocol: 'sse',
        event: 'disconnect',
        clientId,
      });
    });
  };
}

export function cleanupSSEClients(serverId: string) {
  const serverClients = clients.get(serverId);
  if (serverClients) {
    for (const client of serverClients) {
      for (const interval of client.intervals) {
        clearInterval(interval);
        clearTimeout(interval);
      }
      if (!client.res.destroyed) {
        client.res.end();
      }
    }
    clients.delete(serverId);
  }
}
