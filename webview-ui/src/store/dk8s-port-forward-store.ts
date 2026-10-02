/**
 * Port forwards — what the host is running, and asking it for more.
 *
 * The forwards live in the host (see port-forward-handler.ts), which pushes
 * the whole list whenever one changes. This store mirrors it, and turns the
 * two questions the Ports tab asks — "what ports does this pod have" and "is
 * this local port free" — into promises.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { useUiStateStore } from './ui-state-store';
import { currentPfPrefs, PF_LAST_OPEN_PREF } from '../components/k8s/port-forward-prefs';
import { syncBindings } from '../components/k8s/forward-bindings';

export type PortRole =
  | 'http' | 'actuator' | 'debug' | 'grpc' | 'metrics'
  | 'postgres' | 'mysql' | 'redis' | 'mongo' | 'kafka' | 'amqp' | 'mqtt' | '';

export interface DeclaredPort { container: string; name?: string; port: number; protocol: string; role: PortRole }
export interface ServiceRoute { service: string; type: string; port: number; name?: string; targetPort: number | string; containerPort?: number }
export interface ForwardPort { local: number; remote: number; name?: string; role?: PortRole }

export type ForwardState = 'connecting' | 'forwarding' | 'reconnecting' | 'stopped' | 'failed';

export interface ForwardInfo {
  id: string;
  context: string;
  namespace: string;
  pod: string;
  workload?: { kind: string; name: string };
  ports: ForwardPort[];
  address: string;
  state: ForwardState;
  prod: boolean;
  startedAt: number;
  upAt?: number;
  connections: number;
  lastActivity?: number;
  error?: string;
  stopReason?: 'you' | 'idle' | 'limit' | 'closed' | 'exit';
  stoppedAt?: number;
  stopsAt?: number;
  command: string;
  lastConnError?: string;
  service?: string;
  follow?: boolean;
  reconnectTries?: number;
  /** Which reconnect this is, while reconnecting, and when the next try goes. */
  attempt?: number;
  retryAt?: number;
  reconnects: number;
  /** The pod it was on before its workload replaced it. */
  followedFrom?: string;
  dropReason?: string;
}

export interface PodPorts {
  phase?: string;
  ports: DeclaredPort[];
  services: ServiceRoute[];
  servicesError?: string;
  error?: string;
}

export interface PortCheck { port: number; free: boolean; suggestion?: number; holder?: { pid: number; name?: string } }

/** An answer from a forwarded port, read by the host. `status` 0: nothing answered. */
export interface CallResult { status: number; contentType?: string; body?: string; truncated?: boolean; ms?: number; error?: string; revertAt?: number }
export interface DumpResult { file?: string; bytes?: number; error?: string }
export interface OpenApiResult { ok?: boolean; port?: number; path?: string; name?: string; count?: number; pointed?: boolean; error?: string }
export interface LoggerReverted { id: string; logger: string; level: string | null; error?: string; at: number }

export interface ForwardRequest {
  context: string;
  namespace: string;
  pod: string;
  workload?: { kind: string; name: string };
  /** Forward the Service rather than the pod; remote ports are its own. */
  service?: string;
  ports: ForwardPort[];
}

