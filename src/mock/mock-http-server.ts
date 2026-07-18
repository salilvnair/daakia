/**
 * REST HTTP Mock Server — WireMock-grade routing with:
 * - Advanced URL/header/body matching (6A.1-6A.4)
 * - Priority ordering (6A.5)
 * - Handlebars response templating (6A.7-6A.8)
 * - Fault injection (6A.13-6A.14)
 * - Stateful behavior (6A.11)
 * - Response sequences (6A.22)
 * - Webhooks (6A.23)
 * - Rate limiting (6A.14)
 * - Record & playback (6A.16)
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as crypto from 'crypto';
import type {
  MockServerConfig, MockRoute, HttpMethod, MockLogEntry,
  FaultConfig, WebhookConfig, RecordedRequest,
} from './mock-types';
import { resolveAll } from '../services/variables';
import { routeMatchesRequest, sortRoutesByPriority, extractPathParams, parseCookies } from './mock-matcher';
import { renderTemplate, type TemplateRequestContext } from './mock-template-engine';
import type { StateMachineRuntime } from './mock-state-machine';
import { getStateMachineRuntime, disposeStateMachineRuntime, effectiveWorkflowId } from './mock-runtime';
import { RateLimiter, SequenceTracker } from './mock-rate-limiter';

export type LogCallback = (entry: MockLogEntry) => void;
export type RecordCallback = (entry: RecordedRequest) => void;

interface ServerRuntimeState {
  rateLimiter: RateLimiter;
  sequenceTracker: SequenceTracker;
  globalRateLimiter: RateLimiter;
}

const runtimeStates = new Map<string, ServerRuntimeState>();

function getRuntime(serverId: string): ServerRuntimeState {
  if (!runtimeStates.has(serverId)) {
    runtimeStates.set(serverId, {
      rateLimiter: new RateLimiter(),
      sequenceTracker: new SequenceTracker(),
      globalRateLimiter: new RateLimiter(),
    });
  }
  return runtimeStates.get(serverId)!;
}

export function disposeRuntime(serverId: string) {
  runtimeStates.delete(serverId);
  disposeStateMachineRuntime(serverId);
}

export function createHttpServer(
  config: MockServerConfig,
  getConfig: () => MockServerConfig,
  onLog?: LogCallback,
  onRecord?: RecordCallback,
): http.Server {
  return http.createServer((req, res) => {
    const startTime = Date.now();
    const method = (req.method || 'GET').toUpperCase() as HttpMethod;
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    let reqBody = '';
    req.on('data', chunk => { reqBody += chunk; });
    req.on('end', async () => {
      const currentConfig = getConfig();
      const runtime = getRuntime(currentConfig.id);

      // ─── Global rate limiting ──────────────────────────────────────────────
      if (currentConfig.globalRateLimit?.enabled) {
        const rl = runtime.globalRateLimiter.check('__global__', currentConfig.globalRateLimit);
        if (!rl.allowed) {
          const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
          res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSec) });
          res.end(JSON.stringify({ error: 'Too Many Requests', message: `Rate limit exceeded. Retry after ${retryAfterSec}s.`, retryAfterMs: rl.retryAfterMs }));
          return;
        }
      }

      // ─── Body validation ───────────────────────────────────────────────────
      if (reqBody.length > 10 * 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload Too Large' }));
        return;
      }

      const contentType = (req.headers['content-type'] || '').toLowerCase();
      if (reqBody && contentType.includes('application/json')) {
        try { JSON.parse(reqBody); } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad Request', message: `Invalid JSON: ${(e as Error).message}` }));
          return;
        }
      }

      // ─── Parse request context ─────────────────────────────────────────────
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((v, k) => { queryParams[k] = v; });
      const cookies = parseCookies(req.headers['cookie'] || '');

      const reqCtx = {
        method,
        path: pathname,
        headers: req.headers as Record<string, string>,
        queryParams,
        cookies,
        body: reqBody,
      };

      // ─── Route matching (priority + advanced matchers) ─────────────────────
      const sortedRoutes = sortRoutesByPriority(currentConfig.routes);
      let matchedRoute: MockRoute | undefined;
      let matchedParams: Record<string, string> = {};
      let matchedStateMachine: StateMachineRuntime | null = null;
      // First route whose method/path/headers/body matchers all passed but
      // was rejected purely by Trigger Event gating — a "near miss". If the
      // whole loop ends without a real match, this is almost always the
      // caller's actual intent (e.g. POST /api/auth/logout on a session
      // that was never logged in) and deserves a specific, meaningful
      // response instead of the generic "no route matches at all" 404,
      // which wrongly implies the endpoint doesn't exist.
      let gatedNearMiss: { route: MockRoute; currentState: string; sm: StateMachineRuntime; sk: string } | undefined;

      for (const r of sortedRoutes) {
        const result = routeMatchesRequest(r, reqCtx);
        if (result.matched) {
          if (r.triggerEvent) {
            // Event-driven gating: does this event have a valid transition
            // from the session's current state on the connected workflow
            // this route references?
            const sm = getStateMachineRuntime(currentConfig.id, effectiveWorkflowId(r, currentConfig), currentConfig);
            if (!sm) continue; // triggerEvent set but no matching connected/enabled workflow
            const sk = sm.resolveSessionKey(req.headers as Record<string, string>, cookies);
            if (!sm.canFireEvent(sk, r.triggerEvent)) {
              if (!gatedNearMiss) gatedNearMiss = { route: r, currentState: sm.getCurrentState(sk), sm, sk };
              continue;
            }
            matchedStateMachine = sm;
          } else {
            // No triggerEvent — still resolve a runtime if this route's
            // workflow is unambiguous, so session-scoped state vars / state
            // mock-response overrides still apply even without gating.
            matchedStateMachine = getStateMachineRuntime(currentConfig.id, effectiveWorkflowId(r, currentConfig), currentConfig);
          }
          matchedRoute = r;
          matchedParams = result.params;
          break;
        }
      }

      // ─── Recording mode (6A.16) ───────────────────────────────────────────
      if (currentConfig.recordingMode && currentConfig.proxyTarget) {
        await handleProxyRecording(req, res, reqBody, currentConfig, onLog, onRecord, startTime);
        return;
      }

      if (!matchedRoute && gatedNearMiss) {
        // The request genuinely matched a real, configured route — it's
        // rejected purely because the session hasn't reached the state this
        // route's Trigger Event requires (e.g. calling /logout before ever
        // logging in). Returning the generic "no route matches at all" 404
        // here would be actively misleading — the endpoint exists; the
        // caller's sequence of calls is what's wrong. 409 Conflict + a
        // message naming the exact event and current state gives a caller
        // (human or AI) enough to fix their own test sequence immediately,
        // instead of a route-listing dump.
        const { route: r, currentState, sm, sk } = gatedNearMiss;
        const availableEvents = sm.getAvailableEvents(sk);
        const requiredEventPath = sm.findEventPathTo(sk, r.triggerEvent!);
        let hint: string;
        if (requiredEventPath && requiredEventPath.length > 0) {
          hint = `Fire ${requiredEventPath.map((e) => `"${e}"`).join(' then ')} first — that will make "${r.triggerEvent}" reachable.`;
        } else if (availableEvents.length > 0) {
          hint = `From the current state, you can fire: ${availableEvents.map((e) => `"${e.event}" (→ "${e.toState}")`).join(', ')}.`;
        } else {
          hint = `No events can currently fire from state "${currentState}" — this session is a dead end.`;
        }
        const responseBody = JSON.stringify({
          error: 'Conflict',
          message: `${method} ${pathname} exists, but its Trigger Event "${r.triggerEvent}" cannot fire from the current session state ("${currentState}"). ${hint}`,
          requiredEvent: r.triggerEvent,
          currentState,
          availableEvents: availableEvents.map((e) => e.event),
          requiredEventPath: requiredEventPath ?? undefined,
        });
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(responseBody);
        logRequest(onLog, config, method, pathname, 409, req.headers as Record<string, string>, queryParams, reqBody, responseBody, Date.now() - startTime);
        return;
      }

      if (!matchedRoute) {
        // Annotate routes that structurally match this method/path but were
        // skipped purely because of Trigger Event gating (line ~137 above) —
        // otherwise a gated route (e.g. GET /api/profile requiring a prior
        // login) appears in this list looking like a normal, callable route,
        // when calling it exactly as shown will 404 again until the session
        // reaches the required state.
        const availableRoutes = currentConfig.routes.filter(r => r.enabled).map(r => {
          const label = `${r.method} ${r.path}`;
          if (!r.triggerEvent) return label;
          const sm = getStateMachineRuntime(currentConfig.id, effectiveWorkflowId(r, currentConfig), currentConfig);
          // Distinct from "gated but currently unreachable" (below) — this
          // route can NEVER match, on any request, until its connected
          // workflow's config is actually attached (most commonly: a server
          // saved before RestRoutesConfig's applySample() upserted
          // connectedWorkflows[].stateMachine — re-run Load Sample to fix).
          if (!sm) return `${label} (misconfigured — connected workflow for event "${r.triggerEvent}" has no stateMachine config; re-run Load Sample on this server)`;
          const sk = sm.resolveSessionKey(req.headers as Record<string, string>, cookies);
          if (sm.canFireEvent(sk, r.triggerEvent)) return label;
          return `${label} (requires event "${r.triggerEvent}" — not reachable from the current session state)`;
        });
        const responseBody = JSON.stringify({
          error: 'Not Found',
          message: `No mock route matches ${method} ${pathname}`,
          availableRoutes,
        });
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(responseBody);
        logRequest(onLog, config, method, pathname, 404, req.headers as Record<string, string>, queryParams, reqBody, responseBody, Date.now() - startTime);
        return;
      }

      const route = matchedRoute;

      // ─── Per-route rate limiting (6A.14) ──────────────────────────────────
      if (route.rateLimit?.enabled) {
        const rl = runtime.rateLimiter.check(route.id, route.rateLimit);
        if (!rl.allowed) {
          const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
          res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSec) });
          res.end(JSON.stringify({ error: 'Too Many Requests', retryAfterMs: rl.retryAfterMs }));
          return;
        }
      }

      // ─── Session key for state machine ─────────────────────────────────────
      const sessionKey = matchedStateMachine?.resolveSessionKey(req.headers as Record<string, string>, cookies) ?? '__global__';

      // ─── Global fault injection (6A.15) ───────────────────────────────────
      const globalFault = currentConfig.globalFault;
      if (globalFault?.enabled) {
        const faultResponse = applyFault(globalFault, res);
        if (faultResponse !== null) {
          if (faultResponse === 'handled') return;
          setTimeout(() => { sendFaultResponse(res, faultResponse); }, globalFault.delayMs ?? 0);
          logRequest(onLog, config, method, pathname, faultResponse.status, req.headers as Record<string, string>, queryParams, reqBody, faultResponse.body, Date.now() - startTime);
          return;
        }
      }

      // ─── Per-route fault injection (6A.13) ────────────────────────────────
      const routeFault = route.fault;
      if (routeFault?.enabled) {
        const faultResponse = applyFault(routeFault, res);
        if (faultResponse !== null) {
          if (faultResponse === 'handled') return;
          const delay = route.delay + (routeFault.delayMs ?? 0) + (routeFault.randomDelayRange ? randomDelay(routeFault.randomDelayRange) : 0);
          setTimeout(() => { sendFaultResponse(res, faultResponse); }, delay);
          logRequest(onLog, config, method, pathname, faultResponse.status, req.headers as Record<string, string>, queryParams, reqBody, faultResponse.body, Date.now() - startTime);
          return;
        }
      }

      // ─── Build template context ────────────────────────────────────────────
      let parsedBody: unknown;
      try { parsedBody = JSON.parse(reqBody); } catch { /* string body */ }

      const host = req.headers['host']?.split(':')[0] ?? 'localhost';
      const port = parseInt(req.headers['host']?.split(':')[1] ?? '80') || 80;
      const stateVars = matchedStateMachine?.getVariables(sessionKey) ?? {};

      const templateCtx: TemplateRequestContext = {
        url: req.url ?? pathname,
        path: pathname,
        method,
        headers: req.headers as Record<string, string>,
        cookies,
        queryParams,
        body: reqBody,
        parsedBody,
        pathParams: { ...matchedParams, ...extractPathParams(route.path, pathname) },
        host,
        port,
        pathSegments: pathname.split('/').filter(Boolean),
        stateVars,
      };

      // ─── Send response (with delay) ────────────────────────────────────────
      const totalDelay = route.delay + (routeFault?.delayMs ?? 0) + (routeFault?.randomDelayRange ? randomDelay(routeFault.randomDelayRange) : 0);

      const sendResponse = () => {
        let responseBody: string;
        let statusCode = route.statusCode;
        let responseHeaders = { ...route.headers };

        // ── File response (bodySource === 'file') ────────────────────────────
        if (route.bodySource === 'file' && route.bodyFile) {
          const filePath = path.isAbsolute(route.bodyFile) ? route.bodyFile : path.join(process.cwd(), route.bodyFile);
          if (!fs.existsSync(filePath)) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File Not Found', message: `bodyFile not found: ${route.bodyFile}` }));
            logRequest(onLog, config, method, pathname, 500, req.headers as Record<string, string>, queryParams, reqBody, 'bodyFile not found', Date.now() - startTime);
            return;
          }
          const fileBuffer = fs.readFileSync(filePath);
          // Always derive MIME from the actual file extension — never let a leftover inline
          // Content-Type header (e.g. application/json) override a binary file type.
          const mimeType = guessMimeFromExt(filePath);
          const filename = path.basename(filePath);
          res.setHeader('Content-Type', mimeType);
          if (!responseHeaders['Content-Disposition'] && !responseHeaders['content-disposition']) {
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          }
          // Apply remaining custom headers, skipping Content-Type (already set from file)
          for (const [k, v] of Object.entries(responseHeaders)) {
            if (k.toLowerCase() !== 'content-type') {
              res.setHeader(k, resolveAll(v));
            }
          }
          res.writeHead(statusCode);
          res.end(fileBuffer);
          logRequest(onLog, config, method, pathname, statusCode, req.headers as Record<string, string>, queryParams, reqBody, `[binary file: ${filename}]`, Date.now() - startTime, responseHeaders);
          return;
        }

        // Response sequences (6A.22)
        if (route.responses && route.responses.length > 0) {
          const mode = route.sequenceMode ?? 'sequential';
          const idx = runtime.sequenceTracker.next(route.id, route.responses.length, mode);
          const seqItem = route.responses[idx];
          statusCode = seqItem.statusCode;
          responseHeaders = { ...responseHeaders, ...seqItem.headers };
          responseBody = seqItem.body;
        } else if (route.responseScript?.trim()) {
          // JS script response
          try {
            responseBody = executeRouteScript(route.responseScript, {
              method, path: pathname, headers: req.headers as Record<string, string>,
              query: queryParams, body: reqBody, params: templateCtx.pathParams,
            });
          } catch (err) {
            responseBody = JSON.stringify({ error: 'Script error', message: (err as Error).message });
          }
        } else if (route.isTemplate) {
          // Handlebars template rendering (6A.7)
          responseBody = renderTemplate(resolveAll(route.body), templateCtx);
        } else {
          // Static body with variable substitution
          responseBody = resolveAll(route.body);
        }

        // State node mock response override — applies when current session state has a
        // matching method+path response defined on the canvas. Takes precedence over
        // the route's default body.
        if (matchedStateMachine) {
          const stateMockResp = matchedStateMachine.getStateResponseForRoute(method, pathname, sessionKey);
          if (stateMockResp) {
            responseBody = stateMockResp.body;
            statusCode = stateMockResp.status;
          }
        }

        // Set response headers
        for (const [k, v] of Object.entries(responseHeaders)) {
          res.setHeader(k, resolveAll(v));
        }
        res.writeHead(statusCode);
        res.end(responseBody);

        // ─── State machine transition (6A.11) ──────────────────────────────
        // Fire the canvas's own event — target state and validity both come
        // from the graph, nothing route-local.
        if (matchedStateMachine && route.triggerEvent) {
          void matchedStateMachine.fireEvent(sessionKey, route.triggerEvent);
        }

        // ─── Webhooks (6A.23) ──────────────────────────────────────────────
        if (route.webhooks?.length) {
          fireWebhooks(route.webhooks, templateCtx, responseBody, statusCode);
        }

        logRequest(onLog, config, method, pathname, statusCode, req.headers as Record<string, string>, queryParams, reqBody, responseBody, Date.now() - startTime, responseHeaders);
      };

      if (totalDelay > 0) setTimeout(sendResponse, totalDelay);
      else sendResponse();
    });
  });
}

