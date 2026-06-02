/**
 * REST HTTP Mock Server - creates an HTTP server that matches routes and returns mock responses.
 * Supports responseScript for dynamic responses (OAuth/JWT flows).
 */
import * as http from 'http';
import * as vm from 'vm';
import * as crypto from 'crypto';
import type { MockServerConfig, MockRoute, HttpMethod, MockLogEntry } from './mock-types';
import { resolveAll } from '../services/variables';

export type LogCallback = (entry: MockLogEntry) => void;

export function createHttpServer(config: MockServerConfig, getConfig: () => MockServerConfig, onLog?: LogCallback): http.Server {
  return http.createServer((req, res) => {
    const startTime = Date.now();
    const method = (req.method || 'GET').toUpperCase() as HttpMethod;
    const url = new URL(req.url || '/', `http://localhost`);
    const pathname = url.pathname;

    // CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    // Handle preflight
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Collect request body
    let reqBody = '';
    req.on('data', (chunk) => { reqBody += chunk; });
    req.on('end', () => {
      // ─── Request validation (like a real REST server) ───
      const contentType = (req.headers['content-type'] || '').toLowerCase();

      // Body size limit: 10 MB
      if (reqBody.length > 10 * 1024 * 1024) {
        const responseBody = JSON.stringify({ error: 'Payload Too Large', message: 'Request body exceeds 10 MB limit' });
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(responseBody);
        onLog?.({
          id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
          direction: 'incoming', protocol: 'rest', method, path: pathname,
          statusCode: 413, headers: req.headers as Record<string, string>,
          body: reqBody.slice(0, 200), responseBody, duration: Date.now() - startTime,
        });
        return;
      }

      // JSON body validation: if Content-Type is application/json, body must parse
      if (reqBody && contentType.includes('application/json')) {
        try {
          JSON.parse(reqBody);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : 'Invalid JSON';
          const responseBody = JSON.stringify({
            error: 'Bad Request',
            message: `Invalid JSON in request body: ${errMsg}`,
          });
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(responseBody);
          onLog?.({
            id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
            direction: 'incoming', protocol: 'rest', method, path: pathname,
            statusCode: 400, headers: req.headers as Record<string, string>,
            body: reqBody.slice(0, 500), responseBody, duration: Date.now() - startTime,
          });
          return;
        }
      }

      // Body-required methods: POST/PUT/PATCH should have Content-Type when body present
      const bodyMethods = ['POST', 'PUT', 'PATCH'];
      if (bodyMethods.includes(method) && reqBody && !contentType) {
        const responseBody = JSON.stringify({
          error: 'Unsupported Media Type',
          message: `${method} request with body requires a Content-Type header`,
        });
        res.writeHead(415, { 'Content-Type': 'application/json' });
        res.end(responseBody);
        onLog?.({
          id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
          direction: 'incoming', protocol: 'rest', method, path: pathname,
          statusCode: 415, headers: req.headers as Record<string, string>,
          body: reqBody.slice(0, 500), responseBody, duration: Date.now() - startTime,
        });
        return;
      }

      // Find matching route (re-read from live config)
      const currentConfig = getConfig();
      const routes = currentConfig.routes;

      const route = routes.find(r =>
        r.enabled && r.method === method && matchPath(r.path, pathname)
      );

      // Parse query params
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((v, k) => { queryParams[k] = v; });

      if (!route) {
        const responseBody = JSON.stringify({
          error: 'Not Found',
          message: `No mock route matches ${method} ${pathname}`,
          availableRoutes: routes.filter(r => r.enabled).map(r => `${r.method} ${r.path}`),
        });
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(responseBody);

        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'incoming',
          protocol: 'rest',
          method,
          path: pathname,
          statusCode: 404,
          headers: req.headers as Record<string, string>,
          queryParams,
          body: reqBody || undefined,
          responseBody,
          duration: Date.now() - startTime,
        });
        return;
      }

      const sendResponse = () => {
        let responseBody = route.body;

        // If route has a responseScript, execute it to generate dynamic response
        if (route.responseScript && route.responseScript.trim()) {
          try {
            responseBody = executeRouteScript(route.responseScript, {
              method,
              path: pathname,
              headers: req.headers as Record<string, string>,
              query: queryParams,
              body: reqBody,
              params: extractPathParams(route.path, pathname),
            });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            responseBody = JSON.stringify({ error: 'Script error', message: errMsg });
          }
        } else {
          // Resolve template variables in static body
          responseBody = resolveAll(responseBody);
        }

        // Set route headers
        for (const [key, value] of Object.entries(route.headers)) {
          res.setHeader(key, resolveAll(value));
        }
        res.writeHead(route.statusCode);
        res.end(responseBody);

        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'incoming',
          protocol: 'rest',
          method,
          path: pathname,
          statusCode: route.statusCode,
          headers: req.headers as Record<string, string>,
          queryParams,
          body: reqBody || undefined,
          responseHeaders: route.headers,
          responseBody,
          duration: Date.now() - startTime,
        });
      };

      if (route.delay > 0) {
        setTimeout(sendResponse, route.delay);
      } else {
        sendResponse();
      }
    });
  });
}

