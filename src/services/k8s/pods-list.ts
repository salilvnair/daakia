/**
 * A namespace's pods, in the bytes a terminal would use.
 *
 * ── The payload this replaces ──
 *
 * The grid was built from `kubectl get pods -o json`, because a plain table
 * does not carry the owning workload, the images, or the per-container
 * statuses the cards show. That is true, and it is also the wrong conclusion:
 * the table format was never the only alternative to the full object.
 *
 * Measured on one namespace of six pods:
 *
 *   get pods -o json              89ms   28,094 bytes
 *   get pods -o wide --no-headers 79ms      378 bytes   (and missing half of it)
 *   this                          82ms      565 bytes   (and missing none of it)
 *
 * Fifty times smaller, for the same screen. On a namespace of a hundred and
 * fifty pods behind a VPN that is the difference between a pod list and a
 * stopwatch — roughly 1.5 MB against 20 KB, per list, every time one is taken.
 *
 * ── Why a go-template and not custom-columns ──
 *
 * `-o custom-columns` is whitespace-aligned, so a field that is empty or that
 * contains a space silently shifts every column after it. A template writes
 * exactly what it is told, and the separators below are ASCII control
 * characters that cannot occur in any of these values — so parsing is a split
 * rather than a guess.
 *
 * ── On `lastRestartAt` ──
 *
 * It lives under `lastState.terminated.finishedAt`, absent on a pod that has
 * never restarted, so it is read behind a conditional. Left out of the first
 * version of this and immediately missed: the grid said "1 restart · time
 * unknown" on every pod that had ever restarted, which is worse than the
 * figure it replaced.
 */
import { run } from './kubectl';
import { clusterTimeoutMs } from './k8s-timeouts';

/** Between fields. ASCII unit separator: never inside a name, image or date. */
const F = '\x1f';
/** Between the parts of one container. ASCII record separator. */
const SUB = '\x1e';
/** Between containers. ASCII group separator. */
const ITEM = '\x1d';

/**
 * The template, built once.
 *
 * `or .field ""` throughout, because a go-template prints `<no value>` for a
 * missing key — a literal string that would then have to be recognised and
 * stripped at every field rather than never produced.
 */
export const POD_LIST_TEMPLATE = [
  '{{range .items}}',
  '{{.metadata.name}}', F,
  '{{.metadata.uid}}', F,
  '{{.status.phase}}', F,
  '{{or .status.reason ""}}', F,
  '{{or .spec.nodeName ""}}', F,
  '{{or .status.startTime ""}}', F,
  '{{if .metadata.ownerReferences}}{{(index .metadata.ownerReferences 0).kind}}{{end}}', F,
  '{{if .metadata.ownerReferences}}{{(index .metadata.ownerReferences 0).name}}{{end}}', F,
  `{{range .spec.containers}}{{.name}}${SUB}{{.image}}${ITEM}{{end}}`, F,
  `{{range .status.containerStatuses}}{{.name}}${SUB}{{.ready}}${SUB}{{.restartCount}}`
  + `${SUB}{{if .lastState.terminated}}{{.lastState.terminated.finishedAt}}{{end}}${ITEM}{{end}}`, F,
  '{{or .metadata.deletionTimestamp ""}}',
  '\n{{end}}',
].join('');

export interface ListedContainer {
  name: string;
  image: string;
  ready: boolean;
  restarts: number;
  /** When it last died, if it ever has. */
  lastRestartAt?: string;
}

export interface ListedPod {
  name: string;
  uid: string;
  phase: string;
  reason?: string;
  node?: string;
  startedAt?: string;
  /** As the cluster reports it — `ReplicaSet`, not yet resolved to Deployment. */
  ownerKind?: string;
  ownerName?: string;
  containers: ListedContainer[];
  ready: { current: number; total: number };
  restarts: number;
  /** The most recent restart across its containers. */
  lastRestartAt?: string;
  deleting: boolean;
}

function parseContainers(specs: string, statuses: string): ListedContainer[] {
  const images = new Map<string, string>();
  for (const entry of specs.split(ITEM)) {
    if (!entry) continue;
    const [name, image] = entry.split(SUB);
    if (name) images.set(name, image ?? '');
  }

  const out: ListedContainer[] = [];
  const seen = new Set<string>();
  for (const entry of statuses.split(ITEM)) {
    if (!entry) continue;
    const [name, ready, restarts, lastRestartAt] = entry.split(SUB);
    if (!name) continue;
    seen.add(name);
    out.push({
      name,
      image: images.get(name) ?? '',
      ready: ready === 'true',
      restarts: Number(restarts) || 0,
      lastRestartAt: lastRestartAt || undefined,
    });
  }

  /*
    A container declared in the spec with no status yet is still a container.
    It is the normal state of a pod that is starting, and leaving it out makes
    the ready count read `0/0` on a pod that is about to be `0/2`.
  */
  for (const [name, image] of images) {
    if (!seen.has(name)) out.push({ name, image, ready: false, restarts: 0 });
  }
  return out;
}

/** One line of the template's output. Returns nothing for a line it cannot use. */
export function parseListedPod(line: string): ListedPod | undefined {
  if (!line.trim()) return undefined;
  const f = line.split(F);
  /* Eleven fields, always — the template writes every separator even when the
     value between them is empty, so a short line is a line from something
     else and not a pod with missing parts. */
  if (f.length < 11) return undefined;

  const [name, uid, phase, reason, node, startedAt, ownerKind, ownerName,
    specs, statuses, deletion] = f;
  if (!name) return undefined;

  const containers = parseContainers(specs, statuses);
  return {
    name,
    uid,
    phase: phase || 'Unknown',
    reason: reason || undefined,
    node: node || undefined,
    startedAt: startedAt || undefined,
    ownerKind: ownerKind || undefined,
    ownerName: ownerName || undefined,
    containers,
    ready: {
      current: containers.filter(c => c.ready).length,
      total: containers.length,
    },
    /* The pod's count is the sum of its containers', which is what `kubectl
       get pods` prints in its RESTARTS column. */
    restarts: containers.reduce((n, c) => n + c.restarts, 0),
    /* The most recent across the containers — what the grid means by "this
       pod restarted 20m ago". */
    lastRestartAt: containers.map(c => c.lastRestartAt).filter(Boolean).sort().pop(),
    deleting: !!deletion,
  };
}

/** The first line of a kubectl error, which is the part worth showing. */
function firstLine(s: string | undefined): string | undefined {
  const line = (s ?? '').split('\n').map(l => l.trim()).find(Boolean);
  return line || undefined;
}

export interface PodList {
  pods: ListedPod[];
  command: string;
  error?: string;
}

/** Every pod in a namespace, with everything the grid draws. */
export async function podsList(context: string, namespace: string): Promise<PodList> {
  const args = [
    '--context', context, '-n', namespace,
    'get', 'pods', '-o', `go-template=${POD_LIST_TEMPLATE}`,
  ];
  /* The template is unreadable in an audit row and says nothing a reader
     wants — what they need to know is which namespace was listed. */
  const command = `kubectl --context ${context} -n ${namespace} get pods`;

  const r = await run(args, { timeoutMs: clusterTimeoutMs() });
  if (!r.ok) {
    return { pods: [], command, error: firstLine(r.stderr) || r.failure };
  }

  const pods: ListedPod[] = [];
  for (const line of (r.stdout ?? '').split('\n')) {
    const pod = parseListedPod(line);
    if (pod) pods.push(pod);
  }
  return { pods, command };
}
