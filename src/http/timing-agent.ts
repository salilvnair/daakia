/**
 * Timing Agent — Creates http/https Agents that instrument socket events
 * to capture DNS, TCP, TLS, TTFB, and transfer timing.
 */
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as tls from 'tls';

export interface TimingPhase {
  name: string;
  startMs: number;
  durationMs: number;
}

export interface RequestTimings {
  /** Absolute time when socket was created */
  socketCreate: number;
  /** DNS lookup duration (ms) */
  dns: number;
  /** TCP connection duration (ms) */
  tcp: number;
  /** TLS handshake duration (ms) — 0 for http */
  tls: number;
  /** Time to first byte after connection (ms) */
  ttfb: number;
  /** Content download duration (ms) */
  download: number;
  /** Total request duration (ms) */
  total: number;
}

/**
 * Creates a custom HTTP agent that records socket-level timing events.
 * Returns the agent and a timings object that will be populated during the request.
 */
export function createTimedHttpAgent(): { agent: http.Agent; getTimings: () => RequestTimings } {
  const marks: Record<string, number> = {};

  const agent = new http.Agent({ keepAlive: false, maxSockets: 1 });
  const origCreateConnection = agent.createConnection.bind(agent);

  (agent as any).createConnection = (options: any, oncreate: any) => {
    marks.socketCreate = Date.now();
    const socket: net.Socket = origCreateConnection(options, oncreate);

    socket.once('lookup', () => { marks.dnsEnd = Date.now(); });
    socket.once('connect', () => { marks.tcpEnd = Date.now(); });

    return socket;
  };

  const getTimings = (): RequestTimings => {
    const socketCreate = marks.socketCreate || 0;
    const dnsEnd = marks.dnsEnd || socketCreate;
    const tcpEnd = marks.tcpEnd || dnsEnd;
    const ttfbMark = marks.ttfb || tcpEnd;
    const downloadEnd = marks.downloadEnd || ttfbMark;

    return {
      socketCreate,
      dns: dnsEnd - socketCreate,
      tcp: tcpEnd - dnsEnd,
      tls: 0,
      ttfb: ttfbMark - tcpEnd,
      download: downloadEnd - ttfbMark,
      total: downloadEnd - socketCreate,
    };
  };

  return { agent, getTimings, marks } as any;
}

/**
 * Creates a custom HTTPS agent that records socket-level timing events including TLS.
 */
export function createTimedHttpsAgent(rejectUnauthorized = true): { agent: https.Agent; getTimings: () => RequestTimings } {
  const marks: Record<string, number> = {};

  const agent = new https.Agent({ keepAlive: false, maxSockets: 1, rejectUnauthorized });
  const origCreateConnection = (agent as any).createConnection.bind(agent);

  (agent as any).createConnection = (options: any, oncreate: any) => {
    marks.socketCreate = Date.now();
    const socket: tls.TLSSocket = origCreateConnection(options, oncreate);

    socket.once('lookup', () => { marks.dnsEnd = Date.now(); });
    socket.once('connect', () => { marks.tcpEnd = Date.now(); });
    socket.once('secureConnect', () => { marks.tlsEnd = Date.now(); });

    return socket;
  };

  const getTimings = (): RequestTimings => {
    const socketCreate = marks.socketCreate || 0;
    const dnsEnd = marks.dnsEnd || socketCreate;
    const tcpEnd = marks.tcpEnd || dnsEnd;
    const tlsEnd = marks.tlsEnd || tcpEnd;
    const ttfbMark = marks.ttfb || tlsEnd;
    const downloadEnd = marks.downloadEnd || ttfbMark;

    return {
      socketCreate,
      dns: dnsEnd - socketCreate,
      tcp: tcpEnd - dnsEnd,
      tls: tlsEnd - tcpEnd,
      ttfb: ttfbMark - tlsEnd,
      download: downloadEnd - ttfbMark,
      total: downloadEnd - socketCreate,
    };
  };

  return { agent, getTimings, marks } as any;
}

/**
 * Marks TTFB time — call this when the first byte of the response is received.
 */
export function markTtfb(agentResult: { marks?: Record<string, number> }) {
  if ((agentResult as any).marks) {
    (agentResult as any).marks.ttfb = Date.now();
  }
}

/**
 * Marks download end — call this when the response is fully received.
 */
export function markDownloadEnd(agentResult: { marks?: Record<string, number> }) {
  if ((agentResult as any).marks) {
    (agentResult as any).marks.downloadEnd = Date.now();
  }
}

/**
 * Convert RequestTimings to TimelinePhase array for the DevTools Timeline panel.
 */
export function timingsToPhases(timings: RequestTimings): TimingPhase[] {
  const phases: TimingPhase[] = [];
  let offset = 0;

  if (timings.dns > 0) {
    phases.push({ name: 'DNS', startMs: offset, durationMs: timings.dns });
    offset += timings.dns;
  }
  if (timings.tcp > 0) {
    phases.push({ name: 'TCP', startMs: offset, durationMs: timings.tcp });
    offset += timings.tcp;
  }
  if (timings.tls > 0) {
    phases.push({ name: 'TLS', startMs: offset, durationMs: timings.tls });
    offset += timings.tls;
  }
  if (timings.ttfb > 0) {
    phases.push({ name: 'Wait', startMs: offset, durationMs: timings.ttfb });
    offset += timings.ttfb;
  }
  if (timings.download > 0) {
    phases.push({ name: 'Receive', startMs: offset, durationMs: timings.download });
  }

  return phases;
}