// ─── Fault injection engine (6A.13) ──────────────────────────────────────────

type FaultResult = null | 'handled' | { status: number; body: string };

function applyFault(fault: FaultConfig, res: http.ServerResponse): FaultResult {
  if (!fault.enabled) return null;

  // Probability check
  const prob = fault.probability ?? 1.0;
  if (Math.random() > prob) return null;

  switch (fault.type) {
    case 'CONNECTION_RESET':
      res.socket?.destroy();
      return 'handled';

    case 'EMPTY_RESPONSE':
      res.writeHead(200);
      res.end();
      return 'handled';

    case 'TIMEOUT':
      // Never respond — let the request timeout
      return 'handled';

    case 'MALFORMED_JSON':
      return { status: 200, body: '{"broken": json response !!!' };

    case 'CHUNKED_DRIBBLE':
      // Handled inline — write slowly (approximated with just partial body)
      return { status: 200, body: '{"partial":' };

    case 'RANDOM_5XX': {
      const codes = [500, 502, 503, 504];
      const code = codes[Math.floor(Math.random() * codes.length)];
      return { status: code, body: JSON.stringify({ error: 'Server Error', statusCode: code }) };
    }

    default:
      return null;
  }
}

function sendFaultResponse(res: http.ServerResponse, fault: { status: number; body: string }) {
  res.writeHead(fault.status, { 'Content-Type': 'application/json' });
  res.end(fault.body);
}

