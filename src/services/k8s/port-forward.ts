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
  /** The pod forwarded to — or, for a Service forward, the one it last landed on. */
  pod: string;
  workload?: { kind: string; name: string };
  /** Forward the Service rather than the pod: `svc/<name>`, remote ports being the Service's own. */
  service?: string;
  ports: ForwardPort[];
  /** When the pod goes away, move to the workload's current pod. Default on. */
  follow?: boolean;
  /** How many times to reconnect after the tunnel drops. 0 turns it off. Default 5. */
  reconnectTries?: number;
  /** Stop after this long with no connection; null for never. Default 30 minutes. */
  idleMs?: number | null;
  /** Contexts treated as production, besides `*prod*`. */
  prodPatterns?: string[];
}

export type ForwardState = 'connecting' | 'forwarding' | 'reconnecting' | 'stopped' | 'failed';
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
  /** Which reconnect this is, while reconnecting. */
  attempt?: number;
  /** When the next try goes out. */
  retryAt?: number;
  /** How many times it has come back. */
  reconnects: number;
  /** The pod it was on before the workload replaced it. */
  followedFrom?: string;
  /** Why it is reconnecting. */
  dropReason?: string;
}

export interface ForwardDeps {
  spawn: (args: string[]) => Promise<ChildProcess>;
  now?: () => number;
  /** The default idle limit, when a forward does not say. */
  idleMs?: number;
  /** A production forward's hard limit. */
  prodLimitMs?: number;
  /** Give up when kubectl has not said "Forwarding from" by then. */
  connectTimeoutMs?: number;
  /**
   * Which pod to forward to now: the same one while it is running, else — when
   * the forward follows its workload — the workload's newest ready pod.
   * Undefined when there is none yet.
   */
  resolvePod?: (f: ForwardInfo) => Promise<string | undefined>;
  /** For a Service forward: the pod it landed on. */
  landedPod?: (f: ForwardInfo) => Promise<string | undefined>;
  /** Backoff between reconnects, in ms. */
  backoff?: number[];
  /** Timers, injectable for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export const IDLE_MS = 30 * 60_000;
export const PROD_LIMIT_MS = 60 * 60_000;
export const RECONNECT_TRIES = 5;
export const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
const CONNECT_TIMEOUT_MS = 20_000;
/** Finished forwards kept, so "Start again" has something to start. */
const HISTORY = 12;

export function forwardArgs(spec: ForwardSpec): string[] {
  return ['--context', spec.context, '-n', spec.namespace, 'port-forward',
    spec.service ? `svc/${spec.service}` : `pod/${spec.pod}`,
    ...spec.ports.map(p => `${p.local}:${p.remote}`), '--address', '127.0.0.1'];
}

const RUNNING: ForwardState[] = ['connecting', 'forwarding', 'reconnecting'];
const RESTART_PAUSE_MS = 500;

export const isRunning = (f: { state: ForwardState }) => RUNNING.includes(f.state);

export interface ForwardManager {
  start: (spec: ForwardSpec) => ForwardInfo;
  stop: (id: string, reason?: StopReason) => void;
  stopAll: (reason?: StopReason) => void;
  /** Drop a finished forward from the list. */
  forget: (id: string) => void;
  /** A new kubectl for a running forward, on the same local ports. */
  restart: (id: string) => void;
  list: () => ForwardInfo[];
  onChange: (fn: () => void) => () => void;
  /** Idle and time-limit checks; run on a timer, callable from tests. */
  tick: () => void;
  dispose: () => void;
}

export function createForwardManager(deps: ForwardDeps): ForwardManager {
  const now = deps.now ?? Date.now;
  const prodLimitMs = deps.prodLimitMs ?? PROD_LIMIT_MS;
  const connectMs = deps.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
  const backoff = deps.backoff ?? BACKOFF_MS;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => { const t = setTimeout(fn, ms); (t as { unref?: () => void }).unref?.(); return t; });
  const clearTimer = deps.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const forwards = new Map<string, ForwardInfo>();
  const procs = new Map<string, ChildProcess>();
  const retries = new Map<string, unknown>();
  /** Which launch of a forward is current — a late event from an old kubectl is ignored. */
  const generation = new Map<string, number>();
  const listeners = new Set<() => void>();
  let seq = 0;

  const changed = () => { for (const fn of listeners) { try { fn(); } catch { /* a listener's own problem */ } } };

