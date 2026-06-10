/**
 * mock-protocol-helpers.ts — Shared Sprint 13 logic for non-REST protocol mock servers.
 * Provides sequence cycling, fault/delay injection, rate limiting, MQTT wildcard matching,
 * regex payload matching, and Handlebars template rendering for all non-REST protocols.
 */
import type {
  ResponseSequenceItem, SequenceMode, FaultConfig, RateLimitConfig, ProtocolWebhookConfig,
} from './mock-types';
import { renderTemplate } from './mock-template-engine';
import type { TemplateRequestContext } from './mock-template-engine';
import { dispatchWebhook } from './mock-webhook-dispatcher';

// ─── Sequence counters (per-operation, in-memory) ────────────────────────────

const sequenceCounters = new Map<string, number>();

export function resetSequenceCounter(id: string) {
  sequenceCounters.delete(id);
}

/**
 * Pick the next response body from a sequence according to the given mode.
 * Returns null if the sequence is empty.
 */
export function pickSequenceItem(
  id: string,
  responses: ResponseSequenceItem[],
  mode: SequenceMode = 'sequential',
): ResponseSequenceItem | null {
  if (!responses.length) return null;
  if (mode === 'random') return responses[Math.floor(Math.random() * responses.length)];

  const count = sequenceCounters.get(id) ?? 0;
  let idx: number;
  if (mode === 'round-robin') {
    idx = count % responses.length;
    sequenceCounters.set(id, count + 1);
  } else {
    // sequential: stay on last item
    idx = Math.min(count, responses.length - 1);
    if (count < responses.length - 1) sequenceCounters.set(id, count + 1);
  }
  return responses[idx];
}

// ─── Fault injection ─────────────────────────────────────────────────────────

export interface FaultResult {
  triggered: boolean;
  delayMs: number;
  /** If set, close the connection / return this error string */
  errorMessage?: string;
  /** Status code override for HTTP-backed protocols (GQL/SOAP) */
  statusCode?: number;
}

export function evaluateFault(fault?: FaultConfig): FaultResult {
  if (!fault?.enabled) return { triggered: false, delayMs: 0 };

  const prob = fault.probability ?? 1.0;
  const faultFires = Math.random() < prob;

  let delayMs = 0;
  if (fault.delayMs) delayMs = fault.delayMs;
  if (fault.randomDelayRange) {
    const { min, max } = fault.randomDelayRange;
    delayMs += min + Math.random() * (max - min);
  }
  delayMs = Math.round(delayMs);

  if (!faultFires) return { triggered: false, delayMs };

  switch (fault.type) {
    case 'TIMEOUT':
      return { triggered: true, delayMs: delayMs || 30000, errorMessage: 'Request timed out (fault injection)' };
    case 'CONNECTION_RESET':
      return { triggered: true, delayMs, errorMessage: 'Connection reset (fault injection)' };
    case 'EMPTY_RESPONSE':
      return { triggered: true, delayMs, errorMessage: 'Empty response (fault injection)' };
    case 'RANDOM_5XX':
      return { triggered: true, delayMs, statusCode: 500, errorMessage: 'Internal Server Error (fault injection)' };
    case 'MALFORMED_JSON':
      return { triggered: true, delayMs, errorMessage: '{{malformed_json_fault}}' };
    default:
      return { triggered: false, delayMs };
  }
}

// ─── Rate limiting (per-operation sliding window) ────────────────────────────

const rateLimitCounters = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(id: string, config?: RateLimitConfig): boolean {
  if (!config?.enabled) return true;
  const now = Date.now();
  const state = rateLimitCounters.get(id) ?? { count: 0, windowStart: now };
  if (now - state.windowStart > config.windowMs) {
    state.count = 0;
    state.windowStart = now;
  }
  const limit = config.requestsPerWindow + (config.burstAllowance ?? 0);
  if (state.count >= limit) return false;
  state.count++;
  rateLimitCounters.set(id, state);
  return true;
}

