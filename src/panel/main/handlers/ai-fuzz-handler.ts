/**
 * AI Request Fuzzer handler — runs fuzz payloads sequentially against an API endpoint.
 * Feature 4.6.4 — AI Request Fuzzer
 *
 * Receives a list of payloads from the webview, runs each one via HTTP,
 * and streams results back as fuzz:result messages.
 */
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

type PostMessage = (msg: unknown) => void;

interface FuzzPayloadItem {
  index: number;
  body: string;
  name: string;
}

interface KeyValueRow {
  key: string;
  value: string;
  enabled: boolean;
}

function buildHeaders(
  headers: KeyValueRow[],
  authType: string,
  authData: Record<string, string>,
  contentType: string,
): Record<string, string> {
  const result: Record<string, string> = {
    'Content-Type': contentType || 'application/json',
    'User-Agent': 'Daakia-Fuzzer/1.0',
  };

  // Auth headers
  if (authType === 'bearer' && authData.token) {
    result['Authorization'] = `Bearer ${authData.token}`;
  } else if (authType === 'basic' && authData.username) {
    const encoded = Buffer.from(`${authData.username}:${authData.password || ''}`).toString('base64');
    result['Authorization'] = `Basic ${encoded}`;
  } else if (authType === 'api-key' && authData.apiKeyName && authData.apiKeyValue) {
    result[authData.apiKeyName] = authData.apiKeyValue;
  }

  // Custom headers
  for (const h of headers) {
    if (h.enabled && h.key) {
      result[h.key] = h.value;
    }
  }

  return result;
}

async function runSingleFuzz(
  method: string,
  urlStr: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs = 8000,
): Promise<{ status: number; statusText: string; duration: number; responseBody: string }> {
  const t0 = Date.now();

  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      resolve({ status: 0, statusText: 'Invalid URL', duration: 0, responseBody: '' });
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const bodyBuffer = Buffer.from(body, 'utf8');

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: method.toUpperCase(),
      timeout: timeoutMs,
      headers: {
        ...headers,
        'Content-Length': bodyBuffer.length,
      },
      rejectUnauthorized: false,
    };

    const req = transport.request(options, (res) => {
      const status = res.statusCode ?? 0;
      const statusText = res.statusMessage ?? '';
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        if (Buffer.concat(chunks).length < 2048) chunks.push(chunk);
      });

      res.on('end', () => {
        const duration = Date.now() - t0;
        const responseBody = Buffer.concat(chunks).toString('utf8', 0, 2048);
        resolve({ status, statusText, duration, responseBody });
      });
    });

    req.on('timeout', () => { req.destroy(); resolve({ status: 0, statusText: 'Timeout', duration: timeoutMs, responseBody: '' }); });
    req.on('error', (err) => resolve({ status: 0, statusText: err.message, duration: Date.now() - t0, responseBody: '' }));

    req.write(bodyBuffer);
    req.end();
  });
}

export async function handleAiFuzz(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const runId = msg.runId as number;
  const method = msg.method as string;
  const urlStr = msg.url as string;
  const headers = msg.headers as KeyValueRow[] ?? [];
  const authType = msg.authType as string ?? 'none';
  const authData = msg.authData as Record<string, string> ?? {};
  const payloads = msg.payloads as FuzzPayloadItem[];

  const builtHeaders = buildHeaders(headers, authType, authData, 'application/json');

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    const result = await runSingleFuzz(method, urlStr, builtHeaders, payload.body);
    const isDone = i === payloads.length - 1;

    postMessage({
      type: 'fuzz:result',
      runId,
      index: payload.index,
      payload: { name: payload.name },
      status: result.status,
      statusText: result.statusText,
      duration: result.duration,
      body: result.responseBody,
      done: isDone,
    });
  }
}
