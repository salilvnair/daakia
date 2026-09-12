/**
 * 16B, and the one thing it must not get wrong.
 *
 * Direction is not the same as good. Closed rising is green; opened rising is
 * red; median age rising is red. A dashboard that paints every upward arrow
 * green is a dashboard that reports a worsening backlog as progress, and it
 * does it confidently.
 */
import { describe, it, expect } from 'vitest';
import { compare, delta, deltaTone, median, standout } from './insights-model';
import type { BoardIssue } from './board-types';

const NOW = Date.parse('2026-09-10T00:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const issue = (
  number: number, created: number, closed?: number, module = 'Checkout',
): BoardIssue => ({
  number, title: `Issue ${number}`, state: closed === undefined ? 'OPEN' : 'CLOSED',
  url: '', assignees: [], labels: [], createdAt: ago(created),
  updatedAt: ago(closed ?? created), closedAt: closed === undefined ? undefined : ago(closed),
  commentCount: 0, dimensions: { module }, evidence: [],
  ageDays: created, quietDays: 0,
});

const by = (i: BoardIssue) => i.dimensions.module ?? 'none';

describe('median', () => {
  it('is the middle of an odd list', () => {
    expect(median([1, 9, 3])).toBe(3);
  });

  it('averages the two middles of an even one', () => {
    expect(median([1, 3, 5, 9])).toBe(4);
  });

  it('is zero for nothing, rather than NaN', () => {
    expect(median([])).toBe(0);
  });
});

describe('deltaTone', () => {
  it('paints a rise red when down is better', () => {
    expect(deltaTone({ label: 'Opened', now: 14, was: 9, betterWhen: 'down' })).toBe('red');
  });

  it('paints the same rise green when up is better', () => {
    expect(deltaTone({ label: 'Closed', now: 11, was: 9, betterWhen: 'up' })).toBe('green');
  });

  it('paints a fall in median age green, because shorter is better', () => {
    expect(deltaTone({ label: 'Age', now: 6, was: 9, betterWhen: 'down' })).toBe('green');
  });

  it('paints no change flat rather than inventing a finding', () => {
    expect(deltaTone({ label: 'Opened', now: 9, was: 9, betterWhen: 'down' })).toBe('flat');
  });

  it('reports the size of the move regardless of its colour', () => {
    expect(delta({ label: 'x', now: 14, was: 9, betterWhen: 'down' })).toBe(5);
    expect(delta({ label: 'x', now: 6, was: 9, betterWhen: 'down' })).toBe(-3);
  });
});

describe('compare', () => {
  /* Two four-week windows: this one is days 0–28, the one before is 28–56. */
  const issues = [
    issue(1, 3), issue(2, 10), issue(3, 20),
    issue(4, 40), issue(5, 50),
    issue(6, 30, 5),
    issue(7, 60, 40),
  ];

  it('counts opened in each window, with no overlap between them', () => {
    const c = compare(issues, 4, by, NOW);
    const opened = c.metrics.find(m => m.label === 'Opened')!;
    /* This window (0-28d): #1, #2, #3. The one before (28-56d): #4, #5, #6.
       #7 was filed 60 days ago and is in neither. */
    expect(opened.now).toBe(3);
    expect(opened.was).toBe(3);
  });

  it('counts closed by when they closed, not when they were filed', () => {
    const c = compare(issues, 4, by, NOW);
    const closed = c.metrics.find(m => m.label === 'Closed')!;
    /* #6 closed 5 days ago — this window. #7 closed 40 days ago — the one before. */
    expect(closed.now).toBe(1);
    expect(closed.was).toBe(1);
  });

  it('measures still-open at the end of each window, not today for both', () => {
    const c = compare(issues, 4, by, NOW);
    const still = c.metrics.find(m => m.label === 'Still open')!;
    expect(still.now).not.toBe(still.was);
  });

  it('gives the age metric its unit, so the tile reads 9d and not 9', () => {
    const c = compare(issues, 4, by, NOW);
    expect(c.metrics.find(m => m.label === 'Median age at close')!.unit).toBe('d');
  });

  it('declares which way is better on every metric', () => {
    for (const m of compare(issues, 4, by, NOW).metrics) {
      expect(['up', 'down']).toContain(m.betterWhen);
    }
  });

  it('says when no close dates are loaded, rather than reporting zero as a fact', () => {
    const open = [issue(1, 3), issue(2, 40)];
    expect(compare(open, 4, by, NOW).closedKnown).toBe(false);
    expect(compare(issues, 4, by, NOW).closedKnown).toBe(true);
  });

  it('labels the two windows in the reader s own words', () => {
    const c = compare(issues, 12, by, NOW);
    expect(c.thisLabel).toBe('Last 12 weeks');
    expect(c.lastLabel).toBe('The 12 before');
  });

  it('bars carry both periods, so one axis can hold them', () => {
    const c = compare([
      issue(1, 3, undefined, 'Reporting'), issue(2, 40, undefined, 'Reporting'),
    ], 4, by, NOW);
    const row = c.bars.find(b => b.label === 'Reporting')!;
    expect(row).toEqual({ label: 'Reporting', now: 1, was: 1 });
  });

  it('an empty board is empty, not an exception', () => {
    const c = compare([], 4, by, NOW);
    expect(c.bars).toEqual([]);
    expect(c.metrics.every(m => m.now === 0 && m.was === 0)).toBe(true);
  });
});

describe('standout', () => {
  it('says the sentence when one row moved and the rest did not', () => {
    expect(standout([
      { label: 'Reporting', now: 6, was: 2 },
      { label: 'Checkout', now: 3, was: 3 },
      { label: 'Orders', now: 4, was: 4 },
    ])).toBe('Reporting tripled and everything else is flat.');
  });

  it('says nothing when everything moved — that is not a finding', () => {
    expect(standout([
      { label: 'Reporting', now: 6, was: 2 },
      { label: 'Checkout', now: 9, was: 3 },
    ])).toBe('');
  });

  it('says nothing when nothing moved', () => {
    expect(standout([
      { label: 'Reporting', now: 3, was: 3 },
      { label: 'Checkout', now: 3, was: 3 },
    ])).toBe('');
  });

  it('says nothing about a single row, which has nothing to be flat against', () => {
    expect(standout([{ label: 'Reporting', now: 6, was: 2 }])).toBe('');
  });

  it('does not call one-to-two a tripling', () => {
    expect(standout([
      { label: 'Reporting', now: 2, was: 1 },
      { label: 'Checkout', now: 3, was: 3 },
    ])).toBe('');
  });
});
