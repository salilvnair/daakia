/**
 * dk8s port forwarding — the messages the Ports tab and the Forwards panel send.
 *
 *   dk8s:pf:list                 → dk8s:pf:list     every forward, running or recently finished
 *   dk8s:pf:ports {pod…}         → dk8s:pf:ports    the pod's declared ports and the Services routing to it
 *   dk8s:pf:check {ports}        → dk8s:pf:check    free or taken, by whom, and the next free one
 *   dk8s:pf:start {spec}         (the list is pushed as it changes)
 *   dk8s:pf:stop {id} · dk8s:pf:stopAll · dk8s:pf:forget {id}
 *
 * The forwards belong to this process, not to a page: in the browser build a
 * reload reconnects to forwards that are still up. They end with the panel
 * (VS Code) or the server (browser build) — `disposePortForwards`.
 */
import { run, spawnKubectl } from '../../../services/k8s/kubectl';
import {
  createForwardManager, declaredPorts, servicesFor, isPortFree, nextFreePort, portHolder, isRunning,
  type ForwardInfo, type ForwardSpec,
} from '../../../services/k8s/port-forward';
import { resolveWorkload } from '../../../services/k8s/workload';

type PostMessage = (msg: unknown) => void;

/* The last page to speak — where changes go. A reload replaces it. */
let sink: PostMessage | undefined;
type RawPod = { metadata?: { name?: string; deletionTimestamp?: string; ownerReferences?: { kind?: string; name?: string }[] }; status?: { phase?: string; startTime?: string; containerStatuses?: { ready?: boolean }[] } };

/**
 * The pod a forward should be on now: its own while it is running and ready;
 * else, when it follows its workload, that workload's newest ready pod — one
 * no other forward of it is on, so "each replica" stays one pod per port
 * across a rollout. One `get pods` — the same read the pods grid makes.
 */
async function resolvePod(f: ForwardInfo): Promise<string | undefined> {
  const r = await run(['--context', f.context, '-n', f.namespace, 'get', 'pods', '-o', 'json'], { timeoutMs: 15_000, background: true });
  /* The API not answering is not the pod being gone: try the same pod again. */
  if (!r.ok) return f.pod;
  let items: RawPod[] = [];
  try { items = JSON.parse(r.stdout).items ?? []; } catch { return f.pod; }
  const ready = items.filter(p => !p.metadata?.deletionTimestamp && p.status?.phase === 'Running'
    && (p.status.containerStatuses ?? []).every(c => c.ready));
  if (ready.some(p => p.metadata?.name === f.pod)) return f.pod;
  if (f.follow === false || !f.workload) return undefined;
  const same = ready.filter(p => {
    const w = resolveWorkload(p.metadata?.ownerReferences?.[0]);
    return w?.kind === f.workload!.kind && w.name === f.workload!.name;
  }).sort((a, b) => String(b.status?.startTime ?? '').localeCompare(String(a.status?.startTime ?? '')));
  const taken = new Set(manager.list()
    .filter(o => o.id !== f.id && !o.service && isRunning(o) && o.context === f.context && o.namespace === f.namespace)
    .map(o => o.pod));
  return (same.find(p => !taken.has(p.metadata?.name ?? '')) ?? same[0])?.metadata?.name;
}

