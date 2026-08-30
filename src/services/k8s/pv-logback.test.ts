import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  filesForPod, probePv, clearPvCache, expandTemplate, envFor, type PvLogConfig,
} from './pv-logs';
import { searchPvForPod } from './pv-search';
import { DEFAULT_SEARCH } from './k8s-log-search';

/**
 * The real thing: one mount, and every directory below it named after the
 * workload and the environment it runs in.
 *
 *   <mount>/zp-backend-prod-pvc/zp-backend-prod-logs/zp-backend.log
 *   <mount>/zp-backend-prod-pvc/zp-backend-prod-logs/archived/zp-backend.2026-08-28.0.log
 *
 * Both halves of those names are derivable — the app from the pod name, the
 * environment from the cluster — which is what {app} and {env} are for.
 */
let mount: string;

beforeAll(async () => {
  mount = await fs.mkdtemp(path.join(os.tmpdir(), 'dk8s-pvc-'));
  const w = async (rel: string, body: string) => {
    const full = path.join(mount, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  };
  // prod
  await w('zp-backend-prod-pvc/zp-backend-prod-logs/zp-backend.log',
    '2026-08-30 10:00:01 ERROR Connection refused PROD-LIVE\n');
  await w('zp-backend-prod-pvc/zp-backend-prod-logs/archived/zp-backend.2026-08-28.0.log',
    '2026-08-28 09:00:00 ERROR Connection refused PROD-ARCHIVED\n');
  await w('zp-backend-prod-pvc/zp-backend-prod-logs/archived/zp-backend.2026-08-27.1.log',
    '2026-08-27 08:00:00 ERROR Connection refused PROD-SIZE-ROLLED\n');
  // dev, same shape
  await w('zp-backend-dev-pvc/zp-backend-dev-logs/zp-backend.log',
    '2026-08-30 10:00:02 ERROR Connection refused DEV-LIVE\n');
  // a second application, to prove {app} scopes as well as {env}
  await w('zp-payments-prod-pvc/zp-payments-prod-logs/zp-payments.log',
    '2026-08-30 10:00:03 ERROR Connection refused OTHER-APP\n');
});

afterAll(async () => { await fs.rm(mount, { recursive: true, force: true }); });
beforeEach(() => clearPvCache());

/** Exactly what the settings page would hold. */
const cfg = (): PvLogConfig => ({
  enabled: true,
  mounts: [{ path: mount }],
  template: '{app}-{env}-pvc/{app}-{env}-logs/**/{app}*.log*',
  envByContext: { prod: 'prod', dev: 'dev' },
  extensions: ['.log'],
});

const prodPod = { namespace: 'zp-platform', pod: 'zp-backend-7f9455548d-xm6kc', context: 'aks-prod-eu' };
const devPod = { namespace: 'zp-platform', pod: 'zp-backend-7f9455548d-aa111', context: 'aks-dev' };

describe('{app}-{env}-pvc / {app}-{env}-logs', () => {
  it('builds the path from the pod name and the cluster', () => {
    expect(expandTemplate(cfg().template!, prodPod, envFor(cfg(), prodPod)))
      .toBe('zp-backend-prod-pvc/zp-backend-prod-logs/**/zp-backend*.log*');
  });

  it('finds the live file and every logback-rolled one', async () => {
    const files = await filesForPod(cfg(), prodPod);
    expect(files.map(f => f.rel).sort()).toEqual([
      'zp-backend-prod-pvc/zp-backend-prod-logs/archived/zp-backend.2026-08-27.1.log',
      'zp-backend-prod-pvc/zp-backend-prod-logs/archived/zp-backend.2026-08-28.0.log',
      'zp-backend-prod-pvc/zp-backend-prod-logs/zp-backend.log',
    ]);
  });

  it('never reads the dev claim for a prod pod', async () => {
    const files = await filesForPod(cfg(), prodPod);
    expect(files.some(f => f.rel.includes('-dev-'))).toBe(false);
  });

  it('never reads another application', async () => {
    const files = await filesForPod(cfg(), prodPod);
    expect(files.some(f => f.rel.includes('zp-payments'))).toBe(false);
  });

  it('reads dev for a dev pod', async () => {
    const files = await filesForPod(cfg(), devPod);
    expect(files.map(f => f.rel)).toEqual(['zp-backend-dev-pvc/zp-backend-dev-logs/zp-backend.log']);
  });

  it('matches a context by substring, so aks-prod-eu is prod', () => {
    expect(envFor(cfg(), prodPod)).toBe('prod');
    expect(envFor(cfg(), devPod)).toBe('dev');
  });

  it('prefers the longer key, so preprod does not resolve to prod', () => {
    const c: PvLogConfig = { enabled: true, envByContext: { prod: 'prod', preprod: 'preprod' } };
    expect(envFor(c, { ...prodPod, context: 'aks-preprod-01' })).toBe('preprod');
    expect(envFor(c, { ...prodPod, context: 'aks-prod-01' })).toBe('prod');
  });

  it('falls back to a glob for an unmapped cluster, finding both rather than none', async () => {
    const files = await filesForPod({ ...cfg(), envByContext: {} }, prodPod);
    // Still finds the logs; it just cannot tell prod from dev without the map.
    expect(files.length).toBe(4);
    expect(files.some(f => f.rel.includes('-prod-'))).toBe(true);
    expect(files.some(f => f.rel.includes('-dev-'))).toBe(true);
  });

  it('searches live and archived together', async () => {
    const { result, matches } = await searchPvForPod(
      cfg(), prodPod, { ...DEFAULT_SEARCH, query: 'Connection refused' }, { cancelled: false },
    );
    expect(result.matched).toBe(3);
    expect(matches.map(m => m.text.split(' ').pop()).sort())
      .toEqual(['PROD-ARCHIVED', 'PROD-LIVE', 'PROD-SIZE-ROLLED']);
    expect(result.files).toHaveLength(3);
  });

  it('probes the mount and reports what is under it', async () => {
    const p = await probePv(cfg());
    expect(p.ok).toBe(true);
    expect(p.mounts[0].topLevel.sort())
      .toEqual(['zp-backend-dev-pvc', 'zp-backend-prod-pvc', 'zp-payments-prod-pvc']);
    expect(p.fileCount).toBe(5);
  });
});
