/**
 * The clock arithmetic behind the Friday report.
 *
 * One rule carries the whole feature: a run is named after the occurrence it
 * is *for*, never the moment it was produced. A Monday catch-up named for
 * Monday would be read as Monday's numbers when it is Friday's report arriving
 * late — which is worse than the report never arriving, because nobody can
 * tell.
 *
 * Everything is local time on purpose. "Friday at four" is a local claim, and
 * a report that fires at 16:00 UTC for somebody in Chicago is a report that
 * fires at eleven in the morning.
 */
import { describe, it, expect } from 'vitest';
import {
  clock, due, isoDay, lastOccurrence, minuteOf, nextRun, safe, scheduledName,
  unclashed, weekIndex, whenNext, type Schedule,
} from './schedule';

/** Local time, so the tests read the way the feature is specified. */
const local = (y: number, m: number, d: number, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm);

const weekly: Schedule = {
  repo: 'acme/app', view: 'this sprint', every: 'weekly',
  weekday: 5, minute: 960, produces: ['xlsx'], folder: 'C:\\Reports',
};

describe('clock and minuteOf', () => {
  it('reads 16:00 as 960 minutes past midnight, and back', () => {
    expect(minuteOf('16:00')).toBe(960);
    expect(clock(960)).toBe('16:00');
  });

  it('pads, so 09:05 does not render as 9:5', () => {
    expect(clock(545)).toBe('09:05');
  });

  it('keeps the old time rather than jumping to midnight on a typo', () => {
    expect(minuteOf('nonsense', 960)).toBe(960);
    expect(minuteOf('25:00', 960)).toBe(960);
    expect(minuteOf('16:99', 960)).toBe(960);
  });
});

describe('isoDay', () => {
  it('is local, not UTC — the day the reader is looking at', () => {
    expect(isoDay(local(2026, 9, 11, 23, 30))).toBe('2026-09-11');
  });
});

describe('nextRun', () => {
  it('finds the coming Friday from a Wednesday', () => {
    expect(nextRun(weekly, local(2026, 9, 9, 10, 0))).toEqual(local(2026, 9, 11, 16, 0));
  });

  it('is later the same day when the time has not passed yet', () => {
    expect(nextRun(weekly, local(2026, 9, 11, 9, 0))).toEqual(local(2026, 9, 11, 16, 0));
  });

  it('rolls to next week once the time has passed', () => {
    expect(nextRun(weekly, local(2026, 9, 11, 16, 30))).toEqual(local(2026, 9, 18, 16, 0));
  });

  it('daily is tomorrow once today has gone', () => {
    const daily: Schedule = { ...weekly, every: 'daily' };
    expect(nextRun(daily, local(2026, 9, 11, 17, 0))).toEqual(local(2026, 9, 12, 16, 0));
    expect(nextRun(daily, local(2026, 9, 11, 8, 0))).toEqual(local(2026, 9, 11, 16, 0));
  });

  it('fortnightly skips a week, and picks the same weeks on every machine', () => {
    const fort: Schedule = { ...weekly, every: 'fortnightly' };
    const first = nextRun(fort, local(2026, 9, 1));
    const second = nextRun(fort, new Date(first.getTime() + 60_000));
    expect(second.getTime() - first.getTime()).toBe(14 * 86_400_000);
    /* Anchored to the epoch, not to when it was set up. */
    expect(weekIndex(first) % 2).toBe(0);
  });
});

describe('lastOccurrence', () => {
  it('walks backwards, so a Monday launch finds the Friday it missed', () => {
    expect(lastOccurrence(weekly, local(2026, 9, 14, 9, 0)))
      .toEqual(local(2026, 9, 11, 16, 0));
  });

  it('is today when today s time has already passed', () => {
    expect(lastOccurrence(weekly, local(2026, 9, 11, 16, 1)))
      .toEqual(local(2026, 9, 11, 16, 0));
  });

  it('is last week when today s time has not', () => {
    expect(lastOccurrence(weekly, local(2026, 9, 11, 15, 59)))
      .toEqual(local(2026, 9, 4, 16, 0));
  });
});

