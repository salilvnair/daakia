/**
 * MQTT Mock Broker - lightweight MQTT broker using aedes.
 * Supports subscribe/publish, QoS 0-2, retained messages, and auto-publish topics.
 * Uses WebSocket transport so clients connect via ws://localhost:PORT.
 */
import * as http from 'http';
import { WebSocketServer } from 'ws';
import { createWebSocketStream } from 'ws';
import { Aedes } from 'aedes';
import type { MockServerConfig, MQTTMockTopic, MockLogEntry } from './mock-types';
import { resolveAll } from '../services/variables';

export type LogCallback = (entry: MockLogEntry) => void;

interface MQTTBrokerInstance {
  aedes: Aedes;
  server: http.Server;
  wss: WebSocketServer;
  intervals: NodeJS.Timeout[];
}

const brokers = new Map<string, MQTTBrokerInstance>();

/**
 * Creates and starts an MQTT broker on the given port with WebSocket transport.
 * Returns the http.Server for the manager to track.
 */
export async function createMQTTBroker(
  config: MockServerConfig,
  getConfig: () => MockServerConfig,
  onLog?: LogCallback,
): Promise<http.Server> {
  const aedes = await Aedes.createBroker();
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('MQTT Mock Broker (WebSocket)');
  });
  const wss = new WebSocketServer({ server });
  const intervals: NodeJS.Timeout[] = [];

  // Pipe WebSocket connections to aedes
  wss.on('connection', (socket) => {
    const stream = createWebSocketStream(socket);
    (aedes as any).handle(stream);
  });

  // Track connected clients
  let clientCounter = 0;

  aedes.on('client', (client) => {
    clientCounter++;
    onLog?.({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      serverId: config.id,
      direction: 'incoming',
      protocol: 'mqtt',
      event: 'connect',
      clientId: client.id,
      body: `Client "${client.id}" connected`,
    });
  });

  aedes.on('clientDisconnect', (client) => {
    onLog?.({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      serverId: config.id,
      direction: 'incoming',
      protocol: 'mqtt',
      event: 'disconnect',
      clientId: client.id,
      body: `Client "${client.id}" disconnected`,
    });
  });

  aedes.on('subscribe', (subscriptions, client) => {
    for (const sub of subscriptions) {
      onLog?.({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        serverId: config.id,
        direction: 'incoming',
        protocol: 'mqtt',
        event: 'subscribe',
        clientId: client?.id || 'unknown',
        path: sub.topic,
        body: `Subscribed to "${sub.topic}" (QoS ${sub.qos})`,
      });
    }
  });

  aedes.on('publish', (packet, client) => {
    // Skip internal $SYS messages and messages from broker itself
    if (packet.topic.startsWith('$SYS') || !client) return;

    onLog?.({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      serverId: config.id,
      direction: 'incoming',
      protocol: 'mqtt',
      event: 'publish',
      clientId: client?.id || 'broker',
      path: packet.topic,
      body: packet.payload?.toString() || '',
    });
  });

  // ─── MQTT Topic validation (like Mosquitto / HiveMQ) ───
  // Reject publishes to invalid topics per MQTT spec §4.7
  (aedes as any).authorizePublish = (client: any, packet: any, callback: (err: Error | null) => void) => {
    const topic = packet.topic || '';
    const error = validateMqttTopic(topic, false);
    if (error) {
      onLog?.({
        id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
        direction: 'incoming', protocol: 'mqtt', event: 'publish_rejected',
        clientId: client?.id || 'unknown', path: topic,
        body: `Publish rejected: ${error}`,
      });
      callback(new Error(error));
    } else {
      callback(null);
    }
  };

  // Validate subscribe topic filters (wildcards allowed in subscriptions)
  (aedes as any).authorizeSubscribe = (client: any, sub: any, callback: (err: Error | null, sub: any) => void) => {
    const topic = sub?.topic || '';
    const error = validateMqttTopic(topic, true);
    if (error) {
      onLog?.({
        id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
        direction: 'incoming', protocol: 'mqtt', event: 'subscribe_rejected',
        clientId: client?.id || 'unknown', path: topic,
        body: `Subscribe rejected: ${error}`,
      });
      callback(new Error(error), sub);
    } else {
      callback(null, sub);
    }
  };

  // Set up auto-publish for configured topics
  const setupAutoPublish = () => {
    // Clear existing intervals
    intervals.forEach(i => clearInterval(i));
    intervals.length = 0;

    const currentConfig = getConfig();
    const topics = (currentConfig.mqttTopics || []).filter(t => t.enabled);

    for (const topic of topics) {
      // Publish retained message immediately if retain is true
      if (topic.retain) {
        publishTopic(aedes, topic, config.id, onLog);
      }

      // Set up interval publishing if intervalMs > 0
      if (topic.intervalMs > 0) {
        const interval = setInterval(() => {
          publishTopic(aedes, topic, config.id, onLog);
        }, topic.intervalMs);
        intervals.push(interval);
      }
    }
  };

  // Initial setup after server starts
  server.once('listening', () => {
    setupAutoPublish();
  });

  // Store broker instance
  brokers.set(config.id, { aedes, server, wss, intervals });

  return server;
}

