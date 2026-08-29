/**
 * Protocol-wide request auditing.
 *
 * REST, GraphQL, SOAP and gRPC each have their own handler with several return
 * paths — success, HTTP error, transport error, cancel, missing endpoint. Adding
 * an audit call to each one means the next path someone adds silently isn't
 * audited, and an audit log with holes in it is worse than none, because you
 * cannot tell a request that was not made from one that was not recorded.
 *
 * So this hooks the single point every one of those paths goes through: the
 * message post back to the webview. The inbound send is stashed by tab id, the
 * outbound response is paired with it, and one complete row is written. A new
 * return path is audited automatically because it has to post a response to
 * exist at all.
 */
import { insertUiAudit, getSetting } from '../storage/db';
import { buildRequestAudit } from './request-audit';
import { UNPROXIED_PROTOCOLS } from './proxy-config';

/**
 * Some protocols cannot use the HTTP proxy setting at all. Saying "direct" for
 * those would be true but misleading to someone who has a proxy configured and
 * is asking why it is not being used, so the reason is recorded instead.
 */
function unproxiedNote(protocol: string): { used: boolean; description: string; warning?: string } | undefined {
  const reason = UNPROXIED_PROTOCOLS[protocol];
  return reason ? { used: false, description: 'direct (cannot be proxied)', warning: reason } : undefined;
}

/** Inbound message → the audit identity of the action it starts. */
interface SendTrigger {
  protocol: string;
  eventType: string;
  module: string;
  button: string;
}

const SEND_TRIGGERS: Record<string, SendTrigger> = {
  // REST and GraphQL arrive separately but both answer with `responseData`,
  // so the protocol is taken from the stashed send rather than the response.
  executeRequest: { protocol: 'rest', eventType: 'rest.send', module: 'REST', button: 'Send' },
  executeGraphQL: { protocol: 'graphql', eventType: 'graphql.send', module: 'GraphQL', button: 'Run Query' },
  'soap:invoke': { protocol: 'soap', eventType: 'soap.invoke', module: 'SOAP', button: 'Send' },
  'grpc:invoke': { protocol: 'grpc', eventType: 'grpc.invoke', module: 'gRPC', button: 'Invoke' },
};

/** Outbound message types that mean "the operation finished". */
const RESPONSE_TYPES = new Set(['responseData', 'soap:response', 'grpc:response']);

interface PendingSend {
  trigger: SendTrigger;
  msg: Record<string, unknown>;
  at: number;
}

/**
 * Outstanding sends, keyed by tab.
 *
 * Bounded and swept: a send whose response never arrives (a cancelled stream, a
 * closed panel) would otherwise sit here forever.
 */
const pending = new Map<string, PendingSend>();
const MAX_PENDING = 200;
const PENDING_TTL_MS = 10 * 60 * 1000;

function sweep() {
  if (pending.size <= MAX_PENDING) return;
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const [key, value] of pending) {
    if (value.at < cutoff) pending.delete(key);
  }
  // Still oversized: drop oldest first rather than growing without bound.
  if (pending.size > MAX_PENDING) {
    const oldest = [...pending.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < oldest.length - MAX_PENDING; i++) pending.delete(oldest[i][0]);
  }
}

/** Call for every inbound message; ignores anything that is not a send. */
export function noteProtocolSend(msg: Record<string, unknown>): void {
  const trigger = SEND_TRIGGERS[String(msg.type)];
  const tabId = msg.tabId as string | undefined;
  if (!trigger || !tabId) return;
  pending.set(tabId, { trigger, msg, at: Date.now() });
  sweep();
}

/** SOAP reports headers as a list; everything else as a map. */
function toHeaderMap(headers: unknown): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    const out: Record<string, string> = {};
    for (const h of headers as { key?: string; name?: string; value?: unknown }[]) {
      const key = h.key ?? h.name;
      if (key) out[key] = String(h.value ?? '');
    }
    return out;
  }
  if (typeof headers === 'object') {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) out[k] = String(v ?? '');
    return out;
  }
  return {};
}

/**
 * GraphQL sends the whole document, not an operation name, so the name is read
 * off the query. Worth doing: an audit log listing four identical POSTs to
 * /graphql tells you nothing, and `mutation CreateOrder` tells you everything.
 */
