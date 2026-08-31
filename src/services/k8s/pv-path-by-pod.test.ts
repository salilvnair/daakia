/**
 * `pathByPod` — naming the exception instead of bending the rule.
 *
 * The shared template assumes a claim named after the workload and the
 * environment. Plenty of volumes are not laid out that way, and the wrong fix
 * is to widen the template with globs until it covers the odd one out — at
 * which point it no longer describes the common case either, and starts
 * claiming files that belong to other pods.
 */
import { describe, it, expect } from 'vitest';
import { podKeyMatches, templateForPod, type PvLogConfig, type PodRef } from './pv-logs';

const ref = (pod: string): PodRef => ({
  pod, namespace: 'prod', context: 'aks-prod-eu',
});

describe('podKeyMatches', () => {
  it('treats a key with no glob character as a substring', () => {
    // The same rule `appByPod` already uses, so the two editors behave alike.
    expect(podKeyMatches('zp-backend', 'zp-backend-7f9455548d-xm6kc')).toBe(true);
    expect(podKeyMatches('backend', 'zp-backend-7f9455548d-xm6kc')).toBe(true);
    expect(podKeyMatches('checkout', 'zp-backend-7f9455548d-xm6kc')).toBe(false);
  });

  it('is case-insensitive as a substring', () => {
    expect(podKeyMatches('ZP-Backend', 'zp-backend-7f9455548d-xm6kc')).toBe(true);
  });

  it('treats a key containing * as an anchored glob', () => {
    expect(podKeyMatches('zp-backend-*', 'zp-backend-7f9455548d-xm6kc')).toBe(true);
    expect(podKeyMatches('zp-*-xm6kc', 'zp-backend-7f9455548d-xm6kc')).toBe(true);
    // Anchored: a glob describes the whole name, so a partial one does not hit.
    expect(podKeyMatches('zp-backend', 'zp-backend-7f9455548d-xm6kc')).toBe(true);
    expect(podKeyMatches('backend-*', 'zp-backend-7f9455548d-xm6kc')).toBe(false);
  });

  it('treats ? as a single character', () => {
    expect(podKeyMatches('zp-backend-?', 'zp-backend-1')).toBe(true);
    expect(podKeyMatches('zp-backend-?', 'zp-backend-12')).toBe(false);
  });

  it('ignores a blank key rather than matching everything', () => {
    // A half-typed row in the settings editor must not claim every pod.
    expect(podKeyMatches('', 'zp-backend-1')).toBe(false);
    expect(podKeyMatches('   ', 'zp-backend-1')).toBe(false);
  });
});

describe('templateForPod', () => {
  const shared = '{app}-{env}-pvc/{app}-{env}-logs/**/{app}*.log*';

  it('falls back to the shared template when nothing matches', () => {
    const cfg: PvLogConfig = { enabled: true, template: shared };
    expect(templateForPod(cfg, ref('zp-backend-1'))).toBe(shared);
  });

  it('lets a matching pod override the shared template', () => {
    const cfg: PvLogConfig = {
      enabled: true,
      template: shared,
      pathByPod: { 'zp-backend-*': 'shared/team-a/**/{app}*.log*' },
    };
    expect(templateForPod(cfg, ref('zp-backend-7f9455548d-xm6kc')))
      .toBe('shared/team-a/**/{app}*.log*');
    // And leaves every other pod on the rule.
    expect(templateForPod(cfg, ref('checkout-abc-1'))).toBe(shared);
  });

  it('prefers the longest key, so one pod beats a family', () => {
    const cfg: PvLogConfig = {
      enabled: true,
      template: shared,
      pathByPod: {
        'zp-backend': 'family/**/*.log',
        'zp-backend-crashloop': 'one-pod/**/*.log',
      },
    };
    expect(templateForPod(cfg, ref('zp-backend-crashloop-6dd889877d-b5fj6')))
      .toBe('one-pod/**/*.log');
    expect(templateForPod(cfg, ref('zp-backend-oom-7bb88bcc45-27sqb')))
      .toBe('family/**/*.log');
  });

  it('beats a mount-level template too, being the more specific statement', () => {
    const cfg: PvLogConfig = {
      enabled: true,
      template: shared,
      pathByPod: { 'zp-backend-*': 'one-pod/**/*.log' },
    };
    const mount = { path: '/mnt/pvcs', template: 'mount-level/**/*.log' };
    expect(templateForPod(cfg, ref('zp-backend-1'), mount)).toBe('one-pod/**/*.log');
    // Without a match the mount still wins over the shared template.
    expect(templateForPod(cfg, ref('checkout-1'), mount)).toBe('mount-level/**/*.log');
  });

  it('skips a row whose path is blank rather than resolving to nothing', () => {
    // Half-typed rows exist. One must not blank out a working template and
    // make the pod look as though it has no archived logs at all.
    const cfg: PvLogConfig = {
      enabled: true,
      template: shared,
      pathByPod: { 'zp-backend-*': '   ' },
    };
    expect(templateForPod(cfg, ref('zp-backend-1'))).toBe(shared);
  });

  it('returns empty when there is nothing to go on', () => {
    expect(templateForPod({ enabled: true }, ref('zp-backend-1'))).toBe('');
  });
});