// ─── MQTT topic wildcard matching (+ and #) ──────────────────────────────────

export function mqttTopicMatches(pattern: string, topic: string): boolean {
  if (pattern === topic) return true;
  if (pattern === '#') return true;

  const pParts = pattern.split('/');
  const tParts = topic.split('/');

  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i] === '#') return true;
    if (i >= tParts.length) return false;
    if (pParts[i] !== '+' && pParts[i] !== tParts[i]) return false;
  }
  return pParts.length === tParts.length;
}

// ─── Payload/body regex matching ─────────────────────────────────────────────

export function matchesPayloadRegex(payload: string, pattern?: string): boolean {
  if (!pattern) return true;
  try {
    return new RegExp(pattern, 's').test(payload);
  } catch {
    return payload.includes(pattern);
  }
}

// ─── State machine (per-server, in-memory) ───────────────────────────────────

const stateMachines = new Map<string, Map<string, string>>();

export function getState(serverId: string, sessionId = 'global'): string {
  return stateMachines.get(serverId)?.get(sessionId) ?? 'initial';
}

export function setState(serverId: string, sessionId: string, state: string) {
  if (!stateMachines.has(serverId)) stateMachines.set(serverId, new Map());
  stateMachines.get(serverId)!.set(sessionId, state);
}

export function resetStateMachine(serverId: string) {
  stateMachines.delete(serverId);
}

// ─── Sleep helper ────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Sprint 13.31: Handlebars template rendering for non-REST protocols ──────

// ─── Sprint 13.32: Protocol webhook dispatcher ────────────────────────────────

/**
 * Fire any matching server-level webhooks when a non-REST handler responds.
 */
export function dispatchProtocolWebhooks(
  webhooks: ProtocolWebhookConfig[] | undefined,
  payload: { serverId: string; protocol: string; event: string; clientId?: string; topic?: string; body?: string },
) {
  if (!webhooks?.length) return;
  for (const wh of webhooks) {
    const filter = wh.eventFilter ?? 'all';
    if (filter !== 'all' && filter !== payload.event) continue;
    dispatchWebhook(
      { url: wh.url, delayMs: wh.delayMs, retries: wh.retries, retryDelayMs: wh.retryDelayMs, authHeader: wh.authHeader, headers: wh.headers },
      { ...payload, timestamp: Date.now() },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a template string with a non-REST protocol request context.
 * Builds a TemplateRequestContext from the protocol-specific fields so that
 * all standard helpers ({{request.body}}, {{randomInt}}, {{now}}, {{uuid}}, etc.)
 * work identically across GQL, WS, MQTT, SSE, SIO, and gRPC mock servers.
 */
export function renderProtocolTemplate(
  template: string,
  opts: {
    protocol: string;
    /** Raw incoming message / body / payload */
    body?: string;
    /** Topic, event name, operation name, or method name */
    topic?: string;
    /** Headers / metadata as key-value map */
    headers?: Record<string, string>;
    /** Query params (parsed from URL for SSE, etc.) */
    queryParams?: Record<string, string>;
    /** State vars from state machine */
    stateVars?: Record<string, unknown>;
  },
): string {
  // Only attempt template rendering if the template contains {{ }}
  if (!template.includes('{{')) return template;

  const body = opts.body ?? '';
  let parsedBody: unknown;
  try { parsedBody = JSON.parse(body); } catch { parsedBody = undefined; }

  const ctx: TemplateRequestContext = {
    url: opts.topic ?? '',
    path: opts.topic ?? '',
    method: opts.protocol.toUpperCase(),
    headers: opts.headers ?? {},
    cookies: {},
    queryParams: opts.queryParams ?? {},
    body,
    parsedBody,
    pathParams: {},
    host: 'localhost',
    port: 0,
    pathSegments: (opts.topic ?? '').split('/').filter(Boolean),
    stateVars: opts.stateVars,
  };

  try {
    return renderTemplate(template, ctx);
  } catch {
    return template;
  }
}
