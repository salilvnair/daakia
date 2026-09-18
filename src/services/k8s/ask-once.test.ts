import { describe, it, expect, beforeEach } from 'vitest';
import { askOnce, forgetOnce, forgetOnceWhere, __resetAskOnce } from './ask-once';

beforeEach(() => __resetAskOnce());

/** A worker that counts how many times it actually ran. */
function counted<T>(value: T, delayMs = 0) {
  const state = { runs: 0 };
  const work = () => {
    state.runs++;
    return delayMs
      ? new Promise<T>(r => setTimeout(() => r(value), delayMs))
      : Promise.resolve(value);
  };
  return { work, state };
}

describe('asking once', () => {
  it('collapses a burst into one call', async () => {
    /*
      The bug this exists for. Opening a pod fires four probes at the same
      instant; a TTL cache helps none of them, because none has finished.
    */
    const { work, state } = counted('spec', 5);
    const all = await Promise.all([1, 2, 3, 4].map(() => askOnce('k', 60_000, work)));
    expect(state.runs).toBe(1);
    expect(all).toEqual(['spec', 'spec', 'spec', 'spec']);
  });

  it('serves a later caller from what it remembered', async () => {
    const { work, state } = counted('yes');
    await askOnce('k', 60_000, work, 1_000);
    await askOnce('k', 60_000, work, 30_000);
    expect(state.runs).toBe(1);
  });

  it('asks again once the answer has stopped being true', async () => {
    const { work, state } = counted('yes');
    await askOnce('k', 5_000, work, 1_000);
    await askOnce('k', 5_000, work, 10_000);
    expect(state.runs).toBe(2);
  });

  it('still de-duplicates a burst with nothing remembered', async () => {
    // A fact that changes constantly is still only worth asking once per burst.
    const { work, state } = counted('now', 5);
    await Promise.all([1, 2, 3].map(() => askOnce('k', 0, work)));
    expect(state.runs).toBe(1);
    await askOnce('k', 0, work);
    expect(state.runs).toBe(2);
  });

  it('keeps different keys apart', async () => {
    const a = counted('a');
    const b = counted('b');
    expect(await askOnce('a', 60_000, a.work)).toBe('a');
    expect(await askOnce('b', 60_000, b.work)).toBe('b');
  });

  describe('when it fails', () => {
    it('does not remember the failure', async () => {
      /*
        A cluster that timed out once usually answers the next time.
        Remembering "no" would turn one dropped connection into five minutes
        of a feature being missing, with no way to retry it.
      */
      let calls = 0;
      const work = () => {
        calls++;
        return calls === 1 ? Promise.reject(new Error('timeout')) : Promise.resolve('ok');
      };
      await expect(askOnce('k', 60_000, work)).rejects.toThrow('timeout');
      expect(await askOnce('k', 60_000, work)).toBe('ok');
      expect(calls).toBe(2);
    });

    it('fails every caller in the burst, not just the first', async () => {
      const work = () => Promise.reject(new Error('nope'));
      const results = await Promise.allSettled([
        askOnce('k', 60_000, work),
        askOnce('k', 60_000, work),
      ]);
      expect(results.map(r => r.status)).toEqual(['rejected', 'rejected']);
    });
  });

  describe('forgetting', () => {
    it('drops one answer', async () => {
      const { work, state } = counted('v');
      await askOnce('k', 60_000, work);
      forgetOnce('k');
      await askOnce('k', 60_000, work);
      expect(state.runs).toBe(2);
    });

    it('drops everything about one thing', async () => {
      // Every fact about a namespace, when dk8s itself changed it.
      const a = counted('a'); const b = counted('b'); const other = counted('c');
      await askOnce('ctx/ns/pod-1', 60_000, a.work);
      await askOnce('ctx/ns/pod-2', 60_000, b.work);
      await askOnce('ctx/other/pod', 60_000, other.work);
      forgetOnceWhere('ctx/ns/');
      await askOnce('ctx/ns/pod-1', 60_000, a.work);
      await askOnce('ctx/other/pod', 60_000, other.work);
      expect(a.state.runs).toBe(2);
      expect(other.state.runs).toBe(1);
    });
  });
});
