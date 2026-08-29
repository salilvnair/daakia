/**
 * Auditing for the realtime protocols — WebSocket, SSE, Socket.IO, MQTT.
 *
 * These do not fit the request/response record the other protocols use. There
 * is no status code, no response headers, and no single moment where the thing
 * being audited is "done". What there is instead is a session: it opens, it
 * carries traffic in both directions for a while, and it ends for a reason.
 *
 * So one row is written per session, at close — NOT one per message. A busy
 * WebSocket can deliver thousands of frames a minute, and a row for each would
 * bury every other event in the audit log and grow the database without bound,
 * while answering nothing a tally cannot. The questions a realtime audit has to
 * answer are "did it connect, to what, for how long, how much went each way,
 * and why did it end" — and those are properties of the session.
 *
 * Message CONTENTS are deliberately not recorded, only counts, sizes and the
 * channel they arrived on. Frame payloads are the user's live data, often
 * continuous, and keeping them would turn a diagnostic log into a capture file.
 *
 * Per-message auditing already exists for the deliberate ones — `ws.send`,
 * `mqtt.publish`, `mqtt.subscribe` are click-time events, off by default, and
 * remain the right tool when you want individual frames.
 */
import { insertUiAudit, getSetting } from '../storage/db';
import { UNPROXIED_PROTOCOLS } from './proxy-config';

/** The lifecycle of one realtime protocol, as message type prefixes. */
interface SessionProtocol {
  protocol: string;
  module: string;
  /** Audit event written when the session ends. */
  eventType: string;
  button: string;
  /** Inbound message that opens a session. */
  connect: string;
  /** Outbound messages that carry traffic, and which direction they mean. */
  inbound: string[];
  outbound: string[];
}

const PROTOCOLS: SessionProtocol[] = [
  {
    protocol: 'websocket', module: 'WebSocket', eventType: 'ws.connect', button: 'Connect',
    connect: 'ws:connect',
    inbound: ['ws:message'],
    outbound: ['ws:initSent', 'ws:sent'],
  },
  {
    protocol: 'sse', module: 'SSE', eventType: 'sse.connect', button: 'Connect',
    connect: 'sse:connect',
    // SSE is one-directional by design: the client never sends after the
    // handshake, so a non-zero sent count would be a bug, not a statistic.
    inbound: ['sse:event'],
    outbound: [],
  },
  {
    // The registered event id is `sio.*`, not `socketio.*`, while the message
    // types use the long form — the two are genuinely different.
    protocol: 'socketio', module: 'Socket.IO', eventType: 'sio.connect', button: 'Connect',
    connect: 'socketio:connect',
    inbound: ['socketio:event'],
    outbound: ['socketio:sent'],
  },
  {
    protocol: 'mqtt', module: 'MQTT', eventType: 'mqtt.connect', button: 'Connect',
    connect: 'mqtt:connect',
    inbound: ['mqtt:message'],
    outbound: ['mqtt:published'],
  },
  {
    // An MCP client is a session too: it connects once and serves many calls.
    // The unit of traffic is a tool, prompt or resource result, and the tool
    // name makes the channel tally a record of what the session actually did.
    protocol: 'mcp', module: 'MCP', eventType: 'mcp.connect', button: 'Connect',
    connect: 'mcp:connect',
    inbound: ['mcp:toolResult', 'mcp:promptResult', 'mcp:resourceResult'],
    outbound: [],
  },
];

const BY_CONNECT = new Map(PROTOCOLS.map(p => [p.connect, p]));
/** message type → { protocol, direction }, built once. */
const TRAFFIC = new Map<string, { spec: SessionProtocol; direction: 'in' | 'out' }>();
/** message type → protocol, for the messages that end or open a session. */
const OPENED = new Map<string, SessionProtocol>();
const CLOSED = new Map<string, SessionProtocol>();
const FAILED = new Map<string, SessionProtocol>();
for (const spec of PROTOCOLS) {
  for (const t of spec.inbound) TRAFFIC.set(t, { spec, direction: 'in' });
  for (const t of spec.outbound) TRAFFIC.set(t, { spec, direction: 'out' });
  const prefix = spec.connect.split(':')[0];
  OPENED.set(`${prefix}:connected`, spec);
  CLOSED.set(`${prefix}:disconnected`, spec);
  FAILED.set(`${prefix}:error`, spec);
}

