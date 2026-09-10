/**
 * The numbers behind the charts.
 *
 * A chart nobody can check is a chart nobody should believe, so the arithmetic
 * lives in functions with a test each. The rules worth asserting are the ones
 * that would otherwise be invisible on screen: the running total that counts
 * issues opened before the window, the missing close date that must not be
 * drawn as a flat line, and unassigned staying at the top of the last chart.
 */
import { describe, it, expect } from 'vitest';
import { ages, byAssignee, headline, monday, stacked, weekly } from './insights-model';
import type { BoardIssue } from './board-types';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-10T12:00:00Z');

function issue(over: Partial<BoardIssue> = {}): BoardIssue {
  return {
    number: 1,
    title: 'x',
    state: 'OPEN',
    url: '',
    assignees: [],
    labels: [],
    createdAt: '2026-09-08T00:00:00Z',
    updatedAt: '2026-09-09T00:00:00Z',
    commentCount: 0,
    dimensions: {},
    evidence: [],
    ageDays: 2,
    quietDays: 1,
    ...over,
  };
}

describe('monday', () => {
  it('is the Monday of that week, in UTC', () => {
    /* 2026-09-10 is a Thursday. */
    expect(new Date(monday(NOW)).toISOString().slice(0, 10)).toBe('2026-09-07');
  });

  it('leaves a Monday where it is', () => {
    const at = Date.parse('2026-09-07T23:00:00Z');
    expect(new Date(monday(at)).toISOString().slice(0, 10)).toBe('2026-09-07');
  });
});

describe('weekly', () => {
  it('buckets an issue into the week it was opened', () => {
    const s = weekly([issue({ createdAt: '2026-09-08T00:00:00Z' })], 4, NOW);
    expect(s.points[s.points.length - 1]).toMatchObject({ week: '2026-09-07', opened: 1 });
  });

  it('counts issues opened before the window towards the running total', () => {
    const old = issue({ createdAt: new Date(NOW - 200 * DAY).toISOString() });
    const s = weekly([old], 4, NOW);
    expect(s.points[0].opened).toBe(0);
    expect(s.points[0].open).toBe(1);
  });

  it('takes a close down off the running total', () => {
    const s = weekly([
      issue({ createdAt: '2026-08-24T00:00:00Z' }),
      issue({ createdAt: '2026-08-24T00:00:00Z', closedAt: '2026-09-08T00:00:00Z' }),
    ], 4, NOW);
    expect(s.points[s.points.length - 1].open).toBe(1);
  });

  it('says when no close date is known, rather than drawing a flat line', () => {
    expect(weekly([issue()], 4, NOW).closedKnown).toBe(false);
    expect(weekly([issue({ closedAt: '2026-09-08T00:00:00Z' })], 4, NOW).closedKnown).toBe(true);
  });

  it('never reports a negative backlog', () => {
    const s = weekly([issue({ createdAt: 'nonsense', closedAt: '2026-09-08T00:00:00Z' })], 4, NOW);
    expect(s.points.every(p => p.open >= 0)).toBe(true);
  });
});

describe('stacked', () => {
  const rows = [
    issue({ dimensions: { module: 'Checkout', environment: 'PROD' } }),
    issue({ dimensions: { module: 'Checkout', environment: 'DEV' } }),
    issue({ dimensions: { module: 'Orders', environment: 'PROD' } }),
  ];

  it('is biggest first, because the question is where they are', () => {
    const out = stacked(rows, i => i.dimensions.module);
    expect(out.map(r => r.label)).toEqual(['Checkout', 'Orders']);
  });

  it('splits each row and keeps the parts adding up to the total', () => {
    const [first] = stacked(rows, i => i.dimensions.module, i => i.dimensions.environment);
    expect(first.total).toBe(2);
    expect(first.parts.reduce((a, p) => a + p.count, 0)).toBe(2);
  });

  it('has no row for a value nobody has', () => {
    expect(stacked(rows, i => i.dimensions.module).some(r => r.total === 0)).toBe(false);
  });
});

describe('byAssignee', () => {
  it('puts unassigned first however few there are', () => {
    const rows = byAssignee([
      issue({ assignees: ['a'] }), issue({ assignees: ['a'] }), issue({ assignees: [] }),
    ]);
    expect(rows[0].label).toBe('unassigned');
    expect(rows[0].total).toBe(1);
  });

  it('leaves it out when everything has a name on it', () => {
    const rows = byAssignee([issue({ assignees: ['a'] })]);
    expect(rows.map(r => r.label)).toEqual(['a']);
  });
});

describe('ages', () => {
  it('bands them, and the bands are what the colours mean', () => {
    const out = ages([issue({ ageDays: 1 }), issue({ ageDays: 10 }), issue({ ageDays: 400 })]);
    expect(out.find(b => b.label === '0–3d')).toMatchObject({ count: 1, tone: 'good' });
    expect(out.find(b => b.label === '8–14d')).toMatchObject({ count: 1, tone: 'warn' });
    expect(out.find(b => b.label === '30d+')).toMatchObject({ count: 1, tone: 'bad' });
  });

  it('counts every issue exactly once', () => {
    const rows = Array.from({ length: 40 }, (_, i) => issue({ ageDays: i }));
    expect(ages(rows).reduce((a, b) => a + b.count, 0)).toBe(40);
  });
});

describe('headline', () => {
  it('says the two things a status call asks about', () => {
    const said = headline([
      issue({ assignees: [] , ageDays: 30 }),
      issue({ assignees: ['a'], ageDays: 1 }),
    ]);
    expect(said).toBe('2 open · 1 with nobody on it · 1 older than 14 days.');
  });

  it('is not a sentence about nothing', () => {
    expect(headline([])).toBe('Nothing is open.');
  });
});