/** A Service forward's pod: the first ready address behind it. */
async function landedPod(f: ForwardInfo): Promise<string | undefined> {
  if (!f.service) return undefined;
  const at = ['--context', f.context, '-n', f.namespace];
  /* EndpointSlices first — v1 Endpoints is deprecated from 1.33 — and Endpoints for older clusters. */
  const slices = await run([...at, 'get', 'endpointslices', '-l', `kubernetes.io/service-name=${f.service}`, '-o', 'json'], { timeoutMs: 10_000, background: true });
  if (slices.ok) {
    try {
      const list = JSON.parse(slices.stdout) as { items?: { endpoints?: { conditions?: { ready?: boolean }; targetRef?: { kind?: string; name?: string } }[] }[] };
      const pod = list.items?.flatMap(i => i.endpoints ?? [])
        .find(e => e.conditions?.ready !== false && e.targetRef?.kind === 'Pod')?.targetRef?.name;
      if (pod) return pod;
    } catch { /* fall through */ }
  }
  const r = await run([...at, 'get', 'endpoints', f.service, '-o', 'json'], { timeoutMs: 10_000, background: true });
  if (!r.ok) return undefined;
  try {
    const ep = JSON.parse(r.stdout) as { subsets?: { addresses?: { targetRef?: { kind?: string; name?: string } }[] }[] };
    return ep.subsets?.flatMap(s => s.addresses ?? []).find(a => a.targetRef?.kind === 'Pod')?.targetRef?.name;
  } catch { return undefined; }
}

const manager = createForwardManager({ spawn: args => spawnKubectl(args), resolvePod, landedPod });
const listeners = new Set<(forwards: ForwardInfo[]) => void>();
manager.onChange(() => {
  const forwards = manager.list();
  sink?.({ type: 'dk8s:pf:list', forwards });
  for (const fn of listeners) fn(forwards);
});