function randomDelay(range: { min: number; max: number }): number {
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
}

// ─── Webhook engine (6A.23) ──────────────────────────────────────────────────

function fireWebhooks(
  webhooks: WebhookConfig[],
  ctx: TemplateRequestContext,
  responseBody: string,
  statusCode: number,
) {
  for (const webhook of webhooks) {
    if (!webhook.enabled) continue;
    const delayMs = webhook.delayMs ?? 0;

    setTimeout(async () => {
      try {
        let body = webhook.body || '';
        // Template the webhook body with request context
        if (body.includes('{{')) {
          body = renderTemplate(body, ctx);
        }
        // Simple replacement for response context
        body = body
          .replace(/\{\{response\.body\}\}/g, responseBody)
          .replace(/\{\{response\.status\}\}/g, String(statusCode));

        await fetch(webhook.url, {
          method: webhook.method,
          headers: { 'Content-Type': 'application/json', ...webhook.headers },
          body: body || undefined,
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Webhook delivery failures are silent (fire-and-forget)
      }
    }, delayMs);
  }
}

// ─── Proxy recording mode (6A.16) ────────────────────────────────────────────

async function handleProxyRecording(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string,
  config: MockServerConfig,
  onLog?: LogCallback,
  onRecord?: RecordCallback,
  startTime?: number,
) {
  const target = config.proxyTarget!;
  const url = new URL(req.url || '/', target.startsWith('http') ? target : `http://${target}`);

  try {
    const headers: Record<string, string> = {};
    Object.entries(req.headers).forEach(([k, v]) => {
      if (k === 'host') return;
      if (typeof v === 'string') headers[k] = v;
      else if (Array.isArray(v)) headers[k] = v.join(', ');
    });

    const fetchRes = await fetch(url.toString(), {
      method: req.method,
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(30000),
    });

    const responseBody = await fetchRes.text();
    const responseHeaders: Record<string, string> = {};
    fetchRes.headers.forEach((v, k) => { responseHeaders[k] = v; });

    // Forward to client
    for (const [k, v] of Object.entries(responseHeaders)) {
      if (k === 'transfer-encoding') continue;
      res.setHeader(k, v);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(fetchRes.status);
    res.end(responseBody);

    // Record the interaction
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { queryParams[k] = v; });

    const recorded: RecordedRequest = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      method: (req.method || 'GET').toUpperCase() as import('./mock-types').HttpMethod,
      path: url.pathname,
      headers: req.headers as Record<string, string>,
      queryParams,
      body: body || undefined,
      response: {
        status: fetchRes.status,
        headers: responseHeaders,
        body: responseBody,
        duration: Date.now() - (startTime ?? Date.now()),
      },
    };

    onRecord?.(recorded);
    onLog?.({
      id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
      direction: 'incoming', protocol: 'rest',
      method: recorded.method, path: recorded.path,
      statusCode: fetchRes.status,
      headers: req.headers as Record<string, string>, queryParams,
      body, responseBody, duration: recorded.response.duration,
    });
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy Error', message: (err as Error).message }));
  }
}

// ─── Script execution ─────────────────────────────────────────────────────────

function executeRouteScript(script: string, reqContext: {
  method: string; path: string; headers: Record<string, string>;
  query: Record<string, string>; body: string; params: Record<string, string>;
}): string {
  let bodyParsed: unknown = reqContext.body;
  try { bodyParsed = JSON.parse(reqContext.body); } catch { /* keep as string */ }

  const req = { method: reqContext.method, path: reqContext.path, headers: reqContext.headers, query: reqContext.query, body: bodyParsed, rawBody: reqContext.body, params: reqContext.params };

  const jwtSign = (payload: Record<string, unknown>, secret: string, options?: { expiresIn?: number }) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const finalPayload = { ...payload, iat: now, ...(options?.expiresIn ? { exp: now + options.expiresIn } : {}) };
    const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const h = b64(header), p = b64(finalPayload);
    const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    return `${h}.${p}.${sig}`;
  };

  const sandbox: Record<string, unknown> = {
    req, JSON, Date, Math, parseInt, parseFloat,
    crypto: { randomUUID: () => crypto.randomUUID(), randomBytes: (n: number) => crypto.randomBytes(n).toString('hex') },
    jwt: { sign: jwtSign }, Buffer,
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };

  const vmContext = vm.createContext(sandbox);
  const result = new vm.Script(`(function() { ${script} })()`, { filename: 'mock-route-script.js' }).runInContext(vmContext, { timeout: 3000 });

  if (typeof result === 'string') return result;
  if (result === undefined || result === null) return '';
  return JSON.stringify(result);
}

// ─── MIME type helper ─────────────────────────────────────────────────────────

function guessMimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const MIME_MAP: Record<string, string> = {
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.js': 'application/javascript',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.tar': 'application/x-tar',
    '.7z': 'application/x-7z-compressed',
    '.rar': 'application/x-rar-compressed',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.proto': 'text/plain',
    '.wasm': 'application/wasm',
  };
  return MIME_MAP[ext] || 'application/octet-stream';
}

// ─── Logging helper ───────────────────────────────────────────────────────────

function logRequest(
  onLog: LogCallback | undefined,
  config: MockServerConfig,
  method: HttpMethod,
  path: string,
  statusCode: number,
  headers: Record<string, string>,
  queryParams: Record<string, string>,
  body: string,
  responseBody: string,
  duration: number,
  responseHeaders?: Record<string, string>,
) {
  onLog?.({
    id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
    direction: 'incoming', protocol: 'rest', method, path, statusCode,
    headers, queryParams, body: body || undefined, responseHeaders, responseBody, duration,
  });
}