interface Session {
  spec: SessionProtocol;
  msg: Record<string, unknown>;
  startedAt: number;
  /** When the transport actually opened, if it ever did. */
  openedAt?: number;
  sent: number;
  received: number;
  bytesSent: number;
  bytesReceived: number;
  firstTrafficAt?: number;
  lastTrafficAt?: number;
  /** Traffic per topic (MQTT) or event name (Socket.IO). */
  channels: Map<string, number>;
  errors: string[];
  /** Reported by handlers that make a real routing decision. */
  routing?: { proxied: boolean; route: string; warning?: string };
}

/**
 * Live sessions, keyed by tab.
 *
 * A tab holds at most one connection — connecting again closes the previous
 * one — so the tab id is the natural key and the map cannot grow past the
 * number of open tabs.
 */
const sessions = new Map<string, Session>();

/** Channel tallies are capped: a wildcard subscription can see endless topics. */
const MAX_CHANNELS = 50;
const MAX_ERRORS = 10;

function sizeOf(value: unknown): number {
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8');
  if (value === undefined || value === null) return 0;
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8'); } catch { return 0; }
}

/** The topic, event or tool name a frame belongs to, when it has one. */
function channelOf(out: Record<string, unknown>): string | undefined {
  const name = out.topic ?? out.event ?? out.eventName ?? out.toolName ?? out.promptName ?? out.uri;
  return typeof name === 'string' && name ? name : undefined;
}

/** The payload field each protocol uses, for sizing only — never stored. */
function payloadOf(out: Record<string, unknown>): unknown {
  return out.data ?? out.message ?? out.payload ?? out.args ?? out.result;
}

/**
 * Connect options worth recording.
 *
 * Credentials are recorded as present or absent, never by value. Unlike a
 * request header — which you are often debugging and which the detail view can
 * mask behind a toggle — a broker password tells you nothing you did not
 * already know, so keeping it would be pure risk.
 */
function connectionDetails(protocol: string, msg: Record<string, unknown>): Record<string, string> {
  const secret = (v: unknown) => (v ? '(set)' : undefined);
  const keep = (o: Record<string, string | undefined>): Record<string, string> =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Record<string, string>;

  switch (protocol) {
    case 'websocket':
      return keep({
        subprotocols: msg.protocols ? String(msg.protocols) : undefined,
        connectPayload: msg.initBody ? `${sizeOf(msg.initBody)} bytes sent on open` : undefined,
      });
    case 'sse':
      return keep({
        handshakeMethod: msg.initMethod ? String(msg.initMethod) : 'GET',
        connectPayload: msg.initBody ? `${sizeOf(msg.initBody)} bytes` : undefined,
        headerCount: msg.headers ? String((msg.headers as unknown[]).length) : undefined,
      });
    case 'socketio':
      return keep({
        namespace: msg.namespace ? String(msg.namespace) : '/',
        auth: msg.initBody ? '(set)' : undefined,
        headerCount: msg.headers ? String((msg.headers as unknown[]).length) : undefined,
      });
    case 'mcp':
      return keep({
        transport: msg.transport ? String(msg.transport) : undefined,
        command: msg.command ? String(msg.command) : undefined,
        server: msg.serverName ? String(msg.serverName) : undefined,
      });
    case 'mqtt':
      return keep({
        clientId: msg.clientId ? String(msg.clientId) : '(generated)',
        username: msg.username ? String(msg.username) : undefined,
        password: secret(msg.password),
        cleanSession: String(msg.cleanSession !== false),
        keepAlive: `${typeof msg.keepAlive === 'number' ? msg.keepAlive : 60}s`,
        lastWill: msg.lastWillTopic ? String(msg.lastWillTopic) : undefined,
        subscriptions: Array.isArray(msg.subscriptions) && msg.subscriptions.length
          ? String(msg.subscriptions.length) : undefined,
      });
    default:
      return {};
  }
}

