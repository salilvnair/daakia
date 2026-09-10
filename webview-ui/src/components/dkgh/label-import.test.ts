/**
 * 19D — importing a label set, and the line it must not cross.
 *
 * Only additions and colour changes. An import that made this repository match
 * the other one exactly would strip labels somebody is using, and "sync" is
 * not what anybody means when they ask for this — so nothing in this file can
 * produce a delete, and the test below says so directly.
 */
import { describe, it, expect } from 'vitest';
import { diff, preview, stage, summary, type Label, type Side } from './label-import';

const l = (name: string, color: string, description?: string): Label =>
  ({ name, color, description });

const theirs = [
  l('regression', 'db6d28', 'came back'),
  l('needs-evidence', '3fb950'),
  l('sso', 'a371f7'),
  l('bug', 'd73a4a'),
  l('documentation', '0075ca'),
  l('enhancement', 'a2eeef'),
];

const mine = [
  l('bug', 'f85149'),
  l('documentation', '58a6ff'),
  l('enhancement', 'a2eeef'),
  l('wontfix', 'ffffff'),
];

describe('diff', () => {
  const d = diff(theirs, mine);

  it('finds what this repository does not have', () => {
    expect(d.additions.map(a => a.name)).toEqual(['regression', 'needs-evidence', 'sso']);
  });

  it('skips what is already the same, colour and all', () => {
    expect(d.identical.map(i => i.name)).toEqual(['enhancement']);
  });

  it('names the clashes — same label, different colour', () => {
    expect(d.clashes.map(c => c.name)).toEqual(['bug', 'documentation']);
    expect(d.clashes[0].mine.color).toBe('f85149');
    expect(d.clashes[0].theirs.color).toBe('d73a4a');
  });

  it('counts both sides, for the heading', () => {
    expect(d.there).toBe(6);
    expect(d.here).toBe(4);
  });

  it('never reports a label of ours as anything at all — nothing is deleted', () => {
    const everything = [
      ...d.additions.map(a => a.name),
      ...d.identical.map(i => i.name),
      ...d.clashes.map(c => c.name),
    ];
    expect(everything).not.toContain('wontfix');
  });

  it('matches names the way GitHub does, ignoring case', () => {
    const d2 = diff([l('Bug', 'f85149')], [l('bug', 'f85149')]);
    expect(d2.additions).toEqual([]);
    expect(d2.identical).toHaveLength(1);
  });

  it('ignores a leading hash on either side', () => {
    expect(diff([l('bug', '#f85149')], [l('bug', 'F85149')]).identical).toHaveLength(1);
  });

  it('an identical set is nothing to do', () => {
    const d2 = diff(mine, mine);
    expect(d2.additions).toEqual([]);
    expect(d2.clashes).toEqual([]);
    expect(d2.identical).toHaveLength(4);
  });
});

describe('stage', () => {
  const d = diff(theirs, mine);

  it('stages every addition as a new label', () => {
    const edits = stage(d, {});
    expect(Object.keys(edits)).toHaveLength(3);
    expect(edits['import:sso'].name).toBe('sso');
    /* No `readAs` — that is what makes the Labels tab draw it as new and the
       plan turn it into a POST rather than a PATCH. */
    expect(edits['import:sso'].readAs).toBeUndefined();
  });

  it('carries the description across, because a bare label is guessed at', () => {
    expect(stage(d, {})['import:regression'].description).toBe('came back');
  });

  it('writes the colour as the tab spells it, with the hash', () => {
    expect(stage(d, {})['import:sso'].color).toBe('#a371f7');
  });

  it('leaves a clash alone by default — yours wins unless you say so', () => {
    const edits = stage(d, {});
    expect(edits.bug).toBeUndefined();
  });

  it('recolours a clash when you take theirs, as an edit to the existing label', () => {
    const sides: Record<string, Side> = { bug: 'theirs' };
    const edits = stage(d, sides);
    expect(edits.bug.color).toBe('#d73a4a');
    expect(edits.bug.was).toBe('bug');
    /* It carries what it was read as, which is what makes it a PATCH. */
    expect(edits.bug.readAs?.color).toBe('f85149');
  });

  it('never stages a delete, whatever the sides say', () => {
    const sides: Record<string, Side> = { bug: 'theirs', documentation: 'theirs' };
    const edits = stage(d, sides);
    for (const e of Object.values(edits)) {
      expect(e).not.toHaveProperty('deleted');
    }
  });
});

describe('summary', () => {
  const d = diff(theirs, mine);

  it('is the footer s own sentence, with yours winning', () => {
    expect(summary(d, {})).toBe('3 to create · 2 clashes, all keeping yours');
  });

  it('says so when every clash goes the other way', () => {
    expect(summary(d, { bug: 'theirs', documentation: 'theirs' }))
      .toBe('3 to create · 2 clashes, all taking theirs');
  });

  it('counts a mixture', () => {
    expect(summary(d, { bug: 'theirs' }))
      .toBe('3 to create · 2 clashes, 1 taking theirs');
  });

  it('leaves the clause out when there are no clashes', () => {
    const clean = diff([l('sso', 'a371f7')], []);
    expect(summary(clean, {})).toBe('1 to create');
  });
});

describe('preview', () => {
  it('shows three and counts the rest, as the mock does', () => {
    const { shown, more } = preview(diff(theirs, mine).additions);
    expect(shown).toHaveLength(3);
    expect(more).toBe(0);
  });

  it('counts the remainder when there are more than three', () => {
    const many = Array.from({ length: 9 }, (_, i) => l(`x${i}`, 'ffffff'));
    const { shown, more } = preview(many);
    expect(shown).toHaveLength(3);
    expect(more).toBe(6);
  });

  it('shows nothing and counts nothing for an empty set', () => {
    expect(preview([])).toEqual({ shown: [], more: 0 });
  });
});
