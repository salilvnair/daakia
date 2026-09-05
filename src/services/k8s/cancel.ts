/**
 * Stopping something that is already running.
 *
 * ── Why this exists at all ──
 *
 * dk8s's long operations are loops over pods, and each turn of the loop
 * `await`s a `kubectl exec`. A Stop button that only sets a flag in the webview
 * stops nothing: the loop is on the host, it never looks at that flag, and the
 * `find` it is currently waiting on runs to completion regardless. That is what
 * Stop did before this file — the button went grey and thirty more pods were
 * searched anyway.
 *
 * ── Why a flag between iterations is not enough either ──
 *
 * Checking `cancelled` between pods bounds the wait at one pod, and one pod can
 * be the slow one: `find /` across `/sys` and `/proc` in a container with a
 * large filesystem is the case people actually press Stop during. So the child
 * process has to die, not just be un-awaited. `execFile` takes an `AbortSignal`
 * and kills the process when it fires, which is why cancellation here is an
 * `AbortController` rather than a boolean.
 *
 * ── Why one registry rather than one per operation ──
 *
 * Because the next long operation should get Stop for free. File search, log
 * search, directory sizing, downloads and dump collection are all the same
 * shape — a request id, a loop, a child process — and four bespoke cancel paths
 * would mean the fifth feature ships without one. Everything here is keyed by
 * the `requestId` the webview already sends, so a handler opts in by wrapping
 * its work in `begin`/`end` and passing the signal down.
 */

export interface Cancellation {
  /** Pass to `run`/`execFile` so the child dies with the request. */
  signal: AbortSignal;
  /** Checked between iterations, so a loop stops before starting the next one. */
  cancelled: () => boolean;
}

interface Entry {
  controller: AbortController;
  startedAt: number;
  /** What is being cancelled, for the log line. Never user data. */
  kind: string;
}

const live = new Map<string, Entry>();

/**
 * A ceiling on tracked operations.
 *
 * Every entry is removed by `end` in a `finally`, so this should never be
 * reached — which is exactly why it is here. A leak in one handler would
 * otherwise grow this map for the life of the panel, and a bound turns that
 * into a visible refusal rather than an invisible drift.
 */
const MAX_LIVE = 64;

/**
 * Register an operation and get its cancellation.
 *
 * Re-registering the same id cancels the previous one first: a second search
 * on the same request id means the first is obsolete, and leaving it running
 * would have two loops posting results into one view.
 */
export function begin(requestId: string, kind: string): Cancellation {
  const existing = live.get(requestId);
  if (existing) existing.controller.abort();

  if (live.size >= MAX_LIVE) {
    /*
      Oldest first, because the alternative is refusing the new one.

      A caller that has hit this has a leak somewhere, and taking down the
      oldest stuck operation is both the more useful behaviour and the one that
      makes the leak visible in the logs rather than as a dead button.
    */
    const oldest = [...live.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt)[0];
    if (oldest) {
      oldest[1].controller.abort();
      live.delete(oldest[0]);
    }
  }

  const controller = new AbortController();
  live.set(requestId, { controller, startedAt: Date.now(), kind });
  return {
    signal: controller.signal,
    cancelled: () => controller.signal.aborted,
  };
}

/**
 * Stop it.
 *
 * Returns whether anything was actually running, so the caller can tell "I
 * stopped it" from "it had already finished" — the second is not a failure and
 * should not be reported as one.
 */
export function cancel(requestId: string): boolean {
  const entry = live.get(requestId);
  if (!entry) return false;
  entry.controller.abort();
  live.delete(requestId);
  return true;
}

/**
 * Done, one way or the other.
 *
 * Called from a `finally` so it runs on the cancelled path too. Removing the
 * entry after an abort is not redundant: `cancel` deletes it, but an operation
 * that finished normally never went through `cancel` and still has to go.
 */
export function end(requestId: string): void {
  live.delete(requestId);
}

/**
 * Everything, cancelled.
 *
 * For panel disposal and extension deactivation. A `find` still walking a
 * container after the window that asked for it has gone is a process nobody
 * can see and nobody will stop.
 */
export function cancelAll(): void {
  for (const [, entry] of live) entry.controller.abort();
  live.clear();
}

/** What is in flight, for diagnostics. */
export function liveOperations(): { requestId: string; kind: string; ms: number }[] {
  const now = Date.now();
  return [...live.entries()].map(([requestId, e]) => ({
    requestId, kind: e.kind, ms: now - e.startedAt,
  }));
}

/**
 * Whether a failure was this operation being stopped.
 *
 * An aborted `execFile` reports as a spawn failure, which every caller already
 * treats as "that pod could not be searched" — so without this a cancelled
 * sweep fills the results with thirty red error rows saying the user's own
 * Stop was a problem.
 */
export function isAbort(failure: string | undefined): boolean {
  if (!failure) return false;
  return /abort/i.test(failure) || /ABORT_ERR/.test(failure);
}
