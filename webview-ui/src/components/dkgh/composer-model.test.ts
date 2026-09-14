/**
 * The composer's model, where getting it wrong is invisible until later.
 *
 * `assembleBody` is the one that matters. The board can group by Module
 * tomorrow only because the composer wrote `### Module` today — so this asserts
 * that what the composer emits is what `issue-body.ts` reads back, heading for
 * heading, including the `_No response_` GitHub itself writes for a field
 * somebody skipped.
 */
import { describe, it, expect } from 'vitest';
import {
  assembleBody, asks, attachShot, completionsFor, dropShot, emptyDraft,
  formInForce, hasContent, missing, proposeTemplate, retargetEvidence,
  shotsFor, sidebarFields, unassignedShots, type Draft, type IssueForm,
} from './composer-model';
import type { BoardIssue } from './board-types';

const BUG: IssueForm = {
  file: 'bug.yml',
  name: 'Bug report',
  description: 'Something is broken',
  labels: ['bug'],
  fields: [
    { type: 'markdown', label: 'Thanks for filing', options: [], required: false },
    { type: 'input', label: 'Summary', options: [], required: true },
    { type: 'dropdown', label: 'Module', options: ['Checkout', 'Orders'], required: true },
    { type: 'dropdown', label: 'Environment', options: ['PROD', 'DEV'], required: false },
    { type: 'textarea', label: 'Steps', options: [], required: false },
  ],
};

const TRACK: IssueForm = {
  file: 'track.yml',
  name: 'Track item',
  description: 'A piece of planned work with a team and a target release',
  labels: ['tracking'],
  fields: [
    { type: 'input', label: 'Team', options: [], required: true },
    { type: 'input', label: 'Target release', options: [], required: false },
  ],
};

function draft(over: Partial<Draft> = {}): Draft {
  return { ...emptyDraft('o/r'), ...over };
}