  function trimHistory() {
    const done = [...forwards.values()].filter(f => !isRunning(f))
      .sort((a, b) => (b.stoppedAt ?? 0) - (a.stoppedAt ?? 0));
    for (const f of done.slice(HISTORY)) forwards.delete(f.id);
  }

  function killProc(id: string) {
    const p = procs.get(id); procs.delete(id);
    if (p && p.exitCode === null) { try { p.kill(); } catch { /* already gone */ } }
  }

  function finish(id: string, state: 'stopped' | 'failed', patch: Partial<ForwardInfo>) {
    const f = forwards.get(id); if (!f || !isRunning(f)) return;
    Object.assign(f, patch, { state, stoppedAt: now(), retryAt: undefined });
    const r = retries.get(id); if (r !== undefined) { clearTimer(r); retries.delete(id); }
    generation.set(id, (generation.get(id) ?? 0) + 1);
    killProc(id);
    trimHistory();
    changed();
  }

  /**
   * The tunnel dropped. Come back after a pause, on the same local ports —
   * unless reconnecting is off, or the tries are used up.
   */
  function dropped(id: string, why: string) {
    const f = forwards.get(id); if (!f || !isRunning(f)) return;
    generation.set(id, (generation.get(id) ?? 0) + 1);
    killProc(id);
    const tries = f.reconnectTries ?? RECONNECT_TRIES;
    const attempt = (f.state === 'reconnecting' ? f.attempt ?? 0 : 0) + 1;
    if (attempt > tries) {
      finish(id, 'failed', { error: tries ? `${why} Gave up after ${tries} tries.` : why });
      return;
    }
    const wait = backoff[Math.min(attempt - 1, backoff.length - 1)];
    Object.assign(f, { state: 'reconnecting', attempt, retryAt: now() + wait, dropReason: why });
    retries.set(id, setTimer(() => { retries.delete(id); void launch(id); }, wait));
    changed();
  }

