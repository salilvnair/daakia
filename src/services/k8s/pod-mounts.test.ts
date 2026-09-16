/**
 * Offering the paths a pod already knows about.
 *
 * Typing an archive path by hand means knowing a path inside somebody else's
 * container, and one wrong character produces an empty search rather than an
 * error — the worst way to be wrong. The ranking is what makes the list worth
 * reading rather than a dump of every mount Kubernetes added.
 */
import { describe, it, expect } from 'vitest';
import { volumeKind, mountScore, isRunPod } from './pod-mounts';

describe('what kind of volume it is', () => {
  it('reads a claim, and its name', () => {
    expect(volumeKind({ persistentVolumeClaim: { claimName: 'prodapp-prod-pvc' } }))
      .toEqual({ kind: 'pvc', claim: 'prodapp-prod-pvc' });
  });

  it('reads the other kinds', () => {
    expect(volumeKind({ configMap: {} }).kind).toBe('configMap');
    expect(volumeKind({ emptyDir: {} }).kind).toBe('emptyDir');
    expect(volumeKind({ projected: {} }).kind).toBe('projected');
    expect(volumeKind({ azureFile: {} }).kind).toBe('azureFile');
  });

  it('does not guess at one it has never seen', () => {
    expect(volumeKind({ somethingNew: {} }).kind).toBe('unknown');
    expect(volumeKind(undefined).kind).toBe('unknown');
  });
});

describe('which mount to offer first', () => {
  const score = (path: string, kind: string) => mountScore({ path, kind });

  it('puts a claim that mentions logs at the top', () => {
    /* The case this is for: /prodapp-prod-pvc/prodapp_prod_logs. */
    expect(score('/prodapp-prod-pvc/prodapp_prod_logs', 'pvc'))
      .toBeGreaterThan(score('/data', 'pvc'));
  });

  it('prefers a claim to an emptyDir', () => {
    expect(score('/logs', 'pvc')).toBeGreaterThan(score('/logs', 'emptyDir'));
  });

  it('still offers an emptyDir called logs, which sidecars really do', () => {
    expect(score('/var/log/app', 'emptyDir')).toBeGreaterThan(0);
  });

  it('pushes config and secrets below everything', () => {
    expect(score('/etc/config', 'configMap')).toBeLessThan(score('/data', 'emptyDir'));
    expect(score('/etc/tls', 'secret')).toBeLessThan(0);
  });

  it('puts the token Kubernetes mounts on every pod last', () => {
    /* It is on every pod in the cluster and is never what anybody wants. */
    expect(score('/var/run/secrets/kubernetes.io/serviceaccount', 'projected')).toBe(-1);
  });
});

describe('a pod worth checking', () => {
  it('leaves out a run of something', () => {
    /* A finished CronJob run is gone, and where its logs went is the owning
       app's question. Offering one in the picker offers a wrong answer. */
    expect(isRunPod([{ kind: 'Job' }])).toBe(true);
    expect(isRunPod([{ kind: 'CronJob' }])).toBe(true);
  });

  it('keeps what stays up', () => {
    expect(isRunPod([{ kind: 'ReplicaSet' }])).toBe(false);
    expect(isRunPod([{ kind: 'StatefulSet' }])).toBe(false);
  });

  it('reads the owner, never the name', () => {
    /* `nightly-billing-29825510` looks like a run and
       `prodapp-bc8f7bf84-mhz5f` looks like one too if you squint at the
       suffix. Only the owner actually knows. */
    expect(isRunPod(undefined)).toBe(false);
    expect(isRunPod([])).toBe(false);
  });
});
