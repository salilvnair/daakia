/**
 * The linked Project.
 *
 * Two things are worth pinning. The read has to turn GraphQL's union of value
 * shapes into one string per field without losing the option ids a drag needs;
 * and the write has to address the item by id, because a command built from
 * names breaks the moment somebody renames a column.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('./gh', () => ({ run: (...a: unknown[]) => run(...a) }));

const { applyProjectEdit, fetchProject, planProjectEdit, planProjectItem } = await import('./project');

beforeEach(() => run.mockReset());

const STATUS = {
  id: 'PVTSSF_status',
  name: 'Status',
  dataType: 'SINGLE_SELECT',
  options: [{ id: 'f75ad846', name: 'Todo' }, { id: '47fc9ee4', name: 'In Progress' }],
};

function answers(body: unknown) {
  run.mockResolvedValue({ ok: true, stdout: JSON.stringify(body) });
}

function board(over: Record<string, unknown> = {}) {
  return {
    data: {
      repository: {
        projectsV2: { nodes: [{
          id: 'PVT_1', number: 1, title: 'Test Project',
          fields: { nodes: [STATUS, { id: 'PVTF_eta', name: 'Target date', dataType: 'DATE' }] },
        }] },
        issues: { nodes: [{
          number: 41,
          projectItems: { nodes: [{
            id: 'PVTI_41',
            project: { id: 'PVT_1' },
            fieldValues: { nodes: [
              { name: 'Todo', optionId: 'f75ad846', field: { name: 'Status' } },
              { date: '2026-09-11', field: { name: 'Target date' } },
            ] },
          }] },
        }] },
        ...over,
      },
    },
  };
}

describe('fetchProject', () => {
  it('reads the project, its fields and every item in one call', async () => {
    answers(board());
    const out = await fetchProject('acme/app');
    expect(run).toHaveBeenCalledTimes(1);
    expect(out.title).toBe('Test Project');
    expect(out.fields.map(f => f.name)).toEqual(['Status', 'Target date']);
    expect(out.items).toEqual([{
      id: 'PVTI_41',
      number: 41,
      values: { Status: 'Todo', 'Target date': '2026-09-11' },
      optionIds: { Status: 'f75ad846' },
      movedAt: {},
      movedBy: {},
      tracks: [],
      trackedIn: [],
    }]);
  });

  it('carries who last moved a value and when — 06E says so by name', async () => {
    answers(board({
      issues: { nodes: [{
        number: 41,
        projectItems: { nodes: [{
          id: 'PVTI_41',
          project: { id: 'PVT_1' },
          fieldValues: { nodes: [{
            name: 'In Progress', optionId: '47fc9ee4',
            updatedAt: '2026-09-10T09:00:00Z', creator: { login: 'mkulkarni' },
            field: { name: 'Status' },
          }] },
        }] },
      }] },
    }));
    const [item] = (await fetchProject('acme/app')).items;
    expect(item.movedBy.Status).toBe('mkulkarni');
    expect(item.movedAt.Status).toBe('2026-09-10T09:00:00Z');
  });

  it('reads the sub-issues a roadmap draws dependencies from', async () => {
    answers(board({
      issues: { nodes: [{
        number: 41,
        trackedIssues: { nodes: [{ number: 45, title: 'The retry ceiling', state: 'OPEN' }] },
        trackedInIssues: { nodes: [{ number: 30, title: 'SSO epic' }] },
        projectItems: { nodes: [{ id: 'i', project: { id: 'PVT_1' },
          fieldValues: { nodes: [] } }] },
      }] },
    }));
    const [item] = (await fetchProject('acme/app')).items;
    expect(item.tracks).toEqual([{ number: 45, title: 'The retry ceiling', state: 'OPEN' }]);
    expect(item.trackedIn).toEqual([{ number: 30, title: 'SSO epic' }]);
  });

  it('keeps the option id beside the value, so a drag can write it', async () => {
    answers(board());
    const [item] = (await fetchProject('acme/app')).items;
    expect(item.optionIds.Status).toBe('f75ad846');
  });

  it('reads a repository with no project as ordinary, not as an error', async () => {
    answers({ data: { repository: { projectsV2: { nodes: [] }, issues: { nodes: [] } } } });
    const out = await fetchProject('acme/app');
    expect(out.absent).toBe('none');
    expect(out.items).toEqual([]);
  });

  it('calls a missing scope out as a scope problem, not a GraphQL one', async () => {
    run.mockResolvedValue({
      ok: false,
      stderr: 'your token has not been granted the required scopes: read:project',
    });
    expect((await fetchProject('acme/app')).absent).toBe('scope');
  });

  it('passes anything else through in gh’s own words', async () => {
    run.mockResolvedValue({ ok: false, stderr: 'HTTP 502: Bad gateway' });
    expect((await fetchProject('acme/app')).absent).toBe('HTTP 502: Bad gateway');
  });

  it('ignores an item that belongs to a different project', async () => {
    answers(board({
      issues: { nodes: [{
        number: 9,
        projectItems: { nodes: [{ id: 'PVTI_9', project: { id: 'PVT_other' },
          fieldValues: { nodes: [] } }] },
      }] },
    }));
    expect((await fetchProject('acme/app')).items).toEqual([]);
  });

  it('does not throw on a body that is not JSON', async () => {
    run.mockResolvedValue({ ok: true, stdout: 'nope' });
    expect((await fetchProject('acme/app')).absent).toMatch(/not JSON/);
  });
});

describe('planProjectEdit', () => {
  const edit = {
    itemId: 'PVTI_41',
    number: 41,
    field: STATUS,
    option: { id: '47fc9ee4', name: 'In Progress' },
  };

  it('addresses the item by id, never by name', () => {
    const [step] = planProjectEdit('PVT_1', [edit]).steps;
    expect(step.argv).toEqual([
      'project', 'item-edit',
      '--id', 'PVTI_41',
      '--project-id', 'PVT_1',
      '--field-id', 'PVTSSF_status',
      '--single-select-option-id', '47fc9ee4',
    ]);
    expect(step.argv).not.toContain('--field');
    expect(step.argv).not.toContain('--value');
  });

  it('says what it will do in the reader’s terms', () => {
    expect(planProjectEdit('PVT_1', [edit]).steps[0].does)
      .toBe('Sets Status to In Progress on #41');
  });

  it('sets a date, and clears one with --clear rather than an empty date', () => {
    const field = { id: 'PVTF_eta', name: 'Target date', dataType: 'DATE' };
    const set = planProjectEdit('PVT_1', [{ itemId: 'i', number: 1, field, date: '2026-10-01' }]);
    expect(set.steps[0].argv).toContain('--date');

    const cleared = planProjectEdit('PVT_1', [{ itemId: 'i', number: 1, field, date: '' }]);
    expect(cleared.steps[0].argv).toContain('--clear');
    expect(cleared.steps[0].does).toBe('Clears Target date on #1');
  });

  it('refuses a request that asks for nothing', () => {
    expect(planProjectEdit('PVT_1', []).refusal).toBeTruthy();
    expect(planProjectEdit('PVT_1', [{ itemId: 'i', number: 1, field: STATUS }]).refusal)
      .toBeTruthy();
  });
});

describe('applyProjectEdit', () => {
  it('reports per issue, and does not retry', async () => {
    run
      .mockResolvedValueOnce({ ok: false, stderr: 'HTTP 403' })
      .mockResolvedValueOnce({ ok: true, stdout: '{}' });
    const out = await applyProjectEdit({
      projectId: 'PVT_1',
      steps: [
        { number: 1, does: '', argv: ['project'], display: '' },
        { number: 2, does: '', argv: ['project'], display: '' },
      ],
    });
    expect(out).toEqual([
      { number: 1, ok: false, error: 'HTTP 403' },
      { number: 2, ok: true, error: undefined },
    ]);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

/*
  Archive and remove, which are two different things that both keep the issue.
*/
describe('planProjectItem', () => {
  it('archives by item id, against the project it is on', () => {
    const plan = planProjectItem('PVT_1', 'ITEM_9', 42, 'archive');
    expect(plan.steps[0].argv).toEqual([
      'project', 'item-archive', '--id', 'ITEM_9', '--project-id', 'PVT_1',
    ]);
  });

  it('removes with item-delete, which is gh’s name for it', () => {
    const plan = planProjectItem('PVT_1', 'ITEM_9', 42, 'remove');
    expect(plan.steps[0].argv).toEqual([
      'project', 'item-delete', '--id', 'ITEM_9', '--project-id', 'PVT_1',
    ]);
  });

  it('says the issue survives, on both — the confirm screen is where that lands', () => {
    expect(planProjectItem('P', 'I', 1, 'archive').steps[0].does)
      .toContain('still an issue');
    expect(planProjectItem('P', 'I', 1, 'remove').steps[0].does)
      .toContain('still an issue');
  });

  it('is one step — this is never a bulk action', () => {
    expect(planProjectItem('P', 'I', 1, 'remove').steps).toHaveLength(1);
  });

  it('refuses nothing: the scope check is the caller’s, not the plan’s', () => {
    expect(planProjectItem('P', 'I', 1, 'archive').refusal).toBeUndefined();
  });
});

