/**
 * Ask the cluster once, and let everybody who wanted it have the answer.
 *
 * ── The two ways the same question got asked six times ──
 *
 * A cache with a TTL only helps the caller who arrives after the first one has
 * FINISHED. Opening a pod fires four probes at the same instant: they all miss
 * the cache, all four run kubectl, and all four fill the cache with the same
 * answer a moment later. The cache was working exactly as written and saved
 * nothing, because nothing about it was in flight.
 *
 * And separately, four different features each fetched the pod spec for
 * themselves — the log-format matcher, the capability probe, the memory
 * profile, the describe path — because nothing offered it to them. Six
 * `get pod -o json` for one pod, against a terminal's one.
 *
 * So this does the two things a cache alone cannot:
 *
 *   1. A second caller for a key that is IN FLIGHT waits on the first one's
 *      promise rather than starting its own.
 *   2. The answer is kept for as long as it stays true, which is a property of
 *      the question, not of this module — so every caller states it.
 *
 * ── On choosing a TTL ──
 *
 * Long for a fact about you or about an image: whether your token may exec
 * into a namespace does not change because you clicked a different pod, and
 * whether a container has bash is decided by the image. Short for a fact about
 * a running pod, which restarts and moves.
 *
 * A TTL is never a substitute for correctness: anything the reader can change
 * from inside dk8s must invalidate its own key rather than wait one out.
 */

interface Entry<T> {
  at: number;
  value: T;
}

const settled = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Run `work` for `key`, unless the answer is already here or already coming.
 *
 * `ttlMs` is how long the answer stays true. Pass 0 to de-duplicate concurrent
 * callers without remembering anything — which is the right choice for a fact
 * that changes constantly but is still only worth asking for once per burst.
 */
export function askOnce<T>(
  key: string,
  ttlMs: number,
  work: () => Promise<T>,
  now = Date.now(),
): Promise<T> {
  const hit = settled.get(key) as Entry<T> | undefined;
  if (hit && now - hit.at < ttlMs) return Promise.resolve(hit.value);

  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const started = work().then(
    (value) => {
      /*
        Stamped with the clock the caller handed in, not a fresh reading of
        the real one. Mixing the two means an injected clock is honoured when
        the entry is READ and ignored when it is written, so an answer stored
        under a test's clock never appears to expire — which is exactly what
        the expiry test caught.
      */
      if (ttlMs > 0) settled.set(key, { at: now, value });
      inFlight.delete(key);
      return value;
    },
    (err) => {
      /*
        A failure is not cached. A cluster that timed out once will usually
        answer the next time, and remembering "no" for five minutes turns one
        dropped connection into five minutes of a feature being missing with
        no way to retry it.
      */
      inFlight.delete(key);
      throw err;
    },
  );

  inFlight.set(key, started);
  return started;
}

/** Forget one answer — for when dk8s itself changed the thing it describes. */
export function forgetOnce(key: string): void {
  settled.delete(key);
}

/** Forget everything under a prefix, e.g. every fact about one namespace. */
export function forgetOnceWhere(prefix: string): void {
  for (const key of [...settled.keys()]) {
    if (key.startsWith(prefix)) settled.delete(key);
  }
}

/** Testing seam: the caches are module state and a test needs a clean one. */
export function __resetAskOnce(): void {
  settled.clear();
  inFlight.clear();
}
