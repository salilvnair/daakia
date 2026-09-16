/**
 * "This one is Java" — said once, by a person, and remembered.
 *
 * ── Why this exists ──
 *
 * dk8s guesses a pod's runtime from its image, its command and its
 * environment. The guesses are good and they are not complete: a service on a
 * `distroless/java-base` image, one launched through a wrapper script, or
 * anything built on a company base image called something dk8s has never heard
 * of all come back `unknown` — and an unknown pod is offered nothing but its
 * logs.
 *
 * The escape hatch on offer was a Kubernetes label. That is a demand, not an
 * option: it needs write access to the cluster, a manifest change, a review and
 * a deploy, in order to tell a tool on your own laptop something you already
 * know. The label still works and is still the right answer for a team that
 * wants every colleague to get it — but it cannot be the only way.
 *
 * ── What a mark is attached to ──
 *
 * The workload, by default, for the reason `pod-classify.ts` states in its own
 * comment: a pod name carries a generated suffix that changes on every
 * rollout, so anything stored against it is gone at the next deploy. Mark
 * `Deployment/api` once and it is right forever.
 *
 * A pod can still be marked on its own, because sometimes it is the subject —
 * a bare debug pod with no owner, or one container of a job you are working
 * through. That mark is keyed by the pod's real name, so it simply stops
 * matching when the pod is replaced. That is the intended behaviour and not a
 * leak: the thing it described no longer exists.
 *
 * ── Precedence ──
 *
 * A pod mark beats a workload mark beats the cluster label beats a guess. The
 * more specific and the more recent a statement, the more it is believed —
 * except that nothing here overrides what somebody said, which is why a guess
 * is last.
 */

import { getSetting, setSetting } from '../../storage/db';
import { resolveWorkload } from './workload';
import type { PodRuntime } from './pod-classify';

const KEY = 'dk8s.runtimeMarks';

export interface RuntimeMark {
  runtime: PodRuntime;
  /** When it was said, so a later statement can win and a list can be ordered. */
  at: number;
  /** `workload` survives a rollout; `pod` is about this pod and no other. */
  scope: 'workload' | 'pod';
  /** What it reads as on screen — `Deployment/api`, `Pod/api-7bb-27sqb`. */
  label: string;
}

export type RuntimeMarks = Record<string, RuntimeMark>;

export function allMarks(): RuntimeMarks {
  const raw = getSetting<RuntimeMarks>(KEY);
  /* Anything else under this key is a half-written value or somebody else's
     data. No marks is a better answer than a throw on the way to a pod view. */
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

export interface MarkTarget {
  context: string;
  namespace: string;
  pod: string;
  workload?: { kind: string; name: string };
}

/** The key a workload mark is stored under, or undefined for an unowned pod. */
export function workloadMarkKey(t: MarkTarget): string | undefined {
  if (!t.workload) return undefined;
  return `${t.context}/${t.namespace}/${t.workload.kind}/${t.workload.name}`;
}

/** The key a pod mark is stored under. Contains the pod's real, generated name. */
export function podMarkKey(t: MarkTarget): string {
  return `${t.context}/${t.namespace}/Pod/${t.pod}`;
}

/** What somebody has said about this pod, most specific first. */
export function markFor(t: MarkTarget, marks: RuntimeMarks = allMarks()): RuntimeMark | undefined {
  const byPod = marks[podMarkKey(t)];
  if (byPod) return byPod;
  const wk = workloadMarkKey(t);
  return wk ? marks[wk] : undefined;
}

/**
 * Record a mark, or clear one.
 *
 * `undefined` removes it rather than storing "unknown" — a stored unknown
 * would suppress the guess as well, leaving a pod dk8s could have classified
 * reporting nothing at all.
 */
export function setMark(
  t: MarkTarget, scope: 'workload' | 'pod', runtime: PodRuntime | undefined,
): RuntimeMarks {
  const key = scope === 'workload' ? workloadMarkKey(t) : podMarkKey(t);
  if (!key) return allMarks();

  const marks = { ...allMarks() };
  if (!runtime || runtime === 'unknown') {
    delete marks[key];
  } else {
    marks[key] = {
      runtime,
      at: Date.now(),
      scope,
      label: key.split('/').slice(-2).join('/'),
    };
  }
  setSetting(KEY, marks);
  return marks;
}

/** The workload of a pod spec, in the shape a mark target wants. */
export function targetFromSpec(
  context: string, namespace: string, spec: {
    metadata?: { name?: string; ownerReferences?: { kind?: string; name?: string }[] };
  },
): MarkTarget {
  return {
    context,
    namespace,
    pod: spec.metadata?.name ?? '',
    workload: resolveWorkload(spec.metadata?.ownerReferences?.[0]),
  };
}
