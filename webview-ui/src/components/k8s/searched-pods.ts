/**
 * The pods a search covered, as the pod list's own summaries.
 *
 * The grid's pod when it still has one, because it carries the health dot,
 * the workload badge and the real container list. A pod the grid has never
 * seen — a different namespace, a watch since stopped — is described from what
 * the search recorded about it, which is enough to tail.
 */
import type { PodSummary } from '../../store/k8s-store';
import type { SearchedPod } from '../../store/dk8s-result-tab-store';

export function asPodSummaries(searched: SearchedPod[], livePods: PodSummary[]): PodSummary[] {
  return searched.map(t => livePods.find(
    p => p.name === t.pod && p.namespace === t.namespace && (p.context ?? '') === t.context,
  ) ?? ({
    name: t.pod,
    namespace: t.namespace,
    context: t.context,
    uid: `${t.context}/${t.namespace}/${t.pod}`,
    phase: 'Unknown',
    ready: { current: 0, total: 0 },
    restarts: 0,
    containers: t.containers.map(name => ({ name, ready: false, restarts: 0, image: '' })),
    healthy: false,
    deleting: false,
  } as PodSummary));
}
