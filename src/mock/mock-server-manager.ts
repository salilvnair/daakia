/**
 * Mock Server Manager - orchestrates REST/GraphQL/WebSocket/SSE/Socket.IO mock servers.
 * Delegates protocol-specific logic to separate modules.
 */
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';
import { WebSocketServer } from 'ws';
import type { MockServerConfig, MockRoute, GraphQLMockOperation, WebSocketMockHandler, SSEMockEvent, SocketIOMockHandler, MQTTMockTopic, MockLogEntry, SoapMockOperation, GrpcMockMethod } from './mock-types';
import { createHttpServer } from './mock-http-server';
import { createGraphQLServer } from './mock-graphql-server';
import { createWebSocketServer } from './mock-ws-server';
import { createSSEHandler, cleanupSSEClients } from './mock-sse-server';
import { createSocketIOServer, cleanupSocketIOClients } from './mock-socketio-server';
import { createMQTTBroker, cleanupMQTTBroker } from './mock-mqtt-server';
import { createGrpcServer, cleanupGrpcServer } from './mock-grpc-server';
import { createSoapServer } from './mock-soap-server';
import { createAiServer } from './mock-ai-server';
import { createMcpServer } from './mock-mcp-server';

// Re-export types for external consumers
export type { MockServerConfig, MockRoute, GraphQLMockOperation, WebSocketMockHandler, SSEMockEvent, SocketIOMockHandler, MQTTMockTopic, MockLogEntry, HttpMethod, MockServerProtocol, AiMockScenario, McpMockTool } from './mock-types';

// ---------- Internal State ----------

interface RunningServer {
  config: MockServerConfig;
  server: http.Server;
  wss?: WebSocketServer;
  port: number;
}

const _servers = new Map<string, RunningServer>();
let _portMin = 8000;
let _portMax = 9000;
let _storagePath = '';
let _logCallback: ((entry: MockLogEntry) => void) | undefined;

// ---------- Init ----------

export function initMockServerManager(extensionPath: string, portMin?: number, portMax?: number) {
  _storagePath = path.join(os.homedir(), '.salilvnair', 'daakia-vsce', 'mock-servers.json');
  if (portMin !== undefined) _portMin = portMin;
  if (portMax !== undefined) _portMax = portMax;

  const dir = path.dirname(_storagePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function setPortRange(min: number, max: number) {
  _portMin = min;
  _portMax = max;
}

export function getPortRange(): { min: number; max: number } {
  return { min: _portMin, max: _portMax };
}

export function setLogCallback(cb: (entry: MockLogEntry) => void) {
  _logCallback = cb;
}

// ---------- Port Finding ----------

async function findFreePort(): Promise<number> {
  for (let port = _portMin; port <= _portMax; port++) {
    const free = await isPortFree(port);
    if (free) return port;
  }
  throw new Error(`No free port found in range ${_portMin}-${_portMax}`);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, '127.0.0.1');
  });
}

// ---------- Start / Stop ----------

export async function startMockServer(config: MockServerConfig): Promise<{ port: number }> {
  if (_servers.has(config.id)) {
    await stopMockServer(config.id);
  }

  const port = await findFreePort();
  const protocol = config.protocol || 'rest';

  // Helper to get latest config for hot-reload
  const getConfig = () => {
    const running = _servers.get(config.id);
    return running ? running.config : config;
  };

  let server: http.Server;
  let wss: WebSocketServer | undefined;

  if (protocol === 'graphql') {
    server = createGraphQLServer(config, getConfig, _logCallback);
  } else if (protocol === 'websocket') {
    server = http.createServer((_req, res) => {
      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('Upgrade required - this is a WebSocket server');
    });
    wss = createWebSocketServer(server, config, getConfig, _logCallback);
  } else if (protocol === 'sse') {
    const sseHandler = createSSEHandler(config, getConfig, _logCallback);
    server = http.createServer((req, res) => {
      // CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        });
        res.end();
        return;
      }
      sseHandler(req, res);
    });
  } else if (protocol === 'socketio') {
    server = http.createServer((_req, res) => {
      // Handle Engine.IO transport negotiation
      if (_req.url?.startsWith('/socket.io/')) {
        const url = new URL(_req.url, `http://localhost`);
        const transport = url.searchParams.get('transport');

        // CORS headers for all Socket.IO requests
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (transport === 'polling') {
          // Return Engine.IO open packet to satisfy polling handshake, then client upgrades to WS
          const sid = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
          const payload = JSON.stringify({ sid, upgrades: ['websocket'], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 });
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=UTF-8' });
          res.end(`0${payload}`);
          return;
        }
        if (transport === 'websocket') {
          // WebSocket transport — the upgrade will be handled by the WebSocketServer
          // Return 200 with empty body; browser/WS client proceeds with upgrade
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('');
          return;
        }
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Socket.IO Mock Server');
    });
    wss = createSocketIOServer(server, config, getConfig, _logCallback);
  } else if (protocol === 'mqtt') {
    // MQTT uses WebSocket transport via aedes + ws
    server = await createMQTTBroker(config, getConfig, _logCallback);
  } else if (protocol === 'grpc') {
    server = await createGrpcServer(config, getConfig, _logCallback, port);
  } else if (protocol === 'soap') {
    server = createSoapServer(config, getConfig, _logCallback);
  } else if (protocol === 'ai') {
    server = createAiServer(config, _logCallback);
  } else if (protocol === 'mcp') {
    server = createMcpServer(config, _logCallback);
  } else {
    server = createHttpServer(config, getConfig, _logCallback);
  }

  return new Promise((resolve, reject) => {
    server.once('error', (err) => reject(err));
    server.listen(port, '127.0.0.1', () => {
      // Store the actual port on the config so getConfig() returns it (used by WSDL generation)
      config.port = port;
      _servers.set(config.id, { config, server, wss, port });
      resolve({ port });
    });
  });
}

