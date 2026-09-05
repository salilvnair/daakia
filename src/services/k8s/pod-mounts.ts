/**
 * What a path inside a pod actually is.
 *
 * The Explorer shows a filesystem without saying where any of it comes from,
 * and inside a container that is the difference between two very different
 * directories that look identical: one baked into the image, whose contents
 * vanish on restart, and one backed by a PersistentVolume, whose contents are
 * the reason anybody is looking. `/data` tells you nothing; `PVC: order-data`
 * tells you what you are holding.
 *
 * It also answers the question the download button raises. A read-only mount
 * is worth knowing about before rather than after, and a path that is not a
 * mount at all is a path whose contents are as temporary as the pod.
 *
 * This is a `kubectl get pod`, not an exec — the answer is in the pod spec and
 * needs nothing from inside the container. So it works on a distroless image
 * where nothing else in the Explorer does, which is worth having: on those the
 * mount list is the only thing the tab can say.
 */
import { run } from './kubectl';

export interface PodMount {
  /** Where it is mounted inside the container. Always absolute. */
  path: string;
  /**
   * What is behind it, in the reader's words.
   *
   * `pvc: order-data`, `configmap: zp-config-app`, `secret: db-creds`,
   * `emptyDir`, `hostPath` — the kind and the name, because the kind alone
   * does not identify which of three ConfigMaps this one is.
   */
  source: string;
  /** The tone the chip should take. A PVC is the one worth noticing. */
  kind: 'pvc' | 'config' | 'secret' | 'ephemeral' | 'host' | 'other';
  readOnly: boolean;
  /** The container it belongs to, since mounts differ between them. */
  container: string;
}

interface RawVolume {
  name?: string;
  persistentVolumeClaim?: { claimName?: string };
  configMap?: { name?: string };
  secret?: { secretName?: string };
  emptyDir?: unknown;
  hostPath?: { path?: string };
  projected?: unknown;
  downwardAPI?: unknown;
}

/**
 * Name a volume by what it is, not by the key it happens to sit under.
 *
 * `name` in the spec is the pod author's label for it — `config-volume`,
 * `data` — and is exactly as uninformative as the mount path. What identifies
 * a mount is the claim or the ConfigMap behind it, which is what somebody
 * would go and look at next.
 */
export function describeVolume(v: RawVolume): { source: string; kind: PodMount['kind'] } {
  const pvc = v.persistentVolumeClaim?.claimName;
  if (pvc) return { source: `pvc: ${pvc}`, kind: 'pvc' };

  const cm = v.configMap?.name;
  if (cm) return { source: `configmap: ${cm}`, kind: 'config' };

  const sec = v.secret?.secretName;
  if (sec) return { source: `secret: ${sec}`, kind: 'secret' };

  if (v.hostPath?.path) return { source: `hostpath: ${v.hostPath.path}`, kind: 'host' };
  if (v.emptyDir !== undefined) return { source: 'emptydir', kind: 'ephemeral' };
  if (v.projected !== undefined) return { source: 'projected', kind: 'config' };
  if (v.downwardAPI !== undefined) return { source: 'downward api', kind: 'config' };

  // A volume type we do not name yet still gets a row: knowing a path is a
  // mount at all is most of the value, and guessing at the kind is not.
  return { source: v.name ? `volume: ${v.name}` : 'volume', kind: 'other' };
}

/**
 * The deepest mount containing this path, or none.
 *
 * Deepest because mounts nest: a PVC on `/data` and a ConfigMap on
 * `/data/conf` both contain `/data/conf/app.yaml`, and the ConfigMap is the
 * one that actually provides it. Longest-prefix wins, exactly as the kernel
 * resolves it.
 *
 * The boundary check is deliberate — `/data` must not match `/database`, which
 * a bare `startsWith` would happily do and would then attribute a directory to
 * a volume it has nothing to do with.
 */
export function mountFor(mounts: PodMount[], path: string): PodMount | undefined {
  let best: PodMount | undefined;
  for (const m of mounts) {
    if (path !== m.path && !path.startsWith(m.path.endsWith('/') ? m.path : `${m.path}/`)) {
      continue;
    }
    if (!best || m.path.length > best.path.length) best = m;
  }
  return best;
}

export interface MountsResult {
  mounts: PodMount[];
  command: string;
  error?: string;
}

export async function podMounts(
  context: string, namespace: string, pod: string,
): Promise<MountsResult> {
  const args = ['--context', context, '-n', namespace, 'get', 'pod', pod, '-o', 'json'];
  const command = ['kubectl', ...args].join(' ');
  const r = await run(args);

  if (r.code !== 0) {
    return { mounts: [], command, error: r.stderr.trim() || 'Could not read the pod.' };
  }

  let spec: {
    spec?: {
      volumes?: RawVolume[];
      containers?: { name?: string; volumeMounts?: {
        name?: string; mountPath?: string; readOnly?: boolean;
      }[] }[];
    };
  };
  try {
    spec = JSON.parse(r.stdout);
  } catch {
    return { mounts: [], command, error: 'The pod description did not parse.' };
  }

  const byName = new Map<string, RawVolume>();
  for (const v of spec.spec?.volumes ?? []) if (v.name) byName.set(v.name, v);

  const mounts: PodMount[] = [];
  for (const c of spec.spec?.containers ?? []) {
    for (const vm of c.volumeMounts ?? []) {
      if (!vm.mountPath) continue;
      /*
        The service-account token is on every pod ever created and is never
        what anyone is looking at. Listing it would put a chip on `/var/run`
        in every pod in the cluster, which trains people to ignore the chip.
      */
      if (vm.mountPath.startsWith('/var/run/secrets/kubernetes.io/')) continue;

      const vol = vm.name ? byName.get(vm.name) : undefined;
      const { source, kind } = describeVolume(vol ?? { name: vm.name });
      mounts.push({
        path: vm.mountPath,
        source,
        kind,
        readOnly: !!vm.readOnly,
        container: c.name ?? '',
      });
    }
  }

  return { mounts, command };
}
