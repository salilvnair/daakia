/**
 * The shipped layouts have to actually match the trees they claim to.
 *
 * Each layout carries two example paths. Compiling its template and running it
 * against its own examples is what stops a plausible-looking glob shipping
 * broken — a wrong template and an empty volume both produce "no matches", so
 * nobody would find out from using it.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { BUILTIN_LAYOUTS, layoutFor } from './pv-layouts';
import { filesForPod, clearPvCache, type PvLogConfig } from './pv-logs';

/** The pod the examples are written for. */
const REF = {
  namespace: 'payments',
  pod: 'my-app-7f9455548d-xm6kc',
  workload: 'my-app',
  container: 'app',
} as never;

describe('every shipped layout matches its own examples', () => {
  it.each(BUILTIN_LAYOUTS.map(l => [l.name, l] as const))('%s', async (_name, layout) => {
    const root = mkdtempSync(join(tmpdir(), 'dk8s-layout-'));
    try {
      for (const rel of layout.example) {
        const file = join(root, ...rel.split('/'));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, 'line\n');
      }
      clearPvCache();
      const cfg: PvLogConfig = {
        enabled: true,
        mounts: [{ path: root }],
        template: layout.template,
        // No extension filter: several examples end .gz or .log.1, and the
        // layout is what is under test, not the filter.
      };
      const found = await filesForPod(cfg, REF);
      expect(found.map(f => f.rel).sort()).toEqual([...layout.example].sort());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the layouts as a set', () => {
  it('has no duplicate ids', () => {
    const ids = BUILTIN_LAYOUTS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no two layouts with the same template', () => {
    // Two names for one glob is a menu that cannot be chosen between.
    const t = BUILTIN_LAYOUTS.map(l => l.template);
    expect(new Set(t).size).toBe(t.length);
  });

  it('gives every layout a hint and two examples', () => {
    for (const l of BUILTIN_LAYOUTS) {
      expect(l.hint.length).toBeGreaterThan(20);
      expect(l.example).toHaveLength(2);
    }
  });

  it('ships enough to cover the common cases', () => {
    expect(BUILTIN_LAYOUTS.length).toBeGreaterThanOrEqual(8);
  });
});

describe('layoutFor', () => {
  it('recognises a template that came from a layout', () => {
    expect(layoutFor('{app}-{env}-pvc/**/{app}*.log')?.id).toBe('pvc-per-app-env');
  });

  it('tolerates surrounding whitespace', () => {
    expect(layoutFor('  {app}-{env}-pvc/**/{app}*.log  ')?.id).toBe('pvc-per-app-env');
  });

  /*
    An edited template is a custom one, and the picker must stop claiming
    otherwise — the highlight is a statement about what will be searched.
  */
  it('does not recognise an edited template', () => {
    expect(layoutFor('{app}-{env}-pvc/**/{app}*.txt')).toBeUndefined();
  });

  it('recognises nothing for an empty template', () => {
    expect(layoutFor('')).toBeUndefined();
    expect(layoutFor(undefined)).toBeUndefined();
  });
});
