/** Realtime (WS/SSE/Socket.IO/MQTT) DevTools logging messages. Extracted verbatim from the App message handler. */
import { useTabsStore } from '../../store/tabs-store';
import { useDevToolsStore } from '../../store/devtools-store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleRealtimeMessages(msg: any): boolean {
  switch (msg.type as string) {
        // ─── Realtime Protocol DevTools Logging ───────────────────────────
        case 'ws:connected':
        case 'ws:disconnected':
        case 'ws:message':
        case 'ws:error':
        case 'sse:connected':
        case 'sse:disconnected':
        case 'sse:event':
        case 'sse:error':
        case 'socketio:connected':
        case 'socketio:disconnected':
        case 'socketio:event':
        case 'socketio:sent':
        case 'socketio:error':
        case 'mqtt:connected':
        case 'mqtt:disconnected':
        case 'mqtt:message':
        case 'mqtt:published':
        case 'mqtt:subscribed':
        case 'mqtt:error': {
          const rtTab = useTabsStore.getState().tabs.find(t => t.id === msg.tabId);
          const rtName = rtTab?.url || rtTab?.name || msg.tabId || 'Realtime';
          const [, protocol, action] = msg.type.match(/^(\w+):(.+)$/) || [];
          const proto = (protocol || '').toUpperCase();
          let level: 'info' | 'error' | 'warn' | 'log' = 'info';
          let logArgs: unknown[] = [];

          switch (msg.type) {
            case 'ws:connected':
              logArgs = [`[WS] ✓ Connected`];
              break;
            case 'ws:disconnected':
              logArgs = [`[WS] ✕ Disconnected`, msg.reason || ''];
              break;
            case 'ws:message':
              logArgs = [`[WS] ⬇ Received`, msg.data || ''];
              break;
            case 'ws:error':
              level = 'error';
              logArgs = [`[WS] ✕ Error`, msg.error || ''];
              break;
            case 'sse:connected':
              logArgs = [`[SSE] ✓ Connected`];
              break;
            case 'sse:disconnected':
              logArgs = [`[SSE] ✕ Disconnected`, msg.reason || ''];
              break;
            case 'sse:event':
              logArgs = [`[SSE] ⬇ Event: ${msg.event || 'message'}`, msg.data || ''];
              break;
            case 'sse:error':
              level = 'error';
              logArgs = [`[SSE] ✕ Error`, msg.error || ''];
              break;
            case 'socketio:connected':
              logArgs = [`[SIO] ✓ Connected`];
              break;
            case 'socketio:disconnected':
              logArgs = [`[SIO] ✕ Disconnected`, msg.reason || ''];
              break;
            case 'socketio:event':
              logArgs = [`[SIO] ⬇ Event: ${msg.event || ''}`, msg.data || ''];
              break;
            case 'socketio:sent':
              logArgs = [`[SIO] ⬆ Emit: ${msg.event || ''}`, msg.data || ''];
              break;
            case 'socketio:error':
              level = 'error';
              logArgs = [`[SIO] ✕ Error`, msg.error || ''];
              break;
            case 'mqtt:connected':
              logArgs = [`[MQTT] ✓ Connected`];
              break;
            case 'mqtt:disconnected':
              logArgs = [`[MQTT] ✕ Disconnected`, msg.reason || ''];
              break;
            case 'mqtt:message':
              logArgs = [`[MQTT] ⬇ ${msg.topic || ''}`, msg.payload || ''];
              break;
            case 'mqtt:published':
              logArgs = [`[MQTT] ⬆ Published: ${msg.topic || ''}`, msg.payload || ''];
              break;
            case 'mqtt:subscribed':
              logArgs = [`[MQTT] ✓ Subscribed: ${msg.topic || ''}`];
              break;
            case 'mqtt:error':
              level = 'error';
              logArgs = [`[MQTT] ✕ Error`, msg.error || ''];
              break;
            default:
              logArgs = [`[${proto}] ${action}`, JSON.stringify(msg)];
          }

          useDevToolsStore.getState().addLog({
            level,
            args: logArgs.filter(a => a !== ''),
            timestamp: Date.now(),
            requestName: rtName,
            scriptPhase: protocol,
          });
          break;
        }
    default:
      return false;
  }
  return true;
}