/*
  A repository can link more than one project.

  The bug: `projectsV2(first:1)` and `nodes[0]`. A team with a delivery board
  and a bug board saw whichever GitHub returned first, and issues living only
  on the other one had no Status, no dates and no roadmap row — absent rather
  than wrong, which is the harder kind to notice.
*/
describe('a repository with two projects', () => {
  const two = (issues: { number: number; projectId: string }[]) => JSON.stringify({
    data: {
      repository: {
        projectsV2: { nodes: [
          { id: 'P_quiet', number: 1, title: 'Abandoned board', fields: { nodes: [] } },
          { id: 'P_busy', number: 2, title: 'The one they use', fields: { nodes: [] } },
        ] },
        issues: { nodes: issues.map(i => ({
          number: i.number,
          projectItems: { nodes: [{ id: `I_${i.number}`, project: { id: i.projectId },
                                    fieldValues: { nodes: [] } }] },
        })) },
      },
    },
  });

  it('offers every linked project, not just the first', async () => {
    const board = (run.mockResolvedValue({ ok: true, stdout: two([{ number: 1, projectId: 'P_busy' }]) }), await fetchProject('acme/app'));
    expect(board.available?.map(p => p.id).sort()).toEqual(['P_busy', 'P_quiet']);
  });

  it('builds from the one the issues are actually on', async () => {
    /* Not the first GitHub happens to return. A board somebody made once and
       abandoned should not outrank the one they use daily. */
    const board = (run.mockResolvedValue({ ok: true, stdout: two([
      { number: 1, projectId: 'P_busy' },
      { number: 2, projectId: 'P_busy' },
      { number: 3, projectId: 'P_quiet' },
    ]) }), await fetchProject('acme/app'));
    expect(board.id).toBe('P_busy');
    expect(board.items.map(i => i.number).sort()).toEqual([1, 2]);
  });

  it('honours an explicit choice over the count', async () => {
    const board = (run.mockResolvedValue({ ok: true, stdout: two([
      { number: 1, projectId: 'P_busy' },
      { number: 2, projectId: 'P_quiet' },
    ]) }), await fetchProject('acme/app', 'P_quiet'));
    expect(board.id).toBe('P_quiet');
    expect(board.items.map(i => i.number)).toEqual([2]);
  });

  it('counts how many issues sit on each, so the picker can say', async () => {
    const board = (run.mockResolvedValue({ ok: true, stdout: two([
      { number: 1, projectId: 'P_busy' },
      { number: 2, projectId: 'P_busy' },
      { number: 3, projectId: 'P_quiet' },
    ]) }), await fetchProject('acme/app'));
    const byId = Object.fromEntries((board.available ?? []).map(p => [p.id, p.items]));
    expect(byId).toEqual({ P_busy: 2, P_quiet: 1 });
  });
});
