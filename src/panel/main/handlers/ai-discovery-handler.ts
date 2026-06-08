/**
 * AI API Discovery handler — probes common API paths to discover available endpoints.
 * Feature 4.6.1 — AI API Discovery (URL Crawler)
 */
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

type PostMessage = (msg: unknown) => void;

/** Common paths to probe, in approximate priority order */
const COMMON_PATHS = [
  '/',
  '/health',
  '/healthz',
  '/health/check',
  '/ping',
  '/status',
  '/api',
  '/api/v1',
  '/api/v2',
  '/api/v3',
  '/v1',
  '/v2',
  '/v3',
  '/docs',
  '/swagger',
  '/swagger-ui',
  '/swagger.json',
  '/openapi.json',
  '/openapi.yaml',
  '/api-docs',
  '/api/docs',
  '/redoc',
  '/users',
  '/api/users',
  '/api/v1/users',
  '/accounts',
  '/api/accounts',
  '/auth',
  '/api/auth',
  '/login',
  '/api/login',
  '/register',
  '/api/register',
  '/products',
  '/api/products',
  '/api/v1/products',
  '/items',
  '/api/items',
  '/orders',
  '/api/orders',
  '/api/v1/orders',
  '/payments',
  '/api/payments',
  '/posts',
  '/api/posts',
  '/comments',
  '/api/comments',
  '/messages',
  '/api/messages',
  '/notifications',
  '/api/notifications',
  '/settings',
  '/api/settings',
  '/admin',
  '/api/admin',
  '/metrics',
  '/api/metrics',
  '/events',
  '/api/events',
  '/search',
  '/api/search',
  '/upload',
  '/api/upload',
  '/files',
  '/api/files',
  '/images',
  '/api/images',
  '/categories',
  '/api/categories',
  '/tags',
  '/api/tags',
  '/profile',
  '/api/profile',
  '/me',
  '/api/me',
  '/token',
  '/api/token',
  '/refresh',
  '/api/refresh',
  '/graphql',
  '/api/graphql',
  '/ws',
  '/websocket',
  '/feed',
  '/api/feed',
  '/dashboard',
  '/api/dashboard',
];

export interface ProbeResult {
  path: string;
  url: string;
  status: number;
  statusText: string;
  contentType: string;
  responseSize: number;
  duration: number;
  snippet: string;  // first 200 chars of body
  isApi: boolean;   // heuristic: JSON/XML content type AND 2xx/3xx/4xx (not 5xx or unreachable)
  error?: string;
}

/** Probe a single URL, returns result */
async function probeUrl(targetUrl: string, timeoutMs: number): Promise<ProbeResult> {
  const t0 = Date.now();
  const parsed = new URL(targetUrl);
  const isHttps = parsed.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise<ProbeResult>((resolve) => {
    const path = parsed.pathname + parsed.search;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path,
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        'Accept': 'application/json, application/xml, text/plain, */*',
        'User-Agent': 'Daakia-API-Discovery/1.0',
      },
      rejectUnauthorized: false,  // allow self-signed certs
    };

    const req = transport.request(options, (res) => {
      const status = res.statusCode ?? 0;
      const statusText = res.statusMessage ?? '';
      const contentType = res.headers['content-type'] ?? '';
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        if (Buffer.concat(chunks).length < 4096) {  // cap at 4KB
          chunks.push(chunk);
        }
      });

      res.on('end', () => {
        const duration = Date.now() - t0;
        const body = Buffer.concat(chunks).toString('utf8', 0, 4096);
        const snippet = body.slice(0, 200).replace(/\s+/g, ' ').trim();
        const isJsonOrXml = /json|xml|yaml/i.test(contentType);
        const isApi = isJsonOrXml && status > 0 && status < 500;

        resolve({
          path: parsed.pathname,
          url: targetUrl,
          status,
          statusText,
          contentType: contentType.split(';')[0].trim(),
          responseSize: Buffer.concat(chunks).length,
          duration,
          snippet,
          isApi,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        path: parsed.pathname,
        url: targetUrl,
        status: 0,
        statusText: 'Timeout',
        contentType: '',
        responseSize: 0,
        duration: timeoutMs,
        snippet: '',
        isApi: false,
        error: 'Request timed out',
      });
    });

    req.on('error', (err) => {
      resolve({
        path: parsed.pathname,
        url: targetUrl,
        status: 0,
        statusText: 'Error',
        contentType: '',
        responseSize: 0,
        duration: Date.now() - t0,
        snippet: '',
        isApi: false,
        error: err.message,
      });
    });

    req.end();
  });
}

/** Run discovery: probe all common paths and stream progress */
export async function handleAiDiscovery(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const reqId = msg.reqId as string;
  const baseUrl = (msg.baseUrl as string).replace(/\/$/, '');  // strip trailing slash
  const customPaths = (msg.customPaths as string[] | undefined) ?? [];
  const timeoutMs = (msg.timeoutMs as number | undefined) ?? 5000;
  const maxPaths = (msg.maxPaths as number | undefined) ?? 60;

  // Validate base URL
  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    postMessage({ type: 'ai:discovery:error', reqId, message: `Invalid URL: ${baseUrl}` });
    return;
  }

  const allPaths = [...new Set([...customPaths, ...COMMON_PATHS])].slice(0, maxPaths);
  const total = allPaths.length;

  postMessage({ type: 'ai:discovery:started', reqId, total, baseUrl });

  const results: ProbeResult[] = [];
  let completed = 0;

  // Probe in batches of 5 (respect servers, avoid rate limiting)
  const BATCH_SIZE = 5;
  for (let i = 0; i < allPaths.length; i += BATCH_SIZE) {
    const batch = allPaths.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (p) => {
      const targetUrl = `${parsedBase.protocol}//${parsedBase.host}${p}`;
      const result = await probeUrl(targetUrl, timeoutMs);
      completed++;
      postMessage({ type: 'ai:discovery:progress', reqId, result, completed, total });
      return result;
    });
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  // Filter to just the interesting results (reachable paths)
  const reachable = results.filter(r => r.status > 0 && r.status < 600);
  const apiEndpoints = results.filter(r => r.isApi);

  postMessage({
    type: 'ai:discovery:complete',
    reqId,
    results,
    reachable: reachable.length,
    apiEndpoints: apiEndpoints.length,
    baseUrl,
  });
}
