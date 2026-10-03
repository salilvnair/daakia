/**
 * A `kubectl port-forward` someone else wrote — Daakia AI, mostly — read back
 * into a forward dk8s can start.
 *
 * The chat suggests commands as text. A port-forward is not one to run in a
 * terminal beside Daakia: dk8s keeps its own forwards up, follows the pod
 * across a rollout and stops them on exit, none of which a stray kubectl in a
 * shell does. So the suggestion is parsed here and handed to the same dialog
 * the Ports tab opens. Parsing never starts anything; the dialog does, when
 * the reader says so.
 */
import type { ForwardPort, ForwardRequest, PortRole } from '../../store/dk8s-port-forward-store';
import type { PodSummary } from '../../store/k8s-store';

export type ForwardKind = 'pod' | 'deploy' | 'svc';

export interface ParsedForward {
  kind: ForwardKind;
  name: string;
  namespace?: string;
  context?: string;
  /** `local` 0 where the command left the local port to kubectl (`:8080`). */
  ports: { local: number; remote: number }[];
}

const KINDS: Record<string, ForwardKind> = {
  pod: 'pod', pods: 'pod', po: 'pod',
  deploy: 'deploy', deployment: 'deploy', deployments: 'deploy',
  svc: 'svc', service: 'svc', services: 'svc',
};

const portNumber = (s: string) => (/^\d{1,5}$/.test(s) && Number(s) >= 1 && Number(s) <= 65535 ? Number(s) : undefined);

/** `8080:8080`, `18081:8081`, `8080` (the same both sides) or `:8080` (any local port). */
function portSpec(s: string): { local: number; remote: number } | undefined {
  const m = /^(\d*):(\d+)$/.exec(s);
  if (m) {
    const remote = portNumber(m[2]);
    if (remote === undefined) return undefined;
    if (!m[1]) return { local: 0, remote };
    const local = portNumber(m[1]);
    return local === undefined ? undefined : { local, remote };
  }
  const same = portNumber(s);
  return same === undefined ? undefined : { local: same, remote: same };
}

/**
 * The parts of a `kubectl port-forward` command, or nothing when it is not
 * one — or is one this cannot be sure of. A flag it does not know is a reason
 * to give up rather than guess: the dialog would show a forward the command
 * did not ask for.
 */
export function parsePortForward(command: string): ParsedForward | undefined {
  const words = command.trim().split(/\s+/);
  if (words[0] !== 'kubectl') return undefined;
  let namespace: string | undefined;
  let context: string | undefined;
  const rest: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const eq = /^(--[a-z-]+)=(.*)$/.exec(w);
    const flag = eq ? eq[1] : w;
    const value = () => (eq ? eq[2] : words[++i]);
    if (flag === '-n' || flag === '--namespace') namespace = value();
    else if (flag === '--context') context = value();
    /* Where kubectl listens. dk8s binds 127.0.0.1 itself, and says so in the dialog. */
    else if (flag === '--address') value();
    else if (w.startsWith('-')) return undefined;
    else rest.push(w);
  }
  if (rest[0] !== 'port-forward' || rest.length < 3) return undefined;
  if (namespace === '' || context === '') return undefined;

  const target = rest[1];
  const slash = target.indexOf('/');
  const kind = slash < 0 ? 'pod' : KINDS[target.slice(0, slash).toLowerCase()];
  const name = slash < 0 ? target : target.slice(slash + 1);
  if (!kind || !/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(name)) return undefined;

  const ports = rest.slice(2).map(portSpec);
  if (ports.some(p => !p)) return undefined;
  return { kind, name, namespace, context, ports: ports as ParsedForward['ports'] };
}

/**
 * What a port is for, from its number — the host's `portRole` without the
 * name, which a command does not carry. Kept to the numbers the host knows.
 */
export function roleOfPort(port: number): PortRole {
  if (port === 5005 || port === 5678) return 'debug';
  if (port === 9090 || port === 9100 || port === 9404) return 'metrics';
  if (port === 50051) return 'grpc';
  if (port === 5432) return 'postgres';
  if (port === 3306) return 'mysql';
  if (port === 6379) return 'redis';
  if (port === 27017) return 'mongo';
  if (port === 9092) return 'kafka';
  if (port === 5672) return 'amqp';
  if (port === 1883) return 'mqtt';
  if ([80, 443, 3000].includes(port) || (port >= 8000 && port <= 8999)) return 'http';
  return '';
}

export type ResolvedForward =
  | { ok: true; req: ForwardRequest; who: string }
  | { ok: false; reason: string };

const isRunning = (p: PodSummary) => p.phase === 'Running' && !p.deleting;

/**
 * The parsed command against the pods dk8s is watching.
 *
 * Only a watched pod can be forwarded from here: dk8s needs its context, its
 * workload (to follow it) and its ports, and has them only for what it lists.
 * A command for anything else says so instead of offering a button that would
 * fail.
 */
export function resolveForward(
  parsed: ParsedForward,
  pods: PodSummary[],
  scope: { context?: string; namespace?: string } = {},
): ResolvedForward {
  const context = parsed.context ?? scope.context;
  const inScope = (p: PodSummary) =>
    (!context || !p.context || p.context === context)
    && (!parsed.namespace || p.namespace === parsed.namespace);

  let pod: PodSummary | undefined;
  if (parsed.kind === 'pod') {
    const named = pods.filter(p => p.name === parsed.name && inScope(p));
    if (named.length > 1 && !parsed.namespace) {
      return { ok: false, reason: `${parsed.name} is in ${named.length} namespaces — say which with -n.` };
    }
    pod = named[0];
    if (!pod) return { ok: false, reason: `${parsed.name} is not one of the pods dk8s is watching.` };
  } else {
    /* A Deployment or a Service: the pod dk8s would land on is a running one of
       that workload. A Service named after its workload is the usual case;
       anything else needs the pod's own Ports tab, which knows its selectors. */
    const of = pods.filter(p => p.workload?.name === parsed.name && inScope(p));
    pod = of.find(isRunning) ?? of[0];
    if (!pod) {
      return {
        ok: false,
        reason: parsed.kind === 'svc'
          ? `No watched pod belongs to a workload called ${parsed.name} — open the pod's Ports tab to forward its Service.`
          : `No watched pod belongs to ${parsed.name}.`,
      };
    }
  }

  const ports: ForwardPort[] = parsed.ports.map(p => ({
    local: p.local || p.remote,
    remote: p.remote,
    role: roleOfPort(p.remote),
  }));
  const req: ForwardRequest = {
    context: pod.context ?? context ?? '',
    namespace: pod.namespace,
    pod: pod.name,
    ...(pod.workload ? { workload: pod.workload } : {}),
    ...(parsed.kind === 'svc' ? { service: parsed.name } : {}),
    ports,
  };
  if (!req.context) return { ok: false, reason: 'dk8s does not know which cluster that pod is in.' };
  const who = parsed.kind === 'svc' ? `svc/${parsed.name}` : parsed.kind === 'deploy' ? `${parsed.name} (${pod.name})` : pod.name;
  return { ok: true, req, who };
}
