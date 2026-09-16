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
 * ── One scope, because a runtime is a property of the image ──
 *
 * Every pod of a workload runs the same image, so "this pod is Java but its
 * siblings are not" describes nothing real. The mark goes on the app and
 * survives a rollout. A pod with no owning workload is marked as itself,
 * because there is nothing more stable to hang it on — and then that is the
 * only option rather than one of two.
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
  const on = mark?.runtime;
  return RUNTIMES.map(r => ({
    id: `mark-${scope}-${r}`,
    label: RUNTIME_LABEL[r],
    icon: on === r ? <CheckIcon size={13} /> : <CpuIcon size={13} />,
    description: on === r ? 'Marked — choose again to clear' : undefined,
    onClick: () => markRuntime(target, scope, on === r ? undefined : r, container),
  }));
}

/** `Mark app ▸`, ready to drop into a context menu. Nothing without a pod. */
export function markRuntimeItems(
  target: MarkTarget | undefined,
  mark: CurrentMark | undefined,
  container?: string,
): ContextMenuItem[] {
  if (!target?.pod) return [];

  /*
    One entry, not two.

    A runtime is a property of the image, and every pod of a workload runs the
    same image — so "this pod is Java but its siblings are not" describes
    nothing real. Offering the choice made people decide between two answers
    where only one of them is ever right, and the wrong one silently expires at
    the next rollout.

    A pod with no owning workload is marked as itself, because there is nothing
    more stable to hang it on — and then it is the only option rather than one
    of two.
  */
  const scope = target.workload ? 'workload' as const : 'pod' as const;

  return [{
    id: 'mark-runtime',
    label: `Mark ${target.workload ? 'app' : 'pod'}${mark ? ` · ${labelOf(mark.runtime)}` : ''}`,
    description: target.workload
      ? `${target.workload.kind} ${target.workload.name} — survives a rollout`
      : 'This pod has no owning workload, so its own name is all there is',
    icon: <CpuIcon size={13} />,
    children: runtimeItems(target, scope, mark, container),
  }];
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
