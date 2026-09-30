/**
 * Port forwarding: a pod's port, on this machine.
 *
 * `kubectl port-forward` run the way dk8s runs every long-lived kubectl —
 * through `spawnKubectl`, so it is in the Commands audit — with its output read
 * into a state somebody can look at: connecting, forwarding (and how many
 * connections went through), stopped, failed and why.
 *
 * ── What it will not do ──
 *
 * Bind to anything but 127.0.0.1. A forward is a tunnel into the cluster; one
 * that listens on the network hands that tunnel to everyone on the Wi-Fi.
 *
 * Outlive Daakia, or sit forgotten: an idle forward stops after a while, and
 * one into a production context stops after an hour whatever its traffic.
 *
 * This module imports nothing from the VS Code API, so the browser build and
 * the tests run it as it ships.
 */
import type { ChildProcess } from 'child_process';

// ── Ports and what they are for ────────────────────────────────────────────

export type PortRole =
  | 'http' | 'actuator' | 'debug' | 'grpc' | 'metrics'
  | 'postgres' | 'mysql' | 'redis' | 'mongo' | 'kafka' | 'amqp' | 'mqtt' | '';

/**
 * What a port is probably for, from its name first and its number second.
 *
 * Only a guess, and shown as one — but "8081 · actuator" beside "8080 · HTTP
 * API" is the difference between knowing which to forward and trying both.
 */
export function portRole(name: string | undefined, port: number): PortRole {
  const n = (name ?? '').toLowerCase();
  if (/jdwp|debug/.test(n) || port === 5005 || port === 5678) return 'debug';
  if (/manag|actuator|admin/.test(n)) return 'actuator';
  if (/metric|prom/.test(n) || port === 9090 || port === 9100 || port === 9404) return 'metrics';
  if (/grpc/.test(n) || port === 50051) return 'grpc';
  if (/postgres|pg/.test(n) || port === 5432) return 'postgres';
  if (/mysql|maria/.test(n) || port === 3306) return 'mysql';
  if (/redis/.test(n) || port === 6379) return 'redis';
  if (/mongo/.test(n) || port === 27017) return 'mongo';
  if (/kafka/.test(n) || port === 9092) return 'kafka';
  if (/amqp|rabbit/.test(n) || port === 5672) return 'amqp';
  if (/mqtt/.test(n) || port === 1883) return 'mqtt';
  /* 8000–8999 is where app servers listen when nobody named the port — zp-backend's 8104. */
  if (/http|web|api/.test(n) || [80, 443, 3000].includes(port) || (port >= 8000 && port <= 8999)) return 'http';
  return '';
}

export interface DeclaredPort {
  container: string;
  name?: string;
  port: number;
  protocol: string;
  role: PortRole;
}

export interface ServiceRoute {
  service: string;
  type: string;
  /** The Service's own port. */
  port: number;
  name?: string;
  /** What it sends to — a number, or a port name the pod resolves. */
  targetPort: number | string;
  /** `targetPort` resolved against this pod's ports. */
  containerPort?: number;
}

type Raw = Record<string, any>;

