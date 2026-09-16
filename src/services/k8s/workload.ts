/**
 * What a pod belongs to, named the way a person names it.
 *
 * ── Why the owner reference is not the answer ──
 *
 * A pod's first owner is rarely the thing anybody calls it. Kubernetes puts a
 * generated object in between and names it by appending to the real one:
 *
 *   Deployment `api`      → ReplicaSet `api-7bb88bcc45`      → pod
 *   CronJob    `billing`  → Job        `billing-28912345`    → pod
 *
 * Both middles carry a suffix that changes — a ReplicaSet's on every rollout,
 * a Job's on every single run. Anything hung on those names survives until the
 * next deploy, or until the next minute, and then quietly refers to something
 * that no longer exists. That is the worst failure available: it looks like it
 * worked.
 *
 * The ReplicaSet half of this was already handled. The Job half was not, so a
 * star on a CronJob's pod was a star on one run of it.
 */

export interface OwnerRef {
  kind?: string;
  name?: string;
}

export interface Workload {
  kind: string;
  name: string;
}

/**
 * A ReplicaSet's generated suffix: ten-ish characters of base-36 hash.
 *
 * Anchored and bounded rather than greedy — a deployment legitimately called
 * `api-v2` must not come back as `api`.
 */
const REPLICASET_SUFFIX = /-[a-z0-9]{6,10}$/;

/**
 * A CronJob run's suffix: the schedule time in minutes since the epoch.
 *
 * Eight to eleven digits covers 1970 to well past any cluster running this.
 * Digits only, so a Job somebody named `import-2024` keeps its name — that is
 * a Job they created, not a run of a CronJob.
 */
const CRONJOB_SUFFIX = /-\d{8,11}$/;

/**
 * The stable thing behind a pod's owner.
 *
 * Returns undefined for a pod with no owner at all — a debug shell, a bare pod
 * — because there is nothing more stable to name it by than itself, and the
 * caller should say so rather than inventing a workload.
 */
export function resolveWorkload(owner: OwnerRef | undefined): Workload | undefined {
  const kind = owner?.kind;
  const name = owner?.name;
  if (!kind || !name) return undefined;

  if (kind === 'ReplicaSet') {
    return { kind: 'Deployment', name: String(name).replace(REPLICASET_SUFFIX, '') };
  }

  /*
    A Job with a time-shaped suffix is one run of a CronJob.

    It is a guess from the name, because the pod's own owner chain stops at the
    Job — reading the Job to find ITS owner is another API call per pod, on a
    list that can be hundreds long and is re-read on every watch event. The
    guess is wrong only for somebody who names a one-off Job after a number of
    at least eight digits, and the cost of being wrong is a badge reading
    CronJob on a Job.
  */
  if (kind === 'Job' && CRONJOB_SUFFIX.test(String(name))) {
    return { kind: 'CronJob', name: String(name).replace(CRONJOB_SUFFIX, '') };
  }

  return { kind, name: String(name) };
}

/** Workload kinds that run on a schedule rather than continuously. */
export const SCHEDULED_KINDS = new Set(['CronJob', 'Job']);

/** Is this pod a run of something, rather than a thing that stays up? */
export function isScheduled(workload: Workload | undefined): boolean {
  return !!workload && SCHEDULED_KINDS.has(workload.kind);
}
