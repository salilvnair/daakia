/**
 * "This one is Java" — the menu that says so.
 *
 * ── Why this is not a Kubernetes label ──
 *
 * dk8s guesses a pod's runtime and its guesses are good but not complete: a
 * distroless image, a launcher script, or a company base image nobody outside
 * the company has heard of all come back unknown, and an unknown pod is
 * offered nothing but its logs.
 *
 * The only escape hatch used to be the `dk8s.daakia/runtime` label. That is a
 * demand rather than an option — write access to the cluster, a manifest
 * change, a review and a deploy, in order to tell a tool on your own machine
 * something you already know. The label still works and is still the right
 * answer for a team who want every colleague to get it; this is the answer for
 * the person looking at the pod right now.
 *
 * ── Two scopes, because they mean different things ──
 *
 * The app is what people mean nearly always, and it survives a rollout. The
 * pod is for when this one really is the subject — a bare debug pod, one
 * container of a job you are working through — and it stops applying when the
 * pod is replaced, which is correct rather than a leak: the thing it described
 * is gone.
 */
import type { ContextMenuItem } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { CpuIcon, CheckIcon } from '../../icons';

export type PodRuntime = 'java' | 'python' | 'node' | 'go' | 'dotnet';

/** What each is called on screen. `dotnet` is not a word anybody says. */
export const RUNTIME_LABEL: Record<PodRuntime, string> = {
  java: 'Java',
  python: 'Python',
  node: 'Node.js',
  go: 'Go',
  dotnet: '.NET',
};

export const RUNTIMES = Object.keys(RUNTIME_LABEL) as PodRuntime[];

export interface MarkTarget {
  context: string;
  namespace: string;
  pod: string;
  workload?: { kind: string; name: string };
}

export interface CurrentMark {
  runtime: string;
  scope: 'workload' | 'pod';
  label: string;
}

export function markRuntime(
  target: MarkTarget, scope: 'workload' | 'pod', runtime: PodRuntime | undefined,
  container?: string,
): void {
  postMsg({ type: 'dk8s:markRuntime', target, scope, runtime, container });
}

/**
 * The submenu for one scope.
 *
 * The current mark is ticked, and picking it again clears it — the same
 * gesture as every other toggle in the app, and it saves a "Clear" item that
 * would only ever be useful to somebody who had already marked something.
 */
function runtimeItems(
  target: MarkTarget, scope: 'workload' | 'pod', mark: CurrentMark | undefined,
  container: string | undefined,
): ContextMenuItem[] {
  const on = mark?.scope === scope ? mark.runtime : undefined;
  return RUNTIMES.map(r => ({
    id: `mark-${scope}-${r}`,
    label: RUNTIME_LABEL[r],
    icon: on === r ? <CheckIcon size={13} /> : <CpuIcon size={13} />,
    description: on === r ? 'Marked — choose again to clear' : undefined,
    onClick: () => markRuntime(target, scope, on === r ? undefined : r, container),
  }));
}

/**
 * `Mark app ▸` and `Mark pod ▸`, ready to drop into a context menu.
 *
 * Returns nothing when there is no pod to mark. The app entry is absent for a
 * pod with no owning workload — there is nothing stable to hang it on, and an
 * entry that silently did the pod instead would be a lie about what it did.
 */
export function markRuntimeItems(
  target: MarkTarget | undefined,
  mark: CurrentMark | undefined,
  container?: string,
): ContextMenuItem[] {
  if (!target?.pod) return [];

  const items: ContextMenuItem[] = [];

  if (target.workload) {
    items.push({
      id: 'mark-app',
      label: `Mark app${mark?.scope === 'workload' ? ` · ${labelOf(mark.runtime)}` : ''}`,
      description: `${target.workload.kind} ${target.workload.name} — survives a rollout`,
      icon: <CpuIcon size={13} />,
      children: runtimeItems(target, 'workload', mark, container),
    });
  }

  items.push({
    id: 'mark-pod',
    label: `Mark pod${mark?.scope === 'pod' ? ` · ${labelOf(mark.runtime)}` : ''}`,
    description: target.workload
      ? 'Only this pod, until it is replaced'
      : 'This pod has no owning workload, so its own name is all there is',
    icon: <CpuIcon size={13} />,
    children: runtimeItems(target, 'pod', mark, container),
  });

  return items;
}

function labelOf(runtime: string): string {
  return RUNTIME_LABEL[runtime as PodRuntime] ?? runtime;
}

/** The mark target a pod row carries, for menus that only have the summary. */
export function targetOf(pod: {
  name: string; namespace: string; context?: string;
  workload?: { kind: string; name: string };
}, fallbackContext: string): MarkTarget {
  return {
    context: pod.context ?? fallbackContext,
    namespace: pod.namespace,
    pod: pod.name,
    workload: pod.workload,
  };
}