/** Simple path matching: supports exact match and basic path params (:param) */
function matchPath(routePath: string, requestPath: string): boolean {
  if (routePath === requestPath) return true;

  const routeParts = routePath.split('/').filter(Boolean);
  const reqParts = requestPath.split('/').filter(Boolean);

  if (routeParts.length !== reqParts.length) return false;

  return routeParts.every((part, i) => {
    if (part.startsWith(':')) return true; // path parameter = wildcard
    return part === reqParts[i];
  });
}

/** Extract path parameters from a route pattern */
function extractPathParams(routePath: string, requestPath: string): Record<string, string> {
  const params: Record<string, string> = {};
  const routeParts = routePath.split('/').filter(Boolean);
  const reqParts = requestPath.split('/').filter(Boolean);

  routeParts.forEach((part, i) => {
    if (part.startsWith(':') && reqParts[i]) {
      params[part.slice(1)] = reqParts[i];
    }
  });

  return params;
}

/**
 * Execute a route's responseScript in a sandboxed vm context.
 * The script has access to `req` (method, path, headers, query, body, params)
 * and built-in helpers (JSON, crypto, Date, jwt signing).
 * Must return a string (the response body).
 */
function executeRouteScript(script: string, reqContext: {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: string;
  params: Record<string, string>;
}): string {
  // Parse body as JSON if possible
  let bodyParsed: unknown = reqContext.body;
  try { bodyParsed = JSON.parse(reqContext.body); } catch { /* keep as string */ }

  const req = {
    method: reqContext.method,
    path: reqContext.path,
    headers: reqContext.headers,
    query: reqContext.query,
    body: bodyParsed,
    rawBody: reqContext.body,
    params: reqContext.params,
  };

  // JWT helper (simple HMAC-based for mock purposes)
  const jwtSign = (payload: Record<string, unknown>, secret: string, options?: { expiresIn?: number }) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const finalPayload = {
      ...payload,
      iat: now,
      ...(options?.expiresIn ? { exp: now + options.expiresIn } : {}),
    };
    const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const headerB64 = b64(header);
    const payloadB64 = b64(finalPayload);
    const signature = crypto.createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    return `${headerB64}.${payloadB64}.${signature}`;
  };

  const sandbox: Record<string, unknown> = {
    req,
    JSON,
    Date,
    Math,
    parseInt,
    parseFloat,
    crypto: {
      randomUUID: () => crypto.randomUUID(),
      randomBytes: (n: number) => crypto.randomBytes(n).toString('hex'),
    },
    jwt: { sign: jwtSign },
    Buffer,
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };

  const vmContext = vm.createContext(sandbox);
  const wrapped = `(function() { ${script} })()`;
  const result = new vm.Script(wrapped, { filename: 'mock-route-script.js' })
    .runInContext(vmContext, { timeout: 3000 });

  if (typeof result === 'string') return result;
  if (result === undefined || result === null) return '';
  return JSON.stringify(result);
}
