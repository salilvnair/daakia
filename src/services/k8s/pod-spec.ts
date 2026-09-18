/**
 * The pod's own JSON, fetched once for everybody who wants it.
 *
 * ── Why this exists ──
 *
 * Four features needed the same document and each went and got it: the
 * log-format matcher (to read the image and labels), the capability probe (to
 * read the containers), the memory profile (to read the limits), and describe.
 * Nothing offered it to them, so opening one pod cost six `get pod -o json`
 * against a terminal's one.
 *
 * ── The window ──
 *
 * Short, because this describes a running pod: it restarts, it moves, its
 * container statuses change. Long enough to cover the burst of probes that one
 * pod-open fires, which is what the duplication actually was — the callers
 * arrive within the same few hundred milliseconds and then not again.
 *
 * A caller that needs the truth right now — after dk8s itself restarted or
 * deleted something — calls `forgetPodSpec` rather than waiting this out.
 */
import { run } from './kubectl';
import { askOnce, forgetOnce } from './ask-once';
import { shortLivedTtlMs } from './cache-settings';

export interface PodSpecResult {
  ok: boolean;
  /** The parsed document, when it parsed. */
  spec?: Record<string, unknown>;
  /** What went wrong, for a caller that reports it. */
  error?: string;
}

function keyFor(context: string, namespace: string, pod: string): string {
  return `podspec:${context}/${namespace}/${pod}`;
}

/**
 * `kubectl get pod <pod> -o json`, shared.
 *
 * Never throws: every caller here treats a missing spec as "that fact is
 * unknown" and carries on, because a pod that has just been replaced is a
 * normal thing to open and none of them should fail over it.
 */
export function podSpec(
  context: string, namespace: string, pod: string,
): Promise<PodSpecResult> {
  /* Settings → DK8S → Cluster decides this; 0 there still collapses the
     burst that one pod-open fires. */
  return askOnce(keyFor(context, namespace, pod), shortLivedTtlMs(), async () => {
    const got = await run(
      ['--context', context, '-n', namespace, 'get', 'pod', pod, '-o', 'json'],
      { timeoutMs: 20_000 },
    );
    if (!got.ok) return { ok: false, error: got.stderr || got.failure };
    try {
      return { ok: true, spec: JSON.parse(got.stdout) as Record<string, unknown> };
    } catch (err) {
      return { ok: false, error: `could not parse the pod: ${(err as Error).message}` };
    }
  });
}

/** Drop what is remembered about one pod. */
export function forgetPodSpec(context: string, namespace: string, pod: string): void {
  forgetOnce(keyFor(context, namespace, pod));
}
