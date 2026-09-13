/**
 * kubectl never guesses which cluster it is talking to.
 *
 * The bug this pins: call sites spelled the context as
 * `ctx ? ['--context', ctx] : []`, so a missing context was silently dropped
 * and kubectl fell back to its own current-context — localhost:8080 when none
 * is set, which refuses instantly and is indistinguishable from the cluster
 * being down, or somebody else's cluster when one is set, which is worse
 * because it answers.
 *
 * These tests run the real `run`, not a mock. A mocked runner would happily
 * prove the guard exists while the guard did nothing.
 */
import { describe, it, expect } from 'vitest';
import { run } from './kubectl';

describe('a cluster call without --context', () => {
  it('is refused before anything is executed', async () => {
    const r = await run(['get', 'pods', '-n', 'default']);
    expect(r.ok).toBe(false);
    /* `code: null` is the tell that no process ran at all — a kubectl that had
       started and failed would carry an exit status. */
    expect(r.code).toBeNull();
    expect(r.failure).toMatch(/--context/);
  });

  it('says it is dk8s at fault, not the cluster or the reader', async () => {
    /* The whole point. "Unable to connect" sent somebody to check a VPN, a
       firewall and their own permissions for a bug that was ours. */
    const r = await run(['logs', 'some-pod']);
    expect(r.failure).toMatch(/bug in dk8s/);
    expect(r.failure).not.toMatch(/permission|denied/i);
  });

  it('names the command it would have run', async () => {
    const r = await run(['describe', 'pod', 'checkout-7d9']);
    expect(r.failure).toContain('describe pod checkout-7d9');
  });

  it('catches the conditional-spread spelling that caused this', async () => {
    /* Exactly what `scope()` produced when its context argument was empty. */
    const ctx = '';
    const args = [...(ctx ? ['--context', ctx] : []), 'get', 'pods', '-o', 'json'];
    expect((await run(args)).ok).toBe(false);
  });
});

describe('calls that are not about a cluster', () => {
  /*
    These must still run. `version --client` is how the binary is found in the
    first place, and `config` is how the context list is read — requiring a
    context for either would make it impossible to discover one.
  */
  it('lets kubectl describe itself', async () => {
    const r = await run(['version', '--client', '-o', 'json']);
    /* Undefined when it simply ran, which is the outcome being asserted. */
    expect(r.failure ?? '').not.toMatch(/--context/);
  });

  it('lets the kubeconfig be read', async () => {
    const r = await run(['config', 'get-contexts', '-o', 'name']);
    expect(r.failure ?? '').not.toMatch(/--context/);
  });
});

describe('a cluster call that names its context', () => {
  it('is allowed through to kubectl', async () => {
    const r = await run(['--context', 'nope-does-not-exist', 'get', 'pods'], { timeoutMs: 8000 });
    /* It fails — there is no such context — but it fails for kubectl's reason
       rather than ours, which is the distinction being tested. */
    expect(r.failure ?? '').not.toMatch(/dk8s refused/);
  });
});

describe('--context with nothing after it', () => {
  it('is refused, because kubectl reads an empty value as unset', async () => {
    /* The subtler half of the same bug: the flag is present, so a guard that
       only looked for the flag would pass it through to the default cluster. */
    const r = await run(['--context', '', 'get', 'pods']);
    expect(r.ok).toBe(false);
    expect(r.failure).toMatch(/--context/);
  });

  it('is refused for whitespace too', async () => {
    expect((await run(['--context', '   ', 'get', 'pods'])).ok).toBe(false);
  });
});
