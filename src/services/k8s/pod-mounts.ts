/**
 * Where a pod's volumes are, according to the pod.
 *
 * Configuring an archive path by hand means knowing a path that lives inside
 * somebody else's container — and getting one character wrong produces an
 * empty search rather than an error, which is the worst way to be wrong.
 *
 * The pod already knows. `spec.containers[].volumeMounts` says the path and
 * `spec.volumes[]` says what is mounted there, so the paths worth searching
 * can be offered rather than typed. A claim is ranked first because a
 * PersistentVolumeClaim is what an archive almost always is; a ConfigMap or a
 * projected token is a mount too and is never a log directory.
 */
import { run } from './kubectl';

export interface PodMount {
  /** Absolute path inside the container. */
  path: string;
  /** The volume's name in the spec — how the two halves are joined. */
  name: string;
  /** Which container it belongs to, for a pod that has more than one. */
  container: string;
  /** `pvc`, `configMap`, `emptyDir`, `hostPath`, `projected`… */
  kind: string;
  /** The claim's name, where it is one. */
  claim?: string;
  readOnly?: boolean;
  /** True when this looks like somewhere logs are kept. */
  likelyLogs: boolean;
}

export interface PodMountsResult {
  mounts: PodMount[];
  command: string;
  error?: string;
}

/**
 * Mounts Kubernetes adds that nobody put there.
 *
 * The service-account token is on every pod in the cluster and is never what
 * anybody is looking for. Listing it first, above the claim they came for, is
 * the difference between a list you scan and a list you read.
 */
const NOISE = /^\/var\/run\/secrets\/kubernetes\.io/;

/** Path fragments that suggest logs. Only a ranking — nothing is hidden. */
const LOGGY = /log|archive/i;

/** What kind of volume this is, from whichever key the spec carries. */
export function volumeKind(volume: Record<string, unknown> | undefined): {
  kind: string; claim?: string;
} {
  if (!volume) return { kind: 'unknown' };
  const pvc = volume.persistentVolumeClaim as { claimName?: string } | undefined;
  if (pvc) return { kind: 'pvc', claim: pvc.claimName };

  for (const key of ['configMap', 'secret', 'emptyDir', 'hostPath', 'projected',
    'downwardAPI', 'nfs', 'csi', 'azureFile', 'azureDisk']) {
    if (volume[key]) return { kind: key };
  }
  return { kind: 'unknown' };
}

/**
 * Rank a mount by how likely it is to hold logs.
 *
 * A claim whose path mentions logs is the answer nearly every time; a claim
 * that does not is still a good guess; an emptyDir called `logs` is a real
 * pattern for a sidecar shipping them. Everything Kubernetes mounted itself
 * goes last.
 */
export function mountScore(m: Pick<PodMount, 'path' | 'kind'>): number {
  if (NOISE.test(m.path)) return -1;
  let score = 0;
  if (m.kind === 'pvc') score += 4;
  if (m.kind === 'nfs' || m.kind === 'csi' || m.kind === 'azureFile') score += 3;
  if (LOGGY.test(m.path)) score += 3;
  if (m.kind === 'emptyDir') score += 1;
  if (m.kind === 'configMap' || m.kind === 'secret' || m.kind === 'projected') score -= 3;
  return score;
}

/** Read the pod's spec and pair its mounts with its volumes. */
export async function podMounts(
  context: string, namespace: string, pod: string,
): Promise<PodMountsResult> {
  const args = [
    '--context', context, '-n', namespace, 'get', 'pod', pod, '-o', 'json',
  ];
  const command = `kubectl ${args.join(' ')}`;
  const r = await run(args, { timeoutMs: 20_000 });

  if (!r.ok) {
    return { mounts: [], command, error: firstLine(r.stderr) || `Could not read ${pod}.` };
  }

  let spec: {
    spec?: {
      containers?: { name?: string; volumeMounts?: { name?: string; mountPath?: string; readOnly?: boolean }[] }[];
      volumes?: Record<string, unknown>[];
    };
  };
  try {
    spec = JSON.parse(r.stdout);
  } catch {
    return { mounts: [], command, error: 'The pod definition could not be read.' };
  }

  const volumes = new Map<string, Record<string, unknown>>();
  for (const v of spec.spec?.volumes ?? []) {
    if (typeof v.name === 'string') volumes.set(v.name, v);
  }

  const mounts: PodMount[] = [];
  for (const c of spec.spec?.containers ?? []) {
    for (const vm of c.volumeMounts ?? []) {
      if (!vm.mountPath || !vm.name) continue;
      const { kind, claim } = volumeKind(volumes.get(vm.name));
      mounts.push({
        path: vm.mountPath,
        name: vm.name,
        container: c.name ?? '',
        kind,
        claim,
        readOnly: vm.readOnly,
        likelyLogs: mountScore({ path: vm.mountPath, kind }) >= 4,
      });
    }
  }

  /* Best guess first, then alphabetically so the order does not wander between
     two mounts that score the same. */
  mounts.sort((a, b) =>
    mountScore(b) - mountScore(a) || a.path.localeCompare(b.path));

  return { mounts, command };
}

function firstLine(s: string | undefined): string | undefined {
  return (s ?? '').split('\n').map(l => l.trim()).find(Boolean)?.slice(0, 200);
}