/** Contexts treated as production — `*prod*` always, and the ones added in Settings. The host applies the same rule. */
export const PROD_PATTERNS = ['*prod*'];
export function isProdContext(context: string, patterns: string[] = [...PROD_PATTERNS, ...currentPfPrefs().prodPatterns]): boolean {
  return patterns.some(p => {
    const t = p.trim(); if (!t) return false;
    return new RegExp('^' + t.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i').test(context);
  });
}

export const podPortsKey = (t: { context: string; namespace: string; pod: string }) => `${t.context}/${t.namespace}/${t.pod}`;

export const isUp = (f: ForwardInfo) => f.state === 'connecting' || f.state === 'forwarding' || f.state === 'reconnecting';

/** Forwards to one pod, running first. */
export function forwardsFor(forwards: ForwardInfo[], p: { context?: string; namespace: string; name: string }): ForwardInfo[] {
  return forwards
    .filter(f => f.pod === p.name && f.namespace === p.namespace && (!p.context || f.context === p.context))
    .sort((a, b) => Number(isUp(b)) - Number(isUp(a)) || b.startedAt - a.startedAt);
}

/** How a forwarded port is addressed: a URL where it speaks HTTP, host:port otherwise. */
export function localAddress(p: ForwardPort): string {
  return p.role === 'http' || p.role === 'actuator' || p.role === 'metrics' || !p.role
    ? `http://localhost:${p.local}` : `localhost:${p.local}`;
}

interface State {
  forwards: ForwardInfo[];
  loaded: boolean;
  /** The Forwards panel beside the pods grid. */
  panelOpen: boolean;
  /**
   * Each pod's ports as last read, by `context/namespace/pod` — so coming back
   * to the Ports tab draws them at once instead of a skeleton every time.
   */
  portsByPod: Record<string, PodPorts>;
  /** Forwards that were up when Daakia last closed, offered again. Never production. */
  restorable: ForwardRequest[];
  /** Bytes of a heap dump written so far, by request. */
  dumpBytes: Record<string, number>;
  /** Logger levels the host put back on their timer, newest last. */
  reverted: LoggerReverted[];
  restart: (id: string) => void;
  /** A request to a forwarded port — the actuator, mostly. */
  call: (f: ForwardInfo, port: number, path: string, opts?: { method?: 'POST'; json?: unknown; accept?: string; confirmed?: boolean; revertMs?: number; previous?: string | null }) => Promise<CallResult>;
  attach: (f: ForwardInfo, port: number, kind: 'java' | 'python') => Promise<{ ok?: boolean; name?: string; error?: string }>;
  dump: (f: ForwardInfo, port: number, kind: 'threaddump' | 'heapdump', base: string, onReq?: (reqId: string) => void) => Promise<DumpResult>;
  openApi: (f: ForwardInfo) => Promise<OpenApiResult>;
  dismissRestore: () => void;
  setPanelOpen: (open: boolean) => void;
  refresh: () => void;
  loadPorts: (t: { context: string; namespace: string; pod: string }) => Promise<PodPorts>;
  check: (ports: number[]) => Promise<PortCheck[]>;
  start: (req: ForwardRequest) => void;
  stop: (id: string) => void;
  stopAll: () => void;
  forget: (id: string) => void;
}

const pending = new Map<string, (msg: Record<string, unknown>) => void>();
let listening = false;
let seq = 0;

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown> | undefined;
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('dk8s:pf:')) return;
    if (msg.type === 'dk8s:pf:dumpProgress') {
      const reqId = String(msg.reqId ?? '');
      usePortForwardStore.setState(s => ({ dumpBytes: { ...s.dumpBytes, [reqId]: Number(msg.bytes) || 0 } }));
      return;
    }
    if (msg.type === 'dk8s:pf:loggerReverted') {
      const r = { id: String(msg.id), logger: String(msg.logger), level: (msg.level as string | null) ?? null, error: msg.error as string | undefined, at: Date.now() };
      usePortForwardStore.setState(s => ({ reverted: [...s.reverted.slice(-19), r] }));
      return;
    }
    if (msg.type === 'dk8s:pf:list') {
      const forwards = (msg.forwards as ForwardInfo[]) ?? [];
      const first = !usePortForwardStore.getState().loaded;
      usePortForwardStore.setState({ forwards, loaded: true });
      rememberOpen(forwards, first);
      syncBindings(forwards);
      return;
    }
    const done = pending.get(String(msg.reqId ?? ''));
    if (done) { pending.delete(String(msg.reqId)); done(msg); }
  });
}

/**
 * Which forwards were up — kept so the next start can offer them again.
 *
 * Written as the list changes; production ones are never kept, since a tunnel
 * into production should never come back on its own. The first list after
 * Daakia starts is the one that decides whether there is anything to offer:
 * forwards still up (a page reload in the browser build) mean nothing was lost.
 */
