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

export type PortRole =
  | 'http' | 'actuator' | 'debug' | 'grpc' | 'metrics'
  | 'postgres' | 'mysql' | 'redis' | 'mongo' | 'kafka' | 'amqp' | 'mqtt' | '';

export interface DeclaredPort { container: string; name?: string; port: number; protocol: string; role: PortRole }
export interface ServiceRoute { service: string; type: string; port: number; name?: string; targetPort: number | string; containerPort?: number }
export interface ForwardPort { local: number; remote: number; name?: string; role?: PortRole }

export type ForwardState = 'connecting' | 'forwarding' | 'stopped' | 'failed';

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
}

export interface PodPorts {
  phase?: string;
  ports: DeclaredPort[];
  services: ServiceRoute[];
  servicesError?: string;
  error?: string;
}

export interface PortCheck { port: number; free: boolean; suggestion?: number; holder?: { pid: number; name?: string } }

export interface ForwardRequest {
  context: string;
  namespace: string;
  pod: string;
  workload?: { kind: string; name: string };
  ports: ForwardPort[];
}

/** Contexts treated as production — the host applies the same rule. */
export const PROD_PATTERNS = ['*prod*'];
export function isProdContext(context: string, patterns: string[] = PROD_PATTERNS): boolean {
  return patterns.some(p => {
    const t = p.trim(); if (!t) return false;
    return new RegExp('^' + t.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i').test(context);
  });
}

export const podPortsKey = (t: { context: string; namespace: string; pod: string }) => `${t.context}/${t.namespace}/${t.pod}`;

export const isUp = (f: ForwardInfo) => f.state === 'connecting' || f.state === 'forwarding';

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
    if (msg.type === 'dk8s:pf:list') {
      usePortForwardStore.setState({ forwards: (msg.forwards as ForwardInfo[]) ?? [], loaded: true });
      return;
    }
    const done = pending.get(String(msg.reqId ?? ''));
    if (done) { pending.delete(String(msg.reqId)); done(msg); }
  });
}

function ask(type: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  listen();
  const reqId = `pf${++seq}`;
  return new Promise(resolve => {
    pending.set(reqId, resolve);
    postMsg({ type, reqId, ...body });
    /* A host that never answers still lets the tab say so. */
    setTimeout(() => { if (pending.delete(reqId)) resolve({ error: 'No answer from Daakia — try again.' }); }, 30_000);
  });
}

export const usePortForwardStore = create<State>(set => ({
  forwards: [],
  loaded: false,
  panelOpen: false,
  portsByPod: {},
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
  check: async ports => ((await ask('dk8s:pf:check', { ports })).results as PortCheck[]) ?? [],
  start: req => { listen(); postMsg({ type: 'dk8s:pf:start', spec: req }); },
  stop: id => postMsg({ type: 'dk8s:pf:stop', id }),
  stopAll: () => postMsg({ type: 'dk8s:pf:stopAll' }),
  forget: id => postMsg({ type: 'dk8s:pf:forget', id }),
}));