describe('due', () => {
  it('owes the missed Friday on a Monday launch', () => {
    const s = { ...weekly, lastRunFor: '2026-09-04' };
    expect(due(s, local(2026, 9, 14, 9, 0))).toEqual(local(2026, 9, 11, 16, 0));
  });

  it('owes nothing once that occurrence has been written', () => {
    const s = { ...weekly, lastRunFor: '2026-09-11' };
    expect(due(s, local(2026, 9, 14, 9, 0))).toBeUndefined();
  });

  it('runs immediately when it is turned on after the hour', () => {
    /* Somebody sets up a Friday report at five on a Friday. They expect this
       Friday's report, not to wait a week for it. */
    expect(due(weekly, local(2026, 9, 11, 17, 0))).toEqual(local(2026, 9, 11, 16, 0));
  });

  it('owes nothing while paused', () => {
    expect(due({ ...weekly, paused: true }, local(2026, 9, 14, 9, 0))).toBeUndefined();
  });

  it('two launches on the same Friday are one report', () => {
    const first = due(weekly, local(2026, 9, 11, 16, 5))!;
    const after = { ...weekly, lastRunFor: isoDay(first) };
    expect(due(after, local(2026, 9, 11, 18, 0))).toBeUndefined();
  });
});

describe('scheduledName', () => {
  it('is named for the occurrence, never for the moment it ran', () => {
    /* Produced on Monday the 14th, for Friday the 11th. */
    expect(scheduledName(weekly, local(2026, 9, 11), 'xlsx'))
      .toBe('dk-gh — this sprint — 2026-09-11.xlsx');
  });

  it('takes the extension it is given', () => {
    expect(scheduledName(weekly, local(2026, 9, 11), 'pdf'))
      .toBe('dk-gh — this sprint — 2026-09-11.pdf');
  });

  it('falls back to "all" rather than a double dash for an unnamed view', () => {
    expect(scheduledName({ ...weekly, view: '  ' }, local(2026, 9, 11), 'xlsx'))
      .toBe('dk-gh — all — 2026-09-11.xlsx');
  });
});

describe('safe', () => {
  it('strips what a filesystem refuses and keeps the spaces the mock has', () => {
    expect(safe('open / not mine')).toBe('open - not mine');
    expect(safe('this sprint')).toBe('this sprint');
  });
});

describe('unclashed', () => {
  it('leaves a free name alone', () => {
    expect(unclashed('a.xlsx', () => false)).toBe('a.xlsx');
  });

  it('never overwrites — a catch-up would destroy the report being read', () => {
    const taken = new Set(['a.xlsx']);
    expect(unclashed('a.xlsx', n => taken.has(n))).toBe('a (2).xlsx');
  });

  it('keeps counting past the second', () => {
    const taken = new Set(['a.xlsx', 'a (2).xlsx', 'a (3).xlsx']);
    expect(unclashed('a.xlsx', n => taken.has(n))).toBe('a (4).xlsx');
  });

  it('puts the counter before the extension, not after it', () => {
    const taken = new Set(['dk-gh — s — 2026-09-11.pdf']);
    expect(unclashed('dk-gh — s — 2026-09-11.pdf', n => taken.has(n)))
      .toBe('dk-gh — s — 2026-09-11 (2).pdf');
  });
});

describe('whenNext', () => {
  it('is the footer s own sentence', () => {
    expect(whenNext(weekly, local(2026, 9, 9, 10, 0))).toBe('Friday 11 Sep, 16:00');
  });

  it('drops the weekday for a daily schedule, where it says nothing', () => {
    expect(whenNext({ ...weekly, every: 'daily' }, local(2026, 9, 11, 17, 0)))
      .toBe('12 Sep, 16:00');
  });
});
