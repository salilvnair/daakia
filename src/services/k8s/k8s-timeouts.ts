/**
 * How long dk8s waits for a cluster, in one place.
 *
 * ── Why this file exists ──
 *
 * The numbers were scattered and picked one at a time: the pod list bounded at
 * 30s, namespaces at 20s, the reachability check at 15s with its own
 * `--request-timeout=8s`, and — the one that actually bit — a 25-second
 * stopwatch in the pod grid that announced "no answer from the cluster".
 *
 * Twenty-five is less than thirty. The screen gave up **five seconds before the
 * call it was waiting on had finished**, so a cluster that was merely slow got
 * called dead while its answer was still on the way. And when the list failed
 * for real in two seconds — a refused connection, a VPN down — the host already
 * knew and said so, and the screen sat on that for the remaining twenty-three
 * before telling anybody.
 *
 * So: one ceiling, derived everywhere, and the UI's own backstop is computed
 * from it rather than guessed — it cannot fire before the call it is timing.
 *
 * ── Why 30 seconds ──
 *
 * It is the pod list that sets it. A `get pods -o json` on a large namespace
 * across a VPN is the slowest thing dk8s does before it can show anything, and
 * ten seconds is not unusual on a cluster in another region. Thirty leaves room
 * for that without leaving somebody staring at a spinner for a minute. It is a
 * default, not a law — Settings → DK8S → General changes it, and the value is
 * stored with the rest of the dk8s state.
 */

export const DEFAULT_CLUSTER_TIMEOUT_SECONDS = 30;

/** Below this a normal cluster call cannot finish; above it nobody is waiting. */
export const MIN_CLUSTER_TIMEOUT_SECONDS = 5;
export const MAX_CLUSTER_TIMEOUT_SECONDS = 300;

let ceilingMs = DEFAULT_CLUSTER_TIMEOUT_SECONDS * 1000;

/** Clamp whatever was stored or typed into something that can work. */
export function clampTimeoutSeconds(seconds: number | undefined): number {
  if (!Number.isFinite(seconds as number)) return DEFAULT_CLUSTER_TIMEOUT_SECONDS;
  return Math.min(
    MAX_CLUSTER_TIMEOUT_SECONDS,
    Math.max(MIN_CLUSTER_TIMEOUT_SECONDS, Math.round(seconds as number)),
  );
}

export function setClusterTimeoutSeconds(seconds: number | undefined): void {
  ceilingMs = clampTimeoutSeconds(seconds) * 1000;
}

/** What every cluster-facing call is bounded by. */
export function clusterTimeoutMs(): number {
  return ceilingMs;
}

export function clusterTimeoutSeconds(): number {
  return Math.round(ceilingMs / 1000);
}

/**
 * What the reachability check passes to kubectl as `--request-timeout`.
 *
 * Deliberately a fraction of the ceiling: "is this cluster there at all" should
 * fail fast, because the common answer is a VPN that is not up and nobody wants
 * to wait the full ceiling to be told. It still scales with the setting — a
 * person who raised the ceiling because their cluster is genuinely slow means
 * it for this call too.
 */
export function reachRequestTimeoutSeconds(): number {
  return Math.min(15, Math.max(5, Math.round(clusterTimeoutSeconds() / 3)));
}

/**
 * How long a screen waits before it may claim it heard nothing.
 *
 * Strictly greater than the ceiling, by enough to cover the message getting
 * back. A backstop that fires first is not a backstop — it is the bug this file
 * was written for.
 */
export function silenceBackstopMs(): number {
  return ceilingMs + 8_000;
}
