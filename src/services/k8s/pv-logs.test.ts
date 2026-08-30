import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  appNameOf, expandTemplate, filesForPod, walkRoot, applyPattern, probePv,
  isInsideRoot, clearPvCache, type PvLogConfig,
} from './pv-logs';

let root: string;

/**
 * A volume laid out the way these usually are: a directory per namespace, then
 * per application, then per day, with rotated files inside. Plus one corner
 * that does not follow the rule, which is what the regex fallback exists for.
 */
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dk8s-pv-'));
  const write = async (rel: string, body: string) => {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  };

  await write('dk8s-test/zp-backend/2026-08-29/app.log', 'older line\nERROR boom 1\n');
  await write('dk8s-test/zp-backend/2026-08-30/app.log', 'ERROR boom 2\ntrailing\n');
  await write('dk8s-test/zp-backend/2026-08-30/app.log.1', 'rotated ERROR boom 3\n');
  await write('dk8s-test/other-app/2026-08-30/app.log', 'nothing here\n');
  await write('payments/checkout/2026-08-30/app.log', 'ERROR payment failed\n');

  // The exception: a flat file named after the pod, not under app/date.
  await write('legacy/zp-validation-slow-86459dc589-97r6f.log', 'ERROR legacy line\n');

  // Noise that must not be picked up as a log.
  await write('dk8s-test/zp-backend/2026-08-30/heapdump.hprof', 'binary-ish');
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

beforeEach(() => clearPvCache());

const cfg = (over: Partial<PvLogConfig> = {}): PvLogConfig => ({
  enabled: true,
  root,
  template: '{namespace}/{app}/{date}/*.log*',
  extensions: ['.log'],
  ...over,
});

describe('appNameOf', () => {
  it('peels a Deployment pod back to its deployment', () => {
    expect(appNameOf('zp-backend-7f9455548d-xm6kc')).toBe('zp-backend');
    expect(appNameOf('chatty-logger-6c6c75b88d-gh946')).toBe('chatty-logger');
    expect(appNameOf('zp-validation-slow-86459dc589-97r6f')).toBe('zp-validation-slow');
  });

  it('peels a StatefulSet ordinal', () => {
    expect(appNameOf('postgres-0')).toBe('postgres');
    expect(appNameOf('kafka-broker-12')).toBe('kafka-broker');
  });

  it('leaves a bare name alone', () => {
    expect(appNameOf('standalone')).toBe('standalone');
  });
});

describe('expandTemplate', () => {
  const ref = { namespace: 'dk8s-test', pod: 'zp-backend-7f9455548d-xm6kc' };

  it('fills namespace, pod and app', () => {
    expect(expandTemplate('{namespace}/{app}/{pod}.log', ref))
      .toBe('dk8s-test/zp-backend/zp-backend-7f9455548d-xm6kc.log');
  });

  it('turns {date} into a glob', () => {
    // Pinning today's date would miss the rotated file holding the crash.
    expect(expandTemplate('{app}/{date}/x.log', ref)).toBe('zp-backend/*/x.log');
  });
});

describe('walkRoot', () => {
  it('finds the log files and skips what the extension filter excludes', async () => {
    const files = await walkRoot(cfg());
    const rels = files.map(f => f.rel);
    expect(rels).toContain('dk8s-test/zp-backend/2026-08-30/app.log');
    expect(rels).toContain('dk8s-test/zp-backend/2026-08-30/app.log.1');
    expect(rels.some(r => r.endsWith('.hprof'))).toBe(false);
  });

  it('returns newest first', async () => {
    const files = await walkRoot(cfg());
    for (let i = 1; i < files.length; i++) {
      expect(files[i - 1].mtime).toBeGreaterThanOrEqual(files[i].mtime);
    }
  });

  it('honours maxAgeDays', async () => {
    const old = path.join(root, 'dk8s-test/zp-backend/2026-08-29/app.log');
    const ancient = new Date(Date.now() - 40 * 86_400_000);
    await fs.utimes(old, ancient, ancient);
    clearPvCache();
    const files = await walkRoot(cfg({ maxAgeDays: 7 }));
    expect(files.map(f => f.rel)).not.toContain('dk8s-test/zp-backend/2026-08-29/app.log');
  });
});