function humanize(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${Math.round(s % 60)}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export interface SessionAuditRecord {
  connection: {
    protocol: string;
    url: string;
    details: Record<string, string>;
    openedAt?: string;
    /** True when the transport never opened at all. */
    neverOpened: boolean;
  };
  outcome: { state: 'closed' | 'failed' | 'abandoned'; summary: string; code?: string; reason?: string; errors?: string[] };
  traffic: {
    received: number; sent: number;
    bytesReceived: number; bytesSent: number;
    /** Busiest topics or event names, most active first. */
    channels?: Record<string, number>;
    idleMs?: number;
  };
  duration: { totalMs: number; connectedMs?: number; humanized: string };
  routing: { proxied: boolean; route: string; warning?: string };
  settings: Record<string, unknown>;
}

/** Call for every inbound message; ignores anything that is not a connect. */
export function noteSessionConnect(msg: Record<string, unknown>): void {
  const spec = BY_CONNECT.get(String(msg.type));
  const tabId = msg.tabId as string | undefined;
  if (!spec || !tabId) return;

  // Reconnecting on a tab replaces the old session, so the old one is written
  // out rather than dropped — its traffic really happened.
  if (sessions.has(tabId)) finish(tabId, 'abandoned', 'superseded by a new connection on the same tab');

  sessions.set(tabId, {
    spec, msg, startedAt: Date.now(),
    sent: 0, received: 0, bytesSent: 0, bytesReceived: 0,
    channels: new Map(), errors: [],
  });
}

/** Call for every outbound message; tallies traffic and closes sessions. */
export function auditSessionMessage(out: Record<string, unknown>): void {
  const type = String(out.type);
  const tabId = out.tabId as string | undefined;
  if (!tabId) return;

  const opened = OPENED.get(type);
  if (opened) {
    const session = sessions.get(tabId);
    if (session) {
      session.openedAt = Date.now();
      if (out.proxy) session.routing = toRouting(out.proxy);
    }
    return;
  }

  const traffic = TRAFFIC.get(type);
  if (traffic) {
    const session = sessions.get(tabId);
    if (!session) return;              // traffic on a session we never saw open
    const bytes = sizeOf(payloadOf(out));
    if (traffic.direction === 'in') { session.received++; session.bytesReceived += bytes; }
    else { session.sent++; session.bytesSent += bytes; }
    const now = Date.now();
    session.firstTrafficAt ??= now;
    session.lastTrafficAt = now;

    const channel = channelOf(out);
    if (channel && (session.channels.has(channel) || session.channels.size < MAX_CHANNELS)) {
      session.channels.set(channel, (session.channels.get(channel) ?? 0) + 1);
    }
    return;
  }

  const failed = FAILED.get(type);
  if (failed) {
    const session = sessions.get(tabId);
    if (!session) return;
    // MCP puts the text on `message`; everything else uses `error`.
    if (session.errors.length < MAX_ERRORS) {
      session.errors.push(String(out.error ?? out.message ?? 'unknown error'));
    }
    if (out.proxy && !session.routing) session.routing = toRouting(out.proxy);
    // An error before the transport opened is terminal — nothing will close a
    // connection that never existed, so the row is written here or never.
    if (!session.openedAt) finish(tabId, 'failed', 'the connection never opened');
    return;
  }

  const closed = CLOSED.get(type);
  if (closed) {
    finish(tabId, sessions.get(tabId)?.errors.length ? 'failed' : 'closed', undefined, out);
  }
}

/**
 * Write the row for a session and forget it.
 *
 * Every exit runs through here so that a session ending in an unusual way —
 * superseded, errored, panel closed — is recorded the same as a clean close.
 */
function finish(
  tabId: string,
  state: 'closed' | 'failed' | 'abandoned',
  note?: string,
  closeMsg?: Record<string, unknown>,
): void {
  const session = sessions.get(tabId);
  if (!session) return;
  sessions.delete(tabId);

  // The per-event toggle lives in the webview, so the connect message carries it.
  if (session.msg.auditEnabled === false) return;

  try {
    const endedAt = Date.now();
    const totalMs = endedAt - session.startedAt;
    const { spec } = session;

    const channels = [...session.channels.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    const code = closeMsg?.code !== undefined ? String(closeMsg.code) : undefined;
    const reason = closeMsg?.reason ? String(closeMsg.reason) : undefined;

    const summary =
      state === 'failed' ? (note ?? session.errors[0] ?? 'the connection reported an error')
      : state === 'abandoned' ? (note ?? 'still open when the panel closed')
      : session.openedAt ? 'closed normally'
      : 'closed before the connection opened';

    const record: SessionAuditRecord = {
      connection: {
        protocol: spec.protocol,
        url: String(session.msg.url ?? ''),
        details: connectionDetails(spec.protocol, session.msg),
        openedAt: session.openedAt ? new Date(session.openedAt).toISOString() : undefined,
        neverOpened: session.openedAt === undefined,
      },
      outcome: {
        state, summary, code, reason,
        errors: session.errors.length ? session.errors : undefined,
      },
      traffic: {
        received: session.received,
        sent: session.sent,
        bytesReceived: session.bytesReceived,
        bytesSent: session.bytesSent,
        channels: channels.length ? Object.fromEntries(channels) : undefined,
        // Time between the last frame and the close: a long tail is what a
        // silent subscription looks like from the outside.
        idleMs: session.lastTrafficAt ? endedAt - session.lastTrafficAt : undefined,
      },
      duration: {
        totalMs,
        connectedMs: session.openedAt ? endedAt - session.openedAt : undefined,
        humanized: humanize(totalMs),
      },
      // SSE resolves a real proxy decision and reports it; the transports that
      // cannot be proxied at all say so instead of claiming "direct".
      routing: session.routing ?? unproxiedRouting(spec.protocol),
      settings: getSetting<Record<string, unknown>>('general') ?? {},
    };

    insertUiAudit({
      event_type: spec.eventType,
      module: spec.module,
      button: spec.button,
      action: 'click',
      metadata: JSON.stringify({ ...record, protocol: spec.protocol, kind: 'session' }, null, 2),
    });
  } catch {
    // Auditing must never break a disconnect.
  }
}

function toRouting(proxy: unknown): { proxied: boolean; route: string; warning?: string } {
  const p = proxy as { used?: boolean; description?: string; warning?: string };
  return { proxied: p.used === true, route: p.description ?? 'direct', warning: p.warning };
}

/** Most realtime transports open their own sockets and cannot use the proxy. */
function unproxiedRouting(protocol: string): { proxied: boolean; route: string; warning?: string } {
  const reason = UNPROXIED_PROTOCOLS[protocol];
  return reason
    ? { proxied: false, route: 'direct (cannot be proxied)', warning: reason }
    : { proxied: false, route: 'direct' };
}

/**
 * Write out every session still open.
 *
 * Called when the panel goes away: a connection that was still live has no
 * close event coming, and dropping it would lose the whole session — exactly
 * the long-lived ones most worth having recorded.
 */
export function flushOpenSessions(): void {
  for (const tabId of [...sessions.keys()]) {
    finish(tabId, 'abandoned', 'still open when the panel closed');
  }
}

/** Test seam — the session map is module state. */
export function _resetSessionAudit(): void {
  sessions.clear();
}