  async function launch(id: string): Promise<void> {
    let f = forwards.get(id); if (!f || !isRunning(f)) return;
    const gen = (generation.get(id) ?? 0) + 1;
    generation.set(id, gen);
    const current = () => forwards.get(id) && generation.get(id) === gen && isRunning(forwards.get(id)!);

    /* Which pod, now: the same one while it runs, else the workload's current one. */
    if (!f.service && deps.resolvePod && (f.state === 'reconnecting' || (f.follow !== false && f.workload))) {
      let pod: string | undefined;
      try { pod = await deps.resolvePod(f); } catch { pod = undefined; }
      if (!current()) return;
      f = forwards.get(id)!;
      if (!pod) {
        dropped(id, f.follow !== false && f.workload
          ? `No running pod of ${f.workload.name} to forward to.`
          : `${f.pod} is gone.`);
        return;
      }
      if (pod !== f.pod) { f.followedFrom = f.pod; f.pod = pod; }
    }
    f.command = ['kubectl', ...forwardArgs(f)].join(' ');
    changed();

    const bound = new Set<number>();
    let stderrTail = '';
    const onLine = (line: string) => {
      if (!line.trim() || !current()) return;
      const r = parseForwardLine(line);
      const cur = forwards.get(id)!;
      switch (r.kind) {
        case 'bound':
          bound.add(r.local);
          if (cur.state !== 'forwarding' && cur.ports.every(p => bound.has(p.local))) {
            if (cur.state === 'reconnecting') cur.reconnects++;
            /* A new tunnel starts clean: the last one's refused connection is not this one's. */
            Object.assign(cur, { state: 'forwarding', upAt: cur.upAt ?? now(), attempt: undefined, retryAt: undefined, dropReason: undefined, lastConnError: undefined });
            changed();
            if (cur.service && deps.landedPod) {
              void deps.landedPod(cur).then(p => { if (p && current() && p !== cur.pod) { cur.pod = p; changed(); } }).catch(() => undefined);
            }
          }
          break;
        case 'conn':
          cur.connections++; cur.lastActivity = now(); changed();
          break;
        case 'portTaken':
          finish(id, 'failed', { error: r.port ? `Local port ${r.port} is already in use on this machine.` : 'A local port is already in use on this machine.' });
          break;
        case 'forbidden':
          finish(id, 'failed', { error: 'Not allowed: this account cannot create pods/portforward in this namespace.' });
          break;
        case 'notRunning':
          /* On a first start there is nothing to wait for; mid-life it is a restart in progress. */
          if (cur.state === 'connecting' && !cur.reconnects) finish(id, 'failed', { error: 'The pod is not running, so there is nothing to forward to.' });
          else dropped(id, 'The pod is not running right now.');
          break;
        case 'lost':
          dropped(id, 'Lost the connection to the pod.');
          break;
        case 'connError':
          cur.lastConnError = r.text.slice(0, 300); cur.lastActivity = now(); changed();
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

    let proc: ChildProcess;
    try { proc = await deps.spawn(forwardArgs(f)); } catch (err) {
      finish(id, 'failed', { error: `kubectl could not start: ${(err as Error).message}` });
      return;
    }
    if (!current()) { try { proc.kill(); } catch { /* gone */ } return; }
    procs.set(id, proc);
    proc.stdout?.on('data', reader());
    proc.stderr?.on('data', reader());
    proc.on('error', err => { if (current()) finish(id, 'failed', { error: `kubectl could not start: ${err.message}` }); });
    proc.on('exit', code => {
      if (!current()) return;
      const cur = forwards.get(id)!;
      const said = stderrTail.trim().split('\n').pop();
      /* kubectl leaving a tunnel that was working is a drop; leaving before it ever worked is a failure. */
      if (cur.state === 'forwarding' || cur.reconnects > 0 || cur.state === 'reconnecting') dropped(id, said || 'kubectl stopped.');
      else finish(id, 'failed', { stopReason: 'exit', error: said || `kubectl exited (${code ?? 'signal'}).` });
    });
  }

  function start(spec: ForwardSpec): ForwardInfo {
    const id = `pf-${++seq}-${now().toString(36)}`;
    const prod = isProdContext(spec.context, [...DEFAULT_PROD_PATTERNS, ...(spec.prodPatterns ?? [])]);
    const info: ForwardInfo = {
      ...spec, ports: spec.ports.map(p => ({ ...p })), id, address: '127.0.0.1', state: 'connecting', prod,
      startedAt: now(), connections: 0, reconnects: 0, command: ['kubectl', ...forwardArgs(spec)].join(' '),
      stopsAt: prod ? now() + prodLimitMs : undefined,
      idleMs: spec.idleMs === undefined ? deps.idleMs ?? IDLE_MS : spec.idleMs,
    };
    forwards.set(id, info);
    changed();
    void launch(id);
    return info;
  }

  function tick() {
    const t = now();
    for (const f of forwards.values()) {
      if (f.state === 'connecting' && !f.reconnects && t - f.startedAt > connectMs) {
        finish(f.id, 'failed', { error: 'kubectl did not start forwarding within 20 seconds.' });
      } else if (f.stopsAt && t >= f.stopsAt && isRunning(f)) {
        finish(f.id, 'stopped', { stopReason: 'limit' });
      } else if (f.state === 'forwarding' && f.idleMs && t - (f.lastActivity ?? f.upAt ?? f.startedAt) >= f.idleMs) {
        finish(f.id, 'stopped', { stopReason: 'idle' });
      }
    }
  }
  const timer = setInterval(tick, 15_000);
  (timer as { unref?: () => void }).unref?.();

  return {
    start,
    stop: (id, reason = 'you') => finish(id, 'stopped', { stopReason: reason }),
    stopAll: (reason = 'you') => { for (const f of [...forwards.values()]) if (isRunning(f)) finish(f.id, 'stopped', { stopReason: reason }); },
    forget: id => { const f = forwards.get(id); if (f && !isRunning(f)) { forwards.delete(id); changed(); } },
    restart: id => {
      const f = forwards.get(id); if (!f || !isRunning(f)) return;
      generation.set(id, (generation.get(id) ?? 0) + 1);
      killProc(id);
      const r = retries.get(id); if (r !== undefined) clearTimer(r);
      /* Through the reconnect path — same ports, the workload's current pod — after a pause for the old kubectl to let go of them. */
      Object.assign(f, { state: 'reconnecting', attempt: 1, retryAt: now() + RESTART_PAUSE_MS, dropReason: 'Restarting the tunnel.' });
      retries.set(id, setTimer(() => { retries.delete(id); void launch(id); }, RESTART_PAUSE_MS));
      changed();
    },
    list: () => [...forwards.values()].map(f => ({ ...f, ports: f.ports.map(p => ({ ...p })) })),
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    tick,
    dispose: () => {
      clearInterval(timer);
      for (const f of forwards.values()) if (isRunning(f)) finish(f.id, 'stopped', { stopReason: 'closed' });
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
