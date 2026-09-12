/**
 * What a due run actually writes.
 *
 * The one that matters: a saved view that has been renamed away produces a
 * reported failure, never a silent export of everything. A spreadsheet that
 * looks right and is not is the exact failure the whole screen exists to
 * avoid, and it is invisible to the person reading it.
 */
import { describe, it, expect } from 'vitest';
import { jobsFor, joinPath, rowsFor } from './schedule-runner';
import { whenNext, clock, minuteOf, exampleName, isoDay } from './GhSchedule';
import type { Schedule } from './GhSchedule';
import type { SavedView } from './views-model';
import type { BoardIssue } from './board-types';

const issue = (number: number, extra: Partial<BoardIssue> = {}): BoardIssue => ({
  number, title: `Issue ${number}`, state: 'OPEN', url: '',
  assignees: [], labels: [], createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z', commentCount: 0, dimensions: {},
  evidence: [], ageDays: 1, quietDays: 1, ...extra,
});

const view = (name: string, terms: SavedView['capture']['filters'] = undefined): SavedView => ({
  id: name, name, icon: 'tl', capture: { filters: terms },
} as SavedView);

const weekly: Schedule = {
  repo: 'acme/app', view: 'this sprint', every: 'weekly', weekday: 5,
  minute: 960, produces: ['xlsx'], folder: 'C:\\Reports\\dk-gh',
};

describe('rowsFor', () => {
  const all = [issue(1), issue(2)];

  it('is every row when the view captured no filter', () => {
    expect(rowsFor('this sprint', [view('this sprint')], all)).toHaveLength(2);
  });

  it('says nothing at all when the view has been renamed away', () => {
    expect(rowsFor('this sprint', [view('last sprint')], all)).toBeUndefined();
  });

  it('applies the view s own terms', () => {
    const v = view('open only', { terms: [{ field: 'state', values: ['open'] }] } as never);
    const rows = rowsFor('open only', [v], [issue(1), issue(2, { state: 'CLOSED' })]);
    expect(rows?.map(r => r.number)).toEqual([1]);
  });
});

describe('joinPath', () => {
  it('keeps a Windows folder Windows', () => {
    expect(joinPath('C:\\Reports\\dk-gh', 'a.xlsx')).toBe('C:\\Reports\\dk-gh\\a.xlsx');
  });

  it('does not double a trailing separator', () => {
    expect(joinPath('C:\\Reports\\', 'a.xlsx')).toBe('C:\\Reports\\a.xlsx');
    expect(joinPath('/home/me/reports/', 'a.xlsx')).toBe('/home/me/reports/a.xlsx');
  });

  it('keeps a POSIX folder POSIX', () => {
    expect(joinPath('/home/me/reports', 'a.xlsx')).toBe('/home/me/reports/a.xlsx');
  });
});

describe('jobsFor', () => {
  const rows = [issue(1)];

  it('names the file for the day it is for, not the day it runs', () => {
    const [job] = jobsFor(weekly, rows, '2026-09-11', [], '');
    expect(job.filename).toBe('app — this sprint — 2026-09-11.xlsx');
    expect(job.path).toBe('C:\\Reports\\dk-gh\\app — this sprint — 2026-09-11.xlsx');
  });

  it('carries a path, so the host writes without a save dialog', () => {
    const [job] = jobsFor(weekly, rows, '2026-09-11', [], '');
    expect(typeof job.path).toBe('string');
    expect(job.type).toBe('dkgh:export');
  });

  it('is one message per format, so a half-written pair is still two files', () => {
    const jobs = jobsFor({ ...weekly, produces: ['xlsx', 'pdf'] }, rows, '2026-09-11', [], '');
    expect(jobs).toHaveLength(2);
    expect(jobs[0].sheets).toBeDefined();
    expect(jobs[1].report).toBeDefined();
  });

  it('writes nothing at all for a schedule that produces nothing', () => {
    expect(jobsFor({ ...weekly, produces: [] }, rows, '2026-09-11', [], '')).toEqual([]);
  });
});

describe('the webview s copy of the clock', () => {
  it('agrees with the host about 16:00', () => {
    expect(minuteOf('16:00')).toBe(960);
    expect(clock(960)).toBe('16:00');
  });

  it('renders the same footer sentence', () => {
    expect(whenNext(weekly, new Date(2026, 8, 9, 10, 0))).toBe('Friday 11 Sep, 16:00');
  });

  it('shows the name the file will actually get, from the repository', () => {
    expect(exampleName('salilvnair/dk-gh', 'this sprint', 'xlsx', new Date(2026, 8, 11)))
      .toBe('dk-gh — this sprint — 2026-09-11.xlsx');
  });

  it('reads a local day, not a UTC one', () => {
    expect(isoDay(new Date(2026, 8, 11, 23, 30))).toBe('2026-09-11');
  });
});
