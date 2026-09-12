/**
 * 17E — the check that runs before a map is applied.
 *
 * The point of the whole screen is that it refuses to look configured when it
 * is not. Copying a map that mostly does not fit produces a board with empty
 * columns nobody can explain, so every dimension is checked here and the ones
 * that cannot be copied are named rather than dropped quietly.
 */
import { describe, it, expect } from 'vitest';
import {
  check, exportable, mapOf, merged, readMapFile, skippedLines, tally,
  type MapField,
} from './field-map';

const form = (dimension: string, options: string[], heading = dimension): MapField => ({
  dimension, heading, options, source: 'form',
});
const proj = (dimension: string, options: string[]): MapField => ({
  dimension, options, source: 'project',
});

const source = [
  form('Module', ['Checkout', 'Orders', 'Reporting', 'Admin']),
  form('Environment', ['DEV', 'PROD']),
  form('Type', ['UI', 'API', 'Backend', 'Excel']),
  form('Team', ['Payments']),
  proj('Status', ['Todo', 'Done']),
  proj('Priority', ['High', 'Low']),
];

describe('check', () => {
  const here = {
    dimensions: [
      form('Module', ['Checkout', 'Orders', 'Reporting', 'Admin']),
      form('Environment', ['DEV', 'PROD']),
      form('Type', ['UI', 'API', 'Backend', 'Excel', 'Mobile']),
    ],
    hasProject: false,
  };

  it('passes a dimension this repository has, with the same values', () => {
    const [module] = check(source, here);
    expect(module.applies).toBe(true);
    expect(module.verdict).toBe('same');
    expect(module.said).toContain('### Module');
    expect(module.said).toContain('same 4 values');
  });

  it('still applies when this repository has a value the source did not', () => {
    const type = check(source, here).find(c => c.field.dimension === 'Type')!;
    expect(type.applies).toBe(true);
    expect(type.verdict).toBe('extra');
    expect(type.extra).toEqual(['Mobile']);
  });

  it('skips a field this repository does not have', () => {
    const team = check(source, here).find(c => c.field.dimension === 'Team')!;
    expect(team.applies).toBe(false);
    expect(team.verdict).toBe('missing');
    expect(team.said).toBe('no such field here; skipped');
  });

  it('skips Project fields on a repository with no Project, for that reason', () => {
    const status = check(source, here).find(c => c.field.dimension === 'Status')!;
    expect(status.verdict).toBe('no-project');
    expect(status.said).toContain('no Project');
  });

  it('applies Project fields when this repository does have one', () => {
    const withProject = {
      dimensions: [...here.dimensions, proj('Status', ['Todo', 'Done'])],
      hasProject: true,
    };
    const status = check(source, withProject).find(c => c.field.dimension === 'Status')!;
    expect(status.applies).toBe(true);
  });

  it('matches a name regardless of case, because two teams spell it two ways', () => {
    const cased = { dimensions: [form('module', ['Checkout'])], hasProject: false };
    expect(check([form('Module', ['Checkout'])], cased)[0].applies).toBe(true);
  });
});

describe('tally', () => {
  it('is the footer s own sentence', () => {
    const here = {
      dimensions: [form('Module', ['a']), form('Environment', ['b']), form('Type', ['c'])],
      hasProject: false,
    };
    expect(tally(check(source, here))).toBe('3 of 6 apply · 3 skipped');
  });

  it('leaves out the skipped half when nothing was skipped', () => {
    const here = { dimensions: [form('Module', ['a'])], hasProject: false };
    expect(tally(check([form('Module', ['a'])], here))).toBe('1 of 1 apply');
  });
});

describe('skippedLines', () => {
  it('groups the two reasons apart, because the fix is different', () => {
    const here = { dimensions: [form('Module', ['a'])], hasProject: false };
    const groups = skippedLines(check(source, here));
    expect(groups.map(g => g.why)).toEqual(['missing', 'no-project']);
    expect(groups[1].names).toEqual(['Status', 'Priority']);
  });

  it('says nothing when nothing was skipped', () => {
    const here = { dimensions: [form('Module', ['a'])], hasProject: false };
    expect(skippedLines(check([form('Module', ['a'])], here))).toEqual([]);
  });
});

describe('readMapFile', () => {
  it('reads a file this screen wrote', () => {
    const written = JSON.stringify(exportable('acme/app', source, new Date(0)));
    expect(readMapFile(written)?.fields).toHaveLength(6);
  });

  it('refuses JSON that merely has a fields array', () => {
    expect(readMapFile('{"fields":[{"dimension":"whatever"}]}')).toBeUndefined();
  });

  it('refuses anything that is not JSON at all', () => {
    expect(readMapFile('not json')).toBeUndefined();
  });

  it('drops rows with no dimension rather than carrying an unnamed field', () => {
    const raw = '{"kind":"dkgh-field-map","version":1,"repo":"a/b","at":"","fields":'
      + '[{"dimension":"Module","options":["x"]},{"options":["y"]}]}';
    expect(readMapFile(raw)?.fields).toHaveLength(1);
  });
});

describe('mapOf', () => {
  it('marks where each field came from, which decides how it is checked', () => {
    const map = mapOf([{ dimension: 'Module', heading: 'Module', options: ['a'] }],
      [{ name: 'Status', options: ['Todo'] }]);
    expect(map.map(f => f.source)).toEqual(['form', 'project']);
  });
});

describe('merged', () => {
  const own = [
    { dimension: 'Type', heading: 'Issue Type', options: ['UI'] },
    { dimension: 'Module', heading: 'Module', options: ['Checkout'] },
  ];

  it('is this repository s own map when nothing was copied', () => {
    expect(merged(own, [])).toBe(own);
  });

  it('takes the copy s order, which is the part that was configured', () => {
    const copied = [form('Module', ['a']), form('Type', ['b'])];
    expect(merged(own, copied).map(d => d.dimension)).toEqual(['Module', 'Type']);
  });

  it('keeps this repository s own values — a copied list would offer options nobody has', () => {
    const copied = [form('Module', ['Something else'])];
    expect(merged(own, copied)[0].options).toEqual(['Checkout']);
  });

  it('takes the copy s heading, which is what a map actually is', () => {
    const copied = [form('Type', ['x'], 'Category')];
    expect(merged(own, copied)[0].heading).toBe('Category');
  });

  it('never hides a field the copy did not name', () => {
    const copied = [form('Module', ['a'])];
    expect(merged(own, copied).map(d => d.dimension)).toEqual(['Module', 'Type']);
  });

  it('ignores a copied field this repository does not have', () => {
    expect(merged(own, [form('Team', ['a'])]).map(d => d.dimension))
      .toEqual(['Type', 'Module']);
  });
});
