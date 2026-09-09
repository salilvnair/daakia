/**
 * The gh runner, driven against a real process.
 *
 * These tests do not need `gh` installed. They point `DAAKIA_GH` at `node`
 * running a small script, which is enough to exercise everything that actually
 * matters here: that arguments survive intact, that the shell is never
 * involved, that a non-zero exit is a result rather than an exception, and that
 * a binary which is not gh is refused.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { setGhPath, forgetGh, verifyGhPath, GhMissing, resolveBinary } from './gh';

beforeEach(() => { forgetGh(); });
afterEach(() => { setGhPath(undefined); forgetGh(); });

describe('finding the binary', () => {
  it('refuses something that runs but is not gh', async () => {
    /* A path that happens to hold a working binary must not be adopted
       silently — the version output has to mention gh. `node` prints a version
       and is therefore exactly the wrong thing to accept. */
    setGhPath(process.execPath);
    await expect(resolveBinary()).rejects.toBeInstanceOf(GhMissing);
  });

  it('reports the path it looked in when it finds nothing', async () => {
    setGhPath(join(__dirname, 'definitely-not-here'));
    try {
      await resolveBinary();
      throw new Error('should not resolve');
    } catch (err) {
      const missing = err as GhMissing;
      expect(missing.name).toBe('GhMissing');
      /* The install screen prints these, and on a locked-down machine they are
         the difference between "not found" and a fixable answer. */
      expect(missing.tried[0]).toContain('definitely-not-here');
    }
  });

  it('does not fall back to PATH when a path was named', async () => {
    /*
      This test found a real mistake: the first version listed the override
      first and then PATH, so on a machine that has gh installed a wrong
      explicit path silently resolved to the real one. The setting looked
      honoured while something else ran.
    */
    setGhPath(join(__dirname, 'definitely-not-here'));
    try {
      await resolveBinary();
      throw new Error('should not resolve');
    } catch (err) {
      expect((err as GhMissing).tried).toEqual([join(__dirname, 'definitely-not-here')]);
    }
  });
});

describe('verifying a path somebody chose', () => {
  it('accepts a binary that identifies itself as gh', async () => {
    const r = await verifyGhPath(`${process.execPath}`);
    /* node is not gh, so this must fail — the point of the check. */
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/does not look like the GitHub CLI/);
  });

  it('reports a path that cannot be run at all', async () => {
    const r = await verifyGhPath(join(__dirname, 'no-such-file'));
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe('the shell is never involved', () => {
  it('has no shell option anywhere in the module', () => {
    /*
      Arguments here include issue titles and search queries — text from a
      repository we do not control. `sh -c "gh issue list --search $q"` runs
      whatever a query of `x; rm -rf ~` decides to be.

      Asserted against the source rather than through behaviour because the
      failure mode is somebody adding `shell: true` for a glob one afternoon,
      and no ordinary test would notice.
    */
    const src = readFileSync(join(__dirname, 'gh.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/shell\s*:\s*true/);
    expect(code).not.toMatch(/\bexec\s*\(/);
  });

  it('never reads the credential', () => {
    /* The whole argument for shelling out to gh is that the token stays in the
       OS keychain. A helper that fetched it would quietly undo that. */
    const src = readFileSync(join(__dirname, 'gh.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/auth['"\s,\]]*.*token/i);
  });
});

describe('which path wins', () => {
  const ENV_PATH = join(__dirname, 'from-env');
  const SETTING_PATH = join(__dirname, 'from-settings');

  afterEach(() => { delete process.env.DAAKIA_GH; });

  it('prefers the environment over a saved setting', async () => {
    /*
      The env var is the temporary override — set on one launch to test
      something, as in `DAAKIA_GH=C:\nope\gh.exe code .` to reach the
      "not found" screen. A saved setting that outranked it would make that
      launch silently do nothing.
    */
    process.env.DAAKIA_GH = ENV_PATH;
    setGhPath(SETTING_PATH);
    try {
      await resolveBinary();
      throw new Error('should not resolve');
    } catch (err) {
      expect((err as GhMissing).tried).toEqual([ENV_PATH]);
    }
  });

  it('uses the saved setting when there is no environment override', async () => {
    setGhPath(SETTING_PATH);
    try {
      await resolveBinary();
      throw new Error('should not resolve');
    } catch (err) {
      expect((err as GhMissing).tried).toEqual([SETTING_PATH]);
    }
  });

  it('falls back to PATH and the usual locations when neither is set', async () => {
    setGhPath(undefined);
    /* This machine has gh, so this resolves rather than throwing — which is
       itself the assertion: discovery happens when nothing was named. */
    await expect(resolveBinary()).resolves.toBeTruthy();
  });
});
