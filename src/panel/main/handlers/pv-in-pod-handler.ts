/**
 * Reading and searching a volume through the pod that has it mounted.
 *
 * `pv-logs` reads an archive with `fs`, which needs the volume mounted on this
 * machine. That is the rare case; the usual one is a PersistentVolumeClaim
 * that exists only inside the cluster, where the only way in is the pod.
 *
 * Both messages report the command they ran. Somebody who wants to know why a
 * search came back empty should be able to copy the line and run it — and for
 * a search that goes into a container, being able to see exactly what was sent
 * is not a nicety.
 */
import { listInPod, searchInPod } from '../../../services/k8s/pv-in-pod';
import { podMounts } from '../../../services/k8s/pod-mounts';

type PostMessage = (msg: unknown) => void;

function target(msg: Record<string, unknown>) {
  return {
    context: String(msg.context ?? ''),
    namespace: String(msg.namespace ?? ''),
    pod: String(msg.pod ?? ''),
    container: msg.container as string | undefined,
  };
}

/** Which volumes this pod has, and where they are mounted inside it. */
export async function handleDk8sPodMounts(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const t = target(msg);
  if (!t.context || !t.namespace || !t.pod) return;
  const result = await podMounts(t.context, t.namespace, t.pod);
  postMessage({ type: 'dk8s:podMounts', pod: t.pod, ...result });
}

/** What is under a path inside the pod. */
export async function handleDk8sPvList(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const t = target(msg);
  if (!t.context || !t.namespace || !t.pod) return;
  const result = await listInPod(t, String(msg.root ?? ''), {
    globs: Array.isArray(msg.globs) ? (msg.globs as string[]) : undefined,
  });
  postMessage({ type: 'dk8s:pvListed', pod: t.pod, ...result });
}

/** Search it, in the pod, and bring back only what matched. */
export async function handleDk8sPvSearch(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const t = target(msg);
  if (!t.context || !t.namespace || !t.pod) return;
  const result = await searchInPod(t, String(msg.root ?? ''), String(msg.pattern ?? ''), {
    contextLines: Number(msg.contextLines) || 0,
    caseSensitive: !!msg.caseSensitive,
    regex: !!msg.regex,
    maxLines: Number(msg.maxLines) || undefined,
  });
  postMessage({ type: 'dk8s:pvSearched', pod: t.pod, ...result });
}
