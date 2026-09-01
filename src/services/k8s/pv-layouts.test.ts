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
  BUILTIN_LAYOUTS, layoutList, isDefaultLayouts, layoutFor, layoutIdFor,
  shapeRegExp, filesForLayout,
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
      for (const rel of layout.example!) {
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
      expect(found.map(f => f.rel).sort()).toEqual([...layout.example!].sort());
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
  One editable list, seeded from what ships.

  The shipped rows are a starting point rather than a fixed menu: a row that
  does not describe any volume here is deleted, one that nearly does is edited,
  and a volume laid out some other way is added. Restore defaults is what makes
  all of that safe to do.
*/
describe('the layout list', () => {
  const mine = { id: 'custom.ours', name: 'Ours', template: 'logs/{app}/*.log', custom: true };

  it('is the shipped list until something is saved', () => {
    expect(layoutList().map(l => l.id)).toEqual(BUILTIN_LAYOUTS.map(l => l.id));
    expect(layoutList(undefined).map(l => l.id)).toEqual(BUILTIN_LAYOUTS.map(l => l.id));
  });

  it('is whatever was saved once something is', () => {
    expect(layoutList([mine]).map(l => l.id)).toEqual(['custom.ours']);
  });

  /*
    Deleting every row is a state a user can reach, and it has to survive.
    Falling back to the shipped list for an empty array would make the last
    delete look like it failed.
  */
  it('stays empty when every row was deleted', () => {
    expect(layoutList([])).toEqual([]);
  });

  it('hands out copies, so editing a row cannot change the shipped constant', () => {
    const rows = layoutList();
    rows[0]!.template = 'mangled';
    expect(BUILTIN_LAYOUTS[0]!.template).not.toBe('mangled');
    expect(layoutList()[0]!.template).not.toBe('mangled');
  });

  it('recognises a saved row as the current one', () => {
    expect(layoutFor('logs/{app}/*.log', [mine])?.id).toBe('custom.ours');
  });

  /*
    The list replaces the shipped one rather than extending it, so a shipped
    template is only recognised while its row is still in the list — which is
    what makes the highlight honest after a row is deleted.
  */
  it('stops recognising a shipped template once its row is gone', () => {
    expect(layoutFor('{app}-{env}-pvc/**/{app}*.log*')?.id).toBe('pvc-per-app-env');
    expect(layoutFor('{app}-{env}-pvc/**/{app}*.log*', [mine])).toBeUndefined();
  });
});

describe('isDefaultLayouts', () => {
  it('is true when nothing was saved', () => {
    expect(isDefaultLayouts()).toBe(true);
    expect(isDefaultLayouts(undefined)).toBe(true);
  });

  /*
    Compared field by field, not by reference. The list is materialised into
    the config the moment any row is touched, so the saved rows are never the
    same objects as the shipped ones even when they hold the same values —
    and Restore defaults must stay disabled in that case.
  */
  it('is true for a materialised copy of the shipped rows', () => {
    expect(isDefaultLayouts(BUILTIN_LAYOUTS.map(l => ({ ...l })))).toBe(true);
  });

  it('is false once a row is edited', () => {
    const edited = BUILTIN_LAYOUTS.map(l => ({ ...l }));
    edited[0]!.template = '{app}/*.log';
    expect(isDefaultLayouts(edited)).toBe(false);
  });

  it('is false once a row is deleted', () => {
    expect(isDefaultLayouts(BUILTIN_LAYOUTS.slice(1))).toBe(false);
  });

  it('is false once a row is added', () => {
    expect(isDefaultLayouts([
      ...BUILTIN_LAYOUTS,
      { id: 'custom.x', name: 'X', template: 'x/*.log', custom: true },
    ])).toBe(false);
  });

  it('is false for an empty list', () => {
    expect(isDefaultLayouts([])).toBe(false);
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

/*
  Matching a template against paths, with no pod in hand.

  This is what lets the settings table show the files on a real volume beside
  each row instead of an invented example. It has to agree with the walker: a
  row claiming files the search would not find is worse than no example at
  all, because it reads as confirmation that the template is right.
*/
describe('shapeRegExp', () => {
  it('matches every shipped layout against its own examples', () => {
    // The same examples the disk-walking test uses, so the two ways of
    // matching a template cannot drift apart.
    for (const l of BUILTIN_LAYOUTS) {
      const rx = shapeRegExp(l.template);
      for (const ex of l.example!) {
        expect([l.name, ex, rx.test(ex)]).toEqual([l.name, ex, true]);
      }
    }
  });

  it('treats a token as any one path segment', () => {
    const rx = shapeRegExp('{app}-{env}-pvc/{app}.log');
    expect(rx.test('checkout-prod-pvc/checkout.log')).toBe(true);
    // A token cannot span a directory separator, or every row would claim
    // every file and the column would be noise.
    expect(rx.test('a/b-prod-pvc/checkout.log')).toBe(false);
  });

  it('spans no directories as well as many for **', () => {
    const rx = shapeRegExp('{app}-{env}-pvc/**/{app}*.log*');
    expect(rx.test('pv-checkout-prod-pvc/pv-checkout.log')).toBe(true);
    expect(rx.test('pv-checkout-prod-pvc/archived/pv-checkout-2026-08-28.log.gz')).toBe(true);
    expect(rx.test('pv-checkout-prod-pvc/a/b/c/pv-checkout.log')).toBe(true);
  });

  /*
    A token repeated in a template names the same thing twice, and the match
    has to hold it to that — the walker substitutes one app into both places.
  */
  it('holds a repeated token to one value', () => {
    const rx = shapeRegExp('{app}-prod-pvc/**/{app}*.log*');
    expect(rx.test('pv-checkout-prod-pvc/archived/pv-checkout-2026-08-30.log')).toBe(true);
    expect(rx.test('pv-checkout-prod-pvc/archived/pv-billing-2026-08-30.log')).toBe(false);
  });

  /*
    The limit of matching without a pod, stated rather than papered over.

    Adjacent tokens have no unambiguous split: in `{app}-{env}-pvc`, app can be
    `pv-checkout` and env `prod`, or app `pv` and env `checkout-prod`. Both are
    real readings, and under the second the walker really would return
    `pv-billing-*.log` from that directory. So the pattern accepts it. A search
    never has this problem — it knows the pod, so it knows the app.
  */
  it('accepts any valid reading when two tokens are adjacent', () => {
    const rx = shapeRegExp('{app}-{env}-pvc/**/{app}*.log*');
    expect(rx.test('pv-checkout-prod-pvc/archived/pv-billing-2026-08-30.log')).toBe(true);
    // Nothing can read this one: no split leaves an app the file starts with.
    expect(rx.test('pv-checkout-prod-pvc/archived/zz-other-2026-08-30.log')).toBe(false);
  });

  it('keeps a dot literal', () => {
    const rx = shapeRegExp('{app}/x.log');
    expect(rx.test('a/x.log')).toBe(true);
    expect(rx.test('a/xylog')).toBe(false);
  });

  it('is case insensitive, like the walker', () => {
    expect(shapeRegExp('{app}/App.LOG').test('svc/app.log')).toBe(true);
  });
});

describe('filesForLayout', () => {
  const paths = [
    'pv-checkout-prod-pvc/pv-checkout.log',
    'pv-checkout-prod-pvc/archived/pv-checkout-2026-08-30.log',
    'pv-checkout-prod-pvc/archived/pv-checkout-2026-08-28.log.gz',
    'pv-billing-prod-pvc/pv-billing.log',
    'legacy/whatever.txt',
  ];

  it('reports what a template claims and how much of it', () => {
    const r = filesForLayout('{app}-{env}-pvc/**/{app}*.log*', paths);
    expect(r.count).toBe(4);
    // Only a couple are kept — the column shows evidence, not a file browser.
    expect(r.rel).toHaveLength(2);
    expect(r.rel[0]).toBe('pv-checkout-prod-pvc/pv-checkout.log');
  });

  it('reports nothing for a shape that cannot describe these paths', () => {
    // Three segments before the file, and nothing here is nested that deep.
    expect(filesForLayout('{app}/logs/{app}/deep/*.log', paths).count).toBe(0);
  });

  /*
    A looser template that happens to fit claims fewer files than the one that
    describes the volume, and both counts are true: `{namespace}/{app}/**` does
    match a two-deep path, for some namespace. Ranking by count is what makes
    the right row obvious, so the counts have to be honest rather than
    suppressed.
  */
  it('ranks the template that fits above one that merely could', () => {
    const fits = filesForLayout('{app}-{env}-pvc/**/{app}*.log*', paths).count;
    const loose = filesForLayout('{namespace}/{app}/**/*.log*', paths).count;
    expect(fits).toBeGreaterThan(loose);
  });

  it('claims nothing for an empty or broken template', () => {
    expect(filesForLayout('', paths).count).toBe(0);
    expect(filesForLayout('   ', paths).count).toBe(0);
  });
});