function rememberOpen(forwards: ForwardInfo[], first: boolean) {
  const up = forwards.filter(isUp);
  const ui = useUiStateStore.getState();
  if (first) {
    const saved = parseRequests(ui.prefs[PF_LAST_OPEN_PREF]);
    usePortForwardStore.setState({ restorable: up.length ? [] : saved });
    if (!saved.length && !up.length) return;
  }
  if (!first || up.length) {
    const keep = up.filter(f => !f.prod).map(f => ({
      context: f.context, namespace: f.namespace, pod: f.pod, workload: f.workload, service: f.service, ports: f.ports,
    }));
    const next = JSON.stringify(keep);
    if ((ui.prefs[PF_LAST_OPEN_PREF] ?? '[]') !== next) ui.setPref(PF_LAST_OPEN_PREF, next);
    if (up.length) usePortForwardStore.setState({ restorable: [] });
  }
}

function parseRequests(raw: string | undefined): ForwardRequest[] {
  try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

function ask(type: string, body: Record<string, unknown>, opts: { timeoutMs?: number; onReq?: (reqId: string) => void } = {}): Promise<Record<string, unknown>> {
  listen();
  const reqId = `pf${++seq}`;
  opts.onReq?.(reqId);
  return new Promise(resolve => {
    pending.set(reqId, resolve);
    postMsg({ type, reqId, ...body });
    /* A host that never answers still lets the tab say so. */
    setTimeout(() => { if (pending.delete(reqId)) resolve({ error: 'No answer from Daakia — try again.' }); }, opts.timeoutMs ?? 30_000);
  });
}

export const usePortForwardStore = create<State>(set => ({
  forwards: [],
  loaded: false,
  panelOpen: false,
  portsByPod: {},
  restorable: [],
  dumpBytes: {},
  reverted: [],
  restart: id => postMsg({ type: 'dk8s:pf:restart', id }),
  call: async (f, port, path, opts = {}) => {
    const r = await ask('dk8s:pf:call', { id: f.id, port, path, ...opts });
    return { status: Number(r.status) || 0, ...r } as CallResult;
  },
  attach: async (f, port, kind) => (await ask('dk8s:pf:attach', { id: f.id, port, kind }, { timeoutMs: 60_000 })) as { ok?: boolean; error?: string },
  /* A heap dump of a big JVM takes minutes to write and to copy. */
  dump: async (f, port, kind, base, onReq) =>
    (await ask('dk8s:pf:dump', { id: f.id, port, kind, base, confirmed: kind === 'heapdump' }, { timeoutMs: kind === 'heapdump' ? 30 * 60_000 : 90_000, onReq })) as DumpResult,
  openApi: async f => (await ask('dk8s:pf:openapi', { id: f.id, ports: f.ports.map(p => p.local) }, { timeoutMs: 120_000 })) as OpenApiResult,
  dismissRestore: () => { set({ restorable: [] }); useUiStateStore.getState().setPref(PF_LAST_OPEN_PREF, '[]'); },
  setPanelOpen: panelOpen => set({ panelOpen }),
  refresh: () => { listen(); postMsg({ type: 'dk8s:pf:list' }); },
  loadPorts: async t => {
    const r = await ask('dk8s:pf:ports', t);
    const got: PodPorts = {
      phase: r.phase as string | undefined,
      ports: (r.ports as DeclaredPort[]) ?? [],
      services: (r.services as ServiceRoute[]) ?? [],
      servicesError: r.servicesError as string | undefined,
      error: r.error as string | undefined,
    };
    /* A failed re-read does not replace a good answer already on screen. */
    if (!got.error) set(s => ({ portsByPod: { ...s.portsByPod, [podPortsKey(t)]: got } }));
    return got;
  },
  check: async ports => ((await ask('dk8s:pf:check', { ports, strategy: currentPfPrefs().whenTaken })).results as PortCheck[]) ?? [],
  /* Every start carries the Settings as they are now: tries, follow, idle, production patterns. */
  start: req => {
    listen();
    const p = currentPfPrefs();
    postMsg({ type: 'dk8s:pf:start', spec: {
      ...req,
      follow: p.follow,
      reconnectTries: p.reconnect ? p.tries : 0,
      idleMs: p.idleMinutes ? p.idleMinutes * 60_000 : null,
      prodPatterns: p.prodPatterns,
    } });
  },
  stop: id => postMsg({ type: 'dk8s:pf:stop', id }),
  stopAll: () => postMsg({ type: 'dk8s:pf:stopAll' }),
  forget: id => postMsg({ type: 'dk8s:pf:forget', id }),
}));
