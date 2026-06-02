/**
 * Server-Sent Events (SSE) client handler — manages SSE connections per tab.
 * Uses Node's http/https to connect and parses the text/event-stream format.
 */
import http from 'http';
import https from 'https';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import { insertHistory, trimHistory, getSetting } from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

// Track active SSE connections by tabId
const connections = new Map<string, http.ClientRequest>();

export function handleSseConnect(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;
  const headers = msg.headers as { key: string; value: string }[] | undefined;

  // Resolve environment variables
  const vars = loadEnvVars(envId);
  const url = resolveEnvString(msg.url as string, vars);

  // Close existing connection for this tab
  cleanupSseConnection(tabId);

  // Build request headers
  const reqHeaders: Record<string, string> = {
    'Accept': 'text/event-stream',
    'Cache-Control': 'no-cache',
  };
  if (headers) {
    for (const h of headers) {
      if (h.key) reqHeaders[resolveEnvString(h.key, vars)] = resolveEnvString(h.value, vars);
    }
  }

  try {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const req = transport.get(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: reqHeaders,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          postMessage({ type: 'sse:error', tabId, error: `HTTP ${res.statusCode}: ${res.statusMessage}` });
          connections.delete(tabId);
          return;
        }

        postMessage({ type: 'sse:connected', tabId });

        // Record in history
        try {
          insertHistory({
            method: 'SSE',
            url,
            protocol: 'websocket',
            request_data: JSON.stringify({
              authData: {
                rt_protocol: 'sse',
                sse_eventType: (msg.eventType as string) || '',
              },
              headers: headers || [],
            }),
          });
          const maxHistory = parseInt(getSetting('maxHistoryEntries') || '100', 10);
          trimHistory(maxHistory);
        } catch { /* ignore history errors */ }

        // Parse SSE stream
        let buffer = '';
        let currentEvent = '';
        let currentData: string[] = [];
        let currentId = '';

        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete last line in buffer

          for (const line of lines) {
            if (line === '' || line === '\r') {
              // Empty line = dispatch event
              if (currentData.length > 0) {
                postMessage({
                  type: 'sse:event',
                  tabId,
                  event: currentEvent || 'message',
                  data: currentData.join('\n'),
                  id: currentId || undefined,
                  timestamp: Date.now(),
                });
              }
              // Reset
              currentEvent = '';
              currentData = [];
              currentId = '';
            } else {
              const cleaned = line.endsWith('\r') ? line.slice(0, -1) : line;
              // Parse field
              if (cleaned.startsWith(':')) {
                // Comment — ignore
              } else if (cleaned.startsWith('event:')) {
                currentEvent = cleaned.slice(6).trimStart();
              } else if (cleaned.startsWith('data:')) {
                currentData.push(cleaned.slice(5).trimStart());
              } else if (cleaned.startsWith('id:')) {
                currentId = cleaned.slice(3).trimStart();
              } else if (cleaned.startsWith('retry:')) {
                // Retry field — send to client for potential use
                const retry = parseInt(cleaned.slice(6).trim(), 10);
                if (!isNaN(retry)) {
                  postMessage({ type: 'sse:retry', tabId, retry });
                }
              } else if (cleaned.includes(':')) {
                // Unknown field with colon
                const colonIdx = cleaned.indexOf(':');
                const field = cleaned.slice(0, colonIdx);
                const value = cleaned.slice(colonIdx + 1).trimStart();
                if (field === 'data') currentData.push(value);
                else if (field === 'event') currentEvent = value;
                else if (field === 'id') currentId = value;
              }
            }
          }
        });

        res.on('end', () => {
          connections.delete(tabId);
          postMessage({ type: 'sse:disconnected', tabId });
        });

        res.on('error', (err: Error) => {
          connections.delete(tabId);
          if (userDisconnects.has(tabId)) {
            userDisconnects.delete(tabId);
            postMessage({ type: 'sse:disconnected', tabId });
          } else {
            console.error('[SSE Stream Error]', { tabId, error: err.message, stack: err.stack });
            postMessage({ type: 'sse:error', tabId, error: err.message });
          }
        });
      },
    );

    req.on('error', (err: Error) => {
      connections.delete(tabId);
      if (userDisconnects.has(tabId)) {
        userDisconnects.delete(tabId);
        postMessage({ type: 'sse:disconnected', tabId });
      } else {
        console.error('[SSE Connect Error]', { tabId, error: err.message, stack: err.stack });
        postMessage({ type: 'sse:error', tabId, error: err.message });
      }
    });

    connections.set(tabId, req);
  } catch (err: any) {
    console.error('[SSE Error]', { tabId, error: err.message, stack: err.stack });
    postMessage({ type: 'sse:error', tabId, error: err.message || 'Failed to connect' });
  }
}

export function handleSseDisconnect(msg: Record<string, unknown>) {
  const tabId = msg.tabId as string;
  userDisconnects.add(tabId);
  cleanupSseConnection(tabId);
}

// Track user-initiated disconnects to suppress "aborted" error
const userDisconnects = new Set<string>();

function cleanupSseConnection(tabId: string) {
  const req = connections.get(tabId);
  if (req) {
    req.destroy();
    connections.delete(tabId);
  }
}

/** Cleanup all SSE connections (call on panel dispose) */
export function cleanupAllSseConnections() {
  for (const [, req] of connections) {
    req.destroy();
  }
  connections.clear();
}
