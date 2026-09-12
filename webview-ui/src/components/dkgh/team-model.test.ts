import { describe, it, expect } from 'vitest';
import { NOBODY, laneOf, laneToShow, lanesOf, loadPercent } from './team-model';
import type { BoardIssue } from './board-types';

const issue = (number: number, assignees: string[]): BoardIssue => ({
  number,
  title: `#${number}`,
  state: 'OPEN',
  assignees,
  labels: [],
  dimensions: {},
  evidence: [],
  quietDays: 0,
  url: '',
} as unknown as BoardIssue);

const names = (rows: { who: string; issues: BoardIssue[] }[]) =>
  rows.map(l => `${l.who}:${l.issues.length}`);

describe('lanesOf', () => {
  it('gives each assignee their own lane', () => {
    expect(names(lanesOf([issue(1, ['ann']), issue(2, ['bob'])])))
      .toEqual(['ann:1', 'bob:1']);
  });

  it('puts an issue with two assignees on both lanes — they are both on it', () => {
    const lanes = lanesOf([issue(1, ['ann', 'bob'])]);
    expect(names(lanes)).toEqual(['ann:1', 'bob:1']);
  });

  it('orders by load, heaviest first', () => {
    const lanes = lanesOf([
      issue(1, ['ann']), issue(2, ['bob']), issue(3, ['bob']), issue(4, ['bob']),
    ]);
    expect(names(lanes)).toEqual(['bob:3', 'ann:1']);
  });

  it('breaks a tie by name, so the list does not reshuffle between reads', () => {
    expect(names(lanesOf([issue(1, ['zoe']), issue(2, ['ann'])]))).toEqual(['ann:1', 'zoe:1']);
  });

  it('gives the unassigned a lane of their own', () => {
    const lanes = lanesOf([issue(1, []), issue(2, [])]);
    expect(names(lanes)).toEqual([`${NOBODY}:2`]);
    expect(lanes[0].label).toBe('Unassigned');
  });

  it('puts unassigned last however big it is — it is a pile, not a person', () => {
    const lanes = lanesOf([
      issue(1, ['ann']), issue(2, []), issue(3, []), issue(4, []), issue(5, []),
    ]);
    expect(names(lanes)).toEqual(['ann:1', `${NOBODY}:4`]);
  });

  it('leaves the unassigned lane out when there is none', () => {
    expect(lanesOf([issue(1, ['ann'])]).some(l => l.who === NOBODY)).toBe(false);
  });

  it('is empty for an empty board', () => {
    expect(lanesOf([])).toEqual([]);
  });
});

describe('laneToShow', () => {
  const lanes = lanesOf([issue(1, ['ann']), issue(2, ['bob']), issue(3, ['bob'])]);

  it('keeps the lane that was open', () => {
    expect(laneToShow(lanes, 'ann')).toBe('ann');
  });

  it('falls to the busiest when that person no longer has anything', () => {
    expect(laneToShow(lanes, 'gone')).toBe('bob');
  });

  it('opens on the busiest when nothing was chosen', () => {
    expect(laneToShow(lanes)).toBe('bob');
  });

  it('has nothing to show on an empty board', () => {
    expect(laneToShow([], 'ann')).toBeUndefined();
  });
});

describe('laneOf', () => {
  it('finds one', () => {
    const lanes = lanesOf([issue(1, ['ann'])]);
    expect(laneOf(lanes, 'ann')?.issues).toHaveLength(1);
    expect(laneOf(lanes, 'nobody-here')).toBeUndefined();
    expect(laneOf(lanes, undefined)).toBeUndefined();
  });
});

describe('loadPercent', () => {
  const lanes = lanesOf([
    issue(1, ['ann']), issue(2, ['bob']), issue(3, ['bob']), issue(4, ['bob']),
  ]);

  it('fills the bar for the heaviest', () => {
    expect(loadPercent(lanes[0], lanes)).toBe(100);
  });

  it('measures the rest against that, not against the total', () => {
    expect(loadPercent(lanes[1], lanes)).toBe(33);
  });

  it('does not divide by zero', () => {
    expect(loadPercent({ who: 'x', label: 'x', issues: [] }, [])).toBe(0);
  });
});