describe('filesForPod', () => {
  it('finds a pod through the template, including rotated files', async () => {
    const files = await filesForPod(cfg(), {
      namespace: 'dk8s-test', pod: 'zp-backend-7f9455548d-xm6kc',
    });
    const rels = files.map(f => f.rel).sort();
    expect(rels).toContain('dk8s-test/zp-backend/2026-08-30/app.log');
    expect(rels).toContain('dk8s-test/zp-backend/2026-08-30/app.log.1');
    // Another application in the same namespace must not be swept in.
    expect(rels.some(r => r.includes('other-app'))).toBe(false);
  });

  it('does not cross namespaces', async () => {
    const files = await filesForPod(cfg(), {
      namespace: 'dk8s-test', pod: 'checkout-679546f5c7-fs8d2',
    });
    expect(files.map(f => f.rel).some(r => r.startsWith('payments/'))).toBe(false);
  });

  it('picks up the exception through the regex fallback', async () => {
    // The flat legacy file the template cannot express.
    const files = await filesForPod(
      cfg({ pattern: String.raw`^legacy/(?<pod>[^/]+)\.log$` }),
      { namespace: 'dk8s-test', pod: 'zp-validation-slow-86459dc589-97r6f' },
    );
    expect(files.map(f => f.rel)).toContain('legacy/zp-validation-slow-86459dc589-97r6f.log');
  });

  it('survives a half-typed regex rather than failing the search', async () => {
    const files = await filesForPod(
      cfg({ pattern: '([unclosed' }),
      { namespace: 'dk8s-test', pod: 'zp-backend-7f9455548d-xm6kc' },
    );
    // The template's results still come back.
    expect(files.length).toBeGreaterThan(0);
  });

  it('returns nothing, rather than everything, for an unknown pod', async () => {
    const files = await filesForPod(cfg(), {
      namespace: 'nowhere', pod: 'ghost-abcdef1234-xxxxx',
    });
    expect(files).toEqual([]);
  });
});

describe('applyPattern', () => {
  it('reads named groups off the path', () => {
    const out = applyPattern(
      [{ file: 'x', rel: 'payments/checkout/2026-08-30/app.log', bytes: 1, mtime: 1 }],
      String.raw`^(?<namespace>[^/]+)/(?<app>[^/]+)/`,
    );
    expect(out[0].namespace).toBe('payments');
    expect(out[0].app).toBe('checkout');
  });
});

describe('isInsideRoot', () => {
  it('accepts a real child and rejects an escape', async () => {
    expect(await isInsideRoot(root, path.join(root, 'dk8s-test'))).toBe(true);
    // A template is user-supplied text; `..` in one must not walk the machine.
    expect(await isInsideRoot(root, path.resolve(root, '..'))).toBe(false);
  });
});

describe('probePv', () => {
  it('reports the tree so a template can be checked before searching', async () => {
    const p = await probePv(cfg());
    expect(p.ok).toBe(true);
    expect(p.topLevel.sort()).toEqual(['dk8s-test', 'legacy', 'payments']);
    expect(p.fileCount).toBeGreaterThan(0);
    expect(p.sample.length).toBeGreaterThan(0);
  });

  it('says plainly when the path is wrong', async () => {
    // "No matches" and "the path was wrong" look identical from the results.
    const missing = await probePv(cfg({ root: path.join(root, 'does-not-exist') }));
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/does not exist/);

    const blank = await probePv(cfg({ root: '' }));
    expect(blank.error).toMatch(/No path set/);
  });
});