export async function stopMockServer(id: string): Promise<void> {
  const running = _servers.get(id);
  if (!running) return;

  return new Promise((resolve) => {
    if (running.wss) {
      running.wss.clients.forEach(client => client.close());
      running.wss.close();
    }
    // Cleanup protocol-specific resources
    if (running.config.protocol === 'sse') cleanupSSEClients(id);
    if (running.config.protocol === 'socketio') cleanupSocketIOClients(id);
    if (running.config.protocol === 'mqtt') cleanupMQTTBroker(id);
    if (running.config.protocol === 'grpc') cleanupGrpcServer(id);
    running.server.close(() => {
      _servers.delete(id);
      // Do NOT call saveState() here — it only saves running servers,
      // which would delete stopped server configs from disk.
      // Config persistence is handled by webview via saveConfigs().
      resolve();
    });
    running.server.closeAllConnections?.();
  });
}

export async function stopAllMockServers(): Promise<void> {
  const ids = [..._servers.keys()];
  await Promise.all(ids.map(id => stopMockServer(id)));
}

export function getRunningServers(): Array<{ id: string; name: string; port: number; protocol: string }> {
  return [..._servers.values()].map(s => ({
    id: s.config.id,
    name: s.config.name,
    port: s.port,
    protocol: s.config.protocol || 'rest',
  }));
}

// ---------- Live Updates ----------

export function updateMockServerRoutes(id: string, routes: MockRoute[]): void {
  const running = _servers.get(id);
  if (!running) return;
  running.config.routes = routes;
}

export function updateMockServerGraphQLOps(id: string, operations: GraphQLMockOperation[]): void {
  const running = _servers.get(id);
  if (!running) return;
  running.config.graphqlOperations = operations;
}

export function updateMockServerGraphQLSchema(id: string, schema: string): void {
  const running = _servers.get(id);
  if (!running) return;
  running.config.graphqlSchema = schema;
}

export function updateMockServerWsHandlers(id: string, handlers: WebSocketMockHandler[]): void {
  const running = _servers.get(id);
  if (!running) return;
  running.config.wsHandlers = handlers;
}

export function updateMockServerSSEEvents(id: string, events: SSEMockEvent[]): void {
  const running = _servers.get(id);
  if (!running) return;
  running.config.sseEvents = events;
}

export function updateMockServerSocketIOHandlers(id: string, handlers: SocketIOMockHandler[]): void {
  const running = _servers.get(id);
  if (!running) return;
  running.config.socketioHandlers = handlers;
}

export function updateMockServerMQTTTopics(id: string, topics: MQTTMockTopic[]): void {
  const running = _servers.get(id);
  if (!running) return;
  running.config.mqttTopics = topics;
}

export function updateMockServerSoapOps(id: string, operations: SoapMockOperation[]): void {
  const running = _servers.get(id);
  if (!running) return;
  running.config.soapOperations = operations;
}

export function updateMockServerGrpcMethods(id: string, methods: GrpcMockMethod[]): void {
  const running = _servers.get(id);
  if (!running) return;
  running.config.grpcMethods = methods;
}

// ---------- Persistence ----------

interface StoredState {
  portRange: { min: number; max: number };
  servers: MockServerConfig[];
}

export function loadSavedConfigs(): MockServerConfig[] {
  if (!_storagePath) return [];
  try {
    if (fs.existsSync(_storagePath)) {
      const raw = fs.readFileSync(_storagePath, 'utf-8');
      const state: StoredState = JSON.parse(raw);
      if (state.portRange) {
        _portMin = state.portRange.min;
        _portMax = state.portRange.max;
      }
      return state.servers || [];
    }
  } catch {
    // Corrupted file - ignore
  }
  return [];
}

export function saveConfigs(configs: MockServerConfig[]): void {
  if (!_storagePath) return;
  const state: StoredState = {
    portRange: { min: _portMin, max: _portMax },
    servers: configs,
  };
  try {
    fs.writeFileSync(_storagePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Silently fail
  }
}
