/**
 * MQTT client handler — manages MQTT connections per tab.
 * Uses the mqtt.js library for MQTT over WebSocket (ws/wss) or TCP.
 */
import mqtt from 'mqtt';
import type { MqttClient, IClientOptions } from 'mqtt';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import { insertHistory, trimHistory, getSetting } from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

// Track active MQTT connections by tabId
const connections = new Map<string, MqttClient>();

export function handleMqttConnect(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
  refreshHistory?: () => void,
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;

  // Resolve environment variables
  const vars = loadEnvVars(envId);
  const url = resolveEnvString(msg.url as string, vars);
  const clientId = msg.clientId ? resolveEnvString(msg.clientId as string, vars) : `daakia_${Date.now()}`;
  const username = msg.username ? resolveEnvString(msg.username as string, vars) : undefined;
  const password = msg.password ? resolveEnvString(msg.password as string, vars) : undefined;
  const keepAlive = typeof msg.keepAlive === 'number' ? msg.keepAlive : 60;
  const cleanSession = msg.cleanSession !== false;

  // Last Will and Testament
  const lastWillTopic = msg.lastWillTopic ? resolveEnvString(msg.lastWillTopic as string, vars) : undefined;
  const lastWillMessage = msg.lastWillMessage ? resolveEnvString(msg.lastWillMessage as string, vars) : undefined;
  const lastWillQos = (msg.lastWillQos as 0 | 1 | 2) || 0;
  const lastWillRetain = msg.lastWillRetain === true;

  // Close existing connection for this tab
  cleanupMqttConnection(tabId);

  try {
    const options: IClientOptions = {
      clientId,
      username,
      password,
      keepalive: keepAlive as number,
      clean: cleanSession,
      reconnectPeriod: 0, // We handle reconnection manually
      connectTimeout: 15000,
    };

    // Add Last Will if configured
    if (lastWillTopic) {
      options.will = {
        topic: lastWillTopic,
        payload: Buffer.from(lastWillMessage || ''),
        qos: lastWillQos,
        retain: lastWillRetain,
      };
    }

    const client = mqtt.connect(url, options);
    connections.set(tabId, client);

    client.on('connect', () => {
      postMessage({
        type: 'mqtt:connected',
        tabId,
        clientId,
      });

      // Record in history
      try {
        insertHistory({
          method: 'MQTT',
          url,
          protocol: 'websocket',
          request_data: JSON.stringify({
            authData: {
              rt_protocol: 'mqtt',
              mqtt_clientId: clientId,
              mqtt_username: username || '',
              mqtt_password: password || '',
              mqtt_keepAlive: String(keepAlive),
              mqtt_cleanSession: String(cleanSession),
              mqtt_lastWillTopic: lastWillTopic || '',
              mqtt_lastWillMessage: lastWillMessage || '',
              mqtt_lastWillQos: String(lastWillQos),
              mqtt_lastWillRetain: String(lastWillRetain),
              mqtt_subscriptions: JSON.stringify(subscriptions || []),
              mqtt_pubTopic: (msg.pubTopic as string) || '',
              mqtt_pubPayload: (msg.pubPayload as string) || '',
              mqtt_pubQos: String(msg.pubQos ?? 0),
              mqtt_pubRetain: String(msg.pubRetain ?? false),
            },
          }),
        });
        const maxHistory = parseInt(getSetting('maxHistoryEntries') || '100', 10);
        trimHistory(maxHistory);
        if (refreshHistory) refreshHistory();
      } catch { /* ignore history errors */ }
    });

    client.on('message', (topic: string, payload: Buffer, packet) => {
      postMessage({
        type: 'mqtt:message',
        tabId,
        topic,
        payload: payload.toString(),
        qos: packet.qos,
        retain: packet.retain,
        timestamp: Date.now(),
      });
    });

    client.on('error', (err: Error) => {
      console.error('[MQTT Error]', { tabId, error: err.message, stack: err.stack });
      postMessage({ type: 'mqtt:error', tabId, error: err.message });
    });

    client.on('close', () => {
      postMessage({ type: 'mqtt:disconnected', tabId, reason: 'Connection closed' });
      connections.delete(tabId);
    });

    client.on('offline', () => {
      postMessage({ type: 'mqtt:disconnected', tabId, reason: 'Client went offline' });
    });

  } catch (err: any) {
    console.error('[MQTT Connect Error]', { tabId, error: err.message, stack: err.stack });
    postMessage({ type: 'mqtt:error', tabId, error: err.message || 'Failed to connect' });
  }
}

export function handleMqttDisconnect(msg: Record<string, unknown>) {
  const tabId = msg.tabId as string;
  cleanupMqttConnection(tabId);
}

export function handleMqttSubscribe(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const topic = msg.topic as string;
  const qos = (msg.qos as 0 | 1 | 2) || 0;

  const client = connections.get(tabId);
  if (!client || !client.connected) {
    postMessage({ type: 'mqtt:error', tabId, error: 'Not connected' });
    return;
  }

  client.subscribe(topic, { qos }, (err) => {
    if (err) {
      postMessage({ type: 'mqtt:error', tabId, error: `Subscribe failed: ${err.message}` });
    } else {
      postMessage({ type: 'mqtt:subscribed', tabId, topic, qos });
    }
  });
}

export function handleMqttUnsubscribe(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const topic = msg.topic as string;

  const client = connections.get(tabId);
  if (!client || !client.connected) {
    postMessage({ type: 'mqtt:error', tabId, error: 'Not connected' });
    return;
  }

  client.unsubscribe(topic, (err) => {
    if (err) {
      postMessage({ type: 'mqtt:error', tabId, error: `Unsubscribe failed: ${err.message}` });
    } else {
      postMessage({ type: 'mqtt:unsubscribed', tabId, topic });
    }
  });
}

export function handleMqttPublish(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const topic = msg.topic as string;
  const payload = msg.payload as string || '';
  const qos = (msg.qos as 0 | 1 | 2) || 0;
  const retain = msg.retain === true;

  const client = connections.get(tabId);
  if (!client || !client.connected) {
    postMessage({ type: 'mqtt:error', tabId, error: 'Not connected' });
    return;
  }

  client.publish(topic, payload, { qos, retain }, (err) => {
    if (err) {
      postMessage({ type: 'mqtt:error', tabId, error: `Publish failed: ${err.message}` });
    } else {
      postMessage({
        type: 'mqtt:published',
        tabId,
        topic,
        payload,
        qos,
        retain,
        timestamp: Date.now(),
      });
    }
  });
}

function cleanupMqttConnection(tabId: string) {
  const client = connections.get(tabId);
  if (client) {
    try { client.end(true); } catch { /* ignore */ }
    connections.delete(tabId);
  }
}

export function cleanupAllMqttConnections() {
  for (const [tabId] of connections) {
    cleanupMqttConnection(tabId);
  }
}
