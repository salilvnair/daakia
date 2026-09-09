/**
 * A live probe against whatever gh is on this machine.
 *
 * Not a unit test — it asserts only the shape, because the values depend on who
 * is signed in. It exists so `probeEnvironment` is exercised end to end at
 * least once rather than only through its parts, and it is skipped when gh is
 * absent so CI on a machine without it stays green.
 */
import { describe, it, expect } from 'vitest';
import { probeEnvironment } from './gh';

describe('probing this machine', () => {
  it('reports a coherent environment', async () => {
    const env = await probeEnvironment();
    expect(typeof env.present).toBe('boolean');
    if (!env.present) {
      expect(env.triedPaths?.length).toBeGreaterThan(0);
      return;
    }
    expect(env.binary).toBeTruthy();
    expect(env.version?.major).toBeGreaterThan(0);
    expect(env.capabilities?.issueJson).toBe(true);
    expect(env.auth).toBeTruthy();
  }, 60_000);
});
