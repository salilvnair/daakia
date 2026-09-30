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
  createForwardManager, declaredPorts, servicesFor, isPortFree, nextFreePort, portHolder,
  type ForwardInfo, type ForwardSpec,
} from '../../../services/k8s/port-forward';

type PostMessage = (msg: unknown) => void;

/* The last page to speak — where changes go. A reload replaces it. */
let sink: PostMessage | undefined;
const manager = createForwardManager({ spawn: args => spawnKubectl(args) });
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
  const busy = new Set(manager.list().filter(f => f.state === 'connecting' || f.state === 'forwarding').flatMap(f => f.ports.map(p => p.local)));
  const reserved: number[] = [];
  const results = [];
  for (const port of ports) {
    const free = !busy.has(port) && !reserved.includes(port) && await isPortFree(port);
    const suggestion = free ? port : await nextFreePort(port + 1, async p => !busy.has(p) && isPortFree(p), reserved);
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
  manager.start({
    context: s.context, namespace: s.namespace, pod: s.pod,
    workload: s.workload && typeof s.workload.name === 'string' ? { kind: String(s.workload.kind), name: s.workload.name } : undefined,
    ports: ports.map(p => ({ local: p.local, remote: p.remote, name: typeof p.name === 'string' ? p.name.slice(0, 63) : undefined, role: p.role })),
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
