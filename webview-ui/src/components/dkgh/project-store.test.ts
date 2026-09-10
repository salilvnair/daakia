/**
 * What the Project adds, and what it cannot.
 *
 * The two rules worth pinning are both about not overstepping: a form heading
 * beats a Project field of the same name, because the form is in the
 * repository and the Project is a view over it; and a conflict is only a
 * conflict on a card you also changed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  changedSince, dateFields, projectDimensions, readSlips, recordSlips, slipDays, withProject,
  type ProjectBoard,
} from './project-store';
import type { BoardIssue } from './board-types';

function item(over: Partial<ProjectBoard['items'][0]> = {}) {
  return {
    id: 'PVTI_1',
    number: 41,
    values: { Status: 'Todo' },
    optionIds: { Status: 'a' },
    movedAt: {},
    movedBy: {},
    tracks: [],
    trackedIn: [],
    ...over,
  };
}

function board(over: Partial<ProjectBoard> = {}): ProjectBoard {
  return {
    repo: 'acme/app',
    id: 'PVT_1',
    fields: [
      { id: 'f1', name: 'Status', dataType: 'SINGLE_SELECT',
        options: [{ id: 'a', name: 'Todo' }, { id: 'b', name: 'Done' }] },
      { id: 'f2', name: 'Target date', dataType: 'DATE' },
      { id: 'f3', name: 'Title', dataType: 'TITLE' },
    ],
    items: [item()],
    ...over,
  };
}

function issue(over: Partial<BoardIssue> = {}): BoardIssue {
  return {
    number: 41, title: 'x', state: 'OPEN', url: '', assignees: [], labels: [],
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
    commentCount: 0, dimensions: {}, evidence: [], ageDays: 1, quietDays: 1,
    ...over,
  };
}

describe('projectDimensions', () => {
  it('is the single-selects, in the order the project declares them', () => {
    expect(projectDimensions(board())).toEqual([
      { dimension: 'status', heading: 'Status', options: ['Todo', 'Done'], files: [] },
    ]);
  });

  it('leaves out the fields that are GitHub’s own under another name', () => {
    const out = projectDimensions(board({
      fields: [{ id: 'f', name: 'Assignees', dataType: 'SINGLE_SELECT', options: [] }],
    }));
    expect(out).toEqual([]);
  });

  it('is empty when there is no project', () => {
    expect(projectDimensions(null)).toEqual([]);
    expect(projectDimensions({ ...board(), id: undefined })).toEqual([]);
  });
});

describe('withProject', () => {
  it('folds the values in under a lower-cased key', () => {
    const [out] = withProject([issue()], board());
    expect(out.dimensions.status).toBe('Todo');
  });

  it('lets the repository’s own form win a name collision', () => {
    const [out] = withProject([issue({ dimensions: { status: 'From the template' } })], board());
    expect(out.dimensions.status).toBe('From the template');
  });

  it('leaves an issue that is not on the project alone', () => {
    const same = issue({ number: 99 });
    expect(withProject([same], board())[0]).toBe(same);
  });

  it('is a no-op with no project, rather than a copy of everything', () => {
    const rows = [issue()];
    expect(withProject(rows, null)).toBe(rows);
  });
});

describe('dateFields', () => {
  it('is the date fields only', () => {
    expect(dateFields(board()).map(f => f.name)).toEqual(['Target date']);
  });
});

describe('changedSince', () => {
  const before = board();
  const after = board({
    items: [item({
      values: { Status: 'Done' },
      movedBy: { Status: 'mkulkarni' },
      movedAt: { Status: '2026-09-10T09:00:00Z' },
    })],
  });

  it('says what moved, from what to what, and who moved it', () => {
    expect(changedSince(before, after, new Set())).toEqual([{
      number: 41, field: 'Status', was: 'Todo', now: 'Done',
      by: 'mkulkarni', at: '2026-09-10T09:00:00Z', mine: false,
    }]);
  });

  it('marks it a conflict only on a card this session also changed', () => {
    expect(changedSince(before, after, new Set())[0].mine).toBe(false);
    expect(changedSince(before, after, new Set([41]))[0].mine).toBe(true);
  });

  it('is silent when nothing moved', () => {
    expect(changedSince(before, before, new Set())).toEqual([]);
  });

  it('says nothing about a card that was not there before', () => {
    const fresh = board({ items: [item({ number: 99 })] });
    expect(changedSince(before, fresh, new Set())).toEqual([]);
  });
});

describe('the slip record', () => {
  beforeEach(() => localStorage.clear());

  it('writes down a date it watched change, with the day it noticed', () => {
    const before = board({ items: [item({ values: { 'Target date': '2026-09-04' } })] });
    const after = board({ items: [item({ values: { 'Target date': '2026-09-11' } })] });
    const out = recordSlips('acme/app', before, after, 1_000);
    expect(out).toEqual([{
      number: 41, field: 'Target date', from: '2026-09-04', to: '2026-09-11', at: 1_000,
    }]);
    expect(readSlips('acme/app')).toEqual(out);
  });

  it('keeps a record per repository', () => {
    const before = board({ items: [item({ values: { 'Target date': '2026-09-04' } })] });
    const after = board({ items: [item({ values: { 'Target date': '2026-09-11' } })] });
    recordSlips('acme/app', before, after);
    expect(readSlips('other/repo')).toEqual([]);
  });

  it('notes nothing when no date moved', () => {
    expect(recordSlips('acme/app', board(), board())).toEqual([]);
  });

  it('measures the slip in days, in both directions', () => {
    expect(slipDays({ number: 1, field: 'x', from: '2026-09-04', to: '2026-09-11', at: 0 }))
      .toBe(7);
    expect(slipDays({ number: 1, field: 'x', from: '2026-09-11', to: '2026-09-04', at: 0 }))
      .toBe(-7);
  });

  it('does not throw when there is no date to compare against', () => {
    expect(slipDays({ number: 1, field: 'x', from: '', to: '2026-09-11', at: 0 })).toBe(0);
  });
});
