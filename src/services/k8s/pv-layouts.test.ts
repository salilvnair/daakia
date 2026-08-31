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
import {
  BUILTIN_LAYOUTS, allLayouts, layoutFor, layoutIdFor,
} from './pv-layouts';
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
    expect(layoutFor('{app}-{env}-pvc/**/{app}*.log*')?.id).toBe('pvc-per-app-env');
  });

  it('tolerates surrounding whitespace', () => {
    expect(layoutFor('  {app}-{env}-pvc/**/{app}*.log*  ')?.id).toBe('pvc-per-app-env');
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

/*
  Layouts somebody saves, beside the ones that ship.

  The shipped nine are a starting point; a volume laid out some other way has
  to be nameable and reusable, or the template field is retyped from memory
  every time a new mount is added.
*/
describe('saved layouts', () => {
  const mine = { id: 'custom.ours', name: 'Ours', template: 'logs/{app}/*.log' };

  it('offers saved layouts after the shipped ones', () => {
    const all = allLayouts([mine]);
    expect(all).toHaveLength(BUILTIN_LAYOUTS.length + 1);
    // Position matters: a picker whose buttons move as you add to it has to be
    // re-read every time.
    expect(all[all.length - 1]!.id).toBe('custom.ours');
    expect(all.slice(0, BUILTIN_LAYOUTS.length).map(l => l.id))
      .toEqual(BUILTIN_LAYOUTS.map(l => l.id));
  });

  it('marks saved ones as custom so only they can be removed', () => {
    const all = allLayouts([mine]);
    expect(all.find(l => l.id === 'custom.ours')!.custom).toBe(true);
    expect(all.find(l => l.id === 'pvc-per-app-env')!.custom).toBeUndefined();
  });

  it('recognises a saved layout as the current one', () => {
    expect(layoutFor('logs/{app}/*.log', [mine])?.id).toBe('custom.ours');
  });

  it('still recognises a shipped layout when saved ones exist', () => {
    expect(layoutFor('{app}-{env}-pvc/**/{app}*.log*', [mine])?.id).toBe('pvc-per-app-env');
  });

  it('leaves the shipped list untouched', () => {
    // `allLayouts` copies rather than mutating, or saving one layout would
    // mark a shipped one custom for the rest of the session.
    allLayouts([mine]);
    expect(BUILTIN_LAYOUTS.some(l => l.custom)).toBe(false);
  });
});

describe('layoutIdFor', () => {
  it('makes a readable id from a name', () => {
    expect(layoutIdFor('Our Prod Claim')).toBe('custom.our-prod-claim');
  });

  it('cannot collide with a shipped id', () => {
    // Every generated id is namespaced, so naming one "Pod named" is fine.
    expect(layoutIdFor('pod named').startsWith('custom.')).toBe(true);
  });

  it('disambiguates a repeated name', () => {
    const first = { id: 'custom.ours', name: 'Ours', template: 'a' };
    expect(layoutIdFor('Ours', [first])).toBe('custom.ours-2');
  });

  it('falls back for a name with nothing usable in it', () => {
    expect(layoutIdFor('!!!')).toBe('custom.layout');
  });
});
