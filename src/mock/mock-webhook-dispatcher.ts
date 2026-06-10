/**
 * mock-webhook-dispatcher.ts — Sprint 13.32 webhook callbacks.
 * Fires an HTTP POST to a configured URL when a WS/GQL/MQTT/SSE/SIO mock handler fires.
 * Supports configurable delay, retry (up to 3 attempts), and auth header.
 */
import * as https from 'https';
import * as http from 'http';

export interface WebhookConfig {
  /** Destination URL for the POST callback */
  url: string;
  /** ms to wait before firing (default 0) */
  delayMs?: number;
  /** Number of retry attempts on failure (default 1, max 3) */
  retries?: number;
  /** ms between retries (default 1000) */
  retryDelayMs?: number;
  /** Authorization header value (e.g. "Bearer token123") */
  authHeader?: string;
  /** Extra headers to include in the POST */
  headers?: Record<string, string>;
}

export interface WebhookPayload {
  serverId: string;
  protocol: string;
  event: string;
  clientId?: string;
  topic?: string;
  body?: string;
  timestamp: number;
}

/**
 * Dispatch a webhook POST. Fires asynchronously — does not block the caller.
 * Retries up to `config.retries` times with `config.retryDelayMs` delay.
 */
export function dispatchWebhook(config: WebhookConfig, payload: WebhookPayload): void {
  const delay = config.delayMs ?? 0;
  setTimeout(() => fire(config, payload, config.retries ?? 1), delay);
}

async function fire(config: WebhookConfig, payload: WebhookPayload, attemptsLeft: number): Promise<void> {
  try {
    await postJson(config, payload);
  } catch {
    if (attemptsLeft > 1) {
      setTimeout(() => fire(config, payload, attemptsLeft - 1), config.retryDelayMs ?? 1000);
    }
  }
}

function postJson(config: WebhookConfig, payload: WebhookPayload): Promise<void> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(config.url);
    } catch {
      reject(new Error(`Invalid webhook URL: ${config.url}`));
      return;
    }

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body)),
      'X-Daakia-Webhook': '1',
      ...config.headers,
    };
    if (config.authHeader) headers['Authorization'] = config.authHeader;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers,
    };

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      res.resume(); // drain
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`Webhook responded ${res.statusCode}`));
      }
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Webhook timeout')); });
    req.write(body);
    req.end();
  });
}