function publishTopic(
  aedes: Aedes,
  topic: MQTTMockTopic,
  serverId: string,
  onLog?: LogCallback,
) {
  const payload = resolveAll(topic.payload || '');

  (aedes as any).publish(
    {
      topic: topic.topic,
      payload: Buffer.from(payload),
      qos: topic.qos,
      retain: topic.retain,
      cmd: 'publish',
      dup: false,
    },
    null,
    () => {
      onLog?.({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        serverId,
        direction: 'outgoing',
        protocol: 'mqtt',
        event: 'publish',
        clientId: 'broker',
        path: topic.topic,
        body: payload,
      });
    },
  );
}

/**
 * Cleanup MQTT broker resources for a given server ID.
 */
export function cleanupMQTTBroker(id: string): void {
  const broker = brokers.get(id);
  if (!broker) return;

  // Clear auto-publish intervals
  broker.intervals.forEach(i => clearInterval(i));
  broker.intervals.length = 0;

  // Close WebSocket server
  broker.wss.close();

  // Close aedes broker
  broker.aedes.close();
  brokers.delete(id);
}

/**
 * Validate MQTT topic per MQTT spec §4.7.
 * - Must not be empty
 * - Must not exceed 65535 bytes (UTF-8)
 * - Must not contain null character (U+0000)
 * - For publish (allowWildcards=false): must not contain # or +
 * - For subscribe (allowWildcards=true): # must be last char after /, + must occupy entire level
 */
function validateMqttTopic(topic: string, allowWildcards: boolean): string | undefined {
  if (!topic || topic.length === 0) {
    return 'Topic must not be empty';
  }

  if (Buffer.byteLength(topic, 'utf8') > 65535) {
    return 'Topic exceeds maximum length of 65535 bytes';
  }

  if (topic.includes('\u0000')) {
    return 'Topic must not contain null character (U+0000)';
  }

  if (!allowWildcards) {
    // Publish topics cannot contain wildcards
    if (topic.includes('#') || topic.includes('+')) {
      return 'Publish topic must not contain wildcard characters (# or +)';
    }
  } else {
    // Subscribe filter: validate wildcard usage
    const levels = topic.split('/');
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      // Multi-level wildcard # must be the last level and alone
      if (level.includes('#')) {
        if (i !== levels.length - 1 || level !== '#') {
          return 'Multi-level wildcard "#" must be the last character and occupy an entire topic level';
        }
      }
      // Single-level wildcard + must occupy entire level
      if (level.includes('+') && level !== '+') {
        return 'Single-level wildcard "+" must occupy an entire topic level (e.g., "sensor/+/temp")';
      }
    }
  }

  return undefined;
}
