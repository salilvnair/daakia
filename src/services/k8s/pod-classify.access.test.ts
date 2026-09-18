/**
 * The capability probe is an exec, so it has to ask first.
 *
 * On an account without `create pods/exec` the cluster's answer is already
 * known — dk8s asked in the access probe, and the answer is cached. The probe
 * was running anyway, once per pod opened: the audit showed
 * `exec … -- sh -c "for s in bash sh ash busybox…"` coming back exit 1 right
 * beside the `auth can-i create pods/exec` that had just said no.
 *
 * The other half matters as much. A check that could not be MADE is not a no,
 * and an account in that state must still get the probe — hiding something
 * that would have worked is the worse mistake, and it is the bug this whole
 * area was rewritten for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { __resetAskOnce } from './ask-once';

const calls: string[][] = [];
/** What `auth can-i create pods/exec` should answer in the case under test. */
let canExec: { ok: boolean; code: number; stderr: string };

vi.mock('./kubectl', () => ({
  run: async (args: string[]) => {
    calls.push(args);
    if (args.includes('can-i')) {
      // Only the exec check varies; everything else is allowed, so a failure
      // here cannot be blamed on some other verb.
      const isExec = args.includes('pods/exec');
      return isExec
        ? { ...canExec, stdout: '' }
        : { ok: true, code: 0, stdout: '', stderr: '' };
    }
    return { ok: true, code: 0, stdout: 'shell=sh\nbin=tar\n', stderr: '' };
  },
}));

const { probeCapabilities } = await import('./pod-classify');
const { clearAccessCache } = await import('./k8s-access');

const execCalls = () => calls.filter(a => a.includes('exec') && !a.includes('can-i'));

beforeEach(() => {
  calls.length = 0;
  clearAccessCache();
  /* The capability probe is remembered per pod now, and every case here uses
     the same pod on purpose — without this, the second case reads the first
     one's answer and the probe it is asserting about never runs. */
  __resetAskOnce();
});

describe('when the account definitely cannot exec', () => {
  beforeEach(() => {
    /* `--quiet` prints nothing for a real refusal — that silence is the only
       thing that means "no". */
    canExec = { ok: false, code: 1, stderr: '' };
  });

  it('does not spend an exec on it', async () => {
    await probeCapabilities('prod', 'payments', 'api-0');
    expect(execCalls()).toEqual([]);
  });

  it('says why, rather than reporting a distroless image', async () => {
    const caps = await probeCapabilities('prod', 'payments', 'api-0');
    expect(caps.unreachable).toMatch(/cannot create on pods\/exec/);
    expect(caps.shell).toBeNull();
  });
});

describe('when the account can exec', () => {
  beforeEach(() => { canExec = { ok: true, code: 0, stderr: '' }; });

  it('runs the probe and reads what came back', async () => {
    const caps = await probeCapabilities('prod', 'payments', 'api-0');
    expect(execCalls().length).toBe(1);
    expect(caps.shell).toBe('sh');
    expect(caps.tar).toBe(true);
  });
});

describe('when the check itself could not be made', () => {
  beforeEach(() => {
    // kubectl exits 1 here too — but it SPOKE, so it did not answer.
    canExec = { ok: false, code: 1, stderr: 'error: You must be logged in to the server (Unauthorized)' };
  });

  it('still runs the probe, because unknown is not no', async () => {
    const caps = await probeCapabilities('prod', 'payments', 'api-0');
    expect(execCalls().length).toBe(1);
    expect(caps.unreachable).toBeUndefined();
  });
});