/** For the VS Code status bar: every change, with the full list. */
export function onForwardsChange(fn: (forwards: ForwardInfo[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const NAME = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;
const okPort = (p: unknown) => Number.isInteger(p) && (p as number) >= 1 && (p as number) <= 65535;

export function handlePfList(_msg: Record<string, unknown>, post: PostMessage): void {
  sink = post;
  post({ type: 'dk8s:pf:list', forwards: manager.list() });
}

export async function handlePfPorts(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  sink = post;
  const reqId = String(msg.reqId ?? '');
  const context = String(msg.context ?? ''), namespace = String(msg.namespace ?? ''), pod = String(msg.pod ?? '');
  if (!context || context.startsWith('-') || !NAME.test(namespace) || !NAME.test(pod)) {
    post({ type: 'dk8s:pf:ports', reqId, error: 'That pod name does not look right.' });
    return;
  }
  const base = ['--context', context, '-n', namespace];
  const [podRes, svcRes] = await Promise.all([
    run([...base, 'get', 'pod', pod, '-o', 'json'], { timeoutMs: 15_000 }),
    run([...base, 'get', 'services', '-o', 'json'], { timeoutMs: 15_000 }),
  ]);
  if (!podRes.ok) {
    post({ type: 'dk8s:pf:ports', reqId, error: (podRes.stderr || podRes.failure || 'kubectl could not read the pod.').trim().slice(0, 400) });
    return;
  }
  let podJson: Record<string, unknown>;
  try { podJson = JSON.parse(podRes.stdout); } catch { post({ type: 'dk8s:pf:ports', reqId, error: 'kubectl returned something that is not JSON.' }); return; }
  let services: Record<string, unknown>[] = [];
  /* A namespace this account cannot list Services in still has ports worth forwarding. */
  if (svcRes.ok) { try { services = JSON.parse(svcRes.stdout).items ?? []; } catch { /* left empty */ } }
  post({
    type: 'dk8s:pf:ports', reqId,
    phase: (podJson as { status?: { phase?: string } }).status?.phase,
    ports: declaredPorts(podJson),
    services: servicesFor(podJson, services),
    servicesError: svcRes.ok ? undefined : 'Services could not be listed in this namespace.',
  });
}

export async function handlePfCheck(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  const reqId = String(msg.reqId ?? '');
  const ports = (Array.isArray(msg.ports) ? msg.ports : []).filter(okPort).slice(0, 10) as number[];
  const busy = new Set(manager.list().filter(isRunning).flatMap(f => f.ports.map(p => p.local)));
  /* How a taken port is replaced: the next free one, or 10000 above it (8080 → 18080) and free from there. */
  const plus = msg.strategy === 'plus10000';
  const reserved: number[] = [];
  const results = [];
  for (const port of ports) {
    const free = !busy.has(port) && !reserved.includes(port) && await isPortFree(port);
    const from = plus && port + 10000 <= 65535 ? port + 10000 : port + 1;
    const suggestion = free ? port : await nextFreePort(from, async p => !busy.has(p) && isPortFree(p), reserved);
    if (suggestion) reserved.push(suggestion);
    const holder = free ? undefined : busy.has(port) ? { pid: 0, name: 'another dk8s forward' } : await portHolder(port);
    results.push({ port, free, suggestion, holder });
  }
  post({ type: 'dk8s:pf:check', reqId, results });
}

export async function handlePfStart(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  sink = post;
  const s = msg.spec as ForwardSpec | undefined;
  const bad = (why: string) => post({ type: 'toast', toastType: 'error', message: `Port forward not started: ${why}` });
  if (!s || !s.context || s.context.startsWith('-') || !NAME.test(s.namespace) || !NAME.test(s.pod)) return bad('the pod is not named properly.');
  const ports = (s.ports ?? []).filter(p => okPort(p.local) && okPort(p.remote)).slice(0, 10);
  if (!ports.length) return bad('no port was given.');
  if (new Set(ports.map(p => p.local)).size !== ports.length) return bad('two ports ask for the same local port.');
  /* Checked again here: the page asked a moment ago, and something may have taken it since. */
  for (const p of ports) {
    if (!(await isPortFree(p.local))) return bad(`local port ${p.local} was taken in the meantime — pick another.`);
  }
  if (s.service !== undefined && !NAME.test(String(s.service))) return bad('the Service is not named properly.');
  const tries = Number(s.reconnectTries);
  const idle = s.idleMs === null ? null : Number(s.idleMs);
  manager.start({
    context: s.context, namespace: s.namespace, pod: s.pod,
    workload: s.workload && typeof s.workload.name === 'string' ? { kind: String(s.workload.kind), name: s.workload.name } : undefined,
    service: s.service ? String(s.service) : undefined,
    ports: ports.map(p => ({ local: p.local, remote: p.remote, name: typeof p.name === 'string' ? p.name.slice(0, 63) : undefined, role: p.role })),
    follow: s.follow !== false,
    reconnectTries: Number.isInteger(tries) && tries >= 0 && tries <= 10 ? tries : undefined,
    idleMs: idle === null ? null : Number.isFinite(idle) && idle >= 60_000 ? idle : undefined,
    prodPatterns: Array.isArray(s.prodPatterns) ? s.prodPatterns.filter(p => typeof p === 'string' && p.length <= 64).slice(0, 12) : undefined,
  });
}

export function handlePfStop(msg: Record<string, unknown>, post: PostMessage): void {
  sink = post;
  manager.stop(String(msg.id ?? ''), 'you');
}

export function handlePfStopAll(_msg: Record<string, unknown>, post: PostMessage): void {
  sink = post;
  manager.stopAll('you');
}

export function handlePfForget(msg: Record<string, unknown>, post: PostMessage): void {
  sink = post;
  manager.forget(String(msg.id ?? ''));
}

/** Every tunnel down — the panel closed, or the server is going away. */
export function disposePortForwards(): void {
  manager.stopAll('closed');
}

/**
 * A forward that is up and holds `local` — the only ports the "use it" calls
 * (actuator, heap dump, debugger) may reach, so they can never be pointed
 * anywhere else.
 */
export function forwardHolding(id: string, local: number): ForwardInfo | undefined {
  const f = manager.list().find(x => x.id === id);
  return f && f.state === 'forwarding' && f.ports.some(p => p.local === local) ? f : undefined;
}

export function handlePfRestart(msg: Record<string, unknown>, post: PostMessage): void {
  sink = post;
  manager.restart(String(msg.id ?? ''));
}
