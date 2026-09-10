/**
 * 16D — a chart that is a saved question rather than a saved picture.
 *
 * The bars are recomputed from whatever the view holds now, so the only things
 * worth pinning down here are the ones that would quietly produce a wrong
 * picture: the week a date falls in, the median rather than the mean, and the
 * ordering — a category chart reads biggest first, a chart over time reads left
 * to right.
 */
import { describe, it, expect } from 'vitest';
import {
  barsFor, chartFields, provenance, suggestedTitle, valueOf, weekOf,
  type PinnedChart,
} from './charts-model';
import type { BoardIssue } from './board-types';

const issue = (n: number, extra: Partial<BoardIssue> = {}): BoardIssue => ({
  number: n, title: `Issue ${n}`, state: 'OPEN', url: '', assignees: [], labels: [],
  createdAt: '2026-09-08T00:00:00Z', updatedAt: '2026-09-08T00:00:00Z',
  commentCount: 0, dimensions: {}, evidence: [], ageDays: 1, quietDays: 0, ...extra,
});

const chart = (extra: Partial<PinnedChart> = {}): PinnedChart => ({
  id: 'c1', title: 'Mine', view: '', groupBy: 'module', measure: 'count', at: 0, ...extra,
});

describe('weekOf', () => {
  it('gives the same string for every day of the same week', () => {
    expect(weekOf('2026-09-07T00:00:00Z')).toBe(weekOf('2026-09-11T00:00:00Z'));
  });

  it('sorts, which is the whole reason for the format', () => {
    expect(weekOf('2026-09-01T00:00:00Z') < weekOf('2026-09-08T00:00:00Z')).toBe(true);
  });

  it('puts the last days of December in the ISO year the week belongs to', () => {
    /* 2025-12-29 is a Monday in ISO week 2026-W01. */
    expect(weekOf('2025-12-29T00:00:00Z')).toBe('2026-W01');
  });

  it('is empty for a date it cannot read, rather than NaN-W NaN', () => {
    expect(weekOf('whenever')).toBe('');
  });
});

describe('valueOf', () => {
  it('reads the fields GitHub owns as well as the repository s own', () => {
    const i = issue(1, {
      assignees: ['rmenon'], milestone: 'v2.4', state: 'CLOSED',
      labels: [{ name: 'bug', color: 'f00' }], dimensions: { module: 'Checkout' },
    });
    expect(valueOf(i, 'assignee')).toBe('rmenon');
    expect(valueOf(i, 'milestone')).toBe('v2.4');
    expect(valueOf(i, 'state')).toBe('Closed');
    expect(valueOf(i, 'label')).toBe('bug');
    expect(valueOf(i, 'module')).toBe('Checkout');
  });

  it('is empty rather than undefined for a field the issue has nothing in', () => {
    expect(valueOf(issue(1), 'module')).toBe('');
    expect(valueOf(issue(1), 'assignee')).toBe('');
  });
});

describe('barsFor', () => {
  const rows = [
    issue(1, { dimensions: { module: 'Checkout' }, ageDays: 2 }),
    issue(2, { dimensions: { module: 'Checkout' }, ageDays: 40 }),
    issue(3, { dimensions: { module: 'Orders' }, ageDays: 6 }),
    issue(4, { dimensions: {}, ageDays: 1 }),
  ];

  it('counts issues per value, biggest first', () => {
    const bars = barsFor(chart(), rows);
    expect(bars.map(b => [b.label, b.value]))
      .toEqual([['Checkout', 2], ['No module', 1], ['Orders', 1]]);
  });

  it('labels the empty value rather than leaving a blank bar', () => {
    expect(barsFor(chart(), rows).some(b => b.label === 'No module')).toBe(true);
  });

  it('measures days as the median, so one ancient issue does not move it', () => {
    const bars = barsFor(chart({ measure: 'days' }), rows);
    /* Checkout is 2 and 40 — the median of two is their mean, 21, not 40. */
    expect(bars.find(b => b.label === 'Checkout')!.value).toBe(21);
  });

  it('reads a week chart left to right in time, not biggest first', () => {
    const overTime = [
      issue(1, { createdAt: '2026-09-08T00:00:00Z' }),
      issue(2, { createdAt: '2026-08-01T00:00:00Z' }),
      issue(3, { createdAt: '2026-08-01T00:00:00Z' }),
    ];
    const bars = barsFor(chart({ groupBy: 'week' }), overTime);
    expect(bars[0].label < bars[1].label).toBe(true);
  });

  it('splits a bar when asked, and does not when not', () => {
    const split = barsFor(chart({ splitBy: 'state' }), rows);
    expect(split[0].parts.length).toBeGreaterThan(0);
    expect(barsFor(chart(), rows)[0].parts).toEqual([]);
  });

  it('an empty view draws no bars rather than one empty one', () => {
    expect(barsFor(chart(), [])).toEqual([]);
  });
});

describe('chartFields', () => {
  it('offers the repository s own dimensions before GitHub s', () => {
    const fields = chartFields([{ dimension: 'module' }, { dimension: 'environment' }]);
    expect(fields.slice(0, 2)).toEqual(['module', 'environment']);
    expect(fields).toContain('week');
  });

  it('still offers something on a repository with no dimensions at all', () => {
    expect(chartFields([]).length).toBeGreaterThan(0);
  });
});

describe('provenance', () => {
  it('names the view, because that is what the chart actually is', () => {
    expect(provenance(chart({ view: 'Reporting only', pinnedBy: 'salilvnair' })))
      .toBe('from the view “Reporting only” · pinned by salilvnair');
  });

  it('says so plainly when it is the whole board', () => {
    expect(provenance(chart())).toBe('from the whole board');
  });

  it('leaves out the byline when nobody is signed in', () => {
    expect(provenance(chart({ view: 'x' }))).toBe('from the view “x”');
  });
});

describe('suggestedTitle', () => {
  it('describes the question somebody just asked', () => {
    expect(suggestedTitle('module', undefined, 'count')).toBe('Issues by module');
    expect(suggestedTitle('week', undefined, 'days')).toBe('Days open by week');
    expect(suggestedTitle('module', 'priority', 'count'))
      .toBe('Issues by module, split by priority');
  });
});