function graphqlOperation(query: unknown): Record<string, string> {
  if (typeof query !== 'string') return {};
  const named = /\b(query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(query);
  if (named) return { operationType: named[1], operationName: named[2] };
  const anon = /\b(query|mutation|subscription)\b/.exec(query);
  return anon ? { operationType: anon[1], operationName: '(anonymous)' } : {};
}

/**
 * Per-protocol details that do not fit the HTTP request/response shape.
 *
 * The names here are the ones the webview actually posts — `envelope`, not
 * `soapEnvelope`; `method`, not `grpcMethod` — which is worth stating because
 * the two sets differ and the history rows use the other one.
 */
function protocolExtras(protocol: string, msg: Record<string, unknown>): Record<string, string> {
  switch (protocol) {
    case 'soap':
      return {
        ...(msg.soapAction ? { soapAction: String(msg.soapAction) } : {}),
        ...(msg.soapOperation ? { operation: String(msg.soapOperation) } : {}),
        ...(msg.soapService ? { service: String(msg.soapService) } : {}),
        ...(msg.soapVersion ? { soapVersion: String(msg.soapVersion) } : {}),
      };
    case 'grpc':
      return {
        ...(msg.method ? { method: String(msg.method) } : {}),
        ...(msg.rpcType ? { rpcType: String(msg.rpcType) } : {}),
        ...(msg.tls !== undefined ? { tls: String(msg.tls) } : {}),
        ...(msg.protoFile ? { protoFile: String(msg.protoFile) } : {}),
      };
    case 'graphql':
      return graphqlOperation(msg.query);
    default:
      return {};
  }
}

/** The request payload each protocol calls its body. */
function requestBodyOf(protocol: string, msg: Record<string, unknown>): string | undefined {
  switch (protocol) {
    case 'soap':    return msg.envelope as string | undefined;
    case 'grpc':    return msg.message as string | undefined;
    case 'graphql': return msg.query as string | undefined;
    default:        return msg.bodyRaw as string | undefined;
  }
}

/**
 * Call for every outbound message. Writes an audit row when it completes a
 * send, and does nothing otherwise.
 */
export function auditProtocolResponse(out: Record<string, unknown>): void {
  if (!RESPONSE_TYPES.has(String(out.type))) return;
  const tabId = out.tabId as string | undefined;
  if (!tabId) return;

  const entry = pending.get(tabId);
  if (!entry) return;              // no matching send: a stream frame, or a stale tab
  pending.delete(tabId);

  // The per-event on/off config lives in the webview, so the send carries it.
  if (entry.msg.auditEnabled === false) return;

  const response = (out.response ?? {}) as Record<string, unknown>;
  const { trigger, msg } = entry;
  const settings = (getSetting<Record<string, unknown>>('general') ?? {});

  try {
    const record = buildRequestAudit({
      // `msg.method` is the HTTP verb for REST but the RPC method name for
      // gRPC, so it is only read where it means a verb.
      method: String(
        out.requestMethod
        ?? (trigger.protocol === 'rest' ? msg.method ?? 'GET' : undefined)
        ?? (trigger.protocol === 'grpc' ? 'RPC' : 'POST'),
      ),
      url: String(out.requestUrl ?? msg.url ?? msg.endpoint ?? ''),
      // gRPC carries its headers as `metadata`; the executors report what they
      // actually sent, which beats what the webview asked them to send.
      requestHeaders: toHeaderMap(out.requestHeaders ?? msg.headers ?? msg.metadata),
      requestBody: (out.requestBody as string | undefined) ?? requestBodyOf(trigger.protocol, msg),
      bodyMode: msg.bodyMode as string | undefined,
      authType: msg.authType as string | undefined,
      params: msg.params as { key: string; value: string; enabled?: boolean }[] | undefined,
      response: {
        status: Number(response.status ?? 0),
        statusText: String(response.statusText ?? ''),
        headers: toHeaderMap(response.headers),
        body: response.body as string | undefined,
        size: response.size as number | undefined,
        time: response.time as number | undefined,
        contentType: response.contentType as string | undefined,
        timing: response.timing as { name: string; startMs: number; durationMs: number }[] | undefined,
        cookies: response.cookies as unknown[] | undefined,
      },
      proxy: (out.proxy as { used: boolean; description: string; warning?: string } | undefined)
        ?? unproxiedNote(trigger.protocol),
      settings,
    });

    insertUiAudit({
      event_type: trigger.eventType,
      module: trigger.module,
      button: trigger.button,
      action: 'click',
      metadata: JSON.stringify({
        ...record,
        protocol: trigger.protocol,
        ...(Object.keys(protocolExtras(trigger.protocol, msg)).length
          ? { operation: protocolExtras(trigger.protocol, msg) }
          : {}),
      }, null, 2),
    });
  } catch {
    // Auditing must never break a response on its way to the UI.
  }
}

/** Test seam — the pending map is module state. */
export function _resetProtocolAudit(): void {
  pending.clear();
}
