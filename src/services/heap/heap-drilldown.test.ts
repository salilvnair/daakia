import { describe, it, expect } from 'vitest';
import {
  parseDrillRequests, queryFor, formatDrillResult, formatRefusals,
  MAX_PER_ROUND, type DrillRequest,
} from './heap-drilldown';

describe('parseDrillRequests', () => {
  it('reads a plain query line', () => {
    const { requests } = parseDrillRequests('QUERY biggest');
    expect(requests).toEqual([{ kind: 'biggest', filter: undefined, raw: 'QUERY biggest' }]);
  });

  it('reads an object id for the views that need one', () => {
    const { requests } = parseDrillRequests('QUERY retained 4271');
    expect(requests[0]).toMatchObject({ kind: 'retained', row: 4271 });
  });

  it('reads a package filter', () => {
    const { requests } = parseDrillRequests('QUERY classes com.zapper');
    expect(requests[0]).toMatchObject({ kind: 'classes', filter: 'com.zapper' });
  });

  /*
    Models do not emit bare protocol lines. They fence them, bullet them and
    bold them, and none of that changes what was asked for — refusing over a
    backtick would make the whole feature look broken.
  */
  it('survives the ways a model actually writes it', () => {
    const text = [
      'Let me look deeper.',
      '```',
      'QUERY biggest',
      '```',
      '- **QUERY retained 12**',
      '2. `QUERY classes com.zapper`',
      '> QUERY inspections',
    ].join('\n');
    const { requests } = parseDrillRequests(text);
    expect(requests.map(r => r.kind)).toEqual(['biggest', 'retained', 'classes', 'inspections']);
    expect(requests[1].row).toBe(12);
    expect(requests[2].filter).toBe('com.zapper');
  });

  it('is case-insensitive on the keyword', () => {
    expect(parseDrillRequests('query Biggest').requests[0].kind).toBe('biggest');
  });

  it('ignores prose that merely mentions a view', () => {
    const text = 'The biggest objects are worth a look, and retained sizes matter.';
    expect(parseDrillRequests(text).requests).toEqual([]);
  });

  it('refuses a view that does not exist, by name', () => {
    // Silence would let the model assume the answer was empty and reason from
    // nothing, which is how confident wrong answers get made.
    const { requests, refused } = parseDrillRequests('QUERY allocations');
    expect(requests).toEqual([]);
    expect(refused[0].reason).toMatch(/no such view: allocations/);
  });

  it('refuses a row-view with no id, rather than guessing one', () => {
    const { requests, refused } = parseDrillRequests('QUERY retained');
    expect(requests).toEqual([]);
    expect(refused[0].reason).toMatch(/needs an object id/);
  });

  it('refuses a non-numeric id', () => {
    const { refused } = parseDrillRequests('QUERY retained the-big-hashmap');
    expect(refused[0].reason).toMatch(/needs an object id/);
  });

  it('refuses a negative id', () => {
    // -1 is the virtual root internally; a model must reach it via `biggest`
    // rather than by naming an id the numbering does not admit to having.
    const { requests, refused } = parseDrillRequests('QUERY children -1');
    expect(requests).toEqual([]);
    expect(refused.length).toBe(1);
  });

  it('collapses a repeated request within one round', () => {
    const { requests } = parseDrillRequests('QUERY retained 12\nQUERY retained 12');
    expect(requests.length).toBe(1);
  });

  it('treats the same view with different arguments as two requests', () => {
    const { requests } = parseDrillRequests('QUERY retained 12\nQUERY retained 13');
    expect(requests.length).toBe(2);
  });

  it('caps a round and says which were dropped', () => {
    const text = Array.from({ length: 7 }, (_, i) => `QUERY retained ${i}`).join('\n');
    const { requests, refused } = parseDrillRequests(text);
    expect(requests.length).toBe(MAX_PER_ROUND);
    // The ones it asked for first survive — those are the ones it cared about.
    expect(requests.map(r => r.row)).toEqual([0, 1, 2, 3]);
    expect(refused.length).toBe(3);
    expect(refused[0].reason).toMatch(/per round/);
  });
});

describe('queryFor', () => {
  const req = (o: Partial<DrillRequest>): DrillRequest =>
    ({ kind: 'biggest', raw: '', ...o } as DrillRequest);

  it('maps every view to a whitelisted worker query', () => {
    expect(queryFor(req({ kind: 'classes', filter: 'com.zapper' })))
      .toMatchObject({ type: 'histogram', packageFilter: 'com.zapper' });
    expect(queryFor(req({ kind: 'biggest' }))).toMatchObject({ type: 'children', row: -1 });
    expect(queryFor(req({ kind: 'children', row: 9 }))).toMatchObject({ type: 'children', row: 9 });
    expect(queryFor(req({ kind: 'retained', row: 9 })))
      .toMatchObject({ type: 'retainedClasses', row: 9 });
    expect(queryFor(req({ kind: 'inspections' }))).toMatchObject({ type: 'rules' });
  });

  it('never produces a query type outside the known set', () => {
    const types = (['classes', 'biggest', 'children', 'retained', 'path', 'inspections'] as const)
      .map(kind => queryFor(req({ kind, row: 1 })).type);
    for (const t of types) {
      expect(['histogram', 'children', 'retainedClasses', 'evidence', 'rules']).toContain(t);
    }
  });
});

describe('formatDrillResult', () => {
  const req = (o: Partial<DrillRequest>): DrillRequest =>
    ({ kind: 'biggest', raw: '', ...o } as DrillRequest);

  it('includes the object ids, so the next round has something to name', () => {
    const out = formatDrillResult(req({ kind: 'biggest' }), {
      children: [
        { row: 42, className: 'java.util.HashMap', retainedBytes: 251_658_240, childCount: 3 },
      ],
    });
    expect(out).toContain('id=42');
    expect(out).toContain('240.0 MB');
    expect(out).toContain('java.util.HashMap');
  });

  it('gives each retained class its share, which is the actual question', () => {
    const out = formatDrillResult(req({ kind: 'retained', row: 42 }), {
      totalBytes: 1000, totalObjects: 10,
      rows: [
        { className: 'com.zapper.Session', instances: 8, bytes: 900 },
        { className: 'java.lang.String', instances: 2, bytes: 100 },
      ],
    });
    expect(out).toContain('90%');
    expect(out).toContain('10%');
    expect(out).toContain('com.zapper.Session');
  });

  it('says a leaf is a leaf rather than printing an empty table', () => {
    const out = formatDrillResult(req({ kind: 'retained', row: 7 }), {
      totalBytes: 0, totalObjects: 0, rows: [],
    });
    expect(out).toMatch(/leaf/);
  });

  it('says nothing matched rather than showing an empty class list', () => {
    const out = formatDrillResult(req({ kind: 'classes', filter: 'com.nope' }), { total: 0, rows: [] });
    expect(out).toMatch(/nothing matched/);
  });

  it('reports no findings as a result, not as an absence', () => {
    const out = formatDrillResult(req({ kind: 'inspections' }), { findings: [] });
    expect(out).toMatch(/no rule fired/);
  });
});

describe('formatRefusals', () => {
  it('is empty when nothing was refused', () => {
    expect(formatRefusals([])).toBe('');
  });

  it('names both the request and the reason', () => {
    const out = formatRefusals([{ raw: 'QUERY allocations', reason: 'no such view: allocations' }]);
    expect(out).toContain('QUERY allocations');
    expect(out).toContain('no such view');
  });
});