/** The ports a pod's containers say they listen on. */
export function declaredPorts(pod: Raw): DeclaredPort[] {
  const out: DeclaredPort[] = [];
  for (const c of pod?.spec?.containers ?? []) {
    for (const p of c.ports ?? []) {
      const port = Number(p.containerPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
      out.push({ container: String(c.name ?? ''), name: p.name || undefined, port, protocol: p.protocol ?? 'TCP', role: portRole(p.name, port) });
    }
  }
  return out;
}

/**
 * The Services whose selector picks this pod, and where each of their ports
 * lands on it.
 *
 * A Service with no selector (an ExternalName, or one whose endpoints are
 * managed by hand) routes to nothing dk8s can see, and is left out rather than
 * guessed at.
 */
export function servicesFor(pod: Raw, services: Raw[]): ServiceRoute[] {
  const labels: Record<string, string> = pod?.metadata?.labels ?? {};
  const byName = new Map<string, number>();
  for (const p of declaredPorts(pod)) if (p.name) byName.set(p.name, p.port);
  const out: ServiceRoute[] = [];
  for (const s of services) {
    const sel: Record<string, string> | undefined = s?.spec?.selector;
    if (!sel || !Object.keys(sel).length) continue;
    if (!Object.entries(sel).every(([k, v]) => labels[k] === v)) continue;
    for (const p of s.spec.ports ?? []) {
      const target = p.targetPort ?? p.port;
      const containerPort = typeof target === 'number' ? target : byName.get(String(target)) ?? (/^\d+$/.test(String(target)) ? Number(target) : undefined);
      out.push({ service: String(s.metadata?.name ?? ''), type: String(s.spec.type ?? 'ClusterIP'), port: Number(p.port), name: p.name || undefined, targetPort: target, containerPort });
    }
  }
  return out;
}

// ── Production ─────────────────────────────────────────────────────────────

/** Contexts treated as production when nothing else is said. */
export const DEFAULT_PROD_PATTERNS = ['*prod*'];

/** A context name against simple `*` patterns, case-insensitively. */
export function isProdContext(context: string, patterns: string[] = DEFAULT_PROD_PATTERNS): boolean {
  return patterns.some(p => {
    const t = p.trim(); if (!t) return false;
    const re = new RegExp('^' + t.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
    return re.test(context);
  });
}

// ── What kubectl says ──────────────────────────────────────────────────────

export type ForwardLine =
  | { kind: 'bound'; local: number; remote: number }
  | { kind: 'conn'; local: number }
  | { kind: 'portTaken'; port?: number; text: string }
  | { kind: 'forbidden'; text: string }
  | { kind: 'notRunning'; text: string }
  | { kind: 'lost'; text: string }
  | { kind: 'connError'; text: string }
  | { kind: 'other'; text: string };

/** One line of `kubectl port-forward` output, read. */
export function parseForwardLine(line: string): ForwardLine {
  const text = line.trim();
  let m = /^Forwarding from (?:\[[^\]]+\]|[\d.]+):(\d+) -> (\d+)/.exec(text);
  if (m) return { kind: 'bound', local: Number(m[1]), remote: Number(m[2]) };
  m = /^Handling connection for (\d+)/.exec(text);
  if (m) return { kind: 'conn', local: Number(m[1]) };
  if (/unable to listen on (?:any of the requested ports|port)|address already in use|bind: /i.test(text)) {
    const p = /(?:port |:)(\d{2,5})\b/.exec(text);
    return { kind: 'portTaken', port: p ? Number(p[1]) : undefined, text };
  }
  if (/forbidden|cannot create resource "pods\/portforward"/i.test(text)) return { kind: 'forbidden', text };
  if (/pod is not running|Current status=/i.test(text)) return { kind: 'notRunning', text };
  if (/lost connection to pod|error upgrading connection|connection reset by peer|EOF$/i.test(text)) return { kind: 'lost', text };
  if (/an error occurred forwarding|connection refused/i.test(text)) return { kind: 'connError', text };
  return { kind: 'other', text };
}

// ── The forwards ───────────────────────────────────────────────────────────

export interface ForwardPort {
  local: number;
  remote: number;
  name?: string;
  role?: PortRole;
}

export interface ForwardSpec {
  context: string;
  namespace: string;
  pod: string;
  workload?: { kind: string; name: string };
  ports: ForwardPort[];
}

export type ForwardState = 'connecting' | 'forwarding' | 'stopped' | 'failed';
export type StopReason = 'you' | 'idle' | 'limit' | 'closed' | 'exit';

export interface ForwardInfo extends ForwardSpec {
  id: string;
  address: '127.0.0.1';
  state: ForwardState;
  prod: boolean;
  startedAt: number;
  upAt?: number;
  connections: number;
  lastActivity?: number;
  /** Why it failed, in kubectl's words where it said any. */
  error?: string;
  /** Why it stopped, when it did. */
  stopReason?: StopReason;
  stoppedAt?: number;
  /** When a production forward stops regardless of traffic. */
  stopsAt?: number;
  /** The exact command, for copying and for the audit. */
  command: string;
  /** The last per-connection error — nothing listening in the pod, say. Not fatal. */
  lastConnError?: string;
}

export interface ForwardDeps {
  spawn: (args: string[]) => Promise<ChildProcess>;
  now?: () => number;
  /** Stop after this long with no connection. */
  idleMs?: number;
  /** A production forward's hard limit. */
  prodLimitMs?: number;
  /** Give up when kubectl has not said "Forwarding from" by then. */
  connectTimeoutMs?: number;
  prodPatterns?: () => string[];
}

export const IDLE_MS = 30 * 60_000;
export const PROD_LIMIT_MS = 60 * 60_000;
const CONNECT_TIMEOUT_MS = 20_000;
/** Finished forwards kept, so "Start again" has something to start. */
const HISTORY = 12;

export function forwardArgs(spec: ForwardSpec): string[] {
  return ['--context', spec.context, '-n', spec.namespace, 'port-forward', `pod/${spec.pod}`,
    ...spec.ports.map(p => `${p.local}:${p.remote}`), '--address', '127.0.0.1'];
}

export interface ForwardManager {
  start: (spec: ForwardSpec) => ForwardInfo;
  stop: (id: string, reason?: StopReason) => void;
  stopAll: (reason?: StopReason) => void;
  /** Drop a finished forward from the list. */
  forget: (id: string) => void;
  list: () => ForwardInfo[];
  onChange: (fn: () => void) => () => void;
  /** Idle and time-limit checks; run on a timer, callable from tests. */
  tick: () => void;
  dispose: () => void;
}

export function createForwardManager(deps: ForwardDeps): ForwardManager {
  const now = deps.now ?? Date.now;
  const idleMs = deps.idleMs ?? IDLE_MS;
  const prodLimitMs = deps.prodLimitMs ?? PROD_LIMIT_MS;
  const connectMs = deps.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
  const forwards = new Map<string, ForwardInfo>();
  const procs = new Map<string, ChildProcess>();
  const listeners = new Set<() => void>();
  let seq = 0;

  const changed = () => { for (const fn of listeners) { try { fn(); } catch { /* a listener's own problem */ } } };

  function trimHistory() {
    const done = [...forwards.values()].filter(f => f.state === 'stopped' || f.state === 'failed')
      .sort((a, b) => (b.stoppedAt ?? 0) - (a.stoppedAt ?? 0));
    for (const f of done.slice(HISTORY)) forwards.delete(f.id);
  }

  function finish(id: string, state: 'stopped' | 'failed', patch: Partial<ForwardInfo>) {
    const f = forwards.get(id); if (!f) return;
    if (f.state === 'stopped' || f.state === 'failed') return;
    Object.assign(f, patch, { state, stoppedAt: now() });
    const p = procs.get(id); procs.delete(id);
    if (p && p.exitCode === null) { try { p.kill(); } catch { /* already gone */ } }
    trimHistory();
    changed();
  }

  function start(spec: ForwardSpec): ForwardInfo {
    const id = `pf-${++seq}-${now().toString(36)}`;
    const prod = isProdContext(spec.context, deps.prodPatterns?.() ?? DEFAULT_PROD_PATTERNS);
    const args = forwardArgs(spec);
    const info: ForwardInfo = {
      ...spec, ports: spec.ports.map(p => ({ ...p })), id, address: '127.0.0.1', state: 'connecting', prod,
      startedAt: now(), connections: 0, command: ['kubectl', ...args].join(' '),
      stopsAt: prod ? now() + prodLimitMs : undefined,
    };
    forwards.set(id, info);
    changed();

    const bound = new Set<number>();
    let stderrTail = '';
    const onLine = (line: string) => {
      if (!line.trim()) return;
      const r = parseForwardLine(line);
      const f = forwards.get(id); if (!f) return;
      switch (r.kind) {
        case 'bound':
          bound.add(r.local);
          if (f.state === 'connecting' && f.ports.every(p => bound.has(p.local))) { f.state = 'forwarding'; f.upAt = now(); changed(); }
          break;
        case 'conn':
          f.connections++; f.lastActivity = now(); changed();
          break;
        case 'portTaken':
          finish(id, 'failed', { error: r.port ? `Local port ${r.port} is already in use on this machine.` : 'A local port is already in use on this machine.' });
          break;
        case 'forbidden':
          finish(id, 'failed', { error: 'Not allowed: this account cannot create pods/portforward in this namespace.' });
          break;
        case 'notRunning':
          finish(id, 'failed', { error: 'The pod is not running, so there is nothing to forward to.' });
          break;
        case 'lost':
          finish(id, 'failed', { error: 'Lost the connection to the pod — it may have restarted or been replaced.' });
          break;
        case 'connError':
          f.lastConnError = r.text.slice(0, 300); f.lastActivity = now(); changed();
          break;
        default:
          stderrTail = (stderrTail + '\n' + r.text).slice(-600);
      }
    };
    const reader = () => {
      let buf = '';
      return (chunk: Buffer | string) => {
        buf += chunk.toString();
        const lines = buf.split(/\r?\n/); buf = lines.pop() ?? '';
        lines.forEach(onLine);
      };
    };

    deps.spawn(args).then(proc => {
      const f = forwards.get(id);
      if (!f || f.state === 'stopped' || f.state === 'failed') { try { proc.kill(); } catch { /* gone */ } return; }
      procs.set(id, proc);
      proc.stdout?.on('data', reader());
      proc.stderr?.on('data', reader());
      proc.on('error', err => finish(id, 'failed', { error: `kubectl could not start: ${err.message}` }));
      proc.on('exit', code => {
        const cur = forwards.get(id);
        if (!cur || cur.state === 'stopped' || cur.state === 'failed') return;
        finish(id, 'failed', { stopReason: 'exit', error: stderrTail.trim().split('\n').pop() || `kubectl exited (${code ?? 'signal'}).` });
      });
    }).catch(err => finish(id, 'failed', { error: `kubectl could not start: ${(err as Error).message}` }));

    return info;
  }

  function tick() {
    const t = now();
    for (const f of forwards.values()) {
      if (f.state === 'connecting' && t - f.startedAt > connectMs) {
        finish(f.id, 'failed', { error: 'kubectl did not start forwarding within 20 seconds.' });
      } else if (f.state === 'forwarding') {
        if (f.stopsAt && t >= f.stopsAt) finish(f.id, 'stopped', { stopReason: 'limit' });
        else if (t - (f.lastActivity ?? f.upAt ?? f.startedAt) >= idleMs) finish(f.id, 'stopped', { stopReason: 'idle' });
      }
    }
  }
  const timer = setInterval(tick, 15_000);
  (timer as { unref?: () => void }).unref?.();

  return {
    start,
    stop: (id, reason = 'you') => finish(id, 'stopped', { stopReason: reason }),
    stopAll: (reason = 'you') => { for (const f of [...forwards.values()]) if (f.state === 'connecting' || f.state === 'forwarding') finish(f.id, 'stopped', { stopReason: reason }); },
    forget: id => { const f = forwards.get(id); if (f && (f.state === 'stopped' || f.state === 'failed')) { forwards.delete(id); changed(); } },
    list: () => [...forwards.values()].map(f => ({ ...f, ports: f.ports.map(p => ({ ...p })) })),
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    tick,
    dispose: () => {
      clearInterval(timer);
      for (const f of forwards.values()) if (f.state === 'connecting' || f.state === 'forwarding') finish(f.id, 'stopped', { stopReason: 'closed' });
      listeners.clear();
    },
  };
}

// ── Local ports ────────────────────────────────────────────────────────────

/** Whether a port on this machine's loopback can be listened on right now. */
export async function isPortFree(port: number): Promise<boolean> {
  const net = await import('net');
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

/**
 * The port to use: the one asked for when it is free, else the next free one
 * above it. `reserved` is ports another forward in the same request is taking.
 */
export async function nextFreePort(port: number, isFree: (p: number) => Promise<boolean>, reserved: number[] = []): Promise<number | undefined> {
  for (let p = port; p <= Math.min(65535, port + 200); p++) {
    if (reserved.includes(p)) continue;
    if (await isFree(p)) return p;
  }
  return undefined;
}

/**
 * Which process is listening on a port — "taken by node.exe (PID 29948)".
 * Best effort: nothing is said when the tools are missing or slow.
 */
export async function portHolder(port: number): Promise<{ pid: number; name?: string } | undefined> {
  const { execFile } = await import('child_process');
  const exec = (cmd: string, args: string[]) => new Promise<string>(resolve => {
    execFile(cmd, args, { timeout: 3000, windowsHide: true }, (_e, out) => resolve(String(out ?? '')));
  });
  try {
    if (process.platform === 'win32') {
      const out = await exec('netstat', ['-ano', '-p', 'TCP']);
      const line = out.split(/\r?\n/).find(l => /LISTENING/i.test(l) && new RegExp(`[:.]${port}\\s`).test(l.trim().split(/\s+/)[1] + ' '));
      const pid = line ? Number(line.trim().split(/\s+/).pop()) : NaN;
      if (!pid) return undefined;
      const task = await exec('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
      const name = /^"([^"]+)"/.exec(task.trim())?.[1];
      return { pid, name };
    }
    const out = await exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc']);
    const pid = Number(/^p(\d+)/m.exec(out)?.[1]);
    if (!pid) return undefined;
    return { pid, name: /^c(.+)$/m.exec(out)?.[1] };
  } catch {
    return undefined;
  }
}