describe('assembleBody', () => {
  it('writes each field as the heading the board reads back', () => {
    const body = assembleBody(
      draft({ answers: { Summary: 'Login hangs', Module: 'Checkout', Steps: '1. Press submit' } }),
      BUG,
    );
    expect(body).toBe([
      '### Summary',
      '',
      'Login hangs',
      '',
      '### Module',
      '',
      'Checkout',
      '',
      '### Environment',
      '',
      '_No response_',
      '',
      '### Steps',
      '',
      '1. Press submit',
    ].join('\n'));
  });

  it('skips the template’s own prose blocks, which are not fields', () => {
    expect(assembleBody(draft(), BUG)).not.toContain('Thanks for filing');
  });

  it('keeps the declared order, because that is what GitHub’s renderer emits', () => {
    const body = assembleBody(draft({ answers: { Steps: 'x', Summary: 'y' } }), BUG);
    expect(body.indexOf('### Summary')).toBeLessThan(body.indexOf('### Steps'));
  });

  it('is just the description when there is no template', () => {
    expect(assembleBody(draft({ description: 'It broke.' }), undefined)).toBe('It broke.');
  });

  it('appends evidence as markdown images, under its own heading', () => {
    const body = assembleBody(
      draft({ description: 'It broke.', evidence: ['https://example.invalid/a.png'] }),
      undefined,
    );
    expect(body).toContain('### Evidence');
    expect(body).toContain('![screenshot](https://example.invalid/a.png)');
  });

  it('writes a screenshot under the field it was pasted into', () => {
    /*
      The whole point of attaching to a field. A picture in a pile at the
      bottom has lost the sentence it belonged to, and whoever reads the issue
      next has to work out which of four images the paragraph is about.
    */
    const body = assembleBody(draft({
      answers: { Steps: 'Click Pay.' },
      evidence: ['https://example.invalid/steps.png'],
      evidenceOn: { 'https://example.invalid/steps.png': 'Steps' },
    }), BUG);

    const steps = body.slice(body.indexOf('### Steps'));
    expect(steps).toContain('Click Pay.');
    expect(steps).toContain('![screenshot](https://example.invalid/steps.png)');
    // …and it is not also repeated in a trailing pile.
    expect(body.match(/### Evidence/g)).toBeNull();
  });

  it('does not call a field empty when it holds only a picture', () => {
    const body = assembleBody(draft({
      evidence: ['https://example.invalid/a.png'],
      evidenceOn: { 'https://example.invalid/a.png': 'Steps' },
    }), BUG);
    const steps = body.slice(body.indexOf('### Steps'));
    expect(steps).not.toContain('_No response_');
    expect(steps).toContain('![screenshot](https://example.invalid/a.png)');
  });

  it('still piles up the ones pasted into the description', () => {
    const body = assembleBody(draft({
      answers: { Steps: 'Click Pay.' },
      evidence: ['https://example.invalid/loose.png', 'https://example.invalid/steps.png'],
      evidenceOn: { 'https://example.invalid/steps.png': 'Steps' },
    }), BUG);
    const tail = body.slice(body.indexOf('### Evidence'));
    expect(tail).toContain('loose.png');
    expect(tail).not.toContain('steps.png');
  });
});

describe('the template in force', () => {
  it('is the one that was picked', () => {
    expect(formInForce([BUG, TRACK], draft({ templateFile: 'track.yml' }))?.file)
      .toBe('track.yml');
  });

  it('is the one being proposed when nobody has picked', () => {
    /*
      This is the whole of the bug it was written for. The composer showed the
      proposal's fields, called them required, and let the AI step fill them
      in — and the body was assembled from `templateFile`, which nothing ever
      set. Every answer on the screen was dropped on the way to GitHub.
    */
    const d = draft({ description: 'a piece of planned work for a team and a release' });
    expect(formInForce([BUG, TRACK], d)?.file).toBe('track.yml');
    expect(assembleBody({ ...d, answers: { Team: 'Payments' } },
      formInForce([BUG, TRACK], d))).toContain('### Team');
  });

  it('is nothing when the repository has no forms', () => {
    expect(formInForce([], draft())).toBeUndefined();
  });
});

describe('screenshots and their fields', () => {
  it('adds one against a field, and finds it again', () => {
    const d = { ...draft(), ...attachShot(draft(), 'a.png', 'Steps') } as Draft;
    expect(shotsFor(d, 'Steps')).toEqual(['a.png']);
    expect(unassignedShots(d)).toEqual([]);
  });

  it('adds one against nothing when no field is named', () => {
    const d = { ...draft(), ...attachShot(draft(), 'a.png') } as Draft;
    expect(unassignedShots(d)).toEqual(['a.png']);
    expect(shotsFor(d, 'Steps')).toEqual([]);
  });

  it('refuses to add the same image twice', () => {
    const once = { ...draft(), ...attachShot(draft(), 'a.png', 'Steps') } as Draft;
    expect(attachShot(once, 'a.png', 'Steps')).toEqual({});
  });

  it('forgets the field when the image goes', () => {
    const d = { ...draft(), ...attachShot(draft(), 'a.png', 'Steps') } as Draft;
    const gone = { ...d, ...dropShot(d, 'a.png') } as Draft;
    expect(gone.evidence).toEqual([]);
    expect(gone.evidenceOn).toEqual({});
  });

  it('keeps each image with its field when the URLs are rewritten', () => {
    /*
      Uploading swaps a data URL for the blob URL it landed at. The field map
      is keyed by URL, so a plain map over the list would upload the screenshot
      and silently orphan it from the heading it was pasted under — the issue
      would be filed with the picture back in the pile.
    */
    const d = draft({
      evidence: ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'],
      evidenceOn: { 'data:image/png;base64,AAA': 'Steps' },
    });
    const hosted = { 'data:image/png;base64,AAA': 'https://gh/a.png' } as Record<string, string>;
    const next = retargetEvidence(d, u => hosted[u] ?? u);

    expect(next.evidence).toEqual(['https://gh/a.png', 'data:image/png;base64,BBB']);
    expect(next.evidenceOn).toEqual({ 'https://gh/a.png': 'Steps' });
    // The order is the order of the story — see 12A.
    expect(shotsFor({ ...d, ...next } as Draft, 'Steps')).toEqual(['https://gh/a.png']);
  });

  it('survives a draft that predates any of this', () => {
    // Drafts are persisted; one saved last week has no `evidenceOn` at all.
    const old = draft({ evidence: ['a.png'] });
    delete (old as Partial<Draft>).evidenceOn;
    expect(unassignedShots(old)).toEqual(['a.png']);
    expect(shotsFor(old, 'Steps')).toEqual([]);
    expect(assembleBody(old, BUG)).toContain('### Evidence');
  });
});

describe('missing', () => {
  it('names the required fields nobody has filled', () => {
    expect(missing(draft(), BUG).map(f => f.label)).toEqual(['Summary', 'Module']);
  });

  it('stops naming one once it is answered', () => {
    expect(missing(draft({ answers: { Summary: 'x' } }), BUG).map(f => f.label))
      .toEqual(['Module']);
  });

  it('has nothing to say about a repository with no template', () => {
    expect(missing(draft(), undefined)).toEqual([]);
  });
});

describe('proposeTemplate', () => {
  it('puts the one whose words match what was written first', () => {
    const ranked = proposeTemplate([TRACK, BUG], 'the checkout page is broken');
    expect(ranked[0].form.file).toBe('bug.yml');
  });

  it('follows the templates’ own words, so renaming one changes the answer', () => {
    const ranked = proposeTemplate([BUG, TRACK], 'planning the target release for the team');
    expect(ranked[0].form.file).toBe('track.yml');
  });

  it('says what each one would have asked for, not just its name', () => {
    expect(asks(TRACK)).toBe('Asks for team, target release.');
    expect(asks(BUG)).toContain('summary, module, environment, steps');
  });

  it('ranks them all rather than returning one, so the losers stay visible', () => {
    expect(proposeTemplate([BUG, TRACK], 'anything')).toHaveLength(2);
  });
});

describe('sidebarFields — 10C', () => {
  const rows = sidebarFields(BUG, false);

  it('sends assignees, labels and milestone to the issue itself', () => {
    for (const key of ['assignees', 'labels', 'milestone']) {
      expect(rows.find(r => r.key === key)?.destination).toBe('issue');
    }
  });

  it('sends a template field to the body', () => {
    expect(rows.find(r => r.label === 'Module')?.destination).toBe('body');
  });

  it('says why a Project field is not offered rather than showing an empty control', () => {
    const priority = rows.find(r => r.key === 'priority')!;
    expect(priority.destination).toBe('project');
    expect(priority.unavailable).toMatch(/Projects/);
  });

  it('drops the reason once a Project is readable', () => {
    expect(sidebarFields(BUG, true).find(r => r.key === 'priority')?.unavailable)
      .toBeUndefined();
  });

  it('admits the one control that writes nowhere', () => {
    expect(rows.find(r => r.key === 'type')?.destination).toBe('nowhere');
  });
});

describe('drafts', () => {
  it('is not a draft until something has been typed into it', () => {
    expect(hasContent(draft())).toBe(false);
    expect(hasContent(draft({ title: 'x' }))).toBe(true);
    expect(hasContent(draft({ answers: { Summary: ' ' } }))).toBe(false);
    expect(hasContent(draft({ evidence: ['x'] }))).toBe(true);
  });
});

describe('completions — 10B', () => {
  const issues = [
    { number: 41, title: 'Login page hangs' },
    { number: 36, title: 'Session token refresh loops' },
  ] as BoardIssue[];

  it('completes an issue from the board that is already loaded', () => {
    expect(completionsFor('#', '4', issues, []).map(c => c.insert)).toEqual(['#41']);
  });

  it('matches on the title too, because nobody remembers numbers', () => {
    expect(completionsFor('#', 'token', issues, []).map(c => c.insert)).toEqual(['#36']);
  });

  it('completes a person from the collaborator list', () => {
    expect(completionsFor('@', 'rm', issues, ['rmenon', 'tshah']).map(c => c.insert))
      .toEqual(['@rmenon']);
  });
});
